/**
 * NBA championship futures scanner.
 *
 * Compares NBA Championship Winner odds from sportsbooks (The Odds API)
 * against Polymarket futures prices. Flags mispricings where the implied
 * probability gap exceeds a threshold.
 *
 * In dry-run mode: scans and logs but never places orders.
 *
 * Stdout protocol — each line is tagged for dashboard parsing:
 *   START <message>       Runner started
 *   SCAN <message>        Iteration started, fetching data
 *   NO_EDGE <message>     Scan iteration complete, no opportunities
 *   SIGNAL <message>      Mispricing detected (dry-run skip)
 *   SCAN_ERROR <message>  Scan cycle failed
 *   STOP <message>        Runner shutting down
 *
 * Usage: pnpm exec tsx src/runner.ts --dry-run
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchOdds } from "./clients/sportsbook.js";
import { searchMarkets } from "./clients/polymarket.js";
import { fetchNbaGameMarkets } from "./clients/polymarket-games.js";
import type { StrategyConfig } from "./config/strategy.js";
import { DEFAULT_CONFIG } from "./config/strategy.js";
import { shouldFlag } from "./service/signals.js";
import { checkRiskLimits } from "./service/risk.js";
import { DEFAULT_RISK_CONFIG } from "./config/risk.js";
import { scoreSignal, type AiAssessment } from "./service/ai-scorer.js";

// ── Log entry types ─────────────────────────────────────────────────────────

interface SignalLogEntry {
  ts: string;
  automation_id: string;
  cycle: number;
  action: "SIGNAL";
  team: string;
  sportsbookProb: number;
  polymarketPrice: number;
  delta: number;
  relativeEdge: number;
  signalStrength: "strong" | "moderate" | "weak";
  ai?: AiAssessment;
  reasoning: string;
}

interface HeartbeatLogEntry {
  ts: string;
  automation_id: string;
  cycle: number;
  action: "NO_EDGE";
  teams: number;
  markets: number;
  matched: number;
  reasoning: string;
}

interface ScanErrorLogEntry {
  ts: string;
  automation_id: string;
  cycle: number;
  action: "SCAN_ERROR";
  reasoning: string;
}

interface GameSignalLogEntry {
  ts: string;
  automation_id: string;
  cycle: number;
  action: "SIGNAL";
  homeTeam: string;
  awayTeam: string;
  team: string;
  sportsbookProb: number;
  polymarketPrice: number;
  delta: number;
  relativeEdge: number;
  signalStrength: "strong" | "moderate" | "weak";
  polymarketSlug: string;
  reasoning: string;
}

interface GameHeartbeatLogEntry {
  ts: string;
  automation_id: string;
  cycle: number;
  action: "NO_EDGE";
  games: number;
  matched: number;
  reasoning: string;
}

type LogEntry =
  | SignalLogEntry
  | HeartbeatLogEntry
  | ScanErrorLogEntry
  | GameSignalLogEntry
  | GameHeartbeatLogEntry;

// ── Constants ───────────────────────────────────────────────────────────────

const AUTOMATION_ID = "nba-futures-v1";
const GAME_AUTOMATION_ID = "nba-games-v1";
const EXECUTION_DIR = join(process.cwd(), ".canon", "execution");
const DEFAULT_POLL_INTERVAL_MS = 30_000;

// ── Counters ────────────────────────────────────────────────────────────────

let cycleCount = 0;
let signalCount = 0;
let errorCount = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureExecutionDir(): void {
  if (!existsSync(EXECUTION_DIR)) {
    mkdirSync(EXECUTION_DIR, { recursive: true });
  }
}

function logFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return join(EXECUTION_DIR, `${date}.jsonl`);
}

function appendLog(entry: LogEntry): void {
  ensureExecutionDir();
  appendFileSync(logFilePath(), JSON.stringify(entry) + "\n");
}

function out(tag: string, msg: string): void {
  process.stdout.write(`${tag} ${msg}\n`);
}

function parsePollInterval(): number {
  const envVal = process.env["POLL_INTERVAL_MS"];
  if (envVal) {
    const parsed = Number(envVal);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

function isDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

// ── Team matching ───────────────────────────────────────────────────────────

/** Normalize team name for fuzzy matching. */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

/**
 * NBA team name aliases — maps common short names to the full
 * team name fragments. Extend as needed.
 */
const NBA_ALIASES: Record<string, string[]> = {
  "76ers": ["philadelphia", "sixers", "76ers"],
  blazers: ["portland", "trail blazers", "blazers"],
  cavs: ["cleveland", "cavaliers", "cavs"],
  mavs: ["dallas", "mavericks", "mavs"],
  wolves: ["minnesota", "timberwolves", "wolves"],
};

/** Check if a text string mentions a team (fuzzy match with aliases). */
export function textMentionsTeam(
  text: string,
  teamName: string,
): boolean {
  const t = normalize(text);
  const n = normalize(teamName);

  if (t.includes(n)) return true;

  // Try last word of team name (e.g. "Lakers" from "Los Angeles Lakers")
  const parts = n.split(" ");
  const last = parts[parts.length - 1];
  if (last && last.length > 3 && t.includes(last)) return true;

  // Check aliases
  for (const [, aliases] of Object.entries(NBA_ALIASES)) {
    const teamMatches = aliases.some((a) => n.includes(a));
    const textMatches = aliases.some((a) => t.includes(a));
    if (teamMatches && textMatches) return true;
  }

  return false;
}

// ── Sportsbook implied probabilities ────────────────────────────────────────

export interface TeamOdds {
  team: string;
  impliedProb: number;
  sources: number;
}

/**
 * Extract average implied probability per team from championship
 * outright odds across all bookmakers.
 */
export function extractTeamOdds(
  events: Awaited<ReturnType<typeof fetchOdds>>,
): TeamOdds[] {
  const teamProbs = new Map<string, number[]>();

  for (const event of events) {
    for (const bm of event.bookmakers) {
      const outrights = bm.markets.find((m) => m.key === "outrights");
      if (!outrights) continue;

      const eligible = outrights.outcomes.filter((o) => o.price > 1);
      if (eligible.length === 0) continue;

      // Strip bookmaker vig: divide each raw implied prob by the sum so they
      // sum to 1.0, giving the fair (vig-free) probability for each team.
      const rawTotal = eligible.reduce((sum, o) => sum + 1 / o.price, 0);
      const vigFactor = rawTotal > 0 ? 1 / rawTotal : 1;

      for (const outcome of eligible) {
        const fairProb = (1 / outcome.price) * vigFactor;
        const probs = teamProbs.get(outcome.name) ?? [];
        probs.push(fairProb);
        teamProbs.set(outcome.name, probs);
      }
    }
  }

  const result: TeamOdds[] = [];
  for (const [team, probs] of teamProbs) {
    const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
    result.push({ team, impliedProb: avg, sources: probs.length });
  }

  return result.sort((a, b) => b.impliedProb - a.impliedProb);
}

// ── Scan cycle ──────────────────────────────────────────────────────────────

async function runCycle(config: StrategyConfig): Promise<void> {
  const ts = new Date().toISOString();

  out("SCAN", `#${cycleCount} — fetching NBA futures...`);

  // 1. Fetch championship outright odds from sportsbooks
  const events = await fetchOdds("basketball_nba_championship_winner");
  const teamOdds = extractTeamOdds(events);

  // 2. Fetch Polymarket NBA championship markets
  const markets = await searchMarkets("NBA Finals");

  // 3. Match teams to Polymarket markets and compare prices
  let matchedCount = 0;
  let cycleSignals = 0;

  for (const { team, impliedProb, sources } of teamOdds) {
    // Risk gate: require minimum bookmaker sources
    if (!checkRiskLimits({ sources }, DEFAULT_RISK_CONFIG)) continue;

    const market = markets.find((m) => textMentionsTeam(m.question, team));
    if (!market) continue;

    matchedCount++;

    // Signal check: delta exceeds mispricing threshold?
    const signal = shouldFlag(impliedProb, market.yesPrice, config);
    if (!signal) continue;

    cycleSignals++;
    signalCount++;

    const ai = await scoreSignal({
      team,
      fairProb: impliedProb,
      polymarketPrice: market.yesPrice,
      relativeEdge: signal.relativeEdge,
      signalStrength: signal.signalStrength,
      direction: signal.direction,
      bookmakerSources: sources,
    });

    const aiTag = ai
      ? ` | AI: ${ai.recommendation} (${(ai.confidenceScore * 100).toFixed(0)}%)`
      : "";

    const reasoning =
      `${team}: fair ${(impliedProb * 100).toFixed(1)}% vs ` +
      `Polymarket ${(market.yesPrice * 100).toFixed(1)}% ` +
      `(${signal.direction}, edge ${(signal.relativeEdge * 100).toFixed(1)}%, ${signal.signalStrength})${aiTag}`;

    const entry: SignalLogEntry = {
      ts,
      automation_id: AUTOMATION_ID,
      cycle: cycleCount,
      action: "SIGNAL",
      team,
      sportsbookProb: impliedProb,
      polymarketPrice: market.yesPrice,
      delta: signal.absDelta,
      relativeEdge: signal.relativeEdge,
      signalStrength: signal.signalStrength,
      ...(ai && { ai }),
      reasoning,
    };
    appendLog(entry);
    out("SIGNAL", reasoning);
  }

  // 4. Heartbeat if no signals
  if (cycleSignals === 0) {
    const reasoning =
      `#${cycleCount} — ${teamOdds.length} teams, ` +
      `${markets.length} markets, ${matchedCount} matched, no edges`;

    const entry: HeartbeatLogEntry = {
      ts,
      automation_id: AUTOMATION_ID,
      cycle: cycleCount,
      action: "NO_EDGE",
      teams: teamOdds.length,
      markets: markets.length,
      matched: matchedCount,
      reasoning,
    };
    appendLog(entry);
    out("NO_EDGE", reasoning);
  }
}

// ── Game odds extraction ─────────────────────────────────────────────────────

export interface GameTeamOdds {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  homeProb: number;
  awayProb: number;
  sources: number;
}

/**
 * Extract vig-stripped h2h probabilities from sportsbook game events.
 * Averages across all bookmakers that provide h2h markets.
 */
export function extractGameOdds(
  events: Awaited<ReturnType<typeof fetchOdds>>,
): GameTeamOdds[] {
  const result: GameTeamOdds[] = [];

  for (const event of events) {
    const homeProbs: number[] = [];
    const awayProbs: number[] = [];

    for (const bm of event.bookmakers) {
      const h2h = bm.markets.find((m) => m.key === "h2h");
      if (!h2h || h2h.outcomes.length < 2) continue;

      const eligible = h2h.outcomes.filter((o) => o.price > 1);
      if (eligible.length < 2) continue;

      // Strip vig
      const rawTotal = eligible.reduce((sum, o) => sum + 1 / o.price, 0);
      const vigFactor = rawTotal > 0 ? 1 / rawTotal : 1;

      // Match outcomes to home/away by name
      const homeOutcome = eligible.find((o) =>
        normalize(o.name) === normalize(event.homeTeam),
      );
      const awayOutcome = eligible.find((o) =>
        normalize(o.name) === normalize(event.awayTeam),
      );

      if (homeOutcome) homeProbs.push((1 / homeOutcome.price) * vigFactor);
      if (awayOutcome) awayProbs.push((1 / awayOutcome.price) * vigFactor);
    }

    if (homeProbs.length === 0 || awayProbs.length === 0) continue;

    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

    result.push({
      eventId: event.id,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTime: event.commence,
      homeProb: avg(homeProbs),
      awayProb: avg(awayProbs),
      sources: homeProbs.length,
    });
  }

  return result;
}

// ── Game scan cycle ──────────────────────────────────────────────────────────

async function runGameCycle(config: StrategyConfig): Promise<void> {
  out("SCAN", `#${cycleCount} — fetching NBA game odds...`);

  // 1. Fetch game h2h odds from sportsbooks
  const sbEvents = await fetchOdds("basketball_nba");
  const gameOdds = extractGameOdds(sbEvents);

  // 2. Fetch Polymarket game markets
  const pmGames = await fetchNbaGameMarkets();

  let matchedCount = 0;
  let cycleSignals = 0;
  const ts = new Date().toISOString();

  for (const game of gameOdds) {
    if (!checkRiskLimits({ sources: game.sources }, DEFAULT_RISK_CONFIG)) continue;

    // Match sportsbook game to Polymarket event by team names
    const pmGame = pmGames.find((pg) =>
      pg.teams.some((t) => textMentionsTeam(t.teamName, game.homeTeam)) &&
      pg.teams.some((t) => textMentionsTeam(t.teamName, game.awayTeam)),
    );
    if (!pmGame) continue;

    matchedCount++;

    // Compare each team
    const pairs: Array<{ team: string; sbProb: number }> = [
      { team: game.homeTeam, sbProb: game.homeProb },
      { team: game.awayTeam, sbProb: game.awayProb },
    ];

    for (const { team, sbProb } of pairs) {
      const pmTeam = pmGame.teams.find((t) => textMentionsTeam(t.teamName, team));
      if (!pmTeam) continue;

      const signal = shouldFlag(sbProb, pmTeam.yesPrice, config);
      if (!signal) continue;

      cycleSignals++;
      signalCount++;

      const reasoning =
        `${team} (${game.homeTeam} vs ${game.awayTeam}): ` +
        `fair ${(sbProb * 100).toFixed(1)}% vs ` +
        `Polymarket ${(pmTeam.yesPrice * 100).toFixed(1)}% ` +
        `(${signal.direction}, edge ${(signal.relativeEdge * 100).toFixed(1)}%, ${signal.signalStrength})`;

      const entry: GameSignalLogEntry = {
        ts,
        automation_id: GAME_AUTOMATION_ID,
        cycle: cycleCount,
        action: "SIGNAL",
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        team,
        sportsbookProb: sbProb,
        polymarketPrice: pmTeam.yesPrice,
        delta: signal.absDelta,
        relativeEdge: signal.relativeEdge,
        signalStrength: signal.signalStrength,
        polymarketSlug: pmGame.eventSlug,
        reasoning,
      };
      appendLog(entry);
      out("SIGNAL", reasoning);
    }
  }

  if (cycleSignals === 0) {
    const reasoning =
      `#${cycleCount} — ${gameOdds.length} sportsbook games, ` +
      `${pmGames.length} Polymarket games, ${matchedCount} matched, no game edges`;

    const entry: GameHeartbeatLogEntry = {
      ts,
      automation_id: GAME_AUTOMATION_ID,
      cycle: cycleCount,
      action: "NO_EDGE",
      games: gameOdds.length,
      matched: matchedCount,
      reasoning,
    };
    appendLog(entry);
    out("NO_EDGE", reasoning);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main(): Promise<void> {
  if (!isDryRun()) {
    process.stderr.write(
      "error: --dry-run flag is required. " +
        "Live trading is not implemented.\n",
    );
    process.exitCode = 1;
    return;
  }

  const config = DEFAULT_CONFIG;
  const pollInterval = parsePollInterval();

  out("START", `NBA futures + game scanner (dry-run) poll=${pollInterval}ms`);

  let running = true;

  process.on("SIGINT", () => {
    out(
      "STOP",
      `Shutting down — ${cycleCount} iterations, ` +
        `${signalCount} signals, ${errorCount} errors`,
    );
    running = false;
  });

  while (running) {
    cycleCount++;

    // Futures scan
    try {
      await runCycle(config);
    } catch (err: unknown) {
      errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      const errorEntry: ScanErrorLogEntry = {
        ts: new Date().toISOString(),
        automation_id: AUTOMATION_ID,
        cycle: cycleCount,
        action: "SCAN_ERROR",
        reasoning: message,
      };
      appendLog(errorEntry);
      out("SCAN_ERROR", `#${cycleCount} futures — ${message}`);
    }

    // Game-by-game scan
    try {
      await runGameCycle(config);
    } catch (err: unknown) {
      errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      const errorEntry: ScanErrorLogEntry = {
        ts: new Date().toISOString(),
        automation_id: GAME_AUTOMATION_ID,
        cycle: cycleCount,
        action: "SCAN_ERROR",
        reasoning: message,
      };
      appendLog(errorEntry);
      out("SCAN_ERROR", `#${cycleCount} games — ${message}`);
    }

    if (running) {
      await sleep(pollInterval);
    }
  }

  out(
    "STOP",
    `Runner stopped — ${cycleCount} iterations, ` +
      `${signalCount} signals, ${errorCount} errors`,
  );
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}


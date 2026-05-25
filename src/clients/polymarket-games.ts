/**
 * Polymarket client for NBA game-by-game moneyline markets.
 *
 * Fetches active NBA game events via the Gamma API (tag_id=745) and
 * extracts per-team YES prices for moneyline (game winner) markets.
 *
 * No auth required — read-only Gamma API.
 */

const GAMMA_API = "https://gamma-api.polymarket.com";

// NBA tag on Polymarket
const NBA_TAG_ID = 745;

/** A single team's market within a game event. */
export interface GameTeamMarket {
  marketId: string;
  /** Team name as shown on Polymarket (e.g. "OKC Thunder"). */
  teamName: string;
  /** Current YES price (implied win probability, 0–1). */
  yesPrice: number;
}

/** A Polymarket NBA game event with moneyline prices for both teams. */
export interface PolymarketGameOdds {
  eventSlug: string;
  eventTitle: string;
  teams: GameTeamMarket[];
}

// ── Gamma API response shapes ────────────────────────────────────────────────

interface GammaMarket {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  outcomes: string;
  outcomePrices: string;
  groupItemTitle?: string;
  sportsMarketType?: string;
}

interface GammaEvent {
  id: string;
  slug: string;
  title: string;
  active: boolean;
  markets: GammaMarket[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseYesPrice(market: GammaMarket): number {
  try {
    const prices: string[] = JSON.parse(market.outcomePrices);
    const outcomes: string[] = JSON.parse(market.outcomes);
    const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    const yesPrice = yesIdx >= 0 ? prices[yesIdx] : undefined;
    if (yesPrice !== undefined) {
      return parseFloat(yesPrice);
    }
    const first = prices[0];
    return first !== undefined ? parseFloat(first) : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Extract the team name from a moneyline market.
 * Prefers `groupItemTitle` (e.g. "OKC Thunder"), falls back to parsing
 * the question string (e.g. "OKC Thunder to win?").
 */
function extractTeamName(market: GammaMarket): string {
  if (market.groupItemTitle && market.groupItemTitle.trim()) {
    return market.groupItemTitle.trim();
  }
  // Try to extract "X to win?" or "Will X win?" patterns
  const q = market.question;
  const toWin = q.match(/^(.+?)\s+to win\??$/i);
  if (toWin?.[1]) return toWin[1].trim();
  const willWin = q.match(/^Will\s+(.+?)\s+win\??$/i);
  if (willWin?.[1]) return willWin[1].trim();
  return q;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch active NBA game events from Polymarket and return moneyline prices.
 *
 * Filters to events where at least two moneyline markets are found
 * (one per team), so we always get a complete home/away pair.
 *
 * @param limit - Max events to fetch (default 20; covers a full playoff day).
 */
export async function fetchNbaGameMarkets(
  limit = 20,
): Promise<PolymarketGameOdds[]> {
  const url = new URL(`${GAMMA_API}/events`);
  url.searchParams.set("tag_id", String(NBA_TAG_ID));
  url.searchParams.set("active", "true");
  url.searchParams.set("order", "volume_24hr");
  url.searchParams.set("ascending", "false");
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Polymarket Gamma API error (${response.status}): ${await response.text()}`,
    );
  }

  const events = (await response.json()) as GammaEvent[];
  const result: PolymarketGameOdds[] = [];

  for (const event of events) {
    if (!event.active) continue;

    // Keep only active, non-closed moneyline markets
    const moneylineMarkets = (event.markets ?? []).filter(
      (m) =>
        m.sportsMarketType === "moneyline" &&
        m.active &&
        !m.closed,
    );

    if (moneylineMarkets.length < 2) continue;

    const teams: GameTeamMarket[] = moneylineMarkets.map((m) => ({
      marketId: m.id,
      teamName: extractTeamName(m),
      yesPrice: parseYesPrice(m),
    }));

    result.push({
      eventSlug: event.slug,
      eventTitle: event.title,
      teams,
    });
  }

  return result;
}

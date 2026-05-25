# NBA Playoffs Prediction Market Strategy

**DEGA NBA Playoffs Prediction Market Hackathon 2026**

Automated scanner that detects mispricings between NBA sportsbook odds and Polymarket prices across two market types — championship futures and game-by-game moneylines — and flags trading opportunities in real time.

## Strategy

**Archetype:** Cross-venue arbitrage (sportsbook consensus vs. Polymarket)

**Thesis:** Sportsbook odds and Polymarket futures prices serve different user bases and update at different speeds. Sportsbooks aggregate sharp professional money and remove vig to produce fair probabilities. Polymarket reflects retail prediction market participants prone to emotional bias. When the relative gap exceeds 8%, a structural mispricing exists.

**Signal logic — two parallel scanners per cycle:**

*Futures scanner (`nba-futures-v1`):*
1. Fetch NBA championship outright odds from The Odds API (all bookmakers)
2. For each bookmaker, strip the overround (vig) so implied probs sum to 1 — giving the **fair probability** per team
3. Average fair probabilities across all bookmakers per team
4. Fetch matching Polymarket futures market for that team
5. Compute relative edge: `relativeEdge = (fairProb - polymarketPrice) / polymarketPrice`
6. If `|relativeEdge| ≥ 8%` → flag signal with strength classification

*Game scanner (`nba-games-v1`):*
1. Fetch NBA game h2h odds from The Odds API
2. Strip vig per bookmaker, average across sources (min 2)
3. Fetch active NBA game events from Polymarket Gamma API (`tag_id=745`, `sportsMarketType=moneyline`)
4. Match sportsbook games to Polymarket events by team name
5. Same relative edge formula and gate as futures scanner

**Signal strength tiers:**
| Tier | Threshold |
|---|---|
| Strong | ≥ 25% relative edge |
| Moderate | ≥ 12% relative edge |
| Weak | ≥ 8% relative edge |

The relative formula matters: a 5pp gap on a 10% underdog (50% relative edge) is a far stronger signal than a 5pp gap on a 50% favourite (10% relative edge). Absolute thresholds miss this distinction.

**Risk gates:**
- Minimum 2 bookmaker sources required (no single-source noise)
- Maximum delta capped at 50% (filters stale or erroneous data feeds)

This scanner runs in **dry-run mode only** — it detects and logs opportunities but never places orders.

## Setup

```bash
cp .env.example .env
# Add your free Odds API key from https://the-odds-api.com/
pnpm install
```

## Run

```bash
pnpm start
```

Logs are written to `.canon/execution/YYYY-MM-DD.jsonl`.

## Test

```bash
pnpm test
```

## Project structure

```
src/
├── runner.ts              # Main polling loop + stdout protocol (futures + games)
├── strategy.ts            # FuturesScanner wiring class
├── env.ts                 # Environment variable helpers
├── config/
│   ├── strategy.ts        # StrategyConfig + defaults
│   └── risk.ts            # RiskConfig + defaults
├── service/
│   ├── signals.ts         # shouldFlag() — relative edge detection
│   ├── risk.ts            # checkRiskLimits() — source validation
│   └── ai-scorer.ts       # LLM signal validation via OpenRouter
├── clients/
│   ├── sportsbook.ts      # The Odds API client (outrights + h2h)
│   ├── polymarket.ts      # Polymarket Gamma API — futures markets
│   └── polymarket-games.ts # Polymarket Gamma API — game events (tag_id=745)
└── types/
    └── game.ts            # TeamComparison + GameComparison interfaces
.canon/
├── config.yaml            # Canon agent/skill/workflow routing
├── agents/                # 6 agent role definitions
├── skills/                # 8 domain knowledge docs
├── workflows/             # 5 workflow step sequences
└── execution/             # JSONL logs (gitignored)
```

## Execution logs

Each scan cycle writes a structured JSONL entry to `.canon/execution/`:

```jsonc
// Futures signal
{"ts":"...","automation_id":"nba-futures-v1","cycle":1,"action":"SIGNAL","team":"Oklahoma City Thunder","sportsbookProb":0.41,"polymarketPrice":0.31,"delta":0.10,"relativeEdge":0.32,"signalStrength":"strong","reasoning":"..."}

// Game signal
{"ts":"...","automation_id":"nba-games-v1","cycle":1,"action":"SIGNAL","homeTeam":"OKC Thunder","awayTeam":"Minnesota Timberwolves","team":"OKC Thunder","sportsbookProb":0.68,"polymarketPrice":0.55,"delta":0.13,"relativeEdge":0.24,"signalStrength":"moderate","polymarketSlug":"nba-okc-min-2026-05-25","reasoning":"..."}

// No edge found
{"ts":"...","automation_id":"nba-futures-v1","cycle":1,"action":"NO_EDGE","teams":4,"markets":50,"matched":4,"reasoning":"..."}
```

## About

Built on the Canon prediction market automation framework by DEGA.

The edge: sportsbooks aggregate sharp professional money and carry bookmaker vig that distorts raw odds. By stripping the overround first, we obtain fair team probabilities. Polymarket reflects retail prediction market participants. Sports markets systematically underprice certain playoff teams due to retail emotional bias — this scanner surfaces those gaps using relative mispricing, which correctly weights signals regardless of a team's underlying probability.

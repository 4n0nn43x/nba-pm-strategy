# NBA Playoffs Prediction Market Strategy

**DEGA NBA Playoffs Prediction Market Hackathon 2026**

Automated scanner that detects mispricings between NBA Championship outright odds from major sportsbooks and Polymarket futures prices — and flags trading opportunities in real time.

## Strategy

**Archetype:** Cross-venue arbitrage (sportsbook consensus vs. Polymarket)

**Thesis:** Sportsbook odds and Polymarket futures prices serve different user bases and update at different speeds. When the implied probability from sportsbook consensus diverges from the Polymarket YES price by more than 0.5%, a mispricing exists.

**Signal logic:**
1. Fetch NBA championship outright odds from The Odds API (all bookmakers)
2. Compute average implied probability per team: `impliedProb = avg(1 / decimalOdds)`
3. Fetch matching Polymarket futures market for that team
4. If `|impliedProb - polymarketPrice| ≥ 0.5%` → flag signal

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
├── runner.ts              # Main polling loop + stdout protocol
├── strategy.ts            # FuturesScanner wiring class
├── env.ts                 # Environment variable helpers
├── config/
│   ├── strategy.ts        # StrategyConfig + defaults
│   └── risk.ts            # RiskConfig + defaults
├── service/
│   ├── signals.ts         # shouldFlag() — mispricing detection
│   └── risk.ts            # checkRiskLimits() — source validation
├── clients/
│   ├── sportsbook.ts      # The Odds API client
│   └── polymarket.ts      # Polymarket CLOB client
└── types/
    └── game.ts            # TeamComparison interface
```

## Execution logs

Each scan cycle writes a structured JSONL entry to `.canon/execution/`:

```jsonc
// Signal detected
{"ts":"...","automation_id":"nba-futures-v1","cycle":1,"action":"SIGNAL","team":"Oklahoma City Thunder","sportsbookProb":0.38,"polymarketPrice":0.31,"delta":0.07,"reasoning":"..."}

// No edge found
{"ts":"...","automation_id":"nba-futures-v1","cycle":1,"action":"NO_EDGE","teams":30,"markets":28,"matched":22,"reasoning":"..."}
```

## About

Built on the Canon prediction market automation framework by DEGA. Strategy inspired by cross-venue arbitrage research (arXiv:2508.03474v1 — Jon-Becker/prediction-market-analysis).

The edge: sportsbooks aggregate sharp professional money; Polymarket reflects retail prediction market participants. Sports markets systematically underprice home favorites and certain playoff teams due to retail emotional bias — this scanner surfaces those gaps.

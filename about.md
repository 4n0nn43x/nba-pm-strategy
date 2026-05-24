# About — NBA Playoffs Prediction Market Scanner

## What this automation does

This scanner detects pricing inefficiencies between NBA Championship futures on major sportsbooks and Polymarket. Every 30 seconds it computes a vig-stripped fair probability for each team from bookmaker consensus, compares it to the live Polymarket price, and flags mispricings where the relative gap exceeds 8%. When a signal is detected, an LLM evaluates whether the edge is genuine or noise and produces a structured recommendation.

The scanner runs in dry-run mode — it detects, scores, and logs opportunities but never places orders.

---

## Why mispricings exist

Sportsbooks and Polymarket serve different audiences:

- **Sportsbooks** aggregate sharp professional money. Their lines reflect the collective intelligence of experienced bettors who move markets quickly on new information.
- **Polymarket** reflects retail prediction market participants who are more susceptible to recency bias, narrative-driven pricing, and slower reaction to statistical signals.

This structural difference creates persistent, measurable gaps — particularly for teams with strong underlying fundamentals that the retail crowd undervalues.

---

## Automation flow

```
Every 30 seconds
│
├─ 1. FETCH ODDS
│     The Odds API → all available bookmakers
│     Sport key: basketball_nba_championship_winner
│
├─ 2. STRIP VIG (per bookmaker)
│     Raw implied prob = 1 / decimal_odds
│     Sum of raw probs > 1.0 (bookmaker margin baked in)
│     Fair prob = raw_prob / sum_of_all_raw_probs
│     → probabilities now sum to exactly 1.0 per book
│
├─ 3. AVERAGE FAIR PROBS
│     Average vig-stripped prob across all bookmakers per team
│     Require ≥ 2 sources (risk gate — rejects single-book noise)
│
├─ 4. FETCH POLYMARKET PRICES
│     Gamma API (read-only, no auth)
│     Query: "NBA Finals" → active, non-closed markets
│
├─ 5. MATCH TEAMS TO MARKETS
│     Fuzzy match: full name, last word, alias table
│     (e.g. "76ers" → "Philadelphia", "Mavs" → "Dallas Mavericks")
│
├─ 6. COMPUTE RELATIVE EDGE
│     relativeEdge = (fairProb - polymarketPrice) / polymarketPrice
│     Relative formula matters: a 5pp gap on a 10% underdog (50% edge)
│     is a far stronger signal than the same gap on a 50% favourite (10% edge)
│
├─ 7. SIGNAL GATE
│     |relativeEdge| < 8%  → skip (no edge)
│     |relativeEdge| ≥ 8%  → signal
│
│     Signal strength tiers:
│       weak     8–12%   relative edge
│       moderate 12–25%  relative edge
│       strong   ≥ 25%   relative edge
│
├─ 8. AI CONFIDENCE SCORING  (requires OPENROUTER_API_KEY)
│     Sends signal data to LLM via OpenRouter
│     Model: configurable via OPENROUTER_MODEL (default: llama-3.3-70b, free)
│     LLM uses its NBA knowledge (team form, roster, playoff context) to assess:
│       - confidenceScore  0–1
│       - recommendation   TAKE_EDGE | WATCH_ONLY | SKIP_TOO_RISKY
│       - reasoning        plain-language explanation
│       - riskFactors      up to 3 risks that could invalidate the edge
│
└─ 9. LOG & OUTPUT
      Writes JSONL to .canon/execution/YYYY-MM-DD.jsonl
      Prints tagged line to stdout (SIGNAL / NO_EDGE / SCAN_ERROR)
```

---

## Signal output example

**Stdout:**
```
SIGNAL  Oklahoma City Thunder: fair 38.2% vs Polymarket 28.0%
        (sportsbook higher, edge +36.4%, strong) | AI: TAKE_EDGE (91%)
```

**JSONL log entry:**
```json
{
  "ts": "2026-05-24T10:17:44.000Z",
  "automation_id": "nba-futures-v1",
  "cycle": 3,
  "action": "SIGNAL",
  "team": "Oklahoma City Thunder",
  "sportsbookProb": 0.382,
  "polymarketPrice": 0.280,
  "delta": 0.102,
  "relativeEdge": 0.364,
  "signalStrength": "strong",
  "ai": {
    "confidenceScore": 0.91,
    "recommendation": "TAKE_EDGE",
    "reasoning": "OKC consensus at 38% across 5 bookmakers is reliable. Polymarket at 28% is a significant undervaluation. SGA's MVP-level performance and OKC's #1 seed justify sportsbook pricing. Retail market appears anchored to pre-playoff perception.",
    "riskFactors": [
      "low Polymarket liquidity may exaggerate apparent gap",
      "potential undisclosed injury not yet priced by books",
      "late-series momentum shift not captured in outright odds"
    ]
  },
  "reasoning": "Oklahoma City Thunder: fair 38.2% vs Polymarket 28.0% (sportsbook higher, edge +36.4%, strong) | AI: TAKE_EDGE (91%)"
}
```

---

## Risk management

| Gate | Rule | Purpose |
|---|---|---|
| Min sources | ≥ 2 bookmakers | Rejects single-book outliers and data errors |
| Max delta | ≤ 50% absolute | Filters stale feeds and API anomalies |
| Relative threshold | ≥ 8% relative edge | Ignores noise on tight markets |
| AI recommendation | SKIP_TOO_RISKY | Discards quantitatively valid but contextually risky signals |

---

## Key design decisions

**Vig stripping before averaging**
Most naive implementations use raw `1/odds` implied probabilities, which carry the bookmaker's margin (typically 4–8%). This biases every team's probability upward and corrupts the comparison with Polymarket. We normalize per bookmaker before averaging so the fair probability reflects true market consensus.

**Relative edge over absolute delta**
An absolute threshold (e.g. "flag if gap > 2pp") treats all teams equally regardless of their underlying probability. A 2pp gap on a 5% longshot is a 40% relative edge — a massive signal. The same 2pp on a 45% favourite is only 4.4% — likely noise. The relative formula correctly weights signal strength by scale.

**LLM as qualitative validator**
The quantitative signal is necessary but not sufficient. A detected edge might exist because of an injury rumour not yet reflected in odds, a data feed lag, or thin Polymarket liquidity. The LLM brings contextual NBA knowledge — team form, key players, playoff history — to validate whether the quantitative gap makes intuitive sense before recommending action.

**Graceful AI degradation**
If `OPENROUTER_API_KEY` is absent or the API call fails, the scanner continues normally without AI enrichment. The quantitative signal is still logged. This keeps the system robust for users who want to run without an OpenRouter account.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript 5.8 (ESM) |
| Odds source | The Odds API |
| Prediction market | Polymarket Gamma API (read-only) |
| AI scoring | OpenRouter (configurable model) |
| Test suite | Vitest — 21 unit tests |
| Automation framework | Canon by DEGA |
| Package manager | pnpm |

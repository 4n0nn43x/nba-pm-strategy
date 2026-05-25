# Skill: polymarket

Polymarket API reference for the NBA scanner.

## Gamma API (read-only, no auth)

Base URL: `https://gamma-api.polymarket.com`

### Search markets (futures)
```
GET /markets?q=NBA+Finals&active=true&closed=false&limit=50
```
Returns `GammaMarket[]` with `outcomes` and `outcomePrices` as JSON strings.

### List events (game-by-game)
```
GET /events?tag_id=745&active=true&order=volume_24hr&ascending=false&limit=20
```
Returns `GammaEvent[]`. Each event has a `markets` array.

### NBA tag
- `tag_id=745` = NBA tag
- Event slugs: `nba-{abbr1}-{abbr2}-{YYYY-MM-DD}` (e.g. `nba-okc-min-2026-05-25`)

### Moneyline markets
Within an event, filter `markets` where `sportsMarketType === "moneyline"`.
Each is binary (YES/NO). `groupItemTitle` = team name.

```json
{
  "question": "OKC Thunder to win?",
  "sportsMarketType": "moneyline",
  "groupItemTitle": "OKC Thunder",
  "outcomes": "[\"Yes\",\"No\"]",
  "outcomePrices": "[\"0.73\",\"0.27\"]"
}
```

## Price Parsing

```typescript
const prices: string[] = JSON.parse(market.outcomePrices);
const outcomes: string[] = JSON.parse(market.outcomes);
const yesIdx = outcomes.findIndex(o => o.toLowerCase() === "yes");
const yesPrice = parseFloat(prices[yesIdx]);
```

## CLOB API (requires auth — not used in this scanner)

Base URL: `https://clob.polymarket.com`
Used for placing orders. Out of scope for dry-run scanner.

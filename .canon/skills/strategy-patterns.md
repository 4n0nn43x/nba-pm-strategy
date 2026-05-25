# Skill: strategy-patterns

Common patterns for sportsbook-to-prediction-market arbitrage strategies.

## Pattern 1: Outright Futures Arbitrage

Compare championship winner odds across sportsbooks and Polymarket.
- Data source: The Odds API `basketball_nba_championship_winner` (outrights)
- Polymarket: `GET /markets?q=NBA+Finals`
- Update frequency: odds refresh every ~30 minutes

Good for: slow-moving markets, overnight edge detection.

## Pattern 2: Game Moneyline Arbitrage

Compare pre-game moneyline odds to Polymarket game winner markets.
- Data source: The Odds API `basketball_nba` (h2h markets)
- Polymarket: `GET /events?tag_id=745` (sportsMarketType: moneyline)
- Update frequency: odds move significantly 30–90 min before tip-off

Good for: sharp intraday edges before games.

## Pattern 3: In-Game Live Odds

Compare live in-game sportsbook lines to Polymarket live markets.
Not implemented — requires ultra-low latency and Polymarket CLOB access.

## Relative Edge Formula

```
relativeEdge = (sportsbookFairProb - polymarketPrice) / polymarketPrice
```

Positive = sportsbook thinks team is more likely than Polymarket.
Strategy: buy YES on Polymarket (or NO on the opponent).

Negative = Polymarket is higher than sportsbook.
Strategy: sell YES on Polymarket (requires CLOB, not implemented in dry-run).

## Signal Strength Tiers

| Strength  | Relative Edge |
|-----------|---------------|
| strong    | ≥ 25%         |
| moderate  | ≥ 12%         |
| weak      | ≥ 8%          |

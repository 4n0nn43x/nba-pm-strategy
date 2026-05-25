# Skill: backtesting

Guidelines for backtesting the NBA prediction market strategy.

## Data Sources

- Historical sportsbook odds: The Odds API historical endpoint
  `GET /v4/sports/{sport}/odds-history?date=YYYY-MM-DDTHH:MM:SSZ`
- Historical Polymarket prices: Gamma API `/markets/{id}/prices-history`
  or download from Polymarket data dumps

## Backtest Methodology

1. Replay historical (sportsbook_odds, polymarket_price) pairs at T-60min before game
2. Apply `shouldFlag()` with the same thresholds
3. Record which signals resolved as correct (team won)
4. Calculate hit rate, ROI, Sharpe ratio

## Key Metrics

- **Hit rate**: % of signals where the "underpriced" side won
- **ROI**: profit per unit staked across all signals
- **Edge realized**: actual (outcome_prob - polymarket_entry_price) vs expected
- **False positive rate**: signals that fired but the team lost badly

## Limitations

- Polymarket prices from Gamma API are mid prices, not fill prices
- Actual fill price may be worse due to spread (especially on illiquid markets)
- Sportsbook odds at scrape time may differ from actual available odds
- Survivorship bias: games that were cancelled/postponed are missing

## Files

Backtest scripts should go in `scripts/backtest/`, not in `src/`.
Log results to `scripts/backtest/results/YYYY-MM-DD.json`.

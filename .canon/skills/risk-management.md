# Skill: risk-management

Risk management principles for prediction market trading.

## Position Sizing

Never allocate more than 5% of total portfolio to a single position.
For a $1000 portfolio: max $50 per trade.

Kelly Criterion (informational, not implemented):
```
f = (bp - q) / b
  b = net odds (payout - 1)
  p = estimated win probability
  q = 1 - p
```
Use half-Kelly or quarter-Kelly to account for model uncertainty.

## Data Quality Gates

A signal is only actionable if:
1. At least 2 independent bookmaker sources agree on the odds
2. The relative edge exceeds the threshold after vig removal
3. The Polymarket market is active and not closing within 5 minutes

## Circuit Breakers

Situations where the scanner should suppress signals:
- Game postponement or cancellation (prices spike erratically)
- Polymarket spread > 5pp (illiquid market)
- Only 1 bookmaker source available
- API error rate > 50% in the last cycle

## Risk Config (`src/config/risk.ts`)

```typescript
interface RiskConfig {
  minBookmakerSources: number;  // default 2
}
```

Extend with `maxRelativeEdge` to filter out impossibly large edges (data errors).

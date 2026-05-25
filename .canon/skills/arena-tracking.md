# Skill: arena-tracking

How to track strategy performance on Canon Arena.

## What is Canon Arena?

Canon Arena is a leaderboard for Canon automations. Strategies are ranked by
signal quality, hit rate, and overall performance.

## Registration

Automations are registered with:
```bash
canon register \
  --name "NBA Playoffs Prediction Market Strategy" \
  --automation-id nba-futures-v1 \
  --entry "pnpm exec tsx src/runner.ts --dry-run"
```

The `automation_id` field in JSONL logs must match the registered ID.

## Automation IDs in This Project

- `nba-futures-v1`: Championship futures scanner
- `nba-games-v1`: Game-by-game moneyline scanner

## Log Format for Arena

Arena reads `.canon/execution/*.jsonl` files. SIGNAL entries are tracked.
Required signal fields:
- `ts`, `automation_id`, `cycle`, `action: "SIGNAL"`, `reasoning`

Optional but recommended:
- `signalStrength`: "strong" | "moderate" | "weak"
- `relativeEdge`: number (used for ranking)

## Monitoring

View live logs:
```bash
tail -f .canon/execution/$(date +%Y-%m-%d).jsonl | jq .
```

Count signals by strength:
```bash
jq 'select(.action=="SIGNAL") | .signalStrength' .canon/execution/*.jsonl | sort | uniq -c
```

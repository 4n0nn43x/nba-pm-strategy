# Skill: canon-conventions

Conventions for building Canon-compatible automations.

## Stdout Protocol (ACP)

Every line written to stdout must be tagged:

```
START <message>       # Runner started, include poll interval
SCAN <message>        # Cycle began, include cycle number
SIGNAL <message>      # Mispricing detected — log to JSONL
NO_EDGE <message>     # Cycle complete, no opportunities
SCAN_ERROR <message>  # Recoverable error in a cycle
STOP <message>        # Runner shutting down (SIGINT), include totals
```

Canon TUI reads these tags to update the dashboard in real time.
Never write untagged lines to stdout during normal operation.

## JSONL Logging

All structured data goes to `.canon/execution/YYYY-MM-DD.jsonl` (one JSON object per line).
Required fields on every entry:

```typescript
{
  ts: string;           // ISO 8601 timestamp
  automation_id: string; // matches Canon Arena registration
  cycle: number;
  action: "SIGNAL" | "NO_EDGE" | "SCAN_ERROR";
  reasoning: string;    // human-readable summary
}
```

## File Structure

```
src/
  clients/   # External API wrappers (no business logic)
  config/    # Constants and config interfaces
  service/   # Business logic (signals, risk, AI scoring)
  types/     # Shared TypeScript interfaces
  runner.ts  # Entry point — polling loop + stdout protocol
.canon/
  config.yaml
  agents/    # Agent role definitions
  skills/    # Domain knowledge
  workflows/ # Step sequences
  execution/ # JSONL logs (gitignored)
```

## Domain Layering

Types → Config → Clients → Service → Runner

Lower layers must never import from higher layers.

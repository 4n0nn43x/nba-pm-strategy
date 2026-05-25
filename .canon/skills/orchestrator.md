# Skill: orchestrator

How to use Canon's orchestration features for multi-step automations.

## Polling Loop Pattern

The runner implements a standard Canon polling loop:

```typescript
while (running) {
  out("SCAN", `#${cycle} — starting scan`);
  try {
    await runCycle(config);
  } catch (err) {
    out("SCAN_ERROR", `#${cycle} — ${err.message}`);
  }
  await sleep(pollInterval);
}
```

## Graceful Shutdown

Always handle SIGINT to emit a STOP line:
```typescript
process.on("SIGINT", () => {
  out("STOP", `Shutting down — ${cycles} cycles, ${signals} signals`);
  running = false;
});
```

## Environment-Driven Configuration

Use `process.env` for runtime config, never hardcode:
- `POLL_INTERVAL_MS`: scan frequency (default 30000)
- `THE_ODDS_API_KEY`: required
- `ANTHROPIC_API_KEY`: optional

## Multi-Scanner Pattern

When running multiple scans per cycle (futures + games):
1. Run each scan independently with try/catch
2. Emit separate SCAN/NO_EDGE/SIGNAL lines per scanner
3. Use distinct `automation_id` per scanner in JSONL logs
4. Total cycle counts and signal counts should span all scanners

## Canon TUI Integration

Canon TUI expects:
- One process per automation
- Tagged stdout lines for dashboard parsing
- JSONL logs in `.canon/execution/`
- Exit code 0 on SIGINT (graceful), non-zero on fatal error

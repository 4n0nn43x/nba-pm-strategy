import type { StrategyConfig } from "../config/strategy.js";

export interface SignalCheck {
  delta: number;
  absDelta: number;
  direction: "sportsbook higher" | "Polymarket higher";
}

/**
 * Returns a signal if the delta between sportsbook implied probability and
 * Polymarket price exceeds the configured threshold. Returns null otherwise.
 */
export function shouldFlag(
  sportsbookProb: number,
  polymarketPrice: number,
  config: StrategyConfig,
): SignalCheck | null {
  const delta = sportsbookProb - polymarketPrice;
  const absDelta = Math.abs(delta);

  if (absDelta < config.mispricingThreshold) return null;

  return {
    delta,
    absDelta,
    direction: delta > 0 ? "sportsbook higher" : "Polymarket higher",
  };
}

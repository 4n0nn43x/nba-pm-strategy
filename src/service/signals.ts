import type { StrategyConfig } from "../config/strategy.js";

export interface SignalCheck {
  delta: number;
  absDelta: number;
  /** Relative edge: (sportsbookFairProb - polymarketPrice) / polymarketPrice */
  relativeEdge: number;
  signalStrength: "strong" | "moderate" | "weak";
  direction: "sportsbook higher" | "Polymarket higher";
}

/**
 * Detects a mispricing using relative edge rather than absolute delta.
 * The relative formula corrects for scale — a 5pp gap on a 10% favourite
 * is a much stronger signal than a 5pp gap on a 50% favourite.
 *
 * Strength tiers:
 *   strong   : |relativeEdge| ≥ 25%
 *   moderate : |relativeEdge| ≥ 12%
 *   weak     : |relativeEdge| ≥ threshold (default 8%)
 */
export function shouldFlag(
  sportsbookProb: number,
  polymarketPrice: number,
  config: StrategyConfig,
): SignalCheck | null {
  if (polymarketPrice <= 0) return null;

  const delta = sportsbookProb - polymarketPrice;
  const absDelta = Math.abs(delta);
  const relativeEdge = delta / polymarketPrice;
  const absRelativeEdge = Math.abs(relativeEdge);

  if (absRelativeEdge < config.relativeEdgeThreshold) return null;

  const signalStrength: "strong" | "moderate" | "weak" =
    absRelativeEdge >= 0.25 ? "strong" :
    absRelativeEdge >= 0.12 ? "moderate" :
    "weak";

  return {
    delta,
    absDelta,
    relativeEdge,
    signalStrength,
    direction: delta > 0 ? "sportsbook higher" : "Polymarket higher",
  };
}

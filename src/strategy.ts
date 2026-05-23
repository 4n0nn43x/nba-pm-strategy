import type { StrategyConfig } from "./config/strategy.js";
import type { RiskConfig } from "./config/risk.js";
import type { TeamComparison } from "./types/game.js";
import { shouldFlag } from "./service/signals.js";
import { checkRiskLimits } from "./service/risk.js";

export interface SignalResult {
  team: string;
  sportsbookProb: number;
  polymarketPrice: number;
  delta: number;
  absDelta: number;
  relativeEdge: number;
  signalStrength: "strong" | "moderate" | "weak";
  direction: "sportsbook higher" | "Polymarket higher";
}

/**
 * Wiring class that evaluates a list of team comparisons and returns
 * all that pass both risk limits and the mispricing signal threshold.
 */
export class FuturesScanner {
  constructor(
    private readonly strategyConfig: StrategyConfig,
    private readonly riskConfig: RiskConfig,
  ) {}

  evaluate(comparisons: TeamComparison[]): SignalResult[] {
    const results: SignalResult[] = [];

    for (const c of comparisons) {
      if (!checkRiskLimits({ sources: c.sources }, this.riskConfig)) continue;

      const signal = shouldFlag(c.sportsbookProb, c.polymarketPrice, this.strategyConfig);
      if (!signal) continue;

      results.push({
        team: c.team,
        sportsbookProb: c.sportsbookProb,
        polymarketPrice: c.polymarketPrice,
        delta: signal.delta,
        absDelta: signal.absDelta,
        relativeEdge: signal.relativeEdge,
        signalStrength: signal.signalStrength,
        direction: signal.direction,
      });
    }

    return results;
  }
}

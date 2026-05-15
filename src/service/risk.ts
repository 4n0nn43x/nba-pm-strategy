import type { RiskConfig } from "../config/risk.js";

/**
 * Returns true if the trade parameters satisfy all risk limits.
 * Currently gates on minimum number of bookmaker sources.
 */
export function checkRiskLimits(
  params: { sources: number },
  config: RiskConfig,
): boolean {
  return params.sources >= config.minBookmakerSources;
}

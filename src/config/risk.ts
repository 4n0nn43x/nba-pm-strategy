export interface RiskConfig {
  /** Minimum number of bookmaker sources required to trust the implied probability. */
  minBookmakerSources: number;
  /** Maximum delta allowed — filters out data errors or stale feeds. */
  maxDeltaPercent: number;
}

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  minBookmakerSources: 2,
  maxDeltaPercent: 0.50,
};

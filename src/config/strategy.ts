export interface StrategyConfig {
  /**
   * Minimum relative edge to flag a signal.
   * relativeEdge = (sportsbookFairProb - polymarketPrice) / polymarketPrice
   * Default 0.08 = 8% relative mispricing.
   */
  relativeEdgeThreshold: number;
  /** The Odds API sport key for NBA championship futures. */
  sportKey: string;
  /** Search query for Polymarket NBA Finals markets. */
  searchQuery: string;
  /** Milliseconds between scan cycles. */
  pollIntervalMs: number;
}

export const DEFAULT_CONFIG: StrategyConfig = {
  relativeEdgeThreshold: 0.08,
  sportKey: "basketball_nba_championship_winner",
  searchQuery: "NBA Finals",
  pollIntervalMs: 30_000,
};

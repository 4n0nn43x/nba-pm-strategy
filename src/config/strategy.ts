export interface StrategyConfig {
  /** Minimum delta between sportsbook implied prob and Polymarket price to flag a signal. */
  mispricingThreshold: number;
  /** The Odds API sport key for NBA championship futures. */
  sportKey: string;
  /** Search query for Polymarket NBA Finals markets. */
  searchQuery: string;
  /** Milliseconds between scan cycles. */
  pollIntervalMs: number;
}

export const DEFAULT_CONFIG: StrategyConfig = {
  mispricingThreshold: 0.005,
  sportKey: "basketball_nba_championship_winner",
  searchQuery: "NBA Finals",
  pollIntervalMs: 30_000,
};

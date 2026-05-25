/** A team's championship odds comparison across venues. */
export interface TeamComparison {
  team: string;
  /** Average implied probability from sportsbook outrights. */
  sportsbookProb: number;
  /** Polymarket YES price for this team's championship market. */
  polymarketPrice: number;
  /** sportsbookProb - polymarketPrice (positive = sportsbook higher). */
  delta: number;
  /** Number of sportsbook sources contributing to the average. */
  sources: number;
}

/** Per-team odds comparison for a single game (moneyline). */
export interface GameComparison {
  /** Sportsbook event ID. */
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  /** Scheduled tip-off time. */
  commenceTime: Date;
  /** Team being compared in this record. */
  team: string;
  /** Vig-stripped implied probability from sportsbooks. */
  sportsbookProb: number;
  /** Polymarket YES price for this team to win. */
  polymarketPrice: number;
  /** sportsbookProb - polymarketPrice. */
  delta: number;
  /** Number of sportsbook sources. */
  sources: number;
  /** Polymarket event slug. */
  polymarketSlug: string;
}


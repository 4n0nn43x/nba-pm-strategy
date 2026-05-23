import { describe, it, expect } from "vitest";
import {
  normalize,
  textMentionsTeam,
  extractTeamOdds,
} from "../runner.js";
import { DEFAULT_CONFIG } from "../config/strategy.js";
import { DEFAULT_RISK_CONFIG } from "../config/risk.js";
import { shouldFlag } from "../service/signals.js";
import { checkRiskLimits } from "../service/risk.js";
import { FuturesScanner } from "../strategy.js";

describe("normalize", () => {
  it("lowercases and strips non-alphanumeric characters", () => {
    expect(normalize("Los Angeles Lakers")).toBe("los angeles lakers");
  });

  it("preserves numbers", () => {
    expect(normalize("76ers")).toBe("76ers");
  });
});

describe("textMentionsTeam", () => {
  it("matches full team name in question", () => {
    const q = "Will the Oklahoma City Thunder win the 2026 NBA Finals?";
    expect(textMentionsTeam(q, "Oklahoma City Thunder")).toBe(true);
  });

  it("matches last word of team name", () => {
    const q = "Will the Thunder win?";
    expect(textMentionsTeam(q, "Oklahoma City Thunder")).toBe(true);
  });

  it("does not match unrelated teams", () => {
    const q = "Will the Lakers win?";
    expect(textMentionsTeam(q, "Boston Celtics")).toBe(false);
  });

  it("matches via alias table", () => {
    const q = "Will the Philadelphia 76ers win?";
    expect(textMentionsTeam(q, "Philadelphia 76ers")).toBe(true);
  });
});

describe("extractTeamOdds", () => {
  it("strips vig and averages fair probs across bookmakers", () => {
    // Book 1: A=2.0 (50%), B=2.0 (50%) → sum=1.0 → A=0.5, B=0.5
    // Book 2: A=2.5 (40%), B=5/3 (60%) → sum=1.0 → A=0.4, B=0.6
    // Team A avg: (0.5+0.4)/2 = 0.45, sources=2
    const events = [
      {
        id: "ev1",
        homeTeam: "",
        awayTeam: "",
        commence: new Date(),
        bookmakers: [
          {
            key: "bk1",
            title: "Book1",
            markets: [
              {
                key: "outrights",
                outcomes: [
                  { name: "Team A", price: 2.0 },
                  { name: "Team B", price: 2.0 },
                ],
              },
            ],
          },
          {
            key: "bk2",
            title: "Book2",
            markets: [
              {
                key: "outrights",
                outcomes: [
                  { name: "Team A", price: 2.5 },
                  { name: "Team B", price: 5 / 3 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = extractTeamOdds(events);
    expect(result).toHaveLength(2);
    const teamA = result.find((r) => r.team === "Team A");
    expect(teamA?.impliedProb).toBeCloseTo(0.45, 3);
    expect(teamA?.sources).toBe(2);
  });

  it("removes bookmaker overround so fair probs sum to 1", () => {
    // 10% vig: A=2.0 (50%), B=2.5 (40%) → raw sum=0.9
    // After vig strip: A=0.5/0.9≈0.5556, B=0.4/0.9≈0.4444 → sum≈1.0
    const events = [
      {
        id: "ev1",
        homeTeam: "",
        awayTeam: "",
        commence: new Date(),
        bookmakers: [
          {
            key: "bk1",
            title: "Book1",
            markets: [
              {
                key: "outrights",
                outcomes: [
                  { name: "Team A", price: 2.0 },
                  { name: "Team B", price: 2.5 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = extractTeamOdds(events);
    const sum = result.reduce((s, r) => s + r.impliedProb, 0);
    expect(sum).toBeCloseTo(1.0, 3);
    const teamA = result.find((r) => r.team === "Team A");
    expect(teamA?.impliedProb).toBeCloseTo(0.5556, 3);
  });
});

describe("DEFAULT_CONFIG", () => {
  it("uses an 8% relative edge threshold", () => {
    expect(DEFAULT_CONFIG.relativeEdgeThreshold).toBe(0.08);
  });
});

describe("DEFAULT_RISK_CONFIG", () => {
  it("requires at least 2 bookmaker sources", () => {
    expect(DEFAULT_RISK_CONFIG.minBookmakerSources).toBe(2);
  });
});

describe("shouldFlag", () => {
  it("returns signal when relative edge exceeds threshold", () => {
    // sportsbook=0.15, polymarket=0.10 → relativeEdge=(0.15-0.10)/0.10=0.5 (50%)
    const result = shouldFlag(0.15, 0.1, DEFAULT_CONFIG);
    expect(result).not.toBeNull();
    expect(result?.direction).toBe("sportsbook higher");
    expect(result?.absDelta).toBeCloseTo(0.05, 3);
    expect(result?.relativeEdge).toBeCloseTo(0.5, 3);
    expect(result?.signalStrength).toBe("strong");
  });

  it("returns null when relative edge below threshold", () => {
    // sportsbook=0.15, polymarket=0.148 → relativeEdge≈1.35% < 8%
    const result = shouldFlag(0.15, 0.148, DEFAULT_CONFIG);
    expect(result).toBeNull();
  });

  it("detects Polymarket higher direction", () => {
    // sportsbook=0.10, polymarket=0.15 → relativeEdge=-0.05/0.15≈-33%
    const result = shouldFlag(0.1, 0.15, DEFAULT_CONFIG);
    expect(result).not.toBeNull();
    expect(result?.direction).toBe("Polymarket higher");
    expect(result?.relativeEdge).toBeCloseTo(-0.333, 2);
    expect(result?.signalStrength).toBe("strong");
  });

  it("classifies moderate signal strength", () => {
    // sportsbook=0.25, polymarket=0.21 → relativeEdge≈19% → moderate
    const result = shouldFlag(0.25, 0.21, DEFAULT_CONFIG);
    expect(result).not.toBeNull();
    expect(result?.signalStrength).toBe("moderate");
  });

  it("returns null when polymarket price is zero", () => {
    expect(shouldFlag(0.15, 0, DEFAULT_CONFIG)).toBeNull();
  });
});

describe("checkRiskLimits", () => {
  it("approves when sources meet minimum", () => {
    expect(checkRiskLimits({ sources: 3 }, DEFAULT_RISK_CONFIG)).toBe(true);
  });

  it("rejects when sources below minimum", () => {
    expect(checkRiskLimits({ sources: 1 }, DEFAULT_RISK_CONFIG)).toBe(false);
  });

  it("approves at exact minimum", () => {
    expect(
      checkRiskLimits(
        { sources: DEFAULT_RISK_CONFIG.minBookmakerSources },
        DEFAULT_RISK_CONFIG,
      ),
    ).toBe(true);
  });
});

describe("FuturesScanner", () => {
  it("returns signals with relativeEdge and signalStrength for valid comparisons", () => {
    const scanner = new FuturesScanner(DEFAULT_CONFIG, DEFAULT_RISK_CONFIG);
    const comparisons = [
      {
        team: "Team A",
        sportsbookProb: 0.15,
        polymarketPrice: 0.1,
        delta: 0.05,
        sources: 3,
      },
    ];
    const signals = scanner.evaluate(comparisons);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.team).toBe("Team A");
    expect(signals[0]?.relativeEdge).toBeCloseTo(0.5, 3);
    expect(signals[0]?.signalStrength).toBe("strong");
  });

  it("filters out teams with insufficient bookmaker sources", () => {
    const scanner = new FuturesScanner(DEFAULT_CONFIG, DEFAULT_RISK_CONFIG);
    const signals = scanner.evaluate([
      { team: "Team B", sportsbookProb: 0.15, polymarketPrice: 0.1, delta: 0.05, sources: 1 },
    ]);
    expect(signals).toHaveLength(0);
  });

  it("filters out teams with relative edge below threshold", () => {
    const scanner = new FuturesScanner(DEFAULT_CONFIG, DEFAULT_RISK_CONFIG);
    // relativeEdge = 0.002/0.148 ≈ 1.35% < 8%
    const signals = scanner.evaluate([
      { team: "Team C", sportsbookProb: 0.15, polymarketPrice: 0.148, delta: 0.002, sources: 3 },
    ]);
    expect(signals).toHaveLength(0);
  });
});

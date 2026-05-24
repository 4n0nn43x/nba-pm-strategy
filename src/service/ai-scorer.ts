const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export interface AiAssessment {
  confidenceScore: number;
  recommendation: "TAKE_EDGE" | "SKIP_TOO_RISKY" | "WATCH_ONLY";
  reasoning: string;
  riskFactors: string[];
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
}

/**
 * Calls OpenRouter to assess whether a detected mispricing is a genuine
 * tradeable edge or noise. Returns null if no API key is configured or
 * if the call fails — the scanner continues without AI enrichment.
 */
export async function scoreSignal(params: {
  team: string;
  fairProb: number;
  polymarketPrice: number;
  relativeEdge: number;
  signalStrength: "strong" | "moderate" | "weak";
  direction: "sportsbook higher" | "Polymarket higher";
  bookmakerSources: number;
}): Promise<AiAssessment | null> {
  const apiKey = process.env["OPENROUTER_API_KEY"];
  if (!apiKey) return null;

  const {
    team, fairProb, polymarketPrice, relativeEdge,
    signalStrength, direction, bookmakerSources,
  } = params;

  const prompt = `You are a sports prediction market analyst. Evaluate this NBA championship mispricing.

Team: ${team}
Fair probability (vig-stripped sportsbook consensus, ${bookmakerSources} sources): ${(fairProb * 100).toFixed(1)}%
Polymarket price: ${(polymarketPrice * 100).toFixed(1)}%
Relative edge: ${(relativeEdge * 100).toFixed(1)}% (${direction})
Signal strength: ${signalStrength}

Using your knowledge of this NBA team's current playoff performance, roster, and recent form, assess:
1. Does this mispricing make intuitive sense or is it likely noise?
2. What are the main risks that could invalidate this edge?
3. Is this worth acting on?

Respond with JSON only, no markdown.`;

  try {
    const res = await fetch(OPENROUTER_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/4n0nn43x/nba-pm-strategy",
        "X-Title": "NBA Prediction Market Scanner",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          {
            role: "system",
            content:
              "You are a quantitative sports betting analyst. Always respond with valid JSON matching the schema: { confidenceScore: number (0-1), recommendation: 'TAKE_EDGE'|'SKIP_TOO_RISKY'|'WATCH_ONLY', reasoning: string (max 120 words), riskFactors: string[] (max 3 items) }",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "ai_assessment",
            strict: true,
            schema: {
              type: "object",
              properties: {
                confidenceScore: { type: "number" },
                recommendation: {
                  type: "string",
                  enum: ["TAKE_EDGE", "SKIP_TOO_RISKY", "WATCH_ONLY"],
                },
                reasoning: { type: "string" },
                riskFactors: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "confidenceScore",
                "recommendation",
                "reasoning",
                "riskFactors",
              ],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as AiAssessment;
  } catch {
    return null;
  }
}

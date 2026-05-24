const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-pro";

export interface AiAssessment {
  confidenceScore: number;
  recommendation: "TAKE_EDGE" | "SKIP_TOO_RISKY" | "WATCH_ONLY";
  reasoning: string;
  riskFactors: string[];
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>;
  error?: { message: string };
}

function extractJson(text: string): AiAssessment | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const rec = parsed["recommendation"] as string;
    if (!["TAKE_EDGE", "SKIP_TOO_RISKY", "WATCH_ONLY"].includes(rec)) return null;
    return {
      confidenceScore: Number(parsed["confidenceScore"] ?? 0.5),
      recommendation: rec as AiAssessment["recommendation"],
      reasoning: String(parsed["reasoning"] ?? ""),
      riskFactors: Array.isArray(parsed["riskFactors"])
        ? (parsed["riskFactors"] as unknown[]).map(String)
        : [],
    };
  } catch {
    return null;
  }
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

  const model = process.env["OPENROUTER_MODEL"] ?? DEFAULT_MODEL;

  const {
    team, fairProb, polymarketPrice, relativeEdge,
    signalStrength, direction, bookmakerSources,
  } = params;

  const systemPrompt =
    "You are a quantitative sports betting analyst. " +
    "Respond ONLY with a JSON object — no markdown, no explanation outside the JSON. " +
    'Schema: { "confidenceScore": number (0-1), "recommendation": "TAKE_EDGE"|"SKIP_TOO_RISKY"|"WATCH_ONLY", "reasoning": string (max 100 words), "riskFactors": string[] (max 3) }';

  const userPrompt =
    `Evaluate this NBA championship mispricing:\n` +
    `Team: ${team}\n` +
    `Fair prob (vig-stripped, ${bookmakerSources} bookmakers): ${(fairProb * 100).toFixed(1)}%\n` +
    `Polymarket price: ${(polymarketPrice * 100).toFixed(1)}%\n` +
    `Relative edge: ${(relativeEdge * 100).toFixed(1)}% (${direction}, ${signalStrength})\n\n` +
    `Using your NBA knowledge, assess: is this edge genuine or noise? What are the main risks?`;

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
        model,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const data = (await res.json()) as OpenRouterResponse;

    if (!res.ok || data.error) {
      process.stderr.write(`[ai-scorer] API error: ${data.error?.message ?? res.status}\n`);
      return null;
    }

    const content = data.choices[0]?.message?.content ?? "";
    const result = extractJson(content);

    if (!result) {
      process.stderr.write(`[ai-scorer] Could not parse JSON from response: ${content.slice(0, 120)}\n`);
      return null;
    }

    return result;
  } catch (err) {
    process.stderr.write(`[ai-scorer] ${err instanceof Error ? err.message : String(err)}\n`);
    return null;
  }
}

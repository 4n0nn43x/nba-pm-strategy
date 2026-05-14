/**
 * Lightweight Polymarket client for the NBA futures scanner.
 * Read-only — searches markets and fetches prices via Gamma API. No auth required.
 */

const GAMMA_API = "https://gamma-api.polymarket.com";

export interface PolymarketMarket {
  id: string;
  question: string;
  /** Current best ask price for YES token (0–1). */
  yesPrice: number;
  /** Current best ask price for NO token (0–1). */
  noPrice: number;
  active: boolean;
  closed: boolean;
}

interface GammaMarket {
  id: string;
  question: string;
  active: boolean;
  closed: boolean;
  outcomes: string;
  outcomePrices: string;
}

function parseYesPrice(market: GammaMarket): number {
  try {
    const prices: string[] = JSON.parse(market.outcomePrices);
    const outcomes: string[] = JSON.parse(market.outcomes);
    const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    if (yesIdx >= 0 && prices[yesIdx] !== undefined) {
      return parseFloat(prices[yesIdx] as string);
    }
    return prices[0] !== undefined ? parseFloat(prices[0] as string) : 0.5;
  } catch {
    return 0.5;
  }
}

/**
 * Search Polymarket for markets matching the given query.
 * Returns active, non-closed markets with their current YES price.
 */
export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  const url = new URL(`${GAMMA_API}/markets`);
  url.searchParams.set("q", query);
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("limit", "50");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Polymarket Gamma API error (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as GammaMarket[];

  return data.map((m) => {
    const yesPrice = parseYesPrice(m);
    return {
      id: m.id,
      question: m.question,
      yesPrice,
      noPrice: parseFloat((1 - yesPrice).toFixed(4)),
      active: m.active,
      closed: m.closed,
    };
  });
}

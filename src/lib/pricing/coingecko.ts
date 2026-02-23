const BASE_URL = "https://api.coingecko.com/api/v3";

// Rate limiter: max 5 requests per minute (CoinGecko free tier is ~10-30/min)
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestTimestamps: number[] = [];

const REQUEST_TIMEOUT_MS = 10_000;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();

  // Remove timestamps older than the window
  while (
    requestTimestamps.length > 0 &&
    requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS
  ) {
    requestTimestamps.shift();
  }

  // If we've hit the limit, wait until the oldest request expires
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const waitTime =
      requestTimestamps[0] + RATE_LIMIT_WINDOW_MS - now + 100; // +100ms buffer
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  requestTimestamps.push(Date.now());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithBackoff(
  url: string,
  maxRetries = 3
): Promise<Response> {
  let delay = 5000; // Start at 5s — CoinGecko free tier needs generous backoff

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response;

    try {
      response = await rateLimitedFetch(url);
    } catch (error) {
      // Network errors (DNS failure, connection refused, timeout, abort)
      if (attempt === maxRetries) {
        throw new Error(
          `CoinGecko request failed after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      console.warn(
        `CoinGecko network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`,
        error instanceof Error ? error.message : String(error)
      );
      const jitteredDelay = delay * (1 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
      delay *= 2;
      continue;
    }

    if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
      if (attempt === maxRetries) {
        throw new Error(
          `CoinGecko ${response.status} error after ${maxRetries} retries`
        );
      }
      console.warn(
        `CoinGecko ${response.status} error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      const jitteredDelay = delay * (1 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
      delay *= 2;
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `CoinGecko API error: ${response.status} ${response.statusText}`
      );
    }

    return response;
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Unexpected error in fetchWithBackoff");
}

function safeJsonParse(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch((error) => {
    console.warn("CoinGecko returned invalid JSON:", error instanceof Error ? error.message : String(error));
    return {};
  });
}

export async function getPrice(
  ids: string[]
): Promise<Record<string, { usd: number; usd_24h_change: number }>> {
  if (ids.length === 0) return {};

  const idsParam = ids.join(",");
  const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(idsParam)}&vs_currencies=usd&include_24hr_change=true`;

  const response = await fetchWithBackoff(url);
  const data = await safeJsonParse(response) as Record<string, { usd?: number; usd_24h_change?: number }>;

  // Normalize the response shape
  const result: Record<string, { usd: number; usd_24h_change: number }> = {};
  for (const id of ids) {
    if (data[id]) {
      result[id] = {
        usd: data[id].usd ?? 0,
        usd_24h_change: data[id].usd_24h_change ?? 0,
      };
    } else {
      console.warn(`[coingecko] Requested ID "${id}" missing from price response`);
    }
  }

  return result;
}

export interface CoinSearchResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
}

export async function searchCoins(
  query: string
): Promise<CoinSearchResult[]> {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  const response = await fetchWithBackoff(url, 2);
  const data = (await safeJsonParse(response)) as {
    coins?: { id: string; name: string; symbol: string; thumb: string }[];
  };

  return (data.coins ?? []).slice(0, 15).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    thumb: c.thumb,
  }));
}

export async function getMarketChart(
  id: string,
  days: number
): Promise<{ prices: [number, number][] }> {
  const url = `${BASE_URL}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;

  const response = await fetchWithBackoff(url);
  const data = await safeJsonParse(response) as { prices?: [number, number][] };

  return {
    prices: data.prices ?? [],
  };
}

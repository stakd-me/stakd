import { writeFileSync } from "fs";
import { join } from "path";

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
  binance: boolean;
}

async function fetchBinanceSymbols(): Promise<Set<string>> {
  console.log("Fetching Binance exchange info...");
  try {
    const res = await fetch("https://api.binance.com/api/v3/exchangeInfo");
    if (!res.ok) {
      console.warn(`Binance API error: ${res.status} — continuing without Binance data`);
      return new Set();
    }
    const data: { symbols: { symbol: string; quoteAsset: string; status: string }[] } = await res.json();
    const symbols = new Set<string>();
    for (const s of data.symbols) {
      if (s.quoteAsset === "USDT" && s.status === "TRADING") {
        const base = s.symbol.slice(0, -4); // strip "USDT"
        symbols.add(base.toUpperCase());
      }
    }
    console.log(`Found ${symbols.size} Binance USDT trading pairs`);
    return symbols;
  } catch (err) {
    console.warn("Failed to fetch Binance data:", err instanceof Error ? err.message : String(err));
    return new Set();
  }
}

async function main() {
  console.log("Fetching coin list from CoinGecko...");

  const res = await fetch("https://api.coingecko.com/api/v3/coins/list");
  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
  }

  const raw: CoinGeckoCoin[] = await res.json();
  console.log(`Received ${raw.length} coins from CoinGecko`);

  const binanceSymbols = await fetchBinanceSymbols();

  const filtered: CoinListItem[] = raw
    .filter((c) => c.id && c.symbol && c.name)
    .map((c) => ({
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      binance: binanceSymbols.has(c.symbol.toUpperCase()),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const binanceCount = filtered.filter((c) => c.binance).length;
  const outPath = join(__dirname, "..", "public", "coins-list.json");
  writeFileSync(outPath, JSON.stringify(filtered));

  console.log(`Wrote ${filtered.length} coins to ${outPath} (${binanceCount} with Binance pricing)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

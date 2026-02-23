# /refresh-prices

Debug or manually trigger a price refresh.

## How it works
- POST to `/api/prices` triggers `refreshPrices()` in `src/lib/pricing/index.ts`
- Gathers all unique coingeckoIds from tokens + manual_entries tables
- Fetches from CoinGecko API in batches of 50
- Upserts prices table and inserts price_history records
- Rate limited to 10 requests/minute

## To run manually
```bash
curl -X POST http://localhost:3000/api/prices
```

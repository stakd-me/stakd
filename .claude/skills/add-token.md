# /add-token

Add a new token to a chain adapter's known tokens list.

## Steps
1. Find the chain adapter in `src/lib/blockchain/`
2. Add the token to the `KNOWN_TOKENS` array with: address, symbol, name, decimals, coingeckoId
3. If it's a staking token, override `getStakedBalances()` to query it

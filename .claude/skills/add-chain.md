# /add-chain

Add support for a new blockchain to the portfolio manager.

## Steps
1. Create a new adapter file in `src/lib/blockchain/` extending `EvmAdapter` (for EVM chains) or implementing `ChainAdapter` directly
2. Add known tokens with contract addresses and decimals
3. Override `getStakedBalances()` if the chain has staking
4. Register the adapter in `src/lib/blockchain/index.ts` factory
5. Add chain config to `CHAIN_CONFIG` in `src/lib/utils.ts`
6. Add default RPC endpoint in `src/lib/db/init.ts`

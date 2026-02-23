# Crypto Portfolio Manager

Private, offline-first crypto portfolio tracker with Docker containerization.

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- SQLite via better-sqlite3 + Drizzle ORM
- ethers.js v6 (EVM chains), @solana/web3.js (Solana)
- CoinGecko free API for pricing
- Recharts for charts, Tailwind CSS for styling
- @tanstack/react-query + zustand for state
- AES-256-GCM encryption for wallet addresses

## Project Structure
- `src/lib/db/` - Database schema (Drizzle ORM), connection, initialization
- `src/lib/crypto/` - AES-256-GCM encryption, PBKDF2 key derivation
- `src/lib/blockchain/` - Chain adapters (Ethereum, Base, Avalanche, Oasis, Solana)
- `src/lib/pricing/` - CoinGecko client with rate limiting
- `src/app/api/` - 18 API routes for auth, wallets, balances, prices, rebalancing, settings
- `src/app/(app)/` - App pages (dashboard, wallets, tokens, rebalance, settings, history)
- `src/components/` - UI components, charts, layout

## Key Commands
- `npm run dev` - Start development server
- `npm run build` - Production build
- `docker-compose up` - Run in Docker
- `npm run db:migrate` - Run database migrations

## Security
- Password derives AES-256 key via PBKDF2 (SHA-512, 600K iterations)
- Encryption key held in server memory only, cleared on lock/restart
- Wallet addresses encrypted with AES-256-GCM before storage
- No cookies, JWT, or localStorage for authentication

## Supported Chains
- Ethereum (ETH) - with Lido staking detection
- Base (ETH L2)
- Avalanche (AVAX) - with sAVAX staking
- Oasis Sapphire (ROSE)
- Solana (SOL) - with stake program detection

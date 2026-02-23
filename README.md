# Stakd.me

A private, self-hosted crypto portfolio tracker with end-to-end encryption. The server stores only encrypted blobs — it knows you exist but not who you are or what you hold.

## Documentation

- [End User Guide](docs/USER_GUIDE.md) — detailed usage guide for daily users

## Features

- **End-to-End Encryption** — All portfolio data encrypted client-side with AES-256-GCM before leaving the browser
- **Zero-Knowledge Architecture** — Server never sees plaintext data; passphrase-derived keys stay on your device
- **Anonymous Auth** — Username + passphrase, no email or PII required
- **Portfolio Tracking** — Track buys, sells, receives, sends across multiple tokens
- **Manual Entries** — Add off-chain holdings not captured by transactions
- **Rebalancing Engine** — 5 strategies (threshold, calendar, percent-of-portfolio, risk-parity, DCA-weighted)
- **Portfolio History** — Snapshots over time with interactive charts
- **USD-Only Valuation** — All portfolio values are displayed consistently in USD
- **Multi-Exchange Price Feeds** — Binance first, then OKX/Bybit/MEXC/Gate, then CoinGecko fallback with cooldown protection
- **Dark/Light Theme** — System-aware with manual toggle
- **i18n** — English and Vietnamese

## Architecture

```
CLIENT                          SERVER
┌─────────────────────┐        ┌──────────────────────────┐
│ passphrase + salt    │        │                          │
│   ↓ PBKDF2 (600K)   │        │  PostgreSQL              │
│ master_key           │        │  ├─ users (hash only)    │
│   ↓ HKDF             │        │  ├─ encrypted_vaults     │
│ ┌──────┬──────┐      │        │  ├─ sessions             │
│ │auth_k│enc_k │      │        │  ├─ preferences          │
│ └──┬───┴──┬───┘      │        │  ├─ prices (shared)      │
│    │      │          │        │  └─ price_history        │
│    │  AES-256-GCM    │        │                          │
│    │  encrypt/decrypt│        │  Redis                   │
│    │      │          │        │  ├─ rate limiting         │
│    ↓      ↓          │        │  ├─ refresh debounce      │
│ auth_key→server      │        │  └─ CoinGecko cooldown    │
│ enc_key→local only   │        │                          │
└─────────────────────┘        └──────────────────────────┘
```

All user-specific data (transactions, manual entries, rebalance targets, snapshots, settings) is stored as a single encrypted vault blob. Prices are the only shared, server-managed data.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS |
| State | Zustand, TanStack React Query |
| Charts | Chart.js, Recharts |
| Crypto | Web Crypto API (PBKDF2, HKDF, AES-256-GCM) |
| Auth | JWT (jose), httpOnly refresh cookies |
| Database | PostgreSQL 16 (Drizzle ORM) |
| Cache | Redis 7 |
| Container | Docker Compose |

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/stakd-me/stakd.git
cd stakd

# Copy and configure environment
cp .env.example .env
# Edit .env — at minimum, set a secure JWT_SECRET:
#   JWT_SECRET=$(openssl rand -hex 32)

# Start all services
docker-compose up -d
```

Open [http://localhost:33000](http://localhost:33000) and create an account.

### Development

```bash
# Prerequisites: Node.js 20+, PostgreSQL, Redis

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your local PostgreSQL/Redis credentials and a JWT secret

# Start dev server
npm run dev
```

## Environment Variables

All configuration is managed via a `.env` file (see [`.env.example`](.env.example) for a template).

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `portfolio` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `portfolio` |
| `POSTGRES_DB` | PostgreSQL database name | `portfolio` |
| `REDIS_MAXMEMORY` | Redis max memory limit | `64mb` |
| `APP_PORT` | Host port mapped to the app | `33000` |
| `JWT_SECRET` | Secret for signing JWT tokens (min 32 chars) | — |
| `NODE_ENV` | `development` or `production` | `production` |

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Authenticated pages
│   │   ├── dashboard/      # Portfolio overview + charts
│   │   ├── portfolio/      # Transactions + manual entries
│   │   ├── rebalance/      # Target allocation + suggestions
│   │   ├── history/        # Portfolio snapshots over time
│   │   └── settings/       # Passphrase + rebalance configuration
│   └── api/
│       ├── auth/           # register, login, salt, refresh, logout
│       ├── vault/          # GET/PUT encrypted vault blob
│       ├── preferences/    # Non-sensitive user preferences
│       ├── prices/         # Shared price cache + refresh
│       └── health/         # Service health check
├── components/             # UI components, charts, layout
├── hooks/                  # use-portfolio, use-prices, use-analytics
├── lib/
│   ├── crypto/             # Client-side E2EE (Web Crypto API)
│   ├── auth/               # JWT sign/verify
│   ├── db/                 # PostgreSQL schema + connection
│   ├── redis/              # Redis singleton + helpers
│   ├── pricing/            # Binance + secondary exchanges + CoinGecko fallback
│   └── services/           # Portfolio calculator, rebalance strategies
└── i18n/                   # English + Vietnamese translations
```

## Price Source Strategy

Price fetching uses a provider cascade designed to reduce CoinGecko pressure:

1. **Binance** (primary source)
2. **Secondary CEX APIs**: OKX, Bybit, MEXC, Gate
3. **CoinGecko** only when no exchange source is available

CoinGecko fallback is throttled by per-token cooldown keys in Redis (default target: ~4 fetches/day/token) to avoid provider blocking in multi-user deployments.

## Security

- Passphrase derives a master key via PBKDF2 (SHA-512, 600K iterations)
- Master key splits via HKDF into auth key (sent to server) and encryption key (never leaves browser)
- Server stores SHA-256 hash of auth key — timing-safe comparison on login
- Vault encrypted with AES-256-GCM; unique IV per save
- Encryption key stored in `sessionStorage` — lost on tab close, requires re-login
- JWT access tokens (15 min) with httpOnly refresh cookies (30 days, rotated on use)
- Redis rate limiting on login (5 attempts/min)
- Anti-enumeration: fake salt returned for non-existent usernames
- Optimistic concurrency on vault writes (version checking)

## Rebalance Strategies

| Strategy | Description |
|----------|-------------|
| **Threshold** | Rebalance when any token deviates beyond the hold zone |
| **Calendar** | Rebalance on a fixed schedule (weekly/monthly/quarterly) |
| **Percent of Portfolio** | Trigger when total portfolio value changes by X% |
| **Risk Parity** | Weight inversely by volatility using price history |
| **DCA-Weighted** | Split rebalance trades into chunks over time |

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run db:migrate   # Run DB migrations
npm run fetch-coins  # Refresh coin search index (CoinGecko + Binance flag)
```

## License

[MIT](LICENSE)

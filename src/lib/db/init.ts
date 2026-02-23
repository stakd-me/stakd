import { pool } from "./index";

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username_hash TEXT NOT NULL UNIQUE,
        auth_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS encrypted_vaults (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        version INTEGER NOT NULL DEFAULT 1,
        encrypted_data TEXT NOT NULL,
        iv TEXT NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        size_bytes INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS preferences (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme TEXT NOT NULL DEFAULT 'dark',
        locale TEXT NOT NULL DEFAULT 'en',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Backward-compatible migration for older installs:
      -- remove deprecated currency columns if they still exist.
      ALTER TABLE IF EXISTS preferences
        DROP COLUMN IF EXISTS display_currency,
        DROP COLUMN IF EXISTS usd_to_vnd_rate;

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        refresh_token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS prices (
        coingecko_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        price_usd DOUBLE PRECISION NOT NULL,
        change_24h DOUBLE PRECISION,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        coingecko_id TEXT NOT NULL,
        price_usd DOUBLE PRECISION NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_coingecko_recorded
        ON price_history(coingecko_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user
        ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_prices_symbol
        ON prices(symbol);
    `);
  } finally {
    client.release();
  }
}

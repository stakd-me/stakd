import { pgTable, text, integer, doublePrecision, timestamp, uuid, serial, uniqueIndex } from "drizzle-orm/pg-core";

// ── Users ────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  usernameHash: text("username_hash").notNull().unique(),
  authHash: text("auth_hash").notNull(),
  salt: text("salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLogin: timestamp("last_login", { withTimezone: true }),
});

// ── Encrypted Vaults ─────────────────────────────────────────────────
export const encryptedVaults = pgTable("encrypted_vaults", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  version: integer("version").notNull().default(1),
  encryptedData: text("encrypted_data").notNull(),
  iv: text("iv").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  sizeBytes: integer("size_bytes").notNull().default(0),
});

// ── Preferences (plaintext, non-sensitive) ───────────────────────────
export const preferences = pgTable("preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  theme: text("theme").notNull().default("dark"),
  locale: text("locale").notNull().default("en"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Sessions (refresh tokens) ────────────────────────────────────────
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Prices (shared, server-managed) ──────────────────────────────────
export const prices = pgTable("prices", {
  coingeckoId: text("coingecko_id").primaryKey(),
  symbol: text("symbol").notNull(),
  priceUsd: doublePrecision("price_usd").notNull(),
  change24h: doublePrecision("change_24h"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("idx_prices_symbol").on(table.symbol),
]);

// ── Price History (shared) ───────────────────────────────────────────
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  coingeckoId: text("coingecko_id").notNull(),
  priceUsd: doublePrecision("price_usd").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

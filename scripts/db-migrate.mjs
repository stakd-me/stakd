import pg from "pg";

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://portfolio:portfolio@localhost:5432/portfolio";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE IF EXISTS preferences
        DROP COLUMN IF EXISTS display_currency,
        DROP COLUMN IF EXISTS usd_to_vnd_rate;
    `);

    await client.query("COMMIT");
    console.log("[db:migrate] Completed successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[db:migrate] Failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[db:migrate] Fatal error:", error);
  process.exit(1);
});

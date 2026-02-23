export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDatabase } = await import("@/lib/db/init");
    const { startBackgroundPriceRefreshScheduler } = await import(
      "@/lib/pricing/background-refresh"
    );
    await initializeDatabase();
    console.log("[startup] Database tables initialized");
    startBackgroundPriceRefreshScheduler();
  }
}

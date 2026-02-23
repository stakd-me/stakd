import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const startTime = Date.now();

export async function GET() {
  try {
    // Check PostgreSQL
    let dbOk = false;
    try {
      const result = await pool.query("SELECT 1 AS ok");
      dbOk = result.rows[0]?.ok === 1;
    } catch {
      dbOk = false;
    }

    // Check Redis
    let redisOk = false;
    try {
      const pong = await redis.ping();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }

    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);

    const allOk = dbOk && redisOk;
    const status = allOk ? "healthy" : "degraded";
    const httpStatus = allOk ? 200 : 503;

    return NextResponse.json(
      {
        status,
        uptime: uptimeSeconds,
        uptimeHuman: formatUptime(uptimeSeconds),
        db: dbOk ? "connected" : "unavailable",
        redis: redisOk ? "connected" : "unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: httpStatus }
    );
  } catch (e) {
    console.error("Health check error:", e);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}

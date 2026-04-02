import { NextRequest } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { getBinanceWsManager } from "@/lib/pricing/binance-ws";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  // Auth via query param (EventSource doesn't support custom headers)
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await verifyAccessToken(token);
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const manager = getBinanceWsManager();
  if (!manager) {
    return new Response(
      JSON.stringify({ error: "Price stream not available" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial snapshot immediately
      const prices = manager.getPrices();
      if (prices.size > 0) {
        const payload: Record<
          string,
          { usd: number; change24h: number | null; updatedAt: string }
        > = {};
        for (const [id, p] of prices) {
          payload[id] = {
            usd: p.priceUsd,
            change24h: p.change24h,
            updatedAt: new Date(p.updatedAt).toISOString(),
          };
        }
        controller.enqueue(
          encoder.encode(`event: prices\ndata: ${JSON.stringify(payload)}\n\n`)
        );
      }

      const onPrices = (data: string) => {
        try {
          controller.enqueue(
            encoder.encode(`event: prices\ndata: ${data}\n\n`)
          );
        } catch {
          // Stream closed, listener will be cleaned up
        }
      };

      manager.on("prices", onPrices);

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15_000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        manager.off("prices", onPrices);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { ensurePricesExist } from "@/lib/pricing";

export async function POST(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  try {
    const { tokens } = await req.json();

    if (!Array.isArray(tokens)) {
      return NextResponse.json(
        { error: "tokens must be an array" },
        { status: 400 }
      );
    }

    await ensurePricesExist(tokens);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("POST /api/prices/ensure error:", e);
    return NextResponse.json(
      { error: "Failed to ensure prices" },
      { status: 500 }
    );
  }
}

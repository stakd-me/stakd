import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateRequest(req);

    if (payload?.sub) {
      // Delete all sessions for this user
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, payload.sub));
    }

    const response = NextResponse.json({ success: true });

    // Clear refresh token cookie
    response.cookies.delete("refreshToken");

    return response;
  } catch (error) {
    console.error("[auth/logout]", error);
    return NextResponse.json({ success: true });
  }
}

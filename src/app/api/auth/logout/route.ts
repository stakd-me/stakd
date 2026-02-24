import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest } from "@/lib/auth-guard";

const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

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
    response.cookies.set("refreshToken", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: 0,
    });
    response.cookies.set(REMEMBER_ME_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("[auth/logout]", error);
    return NextResponse.json({ success: true });
  }
}

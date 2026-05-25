import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

function getRefreshCookieMaxAge(rememberMe: boolean): number | undefined {
  if (!rememberMe) return undefined;
  return REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
}

function getRefreshExpiryDate(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  return expiresAt;
}

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get("refreshToken")?.value;
    const rememberMe = req.cookies.get(REMEMBER_ME_COOKIE)?.value === "1";

    if (!refreshToken) {
      const response = NextResponse.json(
        { error: "No refresh token" },
        { status: 401 }
      );
      return response;
    }

    const tokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const [session] = await db
      .update(schema.sessions)
      .set({ expiresAt: getRefreshExpiryDate() })
      .where(
        and(
          eq(schema.sessions.refreshTokenHash, tokenHash),
          gt(schema.sessions.expiresAt, new Date())
        )
      )
      .returning({ userId: schema.sessions.userId });

    if (!session) {
      const response = NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
      return response;
    }

    const accessToken = await signAccessToken(session.userId);

    const response = NextResponse.json({
      accessToken,
      userId: session.userId,
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });
    response.cookies.set(REMEMBER_ME_COOKIE, rememberMe ? "1" : "0", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });

    return response;
  } catch (error) {
    console.error("[auth/refresh]", error);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
  }
}

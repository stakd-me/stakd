import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

function getRefreshCookieMaxAge(rememberMe: boolean): number | undefined {
  if (!rememberMe) return undefined;
  return REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
}

function clearRefreshCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("refreshToken", "", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
  response.cookies.set(REMEMBER_ME_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
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
      clearRefreshCookies(response);
      return response;
    }

    const tokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // Find valid session
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.refreshTokenHash, tokenHash),
          gt(schema.sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      // Clear invalid cookie
      const response = NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
      clearRefreshCookies(response);
      return response;
    }

    // Delete old session (token rotation)
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, session.id));

    // Create new tokens
    const accessToken = await signAccessToken(session.userId);
    const newRefreshToken = randomBytes(32).toString("hex");
    const newRefreshTokenHash = createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await db.insert(schema.sessions).values({
      userId: session.userId,
      refreshTokenHash: newRefreshTokenHash,
      expiresAt,
    });

    const response = NextResponse.json({
      accessToken,
      userId: session.userId,
    });

    response.cookies.set("refreshToken", newRefreshToken, {
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

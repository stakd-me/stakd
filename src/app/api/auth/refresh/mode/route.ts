import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { createHash } from "crypto";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { db, schema } from "@/lib/db";

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

export async function PUT(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) {
    return authError();
  }

  try {
    const body = await req.json();
    if (typeof body.rememberMe !== "boolean") {
      return NextResponse.json(
        { error: "Invalid session mode payload" },
        { status: 400 }
      );
    }

    const refreshToken = req.cookies.get("refreshToken")?.value;
    if (!refreshToken) {
      const response = NextResponse.json(
        { error: "No refresh token" },
        { status: 401 }
      );
      clearRefreshCookies(response);
      return response;
    }

    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.userId, payload.sub),
          eq(schema.sessions.refreshTokenHash, refreshTokenHash),
          gt(schema.sessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!session) {
      const response = NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
      clearRefreshCookies(response);
      return response;
    }

    const rememberMe = body.rememberMe;
    const response = NextResponse.json({ success: true, rememberMe });
    const secure = process.env.NODE_ENV === "production";

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });
    response.cookies.set(REMEMBER_ME_COOKIE, rememberMe ? "1" : "0", {
      httpOnly: true,
      secure,
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });

    return response;
  } catch (error) {
    console.error("[auth/refresh/mode]", error);
    return NextResponse.json(
      { error: "Failed to update session mode" },
      { status: 500 }
    );
  }
}

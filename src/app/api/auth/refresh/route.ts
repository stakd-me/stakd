import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";
const MAX_TOKEN_GENERATION_ATTEMPTS = 5;
const PG_UNIQUE_VIOLATION_CODE = "23505";

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

function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === PG_UNIQUE_VIOLATION_CODE
  );
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

    // Atomic single-use rotation:
    // consume the old session and issue a new one in the same transaction.
    const rotation = await db.transaction(async (tx) => {
      const [consumed] = await tx
        .delete(schema.sessions)
        .where(
          and(
            eq(schema.sessions.refreshTokenHash, tokenHash),
            gt(schema.sessions.expiresAt, new Date())
          )
        )
        .returning({
          userId: schema.sessions.userId,
        });

      if (!consumed) return null;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

      for (let attempt = 0; attempt < MAX_TOKEN_GENERATION_ATTEMPTS; attempt++) {
        const newRefreshToken = randomBytes(32).toString("hex");
        const newRefreshTokenHash = createHash("sha256")
          .update(newRefreshToken)
          .digest("hex");

        try {
          await tx.insert(schema.sessions).values({
            userId: consumed.userId,
            refreshTokenHash: newRefreshTokenHash,
            expiresAt,
          });

          return {
            userId: consumed.userId,
            newRefreshToken,
          };
        } catch (error) {
          if (isPgUniqueViolation(error)) continue;
          throw error;
        }
      }

      throw new Error("Failed to generate a unique refresh token.");
    });

    if (!rotation) {
      const response = NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
      clearRefreshCookies(response);
      return response;
    }

    const accessToken = await signAccessToken(rotation.userId);

    const response = NextResponse.json({
      accessToken,
      userId: rotation.userId,
    });

    response.cookies.set("refreshToken", rotation.newRefreshToken, {
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

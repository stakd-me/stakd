import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const refreshToken = req.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token" },
        { status: 401 }
      );
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
      response.cookies.delete("refreshToken");
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
      path: "/api/auth/refresh",
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("[auth/refresh]", error);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
  }
}

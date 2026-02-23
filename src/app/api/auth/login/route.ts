import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";
import { rateLimit } from "@/lib/redis";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export async function POST(req: NextRequest) {
  try {
    const { usernameHash, authKeyHex } = await req.json();

    if (!usernameHash || !authKeyHex) {
      return NextResponse.json(
        { error: "Missing credentials" },
        { status: 400 }
      );
    }

    // Rate limiting: 5 attempts per minute per username hash
    const allowed = await rateLimit(
      `login:${usernameHash}`,
      5,
      60
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    // Find user
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.usernameHash, usernameHash))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Timing-safe comparison of auth hashes
    const computedHash = createHash("sha256")
      .update(Buffer.from(authKeyHex, "hex"))
      .digest("hex");

    const a = Buffer.from(computedHash, "hex");
    const b = Buffer.from(user.authHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Generate tokens
    const accessToken = await signAccessToken(user.id);
    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // Store refresh token session
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await db.insert(schema.sessions).values({
      userId: user.id,
      refreshTokenHash,
      expiresAt,
    });

    // Update last login
    await db
      .update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.id, user.id));

    // Set refresh token as httpOnly cookie
    const response = NextResponse.json({
      accessToken,
      userId: user.id,
    });

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/refresh",
      maxAge: REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

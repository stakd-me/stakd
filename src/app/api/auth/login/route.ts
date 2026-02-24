import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";
import { rateLimit } from "@/lib/redis";
import { getRequestIp, isHexOfByteLength } from "@/lib/auth/input-validation";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";
const DUMMY_AUTH_HASH = createHash("sha256")
  .update("stakd-dummy-auth")
  .digest("hex");

function getRefreshCookieMaxAge(rememberMe: boolean): number | undefined {
  if (!rememberMe) return undefined;
  return REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameHash = typeof body.usernameHash === "string" ? body.usernameHash : "";
    const authKeyHex = typeof body.authKeyHex === "string" ? body.authKeyHex : "";
    const rememberMe = body.rememberMe === true;

    if (!isHexOfByteLength(usernameHash, 32) || !isHexOfByteLength(authKeyHex, 32)) {
      return NextResponse.json(
        { error: "Invalid credentials payload" },
        { status: 400 }
      );
    }

    const clientIp = getRequestIp(req);

    // Rate limiting: per username hash + per IP
    const allowed = await rateLimit(
      `login:${usernameHash}`,
      5,
      60
    );
    const allowedByIp = await rateLimit(
      `login:ip:${clientIp}`,
      30,
      60
    );
    if (!allowed || !allowedByIp) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    // Compute once for both real and dummy comparison to reduce timing side channels.
    const computedHash = createHash("sha256")
      .update(Buffer.from(authKeyHex, "hex"))
      .digest("hex");

    // Find user
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.usernameHash, usernameHash))
      .limit(1);

    if (!user) {
      const lhs = Buffer.from(computedHash, "hex");
      const rhs = Buffer.from(DUMMY_AUTH_HASH, "hex");
      if (lhs.length === rhs.length) {
        timingSafeEqual(lhs, rhs);
      }
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Timing-safe comparison of auth hashes
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
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });

    // Tracks refresh-cookie persistence mode across refresh rotations.
    response.cookies.set(REMEMBER_ME_COOKIE, rememberMe ? "1" : "0", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(rememberMe),
    });

    return response;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}

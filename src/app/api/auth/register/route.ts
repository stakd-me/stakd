import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { signAccessToken } from "@/lib/auth/jwt";
import { rateLimit } from "@/lib/redis";
import { getRequestIp, isHexOfByteLength } from "@/lib/auth/input-validation";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

export async function POST(req: NextRequest) {
  try {
    const { usernameHash, authKeyHex, salt } = await req.json();

    if (
      !isHexOfByteLength(usernameHash, 32) ||
      !isHexOfByteLength(authKeyHex, 32) ||
      !isHexOfByteLength(salt, 32)
    ) {
      return NextResponse.json(
        { error: "Invalid registration payload" },
        { status: 400 }
      );
    }

    const clientIp = getRequestIp(req);
    const allowed = await rateLimit(`register:ip:${clientIp}`, 10, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Try again later." },
        { status: 429 }
      );
    }

    // Check if user already exists
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.usernameHash, usernameHash))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }

    // Hash the auth key before storing (server never stores raw auth key)
    const authHash = createHash("sha256")
      .update(Buffer.from(authKeyHex, "hex"))
      .digest("hex");

    // Create user
    const [user] = await db
      .insert(schema.users)
      .values({
        usernameHash,
        authHash,
        salt,
      })
      .returning({ id: schema.users.id });

    // Auto-login immediately after successful registration
    const accessToken = await signAccessToken(user.id);
    const refreshToken = randomBytes(32).toString("hex");
    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await db.insert(schema.sessions).values({
      userId: user.id,
      refreshTokenHash,
      expiresAt,
    });

    const response = NextResponse.json(
      { userId: user.id, accessToken },
      { status: 201 }
    );

    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });
    response.cookies.set(REMEMBER_ME_COOKIE, "0", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
    });

    return response;
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}

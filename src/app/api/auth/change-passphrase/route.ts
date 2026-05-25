import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { isHexOfByteLength } from "@/lib/auth/input-validation";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";
const MAX_VAULT_SIZE = 10 * 1024 * 1024; // 10MB

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
    const payload = await authenticateRequest(req);
    if (!payload) return authError();

    const {
      oldAuthKeyHex,
      newAuthKeyHex,
      newSalt,
      encryptedVault,
      iv,
      rememberMe,
    } = await req.json();
    const shouldRememberCurrentDevice = rememberMe === true;

    if (
      !isHexOfByteLength(oldAuthKeyHex, 32) ||
      !isHexOfByteLength(newAuthKeyHex, 32) ||
      !isHexOfByteLength(newSalt, 32) ||
      typeof encryptedVault !== "string" ||
      encryptedVault.length === 0 ||
      typeof iv !== "string" ||
      iv.length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid passphrase update payload" },
        { status: 400 }
      );
    }
    if (encryptedVault.length > MAX_VAULT_SIZE) {
      return NextResponse.json(
        { error: "Vault exceeds maximum size (10MB)" },
        { status: 413 }
      );
    }

    // Verify old auth key
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user) {
      return authError();
    }

    const oldHash = createHash("sha256")
      .update(Buffer.from(oldAuthKeyHex, "hex"))
      .digest("hex");

    const a = Buffer.from(oldHash, "hex");
    const b = Buffer.from(user.authHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json(
        { error: "Invalid current passphrase" },
        { status: 401 }
      );
    }

    // Update auth hash, salt, and re-encrypted vault atomically.
    const newAuthHash = createHash("sha256")
      .update(Buffer.from(newAuthKeyHex, "hex"))
      .digest("hex");

    const result = await db.transaction(async (tx) => {
      const [existingVault] = await tx
        .select()
        .from(schema.encryptedVaults)
        .where(eq(schema.encryptedVaults.userId, payload.sub))
        .limit(1);

      // Update user credentials.
      await tx
        .update(schema.users)
        .set({ authHash: newAuthHash, salt: newSalt })
        .where(eq(schema.users.id, payload.sub));

      let vaultVersion = 1;
      if (existingVault) {
        vaultVersion = existingVault.version + 1;
        await tx
          .update(schema.encryptedVaults)
          .set({
            encryptedData: encryptedVault,
            iv,
            version: vaultVersion,
            updatedAt: new Date(),
            sizeBytes: encryptedVault.length,
          })
          .where(eq(schema.encryptedVaults.userId, payload.sub));
      } else {
        await tx.insert(schema.encryptedVaults).values({
          userId: payload.sub,
          encryptedData: encryptedVault,
          iv,
          version: 1,
          sizeBytes: encryptedVault.length,
        });
      }

      // Invalidate other refresh sessions and issue a fresh one for this device.
      await tx
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, payload.sub));

      const refreshToken = randomBytes(32).toString("hex");
      const refreshTokenHash = createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      await tx.insert(schema.sessions).values({
        userId: payload.sub,
        refreshTokenHash,
        expiresAt: getRefreshExpiryDate(),
      });

      return { vaultVersion, refreshToken };
    });

    const response = NextResponse.json({
      success: true,
      vaultVersion: result.vaultVersion,
    });
    response.cookies.set("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: REFRESH_COOKIE_PATH,
      maxAge: getRefreshCookieMaxAge(shouldRememberCurrentDevice),
    });
    response.cookies.set(
      REMEMBER_ME_COOKIE,
      shouldRememberCurrentDevice ? "1" : "0",
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: REFRESH_COOKIE_PATH,
        maxAge: getRefreshCookieMaxAge(shouldRememberCurrentDevice),
      }
    );
    return response;
  } catch (error) {
    console.error("[auth/change-passphrase]", error);
    return NextResponse.json(
      { error: "Failed to change passphrase" },
      { status: 500 }
    );
  }
}

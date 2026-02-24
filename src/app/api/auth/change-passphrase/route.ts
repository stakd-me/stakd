import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash, timingSafeEqual } from "crypto";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { isHexOfByteLength } from "@/lib/auth/input-validation";

const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";
const MAX_VAULT_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateRequest(req);
    if (!payload) return authError();

    const { oldAuthKeyHex, newAuthKeyHex, newSalt, encryptedVault, iv } =
      await req.json();

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

      // Invalidate all refresh sessions (force refresh-token re-login).
      await tx
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, payload.sub));

      return { vaultVersion };
    });

    const response = NextResponse.json({ success: true, vaultVersion: result.vaultVersion });
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
    console.error("[auth/change-passphrase]", error);
    return NextResponse.json(
      { error: "Failed to change passphrase" },
      { status: 500 }
    );
  }
}

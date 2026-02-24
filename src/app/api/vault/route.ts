import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest, authError } from "@/lib/auth-guard";

const MAX_VAULT_SIZE = 10 * 1024 * 1024; // 10MB
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

// GET: Return encrypted vault blob for authenticated user
export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  const [vault] = await db
    .select()
    .from(schema.encryptedVaults)
    .where(eq(schema.encryptedVaults.userId, payload.sub))
    .limit(1);

  if (!vault) {
    return NextResponse.json({ vault: null });
  }

  return NextResponse.json({
    vault: {
      encryptedData: vault.encryptedData,
      iv: vault.iv,
      version: vault.version,
      schemaVersion: vault.schemaVersion,
    },
  });
}

// PUT: Store encrypted vault blob with optimistic concurrency
export async function PUT(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  const { encryptedData, iv, version } = await req.json();

  if (!encryptedData || !iv) {
    return NextResponse.json(
      { error: "Missing encrypted data or IV" },
      { status: 400 }
    );
  }

  if (encryptedData.length > MAX_VAULT_SIZE) {
    return NextResponse.json(
      { error: "Vault exceeds maximum size (10MB)" },
      { status: 413 }
    );
  }

  const [existing] = await db
    .select()
    .from(schema.encryptedVaults)
    .where(eq(schema.encryptedVaults.userId, payload.sub))
    .limit(1);

  if (!existing) {
    // Create new vault
    await db.insert(schema.encryptedVaults).values({
      userId: payload.sub,
      encryptedData,
      iv,
      version: 1,
      sizeBytes: encryptedData.length,
    });
    return NextResponse.json({ version: 1 }, { status: 201 });
  }

  // Optimistic concurrency: check version
  if (version !== undefined && version !== existing.version) {
    return NextResponse.json(
      { error: "Version conflict. Please reload.", currentVersion: existing.version },
      { status: 409 }
    );
  }

  const newVersion = existing.version + 1;
  await db
    .update(schema.encryptedVaults)
    .set({
      encryptedData,
      iv,
      version: newVersion,
      updatedAt: new Date(),
      sizeBytes: encryptedData.length,
    })
    .where(eq(schema.encryptedVaults.userId, payload.sub));

  return NextResponse.json({ version: newVersion });
}

// DELETE: Delete user account and all data (CASCADE)
export async function DELETE(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  await db.delete(schema.users).where(eq(schema.users.id, payload.sub));

  const response = NextResponse.json({ success: true });
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
}

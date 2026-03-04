import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { authenticateRequest, authError } from "@/lib/auth-guard";

const MAX_VAULT_SIZE = 10 * 1024 * 1024; // 10MB
const REFRESH_COOKIE_PATH = "/api/auth/refresh";
const REMEMBER_ME_COOKIE = "rememberMe";

function isValidVaultVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

async function getCurrentVaultVersion(userId: string): Promise<number> {
  const [current] = await db
    .select({ version: schema.encryptedVaults.version })
    .from(schema.encryptedVaults)
    .where(eq(schema.encryptedVaults.userId, userId))
    .limit(1);
  return current?.version ?? 0;
}

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

  const body = await req.json();
  const encryptedData =
    typeof body.encryptedData === "string" ? body.encryptedData : "";
  const iv = typeof body.iv === "string" ? body.iv : "";
  const version = body.version;

  if (encryptedData.length === 0 || iv.length === 0) {
    return NextResponse.json(
      { error: "Missing encrypted data or IV" },
      { status: 400 }
    );
  }

  if (!isValidVaultVersion(version)) {
    return NextResponse.json(
      { error: "Version must be a non-negative integer" },
      { status: 400 }
    );
  }

  if (encryptedData.length > MAX_VAULT_SIZE) {
    return NextResponse.json(
      { error: "Vault exceeds maximum size (10MB)" },
      { status: 413 }
    );
  }

  if (version === 0) {
    const inserted = await db
      .insert(schema.encryptedVaults)
      .values({
        userId: payload.sub,
        encryptedData,
        iv,
        version: 1,
        sizeBytes: encryptedData.length,
      })
      .onConflictDoNothing()
      .returning({ version: schema.encryptedVaults.version });

    if (inserted.length > 0) {
      return NextResponse.json({ version: inserted[0].version }, { status: 201 });
    }

    const currentVersion = await getCurrentVaultVersion(payload.sub);
    return NextResponse.json(
      { error: "Version conflict. Please reload.", currentVersion },
      { status: 409 }
    );
  }

  const nextVersion = version + 1;
  const updated = await db
    .update(schema.encryptedVaults)
    .set({
      encryptedData,
      iv,
      version: nextVersion,
      updatedAt: new Date(),
      sizeBytes: encryptedData.length,
    })
    .where(
      and(
        eq(schema.encryptedVaults.userId, payload.sub),
        eq(schema.encryptedVaults.version, version)
      )
    )
    .returning({ version: schema.encryptedVaults.version });

  if (updated.length === 0) {
    const currentVersion = await getCurrentVaultVersion(payload.sub);
    return NextResponse.json(
      { error: "Version conflict. Please reload.", currentVersion },
      { status: 409 }
    );
  }

  return NextResponse.json({ version: updated[0].version });
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

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, authError } from "@/lib/auth-guard";

export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateRequest(req);
    if (!payload) return authError();

    const { authKeyHex } = await req.json();
    if (
      typeof authKeyHex !== "string" ||
      authKeyHex.length === 0 ||
      authKeyHex.length % 2 !== 0 ||
      !/^[0-9a-fA-F]+$/.test(authKeyHex)
    ) {
      return NextResponse.json(
        { error: "Invalid current passphrase" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ authHash: schema.users.authHash })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user) return authError();

    const computedHash = createHash("sha256")
      .update(Buffer.from(authKeyHex, "hex"))
      .digest("hex");

    const a = Buffer.from(computedHash, "hex");
    const b = Buffer.from(user.authHash, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json(
        { error: "Invalid current passphrase" },
        { status: 401 }
      );
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("[auth/verify-passphrase]", error);
    return NextResponse.json(
      { error: "Failed to verify passphrase" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { authenticateRequest, authError } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/redis";
import { isHexOfByteLength } from "@/lib/auth/input-validation";

export async function POST(req: NextRequest) {
  try {
    const payload = await authenticateRequest(req);
    if (!payload) return authError();

    const allowed = await rateLimit(`verify-passphrase:${payload.sub}`, 10, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Try again later." },
        { status: 429 }
      );
    }

    const { authKeyHex } = await req.json();
    if (!isHexOfByteLength(authKeyHex, 32)) {
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

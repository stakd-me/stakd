import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { rateLimit } from "@/lib/redis";
import { getRequestIp, isHexOfByteLength } from "@/lib/auth/input-validation";

export async function POST(req: NextRequest) {
  try {
    const { usernameHash } = await req.json();

    if (!isHexOfByteLength(usernameHash, 32)) {
      return NextResponse.json(
        { error: "Invalid username hash" },
        { status: 400 }
      );
    }

    const clientIp = getRequestIp(req);
    const allowed = await rateLimit(`auth:salt:${clientIp}`, 60, 60);
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }

    const [user] = await db
      .select({ salt: schema.users.salt })
      .from(schema.users)
      .where(eq(schema.users.usernameHash, usernameHash))
      .limit(1);

    if (user) {
      return NextResponse.json({ salt: user.salt });
    }

    // Return deterministic fake salt to prevent username enumeration.
    // Must match real salt format (64-char hex) used by the client parser.
    const fakeSalt = createHash("sha256")
      .update(`stakd-fake-salt:${usernameHash}`)
      .digest("hex");
    return NextResponse.json({ salt: fakeSalt });
  } catch (error) {
    console.error("[auth/salt]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

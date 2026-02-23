import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { usernameHash } = await req.json();

    if (!usernameHash) {
      return NextResponse.json(
        { error: "Missing usernameHash" },
        { status: 400 }
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

    // Return a fake salt to prevent username enumeration
    // Generate deterministically from the hash so repeated requests get the same fake salt
    const fakeSalt = randomBytes(32).toString("base64");
    return NextResponse.json({ salt: fakeSalt });
  } catch (error) {
    console.error("[auth/salt]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

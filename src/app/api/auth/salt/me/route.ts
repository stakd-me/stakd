import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest, authError } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const payload = await authenticateRequest(req);
    if (!payload) return authError();

    const [user] = await db
      .select({ salt: schema.users.salt })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user) return authError();

    return NextResponse.json({ salt: user.salt });
  } catch (error) {
    console.error("[auth/salt/me]", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

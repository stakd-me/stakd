import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { authenticateRequest, authError } from "@/lib/auth-guard";

const ALLOWED_LOCALES = new Set(["en", "vi", "es", "de"]);

// GET: Return user preferences
export async function GET(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  const [prefs] = await db
    .select()
    .from(schema.preferences)
    .where(eq(schema.preferences.userId, payload.sub))
    .limit(1);

  if (!prefs) {
    return NextResponse.json({
      preferences: {
        theme: "dark",
        locale: "en",
      },
    });
  }

  return NextResponse.json({
    preferences: {
      theme: prefs.theme,
      locale:
        typeof prefs.locale === "string" && ALLOWED_LOCALES.has(prefs.locale)
          ? prefs.locale
          : "en",
    },
  });
}

// PUT: Update user preferences
export async function PUT(req: NextRequest) {
  const payload = await authenticateRequest(req);
  if (!payload) return authError();

  const { theme, locale } = await req.json();
  if (
    locale !== undefined &&
    (typeof locale !== "string" || !ALLOWED_LOCALES.has(locale))
  ) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(schema.preferences)
    .where(eq(schema.preferences.userId, payload.sub))
    .limit(1);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (theme !== undefined) updates.theme = theme;
  if (locale !== undefined) updates.locale = locale;

  if (!existing) {
    await db.insert(schema.preferences).values({
      userId: payload.sub,
      theme: theme ?? "dark",
      locale: locale ?? "en",
    });
  } else {
    await db
      .update(schema.preferences)
      .set(updates)
      .where(eq(schema.preferences.userId, payload.sub));
  }

  return NextResponse.json({ success: true });
}

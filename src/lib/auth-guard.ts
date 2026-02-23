import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type TokenPayload } from "@/lib/auth/jwt";

/**
 * Authenticate a request by extracting and verifying the Bearer JWT.
 * Returns the token payload on success, or null if unauthorized.
 */
export async function authenticateRequest(
  req: NextRequest
): Promise<TokenPayload | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * Returns a 401 JSON response.
 */
export function authError(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

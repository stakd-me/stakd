import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);
const ISSUER = "stakd";
const ACCESS_TOKEN_EXPIRY = "15m";

export interface TokenPayload extends JWTPayload {
  sub: string; // userId
}

/**
 * Sign an access token (JWT) for a user.
 */
export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET);
}

/**
 * Verify an access token and return the payload.
 * Throws on invalid/expired tokens.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET, {
    issuer: ISSUER,
  });
  return payload as TokenPayload;
}

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const DEFAULT_DEV_JWT_SECRET = "dev-secret-change-in-production";
const MIN_JWT_SECRET_LENGTH = 32;
const ISSUER = "stakd";
const ACCESS_TOKEN_EXPIRY = "15m";

export interface TokenPayload extends JWTPayload {
  sub: string; // userId
}

function getJwtSecret(): Uint8Array {
  const configuredJwtSecret = process.env.JWT_SECRET;

  if (
    process.env.NODE_ENV === "production" &&
    (!configuredJwtSecret || configuredJwtSecret.length < MIN_JWT_SECRET_LENGTH)
  ) {
    throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
  }

  const jwtSecretRaw = configuredJwtSecret || DEFAULT_DEV_JWT_SECRET;
  return new TextEncoder().encode(jwtSecretRaw);
}

/**
 * Sign an access token (JWT) for a user.
 */
export async function signAccessToken(userId: string): Promise<string> {
  const jwtSecret = getJwtSecret();
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(jwtSecret);
}

/**
 * Verify an access token and return the payload.
 * Throws on invalid/expired tokens.
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const jwtSecret = getJwtSecret();
  const { payload } = await jwtVerify(token, jwtSecret, {
    issuer: ISSUER,
  });
  return payload as TokenPayload;
}

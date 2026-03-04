import { createHmac } from "crypto";

const DEFAULT_DEV_FAKE_SALT_SECRET =
  "dev-fake-salt-secret-change-me-in-production";
const MIN_FAKE_SALT_SECRET_LENGTH = 32;

function getFakeSaltSecret(): string {
  const configuredSecret =
    process.env.AUTH_FAKE_SALT_SECRET || process.env.JWT_SECRET;

  if (
    process.env.NODE_ENV === "production" &&
    (!configuredSecret || configuredSecret.length < MIN_FAKE_SALT_SECRET_LENGTH)
  ) {
    throw new Error(
      "AUTH_FAKE_SALT_SECRET (or JWT_SECRET) must be set to at least 32 characters in production."
    );
  }

  return configuredSecret || DEFAULT_DEV_FAKE_SALT_SECRET;
}

export function deriveFakeSalt(usernameHash: string): string {
  const normalizedUsernameHash = usernameHash.trim().toLowerCase();
  return createHmac("sha256", getFakeSaltSecret())
    .update(`stakd-fake-salt:v2:${normalizedUsernameHash}`)
    .digest("hex");
}

import { signAccessToken, verifyAccessToken } from "@/lib/auth/jwt";

describe("jwt auth", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it("signs and verifies an access token", async () => {
    const token = await signAccessToken("user-123");
    const payload = await verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
  });

  it("fails verification if secret changes", async () => {
    const token = await signAccessToken("user-123");
    process.env.JWT_SECRET = "abcdefabcdefabcdefabcdefabcdefab";
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("requires a long secret in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "short";
    await expect(signAccessToken("user-123")).rejects.toThrow(/JWT_SECRET/);
  });
});

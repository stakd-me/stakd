import { deriveFakeSalt } from "@/lib/auth/fake-salt";

describe("deriveFakeSalt", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalFakeSaltSecret = process.env.AUTH_FAKE_SALT_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.JWT_SECRET = originalJwtSecret;
    process.env.AUTH_FAKE_SALT_SECRET = originalFakeSaltSecret;
  });

  it("returns a 64-char hex value", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_FAKE_SALT_SECRET = "0123456789abcdef0123456789abcdef";

    const salt = deriveFakeSalt("abcd".repeat(16));
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses secret input to derive deterministic salt", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_FAKE_SALT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    const a = deriveFakeSalt("abcd".repeat(16));
    const b = deriveFakeSalt("abcd".repeat(16));
    expect(a).toBe(b);
  });

  it("changes output when secret changes", () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_FAKE_SALT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const a = deriveFakeSalt("abcd".repeat(16));

    process.env.AUTH_FAKE_SALT_SECRET = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const b = deriveFakeSalt("abcd".repeat(16));

    expect(a).not.toBe(b);
  });

  it("rejects production mode with missing secret", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_FAKE_SALT_SECRET;
    delete process.env.JWT_SECRET;

    expect(() => deriveFakeSalt("abcd".repeat(16))).toThrow(
      /AUTH_FAKE_SALT_SECRET/
    );
  });
});

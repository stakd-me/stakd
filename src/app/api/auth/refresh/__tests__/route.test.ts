import { NextRequest } from "next/server";
import { describe, it, expect, beforeEach, vi } from "vitest";

const signAccessTokenMock = vi.fn();
const updateReturningMock = vi.fn();
const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
const updateMock = vi.fn(() => ({ set: updateSetMock }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
}));

vi.mock("@/lib/db", () => ({
  db: {
    update: (...args: unknown[]) => updateMock(...args),
  },
  schema: {
    sessions: {
      userId: "user_id",
      refreshTokenHash: "refresh_token_hash",
      expiresAt: "expires_at",
    },
  },
}));

vi.mock("@/lib/auth/jwt", () => ({
  signAccessToken: (...args: unknown[]) => signAccessTokenMock(...args),
}));

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    signAccessTokenMock.mockReset();
    updateReturningMock.mockReset();
    updateWhereMock.mockClear();
    updateSetMock.mockClear();
    updateMock.mockClear();
  });

  it("returns 401 without mutating cookies when the refresh session is invalid", async () => {
    updateReturningMock.mockResolvedValue([]);

    const { POST } = await import("@/app/api/auth/refresh/route");
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "refreshToken=old-token; rememberMe=1" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(
      /Invalid or expired refresh token|No refresh token/
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rotates the refresh token and returns a new access token", async () => {
    updateReturningMock.mockResolvedValue([
      {
        userId: "user-1",
      },
    ]);
    signAccessTokenMock.mockResolvedValue("new-access-token");

    const { POST } = await import("@/app/api/auth/refresh/route");
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "refreshToken=old-token; rememberMe=1" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      accessToken: "new-access-token",
      userId: "user-1",
    });
    // The session row must receive a NEW token hash (rotation), not just a
    // bumped expiry.
    expect(updateSetMock).toHaveBeenCalledWith({
      refreshTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      expiresAt: expect.any(Date),
    });
    expect(signAccessTokenMock).toHaveBeenCalledWith("user-1");

    const setCookie = res.headers.get("set-cookie") ?? "";
    // A fresh 64-hex-char refresh token is issued; the old value never
    // reappears in the cookie.
    expect(setCookie).toMatch(/refreshToken=[0-9a-f]{64}/);
    expect(setCookie).not.toContain("refreshToken=old-token");
    expect(setCookie).toContain("rememberMe=1");
    expect(setCookie).toContain("Max-Age=2592000");
  });

  it("issues a different token on every refresh", async () => {
    updateReturningMock.mockResolvedValue([{ userId: "user-1" }]);
    signAccessTokenMock.mockResolvedValue("new-access-token");

    const { POST } = await import("@/app/api/auth/refresh/route");
    const makeReq = () =>
      new NextRequest("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { cookie: "refreshToken=old-token; rememberMe=1" },
      });

    const extractToken = (res: Response) =>
      (res.headers.get("set-cookie") ?? "").match(
        /refreshToken=([0-9a-f]{64})/
      )?.[1];

    const first = extractToken(await POST(makeReq()));
    const second = extractToken(await POST(makeReq()));

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
  });
});

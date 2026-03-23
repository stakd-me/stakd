import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.fn();
const authErrorMock = vi.fn(() =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })
);

const selectLimitMock = vi.fn();
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const selectMock = vi.fn(() => ({ select: undefined, from: selectFromMock }));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth-guard", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequestMock(...args),
  authError: (...args: unknown[]) => authErrorMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => {
      selectMock(...args);
      return { from: selectFromMock };
    },
  },
  schema: {
    sessions: {
      id: "id",
      userId: "user_id",
      refreshTokenHash: "refresh_token_hash",
      expiresAt: "expires_at",
    },
  },
}));

describe("PUT /api/auth/refresh/mode", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authErrorMock.mockClear();
    selectLimitMock.mockReset();
    selectWhereMock.mockClear();
    selectFromMock.mockClear();
    selectMock.mockClear();
  });

  it("returns unauthorized when access token auth fails", async () => {
    authenticateRequestMock.mockResolvedValue(null);

    const { PUT } = await import("@/app/api/auth/refresh/mode/route");
    const req = new NextRequest("http://localhost/api/auth/refresh/mode", {
      method: "PUT",
      body: JSON.stringify({ rememberMe: true }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 and clears cookies when the refresh token cookie is missing", async () => {
    authenticateRequestMock.mockResolvedValue({ sub: "user-1" });

    const { PUT } = await import("@/app/api/auth/refresh/mode/route");
    const req = new NextRequest("http://localhost/api/auth/refresh/mode", {
      method: "PUT",
      body: JSON.stringify({ rememberMe: true }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/No refresh token/);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns 400 for an invalid payload", async () => {
    authenticateRequestMock.mockResolvedValue({ sub: "user-1" });

    const { PUT } = await import("@/app/api/auth/refresh/mode/route");
    const req = new NextRequest("http://localhost/api/auth/refresh/mode", {
      method: "PUT",
      body: JSON.stringify({ rememberMe: "yes" }),
      headers: {
        "content-type": "application/json",
        cookie: "refreshToken=refresh-token; rememberMe=0",
      },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid session mode payload/);
  });

  it("updates the cookie persistence mode for the active refresh session", async () => {
    authenticateRequestMock.mockResolvedValue({ sub: "user-1" });
    selectLimitMock.mockResolvedValue([{ id: "session-1" }]);

    const { PUT } = await import("@/app/api/auth/refresh/mode/route");
    const req = new NextRequest("http://localhost/api/auth/refresh/mode", {
      method: "PUT",
      body: JSON.stringify({ rememberMe: true }),
      headers: {
        "content-type": "application/json",
        cookie: "refreshToken=refresh-token; rememberMe=0",
      },
    });

    const res = await PUT(req);
    const body = await res.json();
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, rememberMe: true });
    expect(setCookie).toContain("rememberMe=1");
    expect(setCookie).toContain("Max-Age=2592000");
  });
});

import { NextRequest } from "next/server";
import { describe, it, expect, beforeEach, vi } from "vitest";

const transactionMock = vi.fn();
const signAccessTokenMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
  schema: {
    sessions: {},
  },
}));

vi.mock("@/lib/auth/jwt", () => ({
  signAccessToken: (...args: unknown[]) => signAccessTokenMock(...args),
}));

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    transactionMock.mockReset();
    signAccessTokenMock.mockReset();
  });

  it("returns 401 and clears cookies when token rotation fails", async () => {
    transactionMock.mockResolvedValue(null);

    const { POST } = await import("@/app/api/auth/refresh/route");
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "refreshToken=old-token; rememberMe=1" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/Invalid or expired refresh token|No refresh token/);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns new access token when rotation succeeds", async () => {
    transactionMock.mockResolvedValue({
      userId: "user-1",
      newRefreshToken: "new-refresh-token",
    });
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
    expect(signAccessTokenMock).toHaveBeenCalledWith("user-1");
  });
});

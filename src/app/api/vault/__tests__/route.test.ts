import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";

const authenticateRequestMock = vi.fn();
const rateLimitMock = vi.fn();
const authErrorMock = vi.fn(() =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 })
);

const selectLimitMock = vi.fn();
const selectWhereMock = vi.fn(() => ({ limit: selectLimitMock }));
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const selectMock = vi.fn(() => ({ from: selectFromMock }));

const insertReturningMock = vi.fn();
const insertConflictMock = vi.fn(() => ({ returning: insertReturningMock }));
const insertValuesMock = vi.fn(() => ({ onConflictDoNothing: insertConflictMock }));
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

const updateReturningMock = vi.fn();
const updateWhereMock = vi.fn(() => ({ returning: updateReturningMock }));
const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
const updateMock = vi.fn(() => ({ set: updateSetMock }));

const deleteWhereMock = vi.fn();
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

vi.mock("@/lib/redis", () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

vi.mock("@/lib/auth-guard", () => ({
  authenticateRequest: (...args: unknown[]) => authenticateRequestMock(...args),
  authError: (...args: unknown[]) => authErrorMock(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
  schema: {
    encryptedVaults: {
      userId: "user_id",
      version: "version",
    },
    users: {
      id: "id",
      authHash: "auth_hash",
    },
  },
}));

describe("PUT /api/vault", () => {
  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authErrorMock.mockClear();

    selectLimitMock.mockReset();
    selectWhereMock.mockClear();
    selectFromMock.mockClear();
    selectMock.mockClear();

    insertReturningMock.mockReset();
    insertConflictMock.mockClear();
    insertValuesMock.mockClear();
    insertMock.mockClear();

    updateReturningMock.mockReset();
    updateWhereMock.mockClear();
    updateSetMock.mockClear();
    updateMock.mockClear();

    authenticateRequestMock.mockResolvedValue({ sub: "user-1" });
  });

  it("rejects invalid version payload", async () => {
    const { PUT } = await import("@/app/api/vault/route");
    const req = new NextRequest("http://localhost/api/vault", {
      method: "PUT",
      body: JSON.stringify({
        encryptedData: "ciphertext",
        iv: "iv",
        version: -1,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Version must be a non-negative integer/);
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("creates a new vault when client version is 0", async () => {
    insertReturningMock.mockResolvedValue([{ version: 1 }]);

    const { PUT } = await import("@/app/api/vault/route");
    const req = new NextRequest("http://localhost/api/vault", {
      method: "PUT",
      body: JSON.stringify({
        encryptedData: "ciphertext",
        iv: "iv",
        version: 0,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.version).toBe(1);
  });

  it("returns 409 when versioned update conflicts", async () => {
    updateReturningMock.mockResolvedValue([]);
    selectLimitMock.mockResolvedValue([{ version: 5 }]);

    const { PUT } = await import("@/app/api/vault/route");
    const req = new NextRequest("http://localhost/api/vault", {
      method: "PUT",
      body: JSON.stringify({
        encryptedData: "ciphertext",
        iv: "iv",
        version: 2,
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.currentVersion).toBe(5);
  });
});

describe("DELETE /api/vault", () => {
  const authKeyHex = "ab".repeat(32);
  const authHash = createHash("sha256")
    .update(Buffer.from(authKeyHex, "hex"))
    .digest("hex");

  const makeReq = (body?: unknown) =>
    new NextRequest("http://localhost/api/vault", {
      method: "DELETE",
      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
        : {}),
    });

  beforeEach(() => {
    authenticateRequestMock.mockReset();
    authErrorMock.mockClear();
    rateLimitMock.mockReset();
    selectLimitMock.mockReset();
    deleteWhereMock.mockReset();
    deleteMock.mockClear();

    authenticateRequestMock.mockResolvedValue({ sub: "user-1" });
    rateLimitMock.mockResolvedValue(true);
    selectLimitMock.mockResolvedValue([{ authHash }]);
    deleteWhereMock.mockResolvedValue(undefined);
  });

  it("rejects deletion without passphrase verification payload", async () => {
    const { DELETE } = await import("@/app/api/vault/route");

    const res = await DELETE(makeReq());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Passphrase verification required/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects deletion with a wrong auth key", async () => {
    const { DELETE } = await import("@/app/api/vault/route");

    const res = await DELETE(makeReq({ authKeyHex: "cd".repeat(32) }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/Invalid passphrase/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("deletes the account when the auth key matches", async () => {
    const { DELETE } = await import("@/app/api/vault/route");

    const res = await DELETE(makeReq({ authKeyHex }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("refreshToken=;");
  });

  it("returns 429 when rate limited", async () => {
    rateLimitMock.mockResolvedValue(false);
    const { DELETE } = await import("@/app/api/vault/route");

    const res = await DELETE(makeReq({ authKeyHex }));

    expect(res.status).toBe(429);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

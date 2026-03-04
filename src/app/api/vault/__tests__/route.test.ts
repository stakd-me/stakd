import { NextRequest, NextResponse } from "next/server";
import { describe, it, expect, beforeEach, vi } from "vitest";

const authenticateRequestMock = vi.fn();
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
    delete: vi.fn(),
  },
  schema: {
    encryptedVaults: {
      userId: "user_id",
      version: "version",
    },
    users: {
      id: "id",
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

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto/key-store", () => ({
  loadEncKey: vi.fn(async () => ({}) as CryptoKey),
}));
vi.mock("@/lib/crypto/client-crypto", () => ({
  encryptVault: vi.fn(async () => ({ ciphertext: "c", iv: "i" })),
  decryptVault: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api-client";
import { useVaultStore } from "@/lib/store";
import { flushVault, isVaultSaveInFlight, saveVaultToServer } from "@/lib/services/vault-sync";

const mockedFetch = vi.mocked(apiFetch);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function ok(version: number) {
  return new Response(JSON.stringify({ version }), { status: 200 });
}

function sentVersions(): number[] {
  return mockedFetch.mock.calls.map(
    ([, init]) => JSON.parse(String((init as RequestInit).body)).version
  );
}

function edit() {
  useVaultStore.getState().updateVault((prev) => ({
    ...prev,
    settings: { ...prev.settings, n: String(Math.random()) },
  }));
}

beforeEach(() => {
  mockedFetch.mockReset();
  useVaultStore.getState().clearVault();
  useVaultStore.setState({ vaultVersion: 1 });
});

describe("saveVaultToServer", () => {
  it("runs overlapping saves one after another, each on the version the last returned", async () => {
    const first = deferred<Response>();
    mockedFetch.mockImplementationOnce(() => first.promise);
    mockedFetch.mockImplementationOnce(async () => ok(3));

    edit();
    const a = saveVaultToServer();
    const b = saveVaultToServer();
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    expect(isVaultSaveInFlight()).toBe(true);

    first.resolve(ok(2));
    await Promise.all([a, b]);

    expect(sentVersions()).toEqual([1, 2]);
    expect(useVaultStore.getState().vaultVersion).toBe(3);
    expect(isVaultSaveInFlight()).toBe(false);
  });

  it("keeps the vault dirty when it was edited while the save was in flight", async () => {
    const pending = deferred<Response>();
    mockedFetch.mockImplementationOnce(() => pending.promise);

    edit();
    const save = saveVaultToServer();
    await vi.waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(1));
    edit(); // lands after encryption, so it is not in this request
    pending.resolve(ok(2));
    await save;

    expect(useVaultStore.getState().isDirty).toBe(true);
  });

  it("marks the vault clean when nothing changed during the save", async () => {
    mockedFetch.mockImplementationOnce(async () => ok(2));
    edit();
    await saveVaultToServer();
    expect(useVaultStore.getState().isDirty).toBe(false);
  });

  it("keeps saving after a failed save", async () => {
    mockedFetch.mockImplementationOnce(async () => new Response("", { status: 500 }));
    mockedFetch.mockImplementationOnce(async () => ok(2));
    edit();
    await expect(saveVaultToServer()).rejects.toThrow("Failed to save vault");
    await saveVaultToServer();
    expect(useVaultStore.getState().isDirty).toBe(false);
  });

  it("asks for keepalive only when requested and the body is small enough", async () => {
    mockedFetch.mockImplementation(async () => ok(2));
    edit();
    await saveVaultToServer({ keepalive: true });
    edit();
    await saveVaultToServer();
    const flags = mockedFetch.mock.calls.map(([, init]) => (init as RequestInit).keepalive);
    expect(flags).toEqual([true, false]);
  });
});

describe("flushVault", () => {
  it("does nothing when there are no unsaved edits", async () => {
    await flushVault();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("saves when there are unsaved edits", async () => {
    mockedFetch.mockImplementationOnce(async () => ok(2));
    edit();
    await flushVault();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

import { useVaultStore } from "@/lib/store";
import { encryptVault, decryptVault } from "@/lib/crypto/client-crypto";
import { loadEncKey } from "@/lib/crypto/key-store";
import { apiFetch } from "@/lib/api-client";
import { createEmptyVault, type VaultData } from "@/lib/crypto/vault-types";
import { BINANCE_SYMBOL_TO_COINGECKO_ID } from "@/lib/pricing/binance-symbol-resolver";

/**
 * Load and decrypt the vault from the server.
 */
export async function loadVaultFromServer(): Promise<void> {
  const encKey = await loadEncKey();
  if (!encKey) throw new Error("No encryption key available");

  const data = await apiFetch("/api/vault");
  const json = await data.json();

  if (!json.vault) {
    // New user with no vault yet
    useVaultStore.getState().setVault(createEmptyVault(), 0);
    return;
  }

  const decrypted = await decryptVault(
    json.vault.encryptedData,
    json.vault.iv,
    encKey
  );

  const vault = normalizeVaultShape(decrypted as Partial<VaultData>);
  const patched = patchMissingCoingeckoIds(vault);

  useVaultStore.getState().setVault(
    patched.vault,
    json.vault.version
  );

  // If any coingeckoIds were auto-filled, mark dirty so autosave persists them
  if (patched.changed) {
    useVaultStore.setState({ isDirty: true });
  }
}

function normalizeVaultShape(vault: Partial<VaultData>): VaultData {
  const emptyVault = createEmptyVault();
  return {
    ...emptyVault,
    ...vault,
    transactions: vault.transactions ?? [],
    manualEntries: vault.manualEntries ?? [],
    rebalanceTargets: vault.rebalanceTargets ?? [],
    rebalanceSessions: vault.rebalanceSessions ?? [],
    rebalanceLogs: vault.rebalanceLogs ?? [],
    portfolioSnapshots: vault.portfolioSnapshots ?? [],
    allocationSnapshots: vault.allocationSnapshots ?? [],
    tokenGroups: vault.tokenGroups ?? [],
    tokenCategories: vault.tokenCategories ?? [],
    costBasisOverrides: vault.costBasisOverrides ?? [],
    settings: vault.settings ?? emptyVault.settings,
  };
}

/**
 * Auto-fill missing coingeckoIds from symbol using the curated map.
 */
function patchMissingCoingeckoIds(vault: VaultData): { vault: VaultData; changed: boolean } {
  let changed = false;

  const transactions = vault.transactions.map((tx) => {
    if (tx.coingeckoId) return tx;
    const resolved = BINANCE_SYMBOL_TO_COINGECKO_ID[tx.tokenSymbol.trim().toUpperCase()];
    if (!resolved) return tx;
    changed = true;
    return { ...tx, coingeckoId: resolved };
  });

  const manualEntries = vault.manualEntries.map((e) => {
    if (e.coingeckoId) return e;
    const resolved = BINANCE_SYMBOL_TO_COINGECKO_ID[e.tokenSymbol.trim().toUpperCase()];
    if (!resolved) return e;
    changed = true;
    return { ...e, coingeckoId: resolved, updatedAt: new Date().toISOString() };
  });

  if (!changed) return { vault, changed: false };

  return {
    vault: { ...vault, transactions, manualEntries },
    changed: true,
  };
}

// Fetch with `keepalive` survives the page unloading, but browsers cap
// its body at 64 KiB; larger vaults go as a normal request and rely on the
// unload prompt instead.
const KEEPALIVE_BODY_LIMIT = 60 * 1024;

interface SaveOptions {
  /** Best-effort delivery while the page is being hidden or unloaded. */
  keepalive?: boolean;
}

// Saves run one at a time. Two overlapping PUTs carry the same base
// version, so the second used to 409 and reload the vault from the server,
// throwing away whatever had been edited locally in between.
let saveChain: Promise<void> = Promise.resolve();
let inFlight = 0;

/** True while a save is queued or running. */
export function isVaultSaveInFlight(): boolean {
  return inFlight > 0;
}

/**
 * Encrypt and save the vault to the server. Calls are serialised; the
 * returned promise settles when *this* save has been acknowledged.
 */
export function saveVaultToServer(options: SaveOptions = {}): Promise<void> {
  inFlight += 1;
  const run = saveChain.then(() => saveNow(options));
  saveChain = run.catch(() => {});
  return run.finally(() => {
    inFlight -= 1;
  });
}

/**
 * Save only if there are unsaved local edits. What autosave and the
 * page-hide handlers call; explicit "Save" buttons call saveVaultToServer.
 */
export function flushVault(options: SaveOptions = {}): Promise<void> {
  if (!useVaultStore.getState().isDirty) return saveChain;
  return saveVaultToServer(options);
}

async function saveNow({ keepalive = false }: SaveOptions): Promise<void> {
  const encKey = await loadEncKey();
  if (!encKey) throw new Error("No encryption key available");

  const { vault, vaultVersion, revision } = useVaultStore.getState();

  const { ciphertext, iv } = await encryptVault(vault, encKey);

  const body = JSON.stringify({
    encryptedData: ciphertext,
    iv,
    version: vaultVersion,
  });

  const res = await apiFetch("/api/vault", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: keepalive && body.length <= KEEPALIVE_BODY_LIMIT,
  });

  if (res.status === 409) {
    // Version conflict - reload from server
    await loadVaultFromServer();
    throw new Error("Version conflict. Vault reloaded from server.");
  }

  if (!res.ok) {
    throw new Error("Failed to save vault");
  }

  const data = await res.json();
  useVaultStore.setState((state) => ({
    vaultVersion: data.version,
    // Edits made while this request was in flight are not in it, so the
    // vault stays dirty and autosave picks them up next.
    isDirty: state.revision === revision ? false : state.isDirty,
  }));
}

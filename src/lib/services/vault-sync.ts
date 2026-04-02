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

  const vault = decrypted as VaultData;
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

/**
 * Encrypt and save the vault to the server.
 */
export async function saveVaultToServer(): Promise<void> {
  const encKey = await loadEncKey();
  if (!encKey) throw new Error("No encryption key available");

  const { vault, vaultVersion } = useVaultStore.getState();

  const { ciphertext, iv } = await encryptVault(vault, encKey);

  const res = await apiFetch("/api/vault", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      encryptedData: ciphertext,
      iv,
      version: vaultVersion,
    }),
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
  useVaultStore.setState({
    vaultVersion: data.version,
    isDirty: false,
  });
}

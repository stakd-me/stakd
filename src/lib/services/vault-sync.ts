import { useVaultStore } from "@/lib/store";
import { encryptVault, decryptVault } from "@/lib/crypto/client-crypto";
import { loadEncKey } from "@/lib/crypto/key-store";
import { apiFetch } from "@/lib/api-client";
import { createEmptyVault, type VaultData } from "@/lib/crypto/vault-types";

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

  useVaultStore.getState().setVault(
    decrypted as VaultData,
    json.vault.version
  );
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

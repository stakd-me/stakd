/**
 * Client-side key store using sessionStorage.
 * The encryption key raw bytes are stored in sessionStorage
 * (survives page refresh, lost on tab close).
 */

const ENC_KEY_STORAGE_KEY = "stakd-enc-key";

/**
 * Store the encryption key's raw bytes in sessionStorage.
 */
export async function storeEncKey(encKey: CryptoKey): Promise<void> {
  const rawBytes = await crypto.subtle.exportKey("raw", encKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(rawBytes)));
  sessionStorage.setItem(ENC_KEY_STORAGE_KEY, b64);
}

/**
 * Load the encryption key from sessionStorage.
 * Returns null if not found.
 */
export async function loadEncKey(): Promise<CryptoKey | null> {
  const b64 = sessionStorage.getItem(ENC_KEY_STORAGE_KEY);
  if (!b64) return null;

  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return crypto.subtle.importKey("raw", bytes, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

/**
 * Check if an encryption key exists in sessionStorage.
 */
export function hasEncKey(): boolean {
  return sessionStorage.getItem(ENC_KEY_STORAGE_KEY) !== null;
}

/**
 * Clear the encryption key from sessionStorage.
 */
export function clearEncKey(): void {
  sessionStorage.removeItem(ENC_KEY_STORAGE_KEY);
}

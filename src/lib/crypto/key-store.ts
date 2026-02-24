/**
 * Client-side key store.
 * - Default: sessionStorage (lost on tab close)
 * - Remember Me: localStorage (persist across browser restarts)
 */

const ENC_KEY_SESSION_STORAGE_KEY = "stakd-enc-key";
const ENC_KEY_PERSISTENT_STORAGE_KEY = "stakd-enc-key-persistent";

function decodeBase64Key(b64: string): ArrayBuffer | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

export async function storeEncKey(
  encKey: CryptoKey,
  options: { persist?: boolean } = {}
): Promise<void> {
  const rawBytes = await crypto.subtle.exportKey("raw", encKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(rawBytes)));

  if (options.persist) {
    localStorage.setItem(ENC_KEY_PERSISTENT_STORAGE_KEY, b64);
    sessionStorage.removeItem(ENC_KEY_SESSION_STORAGE_KEY);
  } else {
    sessionStorage.setItem(ENC_KEY_SESSION_STORAGE_KEY, b64);
    localStorage.removeItem(ENC_KEY_PERSISTENT_STORAGE_KEY);
  }
}

export async function loadEncKey(): Promise<CryptoKey | null> {
  const sessionValue = sessionStorage.getItem(ENC_KEY_SESSION_STORAGE_KEY);
  const persistentValue = localStorage.getItem(ENC_KEY_PERSISTENT_STORAGE_KEY);
  const b64 = sessionValue || persistentValue;
  if (!b64) return null;

  const rawKey = decodeBase64Key(b64);
  if (!rawKey) return null;

  try {
    return crypto.subtle.importKey("raw", rawKey, "AES-GCM", true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

export function hasEncKey(): boolean {
  return (
    sessionStorage.getItem(ENC_KEY_SESSION_STORAGE_KEY) !== null ||
    localStorage.getItem(ENC_KEY_PERSISTENT_STORAGE_KEY) !== null
  );
}

export function isEncKeyPersistent(): boolean {
  return localStorage.getItem(ENC_KEY_PERSISTENT_STORAGE_KEY) !== null;
}

export function clearEncKey(): void {
  sessionStorage.removeItem(ENC_KEY_SESSION_STORAGE_KEY);
  localStorage.removeItem(ENC_KEY_PERSISTENT_STORAGE_KEY);
}

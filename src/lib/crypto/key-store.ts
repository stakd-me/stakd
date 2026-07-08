/**
 * Client-side key store.
 *
 * The enc key is kept in IndexedDB as a NON-EXTRACTABLE CryptoKey: script
 * running in the page (e.g. via XSS) can still use the key while the page is
 * open, but it cannot export the raw bytes for offline/persistent access.
 *
 * - Default: session mode — the IDB record is bound to a per-tab marker in
 *   sessionStorage, so the key becomes unusable once the tab closes.
 * - Remember Me: persistent mode — the record survives browser restarts.
 *
 * Legacy base64 keys in local/sessionStorage (pre-IDB format) are migrated
 * on first load and the plaintext copies removed.
 */

const DB_NAME = "stakd-keys";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const RECORD_ID = "enc-key";
const SESSION_MARKER_STORAGE_KEY = "stakd-enc-key-session-id";

// Pre-IDB storage locations (raw base64 key material).
const LEGACY_SESSION_STORAGE_KEY = "stakd-enc-key";
const LEGACY_PERSISTENT_STORAGE_KEY = "stakd-enc-key-persistent";

interface KeyRecord {
  id: string;
  key: CryptoKey;
  mode: "session" | "persistent";
  sessionId?: string;
}

function isBrowser(): boolean {
  return typeof indexedDB !== "undefined" && typeof sessionStorage !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = operation(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

function getRecord(): Promise<KeyRecord | undefined> {
  return withStore("readonly", (store) => store.get(RECORD_ID));
}

function putRecord(record: KeyRecord): Promise<IDBValidKey> {
  return withStore("readwrite", (store) => store.put(record));
}

function deleteRecord(): Promise<undefined> {
  return withStore("readwrite", (store) => store.delete(RECORD_ID));
}

async function toNonExtractable(key: CryptoKey): Promise<CryptoKey> {
  if (!key.extractable) return key;
  const raw = await crypto.subtle.exportKey("raw", key);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

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

/** One-time migration of raw base64 keys out of local/sessionStorage. */
async function migrateLegacyKey(): Promise<CryptoKey | null> {
  const sessionB64 = sessionStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
  const persistentB64 = localStorage.getItem(LEGACY_PERSISTENT_STORAGE_KEY);
  const b64 = sessionB64 || persistentB64;
  if (!b64) return null;

  sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_PERSISTENT_STORAGE_KEY);

  const raw = decodeBase64Key(b64);
  if (!raw) return null;

  try {
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
    await storeEncKey(key, { persist: Boolean(persistentB64 && !sessionB64) });
    return key;
  } catch {
    return null;
  }
}

export async function storeEncKey(
  encKey: CryptoKey,
  options: { persist?: boolean } = {}
): Promise<void> {
  if (!isBrowser()) return;

  const key = await toNonExtractable(encKey);

  if (options.persist) {
    sessionStorage.removeItem(SESSION_MARKER_STORAGE_KEY);
    await putRecord({ id: RECORD_ID, key, mode: "persistent" });
  } else {
    const sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_MARKER_STORAGE_KEY, sessionId);
    await putRecord({ id: RECORD_ID, key, mode: "session", sessionId });
  }

  // Never leave plaintext copies from the legacy format behind.
  sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_PERSISTENT_STORAGE_KEY);
}

export async function loadEncKey(): Promise<CryptoKey | null> {
  if (!isBrowser()) return null;

  try {
    const record = await getRecord();
    if (!record) {
      return migrateLegacyKey();
    }

    if (record.mode === "session") {
      const marker = sessionStorage.getItem(SESSION_MARKER_STORAGE_KEY);
      if (!marker || marker !== record.sessionId) {
        // Orphaned key from a closed tab — remove it rather than leave
        // usable key material behind.
        await deleteRecord();
        return null;
      }
    }

    return record.key;
  } catch {
    return null;
  }
}

export async function hasEncKey(): Promise<boolean> {
  return (await loadEncKey()) !== null;
}

export async function isEncKeyPersistent(): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    const record = await getRecord();
    return record?.mode === "persistent";
  } catch {
    return false;
  }
}

export async function clearEncKey(): Promise<void> {
  if (!isBrowser()) return;
  sessionStorage.removeItem(SESSION_MARKER_STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_PERSISTENT_STORAGE_KEY);
  try {
    await deleteRecord();
  } catch {
    // IDB unavailable — nothing persisted there to clear.
  }
}

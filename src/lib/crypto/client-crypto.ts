/**
 * Client-side E2EE cryptography using Web Crypto API.
 * All key derivation and encryption happens exclusively in the browser.
 * The encryption key (enc_key) NEVER leaves the client.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 32;

// ── Salt Generation ──────────────────────────────────────────────────

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export function saltToBase64(salt: Uint8Array): string {
  return btoa(String.fromCharCode(...salt));
}

export function saltFromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Key Derivation Chain ─────────────────────────────────────────────

/**
 * Derive master key from passphrase + salt using PBKDF2.
 */
export async function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const masterBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-512",
    },
    keyMaterial,
    256
  );

  return crypto.subtle.importKey(
    "raw",
    masterBits,
    "HKDF",
    false,
    ["deriveBits"]
  );
}

/**
 * Derive auth key from master key using HKDF (sent to server for authentication).
 * Returns raw bytes as ArrayBuffer.
 */
export async function deriveAuthKey(masterKey: CryptoKey): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32), // zero salt for deterministic derivation
      info: encoder.encode("stakd-auth-v1"),
    },
    masterKey,
    256
  );
}

/**
 * Derive encryption key from master key using HKDF (NEVER leaves client).
 * Returns a CryptoKey for AES-256-GCM.
 */
export async function deriveEncKey(masterKey: CryptoKey): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const rawBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: encoder.encode("stakd-enc-v1"),
    },
    masterKey,
    256
  );

  return crypto.subtle.importKey("raw", rawBits, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

// ── Vault Encryption ─────────────────────────────────────────────────

/**
 * Encrypt vault data with AES-256-GCM.
 */
export async function encryptVault(
  data: object,
  encKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(data));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encKey,
    plaintext
  );

  return {
    ciphertext: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
  };
}

/**
 * Decrypt vault data from AES-256-GCM ciphertext.
 */
export async function decryptVault(
  ciphertext: string,
  iv: string,
  encKey: CryptoKey
): Promise<object> {
  const decoder = new TextDecoder();
  const encryptedData = base64ToArrayBuffer(ciphertext);
  const ivBytes = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    encKey,
    encryptedData
  );

  return JSON.parse(decoder.decode(decrypted));
}

// ── Hashing ──────────────────────────────────────────────────────────

/**
 * Hash username to SHA-256 hex (lowercase, trimmed input).
 */
export async function hashUsername(username: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(username.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Hash auth key bytes to SHA-256 hex (for server-side storage).
 */
export async function hashAuthKey(authKey: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", authKey);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Convert auth key to hex for transport.
 */
export function authKeyToHex(authKey: ArrayBuffer): string {
  return arrayBufferToHex(authKey);
}

// ── Utility ──────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

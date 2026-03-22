"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useAuthStore } from "@/lib/store";
import { useTranslation } from "@/hooks/use-translation";
import {
  generateSalt,
  deriveMasterKey,
  deriveAuthKey,
  deriveEncKey,
  hashUsername,
  authKeyToHex,
} from "@/lib/crypto/client-crypto";
import { storeEncKey } from "@/lib/crypto/key-store";
import { loadVaultFromServer } from "@/lib/services/vault-sync";

type Tab = "login" | "register";
const TRUST_DEVICE_DAYS = 30;

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const offset = i * 2;
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16);
    if (Number.isNaN(value)) return null;
    bytes[i] = value;
  }
  return bytes;
}

export function AuthScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassphraseWarning, setShowPassphraseWarning] = useState(false);
  const [savedPassphrase, setSavedPassphrase] = useState("");
  const pendingAuthRef = useRef<{ userId: string; accessToken: string } | null>(null);
  const requiredLabel = t("common.required");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const usernameHash = await hashUsername(username);

      // 1. Get salt from server
      const saltRes = await fetch("/api/auth/salt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameHash }),
      });
      if (!saltRes.ok) throw new Error(t("auth.loginFailed"));
      const { salt: saltHex } = await saltRes.json();
      const salt = hexToBytes(typeof saltHex === "string" ? saltHex : "");
      if (!salt) {
        throw new Error(t("auth.loginFailed"));
      }

      // 2. Derive keys
      const masterKey = await deriveMasterKey(passphrase, salt);
      const authKey = await deriveAuthKey(masterKey);
      const encKey = await deriveEncKey(masterKey);
      const authKeyHex = authKeyToHex(authKey);

      // 3. Login
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameHash, authKeyHex, rememberMe }),
      });

      if (!loginRes.ok) {
        const data = await loginRes.json();
        throw new Error(data.error || t("auth.loginFailed"));
      }

      const loginData = await loginRes.json();

      // 4. Store encryption key based on remember-me preference
      await storeEncKey(encKey, { persist: rememberMe });

      // 5. Set auth state
      useAuthStore.getState().setAuth(loginData.userId, loginData.accessToken);

      // 6. Load and decrypt vault
      await loadVaultFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (passphrase !== confirmPassphrase) {
      setError(t("auth.passphrasesDoNotMatch"));
      return;
    }
    if (passphrase.length < 8) {
      setError(t("auth.passphraseMinLength"));
      return;
    }

    setLoading(true);

    try {
      const usernameHash = await hashUsername(username);
      const salt = generateSalt();
      const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");

      // Derive keys
      const masterKey = await deriveMasterKey(passphrase, salt);
      const authKey = await deriveAuthKey(masterKey);
      const encKey = await deriveEncKey(masterKey);
      const authKeyHex = authKeyToHex(authKey);

      // Register
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameHash, authKeyHex, salt: saltHex }),
      });

      if (!regRes.ok) {
        const data = await regRes.json();
        throw new Error(data.error || t("auth.registrationFailed"));
      }

      const regData = await regRes.json();

      // Store credentials but don't set auth yet — show warning first
      await storeEncKey(encKey);
      pendingAuthRef.current = { userId: regData.userId, accessToken: regData.accessToken };

      // Show passphrase warning before entering the app
      setSavedPassphrase(passphrase);
      setShowPassphraseWarning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDismissWarning = async () => {
    if (pendingAuthRef.current) {
      const { userId, accessToken } = pendingAuthRef.current;
      useAuthStore.getState().setAuth(userId, accessToken);
      await loadVaultFromServer();
      pendingAuthRef.current = null;
    }
    setSavedPassphrase("");
    setShowPassphraseWarning(false);
  };

  // Show passphrase confirmation modal after successful registration
  if (showPassphraseWarning) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-page">
        <div className="w-full max-w-md space-y-6 p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-positive-soft text-status-positive">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-text-primary">
              {t("auth.accountCreated")}
            </h2>
            <p className="mt-2 text-text-subtle">
              {t("auth.accountCreatedDesc")}
            </p>
          </div>

          <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-4 text-sm text-status-warning">
            <p className="mb-2 font-semibold">{t("auth.savePassphraseNow")}</p>
            <p className="mb-3 text-xs text-status-warning/80">
              {t("auth.savePassphraseDesc")}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-status-warning-border bg-status-warning-soft px-3 py-2 font-mono text-sm text-status-warning">
              <span className="flex-1 select-all break-all">{savedPassphrase}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(savedPassphrase);
                }}
                className="shrink-0 rounded p-1 text-status-warning hover:bg-status-warning-soft hover:text-status-warning"
                title={t("auth.copyPassphrase")}
                aria-label={t("auth.copyPassphrase")}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <Button className="w-full" onClick={handleDismissWarning}>
            {t("auth.savedPassphrase")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-page">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">{t("nav.title")}</h1>
          <p className="mt-2 text-text-subtle">
            {tab === "login"
              ? t("auth.signInDescription")
              : t("auth.createAccountDescription")}
          </p>
        </div>

        <div className="flex rounded-lg border border-border-subtle">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={`flex-1 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-bg-hover text-text-primary"
                : "text-text-subtle hover:text-text-primary"
            }`}
          >
            {t("auth.signInTab")}
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={`flex-1 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-bg-hover text-text-primary"
                : "text-text-subtle hover:text-text-primary"
            }`}
          >
            {t("auth.registerTab")}
          </button>
        </div>

        <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-4">
          <FormField
            label={t("auth.usernameLabel")}
            htmlFor="auth-username"
            required
            requiredLabel={requiredLabel}
          >
            <Input
              id="auth-username"
              type="text"
              placeholder={t("auth.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </FormField>

          <FormField
            label={t("auth.passphraseLabel")}
            htmlFor="auth-passphrase"
            required
            requiredLabel={requiredLabel}
            error={passphrase.length > 0 && passphrase.length < 8 ? t("auth.passphraseMinLength") : undefined}
          >
            <Input
              id="auth-passphrase"
              type="password"
              placeholder={t("auth.passphrasePlaceholder")}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              minLength={8}
              required
            />
          </FormField>

          {tab === "register" && (
            <FormField
              label={t("auth.confirmPassphraseLabel")}
              htmlFor="auth-confirm-passphrase"
              required
              requiredLabel={requiredLabel}
              error={
                confirmPassphrase.length > 0 && confirmPassphrase !== passphrase
                  ? t("auth.passphrasesDoNotMatch")
                  : undefined
              }
            >
              <Input
                id="auth-confirm-passphrase"
                type="password"
                placeholder={t("auth.confirmPassphrasePlaceholder")}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                minLength={8}
                required
              />
            </FormField>
          )}

          {error && <p className="text-sm text-status-negative">{error}</p>}

          {tab === "login" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-subtle">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border-subtle"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {t("auth.rememberMe", { days: TRUST_DEVICE_DAYS })}
            </label>
          )}

          {tab === "register" && (
            <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-3 text-xs text-status-warning">
              {t("auth.savePassphraseDesc")}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || username.length < 1 || passphrase.length < 8}
          >
            {loading
              ? t("common.processing")
              : tab === "login"
                ? t("auth.signIn")
                : t("auth.createAccount")}
          </Button>
        </form>
      </div>
    </div>
  );
}

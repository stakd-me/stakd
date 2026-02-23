"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function AuthScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("login");
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassphraseWarning, setShowPassphraseWarning] = useState(false);
  const [savedPassphrase, setSavedPassphrase] = useState("");
  const pendingAuthRef = useRef<{ userId: string; accessToken: string } | null>(null);

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
      if (!saltRes.ok) throw new Error("Failed to get salt");
      const { salt: saltHex } = await saltRes.json();
      const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));

      // 2. Derive keys
      const masterKey = await deriveMasterKey(passphrase, salt);
      const authKey = await deriveAuthKey(masterKey);
      const encKey = await deriveEncKey(masterKey);
      const authKeyHex = authKeyToHex(authKey);

      // 3. Login
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameHash, authKeyHex }),
      });

      if (!loginRes.ok) {
        const data = await loginRes.json();
        throw new Error(data.error || "Login failed");
      }

      const loginData = await loginRes.json();

      // 4. Store enc key in sessionStorage
      await storeEncKey(encKey);

      // 5. Set auth state
      useAuthStore.getState().setAuth(loginData.userId, loginData.accessToken);

      // 6. Load and decrypt vault
      await loadVaultFromServer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match");
      return;
    }
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
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
        throw new Error(data.error || "Registration failed");
      }

      const regData = await regRes.json();

      // Store credentials but don't set auth yet — show warning first
      await storeEncKey(encKey);
      pendingAuthRef.current = { userId: regData.userId, accessToken: regData.accessToken };

      // Show passphrase warning before entering the app
      setSavedPassphrase(passphrase);
      setShowPassphraseWarning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
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
            <h2 className="text-2xl font-bold text-text-primary">Account Created</h2>
            <p className="mt-2 text-text-subtle">
              Your account has been created successfully.
            </p>
          </div>

          <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-4 text-sm text-status-warning">
            <p className="mb-2 font-semibold">Save your passphrase now!</p>
            <p className="mb-3 text-xs text-status-warning/80">
              Your data is encrypted with a key derived from your passphrase.
              We cannot recover or reset it. If you lose your passphrase, your data is lost forever.
            </p>
            <div className="flex items-center gap-2 rounded-md border border-status-warning-border bg-status-warning-soft px-3 py-2 font-mono text-sm text-status-warning">
              <span className="flex-1 select-all break-all">{savedPassphrase}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(savedPassphrase);
                }}
                className="shrink-0 rounded p-1 text-status-warning hover:bg-status-warning-soft hover:text-status-warning"
                title="Copy to clipboard"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <Button className="w-full" onClick={handleDismissWarning}>
            I have saved my passphrase
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
            {tab === "login" ? "Sign in to your portfolio" : "Create a new account"}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-border-subtle">
          <button
            onClick={() => { setTab("login"); setError(""); }}
            className={`flex-1 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-bg-hover text-text-primary"
                : "text-text-subtle hover:text-text-primary"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => { setTab("register"); setError(""); }}
            className={`flex-1 rounded-r-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-bg-hover text-text-primary"
                : "text-text-subtle hover:text-text-primary"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={tab === "login" ? handleLogin : handleRegister} className="space-y-4">
          <Input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />

          <Input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            minLength={8}
            required
          />

          {tab === "register" && (
            <Input
              type="password"
              placeholder="Confirm passphrase"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              minLength={8}
              required
            />
          )}

          {error && <p className="text-sm text-status-negative">{error}</p>}

          {tab === "register" && (
            <div className="rounded-lg border border-status-warning-border bg-status-warning-soft p-3 text-xs text-status-warning">
              Save your passphrase. We cannot recover it. Your data is encrypted with a key derived from your passphrase.
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
                ? "Sign In"
                : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}

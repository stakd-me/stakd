"use client";

import { useRef, useState } from "react";
import {
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { InlineHelpCard } from "@/components/ui/inline-help";
import { useTranslation } from "@/hooks/use-translation";
import {
  authKeyToHex,
  deriveAuthKey,
  deriveEncKey,
  deriveMasterKey,
  generateSalt,
  hashUsername,
} from "@/lib/crypto/client-crypto";
import { storeEncKey } from "@/lib/crypto/key-store";
import { loadVaultFromServer } from "@/lib/services/vault-sync";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

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
  const [copyStatusMessage, setCopyStatusMessage] = useState("");
  const pendingAuthRef = useRef<{ userId: string; accessToken: string } | null>(
    null
  );
  const requiredLabel = t("common.required");
  const authPanelId = "auth-panel";
  const loginTabId = "auth-login-tab";
  const registerTabId = "auth-register-tab";
  const passphraseTooShort = passphrase.length > 0 && passphrase.length < 8;
  const confirmMismatch =
    tab === "register" &&
    confirmPassphrase.length > 0 &&
    confirmPassphrase !== passphrase;

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    setError("");
    setPassphrase("");
    setConfirmPassphrase("");
    if (nextTab === "register") {
      setRememberMe(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const usernameHash = await hashUsername(username);

      const saltRes = await fetch("/api/auth/salt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameHash }),
      });

      if (!saltRes.ok) {
        throw new Error(t("auth.loginFailed"));
      }

      const { salt: saltHex } = await saltRes.json();
      const salt = hexToBytes(typeof saltHex === "string" ? saltHex : "");
      if (!salt) {
        throw new Error(t("auth.loginFailed"));
      }

      const masterKey = await deriveMasterKey(passphrase, salt);
      const authKey = await deriveAuthKey(masterKey);
      const encKey = await deriveEncKey(masterKey);
      const authKeyHex = authKeyToHex(authKey);

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

      await storeEncKey(encKey, { persist: rememberMe });

      useAuthStore.getState().setAuth(loginData.userId, loginData.accessToken);

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
      const saltHex = Array.from(salt)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      const masterKey = await deriveMasterKey(passphrase, salt);
      const authKey = await deriveAuthKey(masterKey);
      const encKey = await deriveEncKey(masterKey);
      const authKeyHex = authKeyToHex(authKey);

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

      await storeEncKey(encKey);
      pendingAuthRef.current = {
        userId: regData.userId,
        accessToken: regData.accessToken,
      };

      setSavedPassphrase(passphrase);
      setShowPassphraseWarning(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("auth.registrationFailed")
      );
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

  if (showPassphraseWarning) {
    return (
      <div className="min-h-screen bg-bg-page px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center">
          <div className="w-full space-y-6 rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-sm sm:p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-positive-soft text-status-positive">
                <svg
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-text-primary">
                {t("auth.accountCreated")}
              </h2>
              <p className="mt-2 text-text-subtle">
                {t("auth.accountCreatedDesc")}
              </p>
            </div>

            <InlineHelpCard
              tone="warning"
              icon={<TriangleAlert className="h-4 w-4" />}
              title={t("auth.savePassphraseNow")}
              description={t("auth.savePassphraseDesc")}
              items={[
                t("auth.passphraseShownOnce"),
                t("auth.registerStartsSessionOnly"),
              ]}
            />

            <div className="rounded-lg border border-status-warning-border bg-status-warning-soft px-3 py-2 font-mono text-sm text-status-warning">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 select-all break-all">
                  {savedPassphrase}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(savedPassphrase);
                    setCopyStatusMessage(t("auth.passphraseCopied"));
                  }}
                  className="shrink-0 rounded p-1 text-status-warning transition-colors hover:bg-status-warning/10"
                  title={t("auth.copyPassphrase")}
                  aria-label={t("auth.copyPassphrase")}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                </button>
              </div>
              <p className="sr-only" role="status" aria-live="polite">
                {copyStatusMessage}
              </p>
            </div>

            <Button className="w-full" onClick={handleDismissWarning}>
              {t("auth.savedPassphrase")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-page px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center">
        <section className="space-y-4 lg:pr-6">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full border border-border-subtle bg-bg-card px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-text-dim">
              {t("nav.title")}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                {tab === "login"
                  ? t("auth.signInDescription")
                  : t("auth.createAccountDescription")}
              </h1>
              <p className="max-w-xl text-sm text-text-subtle sm:text-base">
                {t("auth.privateVaultDesc")}
              </p>
            </div>
          </div>

          <InlineHelpCard
            icon={<ShieldCheck className="h-4 w-4" />}
            title={t("auth.privateVaultTitle")}
            description={t("auth.privateVaultSummary")}
            items={[
              t("auth.privateVaultPointPassphrase"),
              t("auth.privateVaultPointBrowser"),
            ]}
          />

          {tab === "login" ? (
            <InlineHelpCard
              tone={rememberMe ? "warning" : "info"}
              icon={<MonitorSmartphone className="h-4 w-4" />}
              title={t("auth.sessionSecurityTitle")}
              description={t("auth.sessionSecuritySummary")}
              items={[
                t("auth.sessionOnlyDesc"),
                t("auth.trustedDeviceDesc", { days: TRUST_DEVICE_DAYS }),
              ]}
            />
          ) : (
            <InlineHelpCard
              tone="warning"
              icon={<KeyRound className="h-4 w-4" />}
              title={t("auth.registerSecurityTitle")}
              description={t("auth.registerSecuritySummary")}
              items={[
                t("auth.savePassphraseDesc"),
                t("auth.registerStartsSessionOnly"),
              ]}
            />
          )}
        </section>

        <section className="w-full rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-text-primary">
                {tab === "login" ? t("auth.signIn") : t("auth.createAccount")}
              </h2>
              <p className="text-sm text-text-subtle">
                {tab === "login"
                  ? t("auth.signInDescription")
                  : t("auth.createAccountDescription")}
              </p>
            </div>

            <div
              className="grid grid-cols-2 rounded-xl border border-border-subtle bg-bg-muted p-1"
              role="tablist"
              aria-label={t("auth.accountTabs")}
            >
              <button
                id={loginTabId}
                type="button"
                role="tab"
                aria-selected={tab === "login"}
                aria-controls={authPanelId}
                tabIndex={tab === "login" ? 0 : -1}
                onClick={() => handleTabChange("login")}
                className={cn(
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card",
                  tab === "login"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-subtle hover:text-text-primary"
                )}
              >
                {t("auth.signInTab")}
              </button>
              <button
                id={registerTabId}
                type="button"
                role="tab"
                aria-selected={tab === "register"}
                aria-controls={authPanelId}
                tabIndex={tab === "register" ? 0 : -1}
                onClick={() => handleTabChange("register")}
                className={cn(
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card",
                  tab === "register"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-subtle hover:text-text-primary"
                )}
              >
                {t("auth.registerTab")}
              </button>
            </div>

            <form
              id={authPanelId}
              role="tabpanel"
              aria-labelledby={tab === "login" ? loginTabId : registerTabId}
              onSubmit={tab === "login" ? handleLogin : handleRegister}
              className="space-y-4"
            >
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
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </FormField>

              <FormField
                label={t("auth.passphraseLabel")}
                htmlFor="auth-passphrase"
                required
                requiredLabel={requiredLabel}
                error={passphraseTooShort ? t("auth.passphraseMinLength") : undefined}
              >
                <Input
                  id="auth-passphrase"
                  type="password"
                  placeholder={t("auth.passphrasePlaceholder")}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete={tab === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  aria-invalid={passphraseTooShort || undefined}
                  required
                />
              </FormField>

              {tab === "register" ? (
                <FormField
                  label={t("auth.confirmPassphraseLabel")}
                  htmlFor="auth-confirm-passphrase"
                  required
                  requiredLabel={requiredLabel}
                  error={confirmMismatch ? t("auth.passphrasesDoNotMatch") : undefined}
                >
                  <Input
                    id="auth-confirm-passphrase"
                    type="password"
                    placeholder={t("auth.confirmPassphrasePlaceholder")}
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    aria-invalid={confirmMismatch || undefined}
                    required
                  />
                </FormField>
              ) : null}

              {error ? (
                <p
                  className="rounded-lg border border-status-negative-border bg-status-negative-soft px-3 py-2 text-sm text-status-negative"
                  role="alert"
                  aria-live="assertive"
                >
                  {error}
                </p>
              ) : null}

              <p className="sr-only" role="status" aria-live="polite">
                {loading ? t("common.processing") : ""}
              </p>

              {tab === "login" ? (
                <div className="rounded-xl border border-border-subtle bg-bg-card p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border-subtle bg-bg-input text-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
                    />
                    <span className="space-y-1">
                      <span className="block text-sm font-medium text-text-primary">
                        {t("auth.rememberMe", { days: TRUST_DEVICE_DAYS })}
                      </span>
                      <span className="block text-xs text-text-dim">
                        {rememberMe
                          ? t("auth.trustedDeviceDesc", {
                              days: TRUST_DEVICE_DAYS,
                            })
                          : t("auth.sessionOnlyDesc")}
                      </span>
                    </span>
                  </label>
                </div>
              ) : (
                <InlineHelpCard
                  tone="warning"
                  icon={<TriangleAlert className="h-4 w-4" />}
                  title={t("auth.registerSecurityTitle")}
                  description={t("auth.registerSecuritySummary")}
                  items={[
                    t("auth.savePassphraseDesc"),
                    t("auth.registerStartsSessionOnly"),
                  ]}
                />
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || username.length < 1 || passphrase.length < 8}
                aria-busy={loading}
              >
                {loading
                  ? t("common.processing")
                  : tab === "login"
                    ? t("auth.signIn")
                    : t("auth.createAccount")}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}

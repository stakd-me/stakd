"use client";

import { useRef, useState } from "react";
import { Copy, KeyRound, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
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

  const brand = (
    <div>
      <div className="text-heading font-extrabold uppercase tracking-tight text-text-primary">
        {t("nav.title")}
      </div>
      <div className="mt-0.5 font-mono text-meta uppercase text-text-muted">
        {t("nav.localVault")}
      </div>
    </div>
  );

  if (showPassphraseWarning) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-page p-4">
        <div className="w-full max-w-lg space-y-4">
          {brand}

          <div className="border border-border bg-bg-card">
            <div className="border-b border-border px-5 py-4">
              <div className="font-mono text-meta uppercase text-text-muted">
                {t("auth.accountCreated")}
              </div>
              <h1 className="mt-1 text-display-sm text-text-primary">
                {t("auth.savePassphraseNow")}
              </h1>
              <p className="mt-1.5 text-body text-text-secondary">
                {t("auth.accountCreatedDesc")}
              </p>
            </div>

            <div className="space-y-4 p-5">
              <InlineHelpCard
                tone="warning"
                icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
                title={t("auth.savePassphraseDesc")}
                items={[
                  t("auth.passphraseShownOnce"),
                  t("auth.registerStartsSessionOnly"),
                ]}
              />

              <div className="border border-status-warning-border bg-status-warning-soft">
                <div className="flex items-start gap-2 p-3">
                  <span className="min-w-0 flex-1 select-all break-all font-mono text-body text-text-primary">
                    {savedPassphrase}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(savedPassphrase);
                      setCopyStatusMessage(t("auth.passphraseCopied"));
                    }}
                    className="shrink-0 rounded-sm p-1 text-status-warning transition-colors duration-[120ms] ease-out hover:bg-status-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    title={t("auth.copyPassphrase")}
                    aria-label={t("auth.copyPassphrase")}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <p className="sr-only" role="status" aria-live="polite">
                  {copyStatusMessage}
                </p>
              </div>

              <Button
                variant="accent"
                size="lg"
                className="w-full"
                onClick={handleDismissWarning}
              >
                {t("auth.savedPassphrase")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-page p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-4xl items-center gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <section className="order-2 hidden space-y-4 lg:order-1 lg:block">
          {brand}
          <h1 className="text-display-lg text-text-primary">
            {t("auth.privateVaultTitle")}
          </h1>
          <p className="max-w-md text-body text-text-secondary">
            {t("auth.privateVaultDesc")}
          </p>

          <InlineHelpCard
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            title={t("auth.privateVaultSummary")}
            items={[
              t("auth.privateVaultPointPassphrase"),
              t("auth.privateVaultPointBrowser"),
            ]}
          />

          {tab === "register" ? (
            <InlineHelpCard
              tone="warning"
              icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
              title={t("auth.registerSecurityTitle")}
              description={t("auth.registerSecuritySummary")}
              items={[
                t("auth.savePassphraseDesc"),
                t("auth.registerStartsSessionOnly"),
              ]}
            />
          ) : null}
        </section>

        <section className="order-1 w-full border border-border bg-bg-card lg:order-2">
          <div className="border-b border-border px-5 py-4">
            <div className="lg:hidden">{brand}</div>
            <h1 className="mt-1 text-display-sm text-text-primary lg:mt-0">
              {tab === "login"
                ? t("auth.signInDescription")
                : t("auth.createAccountDescription")}
            </h1>
          </div>

          <div
            className="flex gap-5 border-b border-border px-5"
            role="tablist"
            aria-label={t("auth.accountTabs")}
          >
            {(["login", "register"] as const).map((value) => {
              const isActive = tab === value;
              return (
                <button
                  key={value}
                  id={value === "login" ? loginTabId : registerTabId}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={authPanelId}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => handleTabChange(value)}
                  className={cn(
                    "-mb-px border-b-2 py-3 text-body font-semibold",
                    "transition-colors duration-[120ms] ease-out",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset",
                    isActive
                      ? "border-accent text-text-primary"
                      : "border-transparent text-text-muted hover:text-text-primary"
                  )}
                >
                  {value === "login" ? t("auth.signInTab") : t("auth.registerTab")}
                </button>
              );
            })}
          </div>

          <form
            id={authPanelId}
            role="tabpanel"
            aria-labelledby={tab === "login" ? loginTabId : registerTabId}
            onSubmit={tab === "login" ? handleLogin : handleRegister}
            className="space-y-4 p-5"
          >
            <FormField
              label={t("auth.usernameLabel")}
              htmlFor="auth-username"
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
                className="font-mono"
              />
            </FormField>

            <FormField
              label={t("auth.passphraseLabel")}
              htmlFor="auth-passphrase"
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
                className="font-mono"
              />
            </FormField>

            {tab === "register" ? (
              <FormField
                label={t("auth.confirmPassphraseLabel")}
                htmlFor="auth-confirm-passphrase"
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
                  className="font-mono"
                />
              </FormField>
            ) : null}

            {error ? (
              <p
                className="border border-status-negative-border bg-status-negative-soft px-3 py-2 text-body text-text-primary"
                role="alert"
                aria-live="assertive"
              >
                {error}
              </p>
            ) : null}

            <p className="sr-only" role="status" aria-live="polite">
              {loading ? t("common.processing") : ""}
            </p>

            {tab === "login" && (
              <label className="flex cursor-pointer items-start gap-3 border-t border-border-subtle pt-4">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-sm border-border accent-accent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-card"
                />
                <span>
                  <span className="block text-body font-semibold text-text-primary">
                    {t("auth.rememberMe", { days: TRUST_DEVICE_DAYS })}
                  </span>
                  <span className="mt-0.5 block text-caption text-text-muted">
                    {rememberMe
                      ? t("auth.trustedDeviceDesc", { days: TRUST_DEVICE_DAYS })
                      : t("auth.sessionOnlyDesc")}
                  </span>
                </span>
              </label>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
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

            <p className="flex items-center justify-center gap-2 pt-1 text-caption text-text-muted">
              <Lock className="h-3.5 w-3.5 text-status-positive" aria-hidden="true" />
              {t("auth.encryptedInBrowser")}
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

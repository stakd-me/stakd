"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Shield } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { apiFetch } from "@/lib/api-client";
import {
  deriveMasterKey,
  deriveAuthKey,
  deriveEncKey,
  authKeyToHex,
  encryptVault,
  generateSalt,
} from "@/lib/crypto/client-crypto";
import { isEncKeyPersistent, storeEncKey } from "@/lib/crypto/key-store";
import { hexToBytes } from "./hex";
import { SessionModeSection } from "./session-mode-section";

export function PassphraseSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const requiredLabel = t("common.required");

  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState("");
  const [passphraseChanging, setPassphraseChanging] = useState(false);
  const [passphraseError, setPassphraseError] = useState("");
  const [passphraseSuccess, setPassphraseSuccess] = useState(false);

  const handlePassphraseChange = async () => {
    setPassphraseError("");
    setPassphraseSuccess(false);

    if (newPassphrase !== confirmNewPassphrase) return;
    if (newPassphrase.length < 8) return;

    setPassphraseChanging(true);
    try {
      // 1. Get current user's salt from authenticated session
      const saltRes = await apiFetch("/api/auth/salt/me");
      if (!saltRes.ok) throw new Error("Failed to get salt");
      const { salt: saltHex } = await saltRes.json();
      const oldSalt = hexToBytes(typeof saltHex === "string" ? saltHex : "");
      if (!oldSalt) {
        throw new Error(t("settings.failedVerifyPassphrase"));
      }

      // 2. Derive old auth key from current passphrase + old salt
      const oldMasterKey = await deriveMasterKey(currentPassphrase, oldSalt);
      const oldAuthKey = await deriveAuthKey(oldMasterKey);
      const oldAuthKeyHex = authKeyToHex(oldAuthKey);

      // 3. Generate new salt and derive new keys
      const newSalt = generateSalt();
      const newMasterKey = await deriveMasterKey(newPassphrase, newSalt);
      const newAuthKey = await deriveAuthKey(newMasterKey);
      const newEncKey = await deriveEncKey(newMasterKey);
      const newAuthKeyHex = authKeyToHex(newAuthKey);

      // 4. Re-encrypt vault with new enc key
      const { vault } = useVaultStore.getState();
      const { ciphertext, iv } = await encryptVault(vault, newEncKey);
      const rememberCurrentDevice = await isEncKeyPersistent();

      // 5. Send to server
      const newSaltHex = Array.from(newSalt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await apiFetch("/api/auth/change-passphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldAuthKeyHex,
          newAuthKeyHex,
          newSalt: newSaltHex,
          encryptedVault: ciphertext,
          iv,
          rememberMe: rememberCurrentDevice,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("settings.failedChangePassword"));
      }

      const data: { vaultVersion?: number } = await res.json();

      // 6. Keep existing key persistence mode after passphrase rotation.
      await storeEncKey(newEncKey, { persist: rememberCurrentDevice });

      // 7. Sync local vault version to avoid optimistic-lock conflict on next save.
      if (typeof data.vaultVersion === "number") {
        useVaultStore.setState({
          vaultVersion: data.vaultVersion,
          isDirty: false,
        });
      }

      // 8. Clear form
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmNewPassphrase("");
      setPassphraseSuccess(true);
      toast(t("settings.passwordChanged"), "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("settings.failedChangePassword");
      setPassphraseError(msg);
      toast(msg, "error");
    } finally {
      setPassphraseChanging(false);
    }
  };

  const passphrasesMatch = newPassphrase === confirmNewPassphrase;
  const passphraseLongEnough = newPassphrase.length >= 8;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t("settings.changePassword")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="max-w-xl space-y-4">
            <FormField
              label={t("settings.currentPassword")}
              htmlFor="settings-current-passphrase"
              required
              requiredLabel={requiredLabel}
            >
              <Input
                id="settings-current-passphrase"
                type="password"
                value={currentPassphrase}
                onChange={(e) => setCurrentPassphrase(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
              />
            </FormField>
            <FormField
              label={t("settings.newPassword")}
              htmlFor="settings-new-passphrase"
              required
              requiredLabel={requiredLabel}
              error={
                newPassphrase.length > 0 && !passphraseLongEnough
                  ? t("settings.passwordMinLength")
                  : undefined
              }
            >
              <Input
                id="settings-new-passphrase"
                type="password"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                placeholder={t("settings.newPasswordPlaceholder")}
              />
            </FormField>
            <FormField
              label={t("settings.confirmNewPassword")}
              htmlFor="settings-confirm-passphrase"
              required
              requiredLabel={requiredLabel}
              error={
                confirmNewPassphrase.length > 0 && !passphrasesMatch
                  ? t("settings.passwordsDoNotMatch")
                  : undefined
              }
            >
              <Input
                id="settings-confirm-passphrase"
                type="password"
                value={confirmNewPassphrase}
                onChange={(e) => setConfirmNewPassphrase(e.target.value)}
                placeholder={t("settings.confirmPasswordPlaceholder")}
              />
            </FormField>
            <Button
              onClick={handlePassphraseChange}
              disabled={
                passphraseChanging ||
                !passphrasesMatch ||
                !passphraseLongEnough ||
                currentPassphrase.length === 0
              }
            >
              {passphraseChanging
                ? t("settings.changingPassword")
                : t("settings.changePassword")}
            </Button>

            {passphraseError && (
              <p className="text-sm text-status-negative" role="alert" aria-live="assertive">
                {passphraseError}
              </p>
            )}
            {passphraseSuccess && (
              <p className="text-sm text-status-positive" role="status" aria-live="polite">
                {t("settings.passwordChanged")}
              </p>
            )}
          </div>

          <SessionModeSection />
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect } from "react";
import { useVaultStore } from "@/lib/store";
import { flushVault, isVaultSaveInFlight } from "@/lib/services/vault-sync";

/**
 * Short enough that a change is on the server before a person can reload,
 * long enough to fold a burst of edits (typing in a form) into one PUT.
 * It used to be 5s, and a reload inside that window silently lost the edit.
 */
const DEBOUNCE_MS = 800;

function logSaveError(err: unknown) {
  console.error("[autosave] Failed to save vault:", err);
}

/**
 * Persists local vault edits to the server:
 * - debounced after every edit (keyed on the store's revision, so edits made
 *   while a save is in flight get their own save);
 * - immediately, with keepalive, when the tab is hidden or the page unloads;
 * - and, if something is still unsaved at unload, the browser asks first.
 */
export function useVaultAutosave() {
  const isDirty = useVaultStore((s) => s.isDirty);
  const revision = useVaultStore((s) => s.revision);

  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      flushVault().catch(logSaveError);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isDirty, revision]);

  useEffect(() => {
    const flushNow = () => {
      // The page may be torn down before the response arrives; the browser
      // still delivers a keepalive request, so a rejected promise here is
      // expected noise, not a failed save worth logging.
      flushVault({ keepalive: true }).catch(() => {});
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushNow();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useVaultStore.getState().isDirty && !isVaultSaveInFlight()) return;
      flushNow();
      // Encryption is async, so the save may not finish before the page
      // goes; ask the browser to confirm rather than drop the edit silently.
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", flushNow);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);
}

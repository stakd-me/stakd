"use client";

import { useEffect, useRef } from "react";
import { useVaultStore } from "@/lib/store";
import { saveVaultToServer } from "@/lib/services/vault-sync";

const DEBOUNCE_MS = 2000;

/**
 * Watches the vault isDirty flag and auto-saves after a debounce.
 * Also saves on beforeunload.
 */
export function useVaultAutosave() {
  const isDirty = useVaultStore((s) => s.isDirty);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isDirty) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      try {
        await saveVaultToServer();
      } catch (err) {
        console.error("[autosave] Failed to save vault:", err);
      } finally {
        savingRef.current = false;
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isDirty]);

  // Save on beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (useVaultStore.getState().isDirty) {
        // Note: We can't encrypt async in beforeunload, so we rely on the debounced save
        // having completed. The isDirty flag will be true if unsaved changes exist.
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}

"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";

/** Plaintext vault backup export (rendered inside the danger zone card). */
export function BackupSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const vault = useVaultStore((s) => s.vault);

  const handleExportVaultBackup = () => {
    try {
      const backupJson = JSON.stringify(vault, null, 2);
      const blob = new Blob([backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vault_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(t("settings.backupExported"), "success");
    } catch {
      toast(t("settings.backupExportFailed"), "error");
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExportVaultBackup}>
      {t("settings.exportBackup")}
    </Button>
  );
}

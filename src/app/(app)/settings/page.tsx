"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SectionNavigator, SectionPanel } from "@/components/ui/section-navigator";
import { Save } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useVaultStore } from "@/lib/store";
import { AboutSection } from "@/components/settings/about-section";
import { AlertRulesSection } from "@/components/settings/alert-rules-section";
import { DangerZoneSection } from "@/components/settings/danger-zone-section";
import { PassphraseSection } from "@/components/settings/passphrase-section";
import { RebalanceSettingsSection } from "@/components/settings/rebalance-settings-section";
import { useRebalanceSettingsForm } from "@/components/settings/rebalance-settings-form";
import { parseAlertRules } from "@/lib/alert-rules";

type SettingsSection =
  | "security"
  | "strategy"
  | "preferences"
  | "data";

export default function SettingsPage() {
  const sectionsBaseId = "settings-sections";
  const { t } = useTranslation();
  const vault = useVaultStore((s) => s.vault);

  const [activeSection, setActiveSection] = useState<SettingsSection>("security");

  const {
    form,
    setField,
    save: handleSaveRebalanceSettings,
    saving: rebalanceSaving,
  } = useRebalanceSettingsForm();

  const strategyFieldsCount = useMemo(() => {
    if (form.rebalanceStrategy === "dca-weighted") return 3;
    if (
      form.rebalanceStrategy === "calendar" ||
      form.rebalanceStrategy === "percent-of-portfolio" ||
      form.rebalanceStrategy === "risk-parity"
    ) {
      return 2;
    }
    return 1;
  }, [form.rebalanceStrategy]);

  const tradingFieldsCount = form.buyOnlyMode ? 6 : 5;
  const alertRulesCount = useMemo(
    () => parseAlertRules(vault.settings.alertRules).length,
    [vault.settings.alertRules]
  );
  const settingsSectionOptions = useMemo(
    () => [
      {
        value: "security" as const,
        label: t("settings.sectionSecurity"),
        description: t("settings.sessionSecurity"),
        count: 2,
      },
      {
        value: "strategy" as const,
        label: t("settings.sectionStrategy"),
        description: t("settings.rebalanceStrategy"),
        count: strategyFieldsCount + 3 + tradingFieldsCount,
      },
      {
        value: "preferences" as const,
        label: t("settings.sectionPreferences"),
        description: t("settings.alertRulesDescription"),
        count: alertRulesCount,
      },
      {
        value: "data" as const,
        label: t("settings.sectionData"),
        description: t("settings.exportBackup"),
        count: 2,
      },
    ],
    [strategyFieldsCount, t, tradingFieldsCount, alertRulesCount]
  );

  const holdingSymbols = useMemo(() => {
    const symbols = new Set<string>();
    for (const tx of vault.transactions) {
      symbols.add(tx.tokenSymbol.toUpperCase());
    }
    for (const me of vault.manualEntries) {
      symbols.add(me.tokenSymbol.toUpperCase());
    }
    return Array.from(symbols);
  }, [vault.transactions, vault.manualEntries]);

  const showSecuritySection = activeSection === "security";
  const showStrategySection = activeSection === "strategy";
  const showAlertsSection = activeSection === "preferences";
  const showDataSection = activeSection === "data";
  const showRebalanceSaveAction = activeSection === "strategy";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("settings.subtitle")}
        title={t("settings.title")}
        actions={
          showRebalanceSaveAction ? (
            <Button
              variant="accent"
              onClick={handleSaveRebalanceSettings}
              disabled={rebalanceSaving}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {rebalanceSaving
                ? t("common.saving")
                : t("settings.saveRebalanceSettings")}
            </Button>
          ) : undefined
        }
      />

      <SectionNavigator
        baseId={sectionsBaseId}
        label={t("settings.focusView")}
        value={activeSection}
        onChange={setActiveSection}
        options={settingsSectionOptions}
      />

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>
        {showSecuritySection && <PassphraseSection />}

        {showStrategySection && (
          <RebalanceSettingsSection form={form} setField={setField} />
        )}

        {showAlertsSection && <AlertRulesSection holdingSymbols={holdingSymbols} />}

        {showDataSection && <DangerZoneSection />}

        {showDataSection && <AboutSection />}
      </SectionPanel>
    </div>
  );
}

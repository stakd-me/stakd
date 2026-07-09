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
  | "risk"
  | "trading"
  | "alerts"
  | "danger"
  | "about"
  | "all";

export default function SettingsPage() {
  const sectionsBaseId = "settings-sections";
  const { t } = useTranslation();
  const vault = useVaultStore((s) => s.vault);

  const [activeSection, setActiveSection] = useState<SettingsSection>("all");

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
        count: strategyFieldsCount,
      },
      {
        value: "risk" as const,
        label: t("settings.sectionRisk"),
        description: t("settings.concentrationThreshold"),
        count: 3,
      },
      {
        value: "trading" as const,
        label: t("settings.sectionTrading"),
        description: t("settings.minTradeSize"),
        count: tradingFieldsCount,
      },
      {
        value: "alerts" as const,
        label: t("settings.sectionAlerts"),
        description: t("settings.alertRulesDescription"),
        count: alertRulesCount,
      },
      {
        value: "danger" as const,
        label: t("settings.sectionDanger"),
        description: t("settings.exportBackup"),
        count: 1,
      },
      {
        value: "about" as const,
        label: t("settings.sectionAbout"),
        description: t("settings.about"),
        count: 1,
      },
      {
        value: "all" as const,
        label: t("settings.sectionAll"),
        description: t("settings.subtitle"),
        count:
          2 +
          strategyFieldsCount +
          3 +
          tradingFieldsCount +
          alertRulesCount +
          1 +
          1,
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

  const showSecuritySection =
    activeSection === "all" || activeSection === "security";
  const showStrategySection =
    activeSection === "all" || activeSection === "strategy";
  const showRiskSection = activeSection === "all" || activeSection === "risk";
  const showTradingSection =
    activeSection === "all" || activeSection === "trading";
  const showAlertsSection =
    activeSection === "all" || activeSection === "alerts";
  const showDangerSection =
    activeSection === "all" || activeSection === "danger";
  const showAboutSection =
    activeSection === "all" || activeSection === "about";
  const showRebalanceSaveAction =
    activeSection === "all" ||
    activeSection === "strategy" ||
    activeSection === "risk" ||
    activeSection === "trading";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.subtitle")}
        actions={
          showRebalanceSaveAction ? (
            <Button
              onClick={handleSaveRebalanceSettings}
              disabled={rebalanceSaving}
              size="sm"
            >
              <Save className="mr-2 h-4 w-4" />
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
        description={t("settings.subtitle")}
        value={activeSection}
        onChange={setActiveSection}
        options={settingsSectionOptions}
        columnsClassName="grid-cols-2 xl:grid-cols-4"
      />

      <SectionPanel baseId={sectionsBaseId} value={activeSection}>
        {showSecuritySection && <PassphraseSection />}

        <RebalanceSettingsSection
          form={form}
          setField={setField}
          showStrategy={showStrategySection}
          showRisk={showRiskSection}
          showTrading={showTradingSection}
        />

        {showAlertsSection && <AlertRulesSection holdingSymbols={holdingSymbols} />}

        {showDangerSection && <DangerZoneSection />}

        {showAboutSection && <AboutSection />}
      </SectionPanel>
    </div>
  );
}

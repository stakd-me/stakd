"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useTranslation } from "@/hooks/use-translation";

export function AboutSection() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.about")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-text-subtle">
          <p>
            <strong className="text-text-primary">
              {t("settings.aboutDesc1")}
            </strong>
          </p>
          <p>{t("settings.aboutDesc2")}</p>
          <p>{t("settings.aboutDesc3")}</p>
          <p className="pt-2 text-xs text-text-dim">
            {t("settings.version")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

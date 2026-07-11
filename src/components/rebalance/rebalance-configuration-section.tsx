"use client";

import { useState, type ComponentProps } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetCategoriesSection } from "@/components/rebalance/asset-categories-section";
import { TokenGroupsSection } from "@/components/rebalance/token-groups-section";
import { useTranslation } from "@/hooks/use-translation";
import { cn } from "@/lib/utils";

interface RebalanceConfigurationSectionProps {
  tokenGroupsProps: ComponentProps<typeof TokenGroupsSection>;
  assetCategoriesProps: ComponentProps<typeof AssetCategoriesSection>;
}

export function RebalanceConfigurationSection({
  tokenGroupsProps,
  assetCategoriesProps,
}: RebalanceConfigurationSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <SlidersHorizontal className="mr-2 h-4 w-4" />
        {t("rebalance.advancedSetup")}
        <ChevronDown
          className={cn("ml-2 h-4 w-4 transition-transform", expanded && "rotate-180")}
        />
      </Button>
      {expanded ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <TokenGroupsSection {...tokenGroupsProps} />
          <AssetCategoriesSection {...assetCategoriesProps} />
        </div>
      ) : null}
    </div>
  );
}

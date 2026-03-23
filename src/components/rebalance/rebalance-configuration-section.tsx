"use client";

import type { ComponentProps } from "react";
import { AssetCategoriesSection } from "@/components/rebalance/asset-categories-section";
import { TokenGroupsSection } from "@/components/rebalance/token-groups-section";

interface RebalanceConfigurationSectionProps {
  tokenGroupsProps: ComponentProps<typeof TokenGroupsSection>;
  assetCategoriesProps: ComponentProps<typeof AssetCategoriesSection>;
}

export function RebalanceConfigurationSection({
  tokenGroupsProps,
  assetCategoriesProps,
}: RebalanceConfigurationSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <TokenGroupsSection {...tokenGroupsProps} />
      <AssetCategoriesSection {...assetCategoriesProps} />
    </div>
  );
}

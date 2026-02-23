"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Layers } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import type { TokenGroup } from "./types";

interface TokenGroupsSectionProps {
  groups: TokenGroup[];
  onCreateGroup: (data: { name: string; symbols: string[] }) => void;
  createPending: boolean;
  onConfirmDelete: (id: string | number, label: string) => void;
  deletePending: boolean;
}

export function TokenGroupsSection({
  groups,
  onCreateGroup,
  createPending,
  onConfirmDelete,
  deletePending,
}: TokenGroupsSectionProps) {
  const { t } = useTranslation();
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSymbols, setGroupSymbols] = useState("");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t("rebalance.tokenGroups")}
          </CardTitle>
          {!showGroupForm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGroupForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("rebalance.addGroup")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showGroupForm && (
          <div className="mb-4 space-y-3 rounded-lg border border-border bg-bg-card p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("rebalance.groupName")}
                </label>
                <Input
                  placeholder={t("rebalance.groupNamePlaceholder")}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-subtle">
                  {t("rebalance.symbolsLabel")}
                </label>
                <Input
                  placeholder={t("rebalance.symbolsPlaceholder")}
                  value={groupSymbols}
                  onChange={(e) => setGroupSymbols(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowGroupForm(false);
                  setGroupName("");
                  setGroupSymbols("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const symbols = groupSymbols
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (groupName && symbols.length > 0) {
                    onCreateGroup({ name: groupName, symbols });
                    setShowGroupForm(false);
                    setGroupName("");
                    setGroupSymbols("");
                  }
                }}
                disabled={createPending}
              >
                {createPending ? t("common.creating") : t("rebalance.createGroup")}
              </Button>
            </div>
          </div>
        )}

        {groups.length === 0 && !showGroupForm ? (
          <p className="text-sm text-text-subtle">
            {t("rebalance.noGroups")}
          </p>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div
                key={group.id}
                className="rounded-md bg-bg-card px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-text-primary">{group.name}</span>
                    {group.totalValueUsd != null && (
                      <span className="ml-3 text-sm text-text-subtle">
                        {formatUsd(group.totalValueUsd)}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-text-subtle hover:text-status-negative"
                    onClick={() =>
                      onConfirmDelete(group.id, `group "${group.name}"`)
                    }
                    disabled={deletePending}
                    aria-label={`Delete group ${group.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {group.members && group.members.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.members.map((m) => (
                      <span
                        key={m.symbol}
                        className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-tertiary"
                      >
                        {m.symbol}
                        <span className="text-text-subtle">
                          {m.percentInGroup.toFixed(1)}%
                        </span>
                        <span className="text-text-dim">
                          {formatUsd(m.valueUsd)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

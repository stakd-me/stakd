"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Layers, Pencil, RefreshCw } from "lucide-react";
import { formatUsd } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";
import type { TokenGroup } from "./types";

interface TokenGroupsSectionProps {
  groups: TokenGroup[];
  onCreateGroup: (data: { name: string; symbols: string[] }) => void;
  onUpdateGroup: (id: string | number, data: { name: string; symbols: string[] }) => void;
  onTrackGroup: (id: string | number) => void;
  trackPendingGroupId: string | number | null;
  createPending: boolean;
  updatePending: boolean;
  onConfirmDelete: (id: string | number, label: string) => void;
  deletePending: boolean;
}

export function TokenGroupsSection({
  groups,
  onCreateGroup,
  onUpdateGroup,
  onTrackGroup,
  trackPendingGroupId,
  createPending,
  updatePending,
  onConfirmDelete,
  deletePending,
}: TokenGroupsSectionProps) {
  const { t } = useTranslation();
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | number | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupSymbols, setGroupSymbols] = useState("");
  const isEditing = editingGroupId !== null;
  const isSubmitting = createPending || updatePending;
  const trackingPending = trackPendingGroupId !== null;

  const getGroupTrackingLabel = (status: NonNullable<TokenGroup["tracking"]>["status"]) => {
    if (status === "tracked") return t("rebalance.trackingTracked");
    if (status === "partial") return t("rebalance.trackingPartial");
    return t("rebalance.trackingUntracked");
  };

  const getGroupTrackingClass = (status: NonNullable<TokenGroup["tracking"]>["status"]) => {
    if (status === "tracked") {
      return "border border-status-positive-border bg-status-positive-soft text-status-positive";
    }
    if (status === "partial") {
      return "border border-status-warning-border bg-status-warning-soft text-status-warning";
    }
    return "border border-border bg-bg-muted text-text-subtle";
  };

  const getMemberTrackingLabel = (status: "tracked" | "requested" | "untracked") => {
    if (status === "tracked") return t("rebalance.trackingTracked");
    if (status === "requested") return t("rebalance.trackingRequested");
    return t("rebalance.trackingUntracked");
  };

  const getMemberTrackingClass = (status: "tracked" | "requested" | "untracked") => {
    if (status === "tracked") {
      return "bg-status-positive-soft text-status-positive";
    }
    if (status === "requested") {
      return "bg-status-info-soft text-status-info";
    }
    return "bg-bg-muted text-text-subtle";
  };

  const resetForm = () => {
    setShowGroupForm(false);
    setEditingGroupId(null);
    setGroupName("");
    setGroupSymbols("");
  };

  const openCreateForm = () => {
    setShowGroupForm(true);
    setEditingGroupId(null);
    setGroupName("");
    setGroupSymbols("");
  };

  const openEditForm = (group: TokenGroup) => {
    setShowGroupForm(true);
    setEditingGroupId(group.id);
    setGroupName(group.name);
    setGroupSymbols(group.symbols.join(", "));
  };

  const handleSubmit = () => {
    const name = groupName.trim();
    const symbols = Array.from(
      new Set(
        groupSymbols
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );

    if (!name || symbols.length === 0) return;

    if (isEditing && editingGroupId !== null) {
      onUpdateGroup(editingGroupId, { name, symbols });
    } else {
      onCreateGroup({ name, symbols });
    }

    resetForm();
  };

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
              onClick={openCreateForm}
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
                onClick={resetForm}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? t("common.saving")
                  : isEditing
                    ? t("rebalance.updateGroup")
                    : t("rebalance.createGroup")}
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
                    {group.tracking && (
                      <>
                        <span
                          className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getGroupTrackingClass(group.tracking.status)}`}
                        >
                          {getGroupTrackingLabel(group.tracking.status)}
                        </span>
                        <span className="ml-2 text-xs text-text-dim">
                          {t("rebalance.groupTrackedCount", {
                            tracked: group.tracking.trackedCount,
                            total: group.tracking.totalCount,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-text-subtle hover:text-status-info"
                      onClick={() => onTrackGroup(group.id)}
                      disabled={trackingPending || isSubmitting}
                      aria-label={`Track group ${group.name}`}
                      title={t("rebalance.trackGroup")}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${String(trackPendingGroupId) === String(group.id) ? "animate-spin" : ""}`}
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-text-subtle hover:text-status-info"
                      onClick={() => openEditForm(group)}
                      disabled={isSubmitting}
                      aria-label={`Edit group ${group.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
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
                </div>
                {group.members && group.members.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.members.map((m) => (
                      <span
                        key={`${m.symbol}-${m.coingeckoId ?? "none"}`}
                        className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2.5 py-1 text-xs font-medium text-text-tertiary"
                      >
                        {m.symbol}
                        <span className="text-text-subtle">
                          {m.percentInGroup.toFixed(1)}%
                        </span>
                        <span className="text-text-dim">
                          {formatUsd(m.valueUsd)}
                        </span>
                        {m.trackingStatus && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getMemberTrackingClass(m.trackingStatus)}`}
                          >
                            {getMemberTrackingLabel(m.trackingStatus)}
                          </span>
                        )}
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

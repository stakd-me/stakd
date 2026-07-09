"use client";

import { ManualEntriesSection } from "@/components/portfolio/manual-entries-section";
import type { ManualEntriesController } from "@/hooks/use-manual-entries";

interface ManualEntriesPanelProps {
  manual: ManualEntriesController;
  search: string;
  isAllSectionsView: boolean;
  manualSectionExpanded: boolean;
  onToggleExpanded: () => void;
}

/**
 * Binds the useManualEntries controller to the presentational
 * ManualEntriesSection so the page component doesn't have to wire ~30 props.
 */
export function ManualEntriesPanel({
  manual,
  search,
  isAllSectionsView,
  manualSectionExpanded,
  onToggleExpanded,
}: ManualEntriesPanelProps) {
  return (
    <ManualEntriesSection
      isAllSectionsView={isAllSectionsView}
      manualSectionExpanded={manualSectionExpanded}
      manualEntriesCount={manual.manualEntries.length}
      manualEntries={manual.manualEntries}
      filteredManualEntries={manual.filteredManualEntries}
      search={search}
      meSymbol={manual.meSymbol}
      meName={manual.meName}
      meQuantity={manual.meQuantity}
      meInitialPrice={manual.meInitialPrice}
      meNote={manual.meNote}
      showManualSymbolSuggestions={manual.showManualSymbolSuggestions}
      manualSymbolSuggestions={manual.manualSymbolSuggestions}
      manualEntryQuantityValid={manual.manualEntryQuantityValid}
      manualEntryInitialPriceValid={manual.manualEntryInitialPriceValid}
      addingManualEntry={manual.addingManualEntry}
      editingEntryId={manual.editingEntryId}
      editEntryQty={manual.editEntryQty}
      editEntryNote={manual.editEntryNote}
      updatingManualEntry={manual.updatingManualEntry}
      deletingManualEntry={manual.deletingManualEntry}
      onToggleExpanded={onToggleExpanded}
      onSetMeSymbol={manual.setMeSymbol}
      onSetShowManualSymbolSuggestions={manual.setShowManualSymbolSuggestions}
      onSelectManualSymbolSuggestion={manual.selectManualSymbolSuggestion}
      onSetMeName={manual.setMeName}
      onSetMeQuantity={manual.setMeQuantity}
      onSetMeInitialPrice={manual.setMeInitialPrice}
      onSetMeNote={manual.setMeNote}
      onAddEntry={manual.submitNewEntry}
      onStartEditEntry={manual.startEditEntry}
      onSetEditEntryQty={manual.setEditEntryQty}
      onSetEditEntryNote={manual.setEditEntryNote}
      onSaveEditEntry={manual.saveEditEntry}
      onCancelEditEntry={manual.cancelEditEntry}
      onDeleteEntry={manual.setDeleteManualTarget}
    />
  );
}

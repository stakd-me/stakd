"use client";

import { useEffect, type RefObject } from "react";
import type { BreakdownItem } from "@/components/portfolio/types";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

interface UsePortfolioShortcutsArgs {
  searchInputRef: RefObject<HTMLInputElement | null>;

  // Import modal ("Ctrl/Cmd + I", Escape, "Ctrl/Cmd + Enter")
  showImportModal: boolean;
  importing: boolean;
  /** importPreview rows present and no validation errors */
  importSubmittable: boolean;
  openImportModal: (resetState?: boolean) => void;
  closeImportModal: () => void;
  submitImport: () => Promise<void>;

  // Escape targets, in priority order after the import modal
  hasDeleteTarget: boolean;
  cancelDeleteTransaction: () => void;
  hasManualDeleteTarget: boolean;
  cancelManualDelete: () => void;
  isEditingTransaction: boolean;
  dismissEditForm: () => void;
  hasExpandedHolding: boolean;
  closeInlineForm: () => void;
  isEditingManualEntry: boolean;
  cancelManualEdit: () => void;

  // "Ctrl/Cmd + Enter" submits
  submittingEdit: boolean;
  handleEditSubmit: () => Promise<void>;
  activeInlineItem: BreakdownItem | null;
  submittingInline: boolean;
  handleInlineSubmit: (item: BreakdownItem) => Promise<void>;
}

/**
 * Global keyboard shortcuts for the portfolio page:
 * "/" focuses search, Ctrl/Cmd+I opens the import modal, Escape closes the
 * topmost open dialog/form, and Ctrl/Cmd+Enter submits the active form.
 * Extracted verbatim from the page's keydown effect.
 */
export function usePortfolioShortcuts({
  searchInputRef,
  showImportModal,
  importing,
  importSubmittable,
  openImportModal,
  closeImportModal,
  submitImport,
  hasDeleteTarget,
  cancelDeleteTransaction,
  hasManualDeleteTarget,
  cancelManualDelete,
  isEditingTransaction,
  dismissEditForm,
  hasExpandedHolding,
  closeInlineForm,
  isEditingManualEntry,
  cancelManualEdit,
  submittingEdit,
  handleEditSubmit,
  activeInlineItem,
  submittingInline,
  handleInlineSubmit,
}: UsePortfolioShortcutsArgs) {
  useEffect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      const isMetaOrCtrl = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);

      if (!typing && key === "/" && !isMetaOrCtrl && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isMetaOrCtrl && key === "i" && !event.shiftKey && !event.altKey) {
        if (typing || showImportModal) return;
        event.preventDefault();
        openImportModal(true);
        return;
      }

      if (event.key === "Escape") {
        if (showImportModal) {
          event.preventDefault();
          closeImportModal();
          return;
        }
        if (hasDeleteTarget) {
          event.preventDefault();
          cancelDeleteTransaction();
          return;
        }
        if (hasManualDeleteTarget) {
          event.preventDefault();
          cancelManualDelete();
          return;
        }
        if (isEditingTransaction) {
          event.preventDefault();
          dismissEditForm();
          return;
        }
        if (hasExpandedHolding) {
          event.preventDefault();
          closeInlineForm();
          return;
        }
        if (isEditingManualEntry) {
          event.preventDefault();
          cancelManualEdit();
        }
        return;
      }

      if (!isMetaOrCtrl || key !== "enter") return;

      if (showImportModal && !importing && importSubmittable) {
        event.preventDefault();
        void submitImport();
        return;
      }

      if (isEditingTransaction && !submittingEdit) {
        event.preventDefault();
        void handleEditSubmit();
        return;
      }

      if (activeInlineItem && !submittingInline) {
        event.preventDefault();
        void handleInlineSubmit(activeInlineItem);
      }
    };

    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, [
    activeInlineItem,
    cancelDeleteTransaction,
    cancelManualDelete,
    cancelManualEdit,
    closeImportModal,
    closeInlineForm,
    dismissEditForm,
    handleEditSubmit,
    handleInlineSubmit,
    hasDeleteTarget,
    hasExpandedHolding,
    hasManualDeleteTarget,
    importSubmittable,
    importing,
    isEditingManualEntry,
    isEditingTransaction,
    openImportModal,
    searchInputRef,
    showImportModal,
    submitImport,
    submittingEdit,
    submittingInline,
  ]);
}

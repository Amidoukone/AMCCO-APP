import { useCallback, useRef } from "react";
import { useBeforeUnload, useBlocker } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function hasUnsavedForms(): boolean {
  return Boolean(document.querySelector('[data-unsaved-sector-form="true"]'));
}

export function useUnsavedChangesGuard() {
  const bypass = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypass.current || !hasUnsavedForms()) return false;
    if (currentLocation.pathname !== nextLocation.pathname) return true;
    const currentSearch = new URLSearchParams(currentLocation.search);
    const nextSearch = new URLSearchParams(nextLocation.search);
    // Selecting a transaction (including after saving) keeps this page's form.
    // Sector and workspace changes still discard it and must remain guarded.
    if (currentLocation.pathname === "/finance/transactions") {
      currentSearch.delete("transactionId");
      nextSearch.delete("transactionId");
    }
    currentSearch.sort();
    nextSearch.sort();
    return currentSearch.toString() !== nextSearch.toString();
  });
  useBeforeUnload(useCallback((event) => {
    if (hasUnsavedForms()) {
      event.preventDefault();
      event.returnValue = "";
    }
  }, []));

  // Sector changes are already confirmed before the selected context is updated.
  function navigateAfterConfirmation(action: () => void): void {
    bypass.current = true;
    try { action(); } finally { bypass.current = false; }
  }

  const dialog = (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Quitter la saisie en cours ?"
      description="Des modifications n'ont pas encore été enregistrées."
      objectName="Formulaire en cours"
      impactText="Quitter cette page abandonnera uniquement les modifications non enregistrées."
      cancelLabel="Continuer la saisie"
      confirmLabel="Quitter la page"
      onCancel={() => { if (blocker.state === "blocked") blocker.reset(); }}
      onConfirm={() => { if (blocker.state === "blocked") blocker.proceed(); }}
    />
  );
  return { dialog, navigateAfterConfirmation };
}

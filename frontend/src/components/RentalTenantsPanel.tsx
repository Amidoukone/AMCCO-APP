import type { Dispatch, SetStateAction, FormEvent } from "react";
import { ButtonSpinner } from "./ButtonSpinner";
import { SectorDirectoryPanel } from "./SectorDirectoryPanel";
import { formatAmountForDisplay, formatAmountForInput, formatEditableAmountForInput } from "../lib/amountFormatting";
import type { RentalTenant } from "../types/tenants";

type Form = { name: string; unitLabel: string; monthlyRent: string; phone: string; tenancyStart: string };
type Props = {
  tenants: RentalTenant[];
  tenantForm: Form;
  setTenantForm: Dispatch<SetStateAction<Form>>;
  editingTenantId: string | null;
  busyTenantId: string | null;
  isSavingTenant: boolean;
  isTenantManagementExpanded: boolean;
  setIsTenantManagementExpanded: (value: boolean) => void;
  tenantChanges: { isDirty: boolean; onChangeCapture: () => void };
  isLoading: boolean;
  hasLoaded: boolean;
  onReload: () => void;
  handleSaveTenant: (event: FormEvent<HTMLFormElement>) => void;
  handleCancelEditTenant: () => void;
  handleStartEditTenant: (record: RentalTenant) => void;
  handleDeleteTenant: (record: RentalTenant) => void;
};

function formatTenancyStartLabel(tenancyStart: string): string {
  const parsed = new Date(`${tenancyStart}-01T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return tenancyStart;
  }
  return parsed.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function RentalTenantsPanel({
  tenants, tenantForm, setTenantForm, editingTenantId, busyTenantId, isSavingTenant,
  isTenantManagementExpanded, setIsTenantManagementExpanded, tenantChanges,
  isLoading, hasLoaded, onReload, handleSaveTenant, handleCancelEditTenant, handleStartEditTenant, handleDeleteTenant
}: Props): JSX.Element {
  return (
    <SectorDirectoryPanel
      title="Locataires" searchLabel="Rechercher un locataire"
      emptyMessage="Aucun locataire enregistré pour le moment." noResultsMessage="Aucun locataire ne correspond à votre recherche."
      records={tenants} getSearchValues={(record) => [record.name, record.unitLabel, record.phone]}
      renderDetails={(record) => (<><p className="hint">{record.unitLabel} | Loyer mensuel: {formatAmountForDisplay(record.monthlyRent)}</p><p className="hint">Locataire depuis: {formatTenancyStartLabel(record.tenancyStart)}</p>{record.phone ? <p className="hint">Tél: {record.phone}</p> : null}</>)}
      busyId={busyTenantId} isSaving={isSavingTenant} isLoading={isLoading} hasLoaded={hasLoaded}
      onReload={onReload} onEdit={handleStartEditTenant} onDelete={handleDeleteTenant}
      sectionId="tenant-management" formTitle={editingTenantId ? "Modifier un locataire" : "Ajouter un locataire"}
      formDescription="Locataires du secteur actif."
      isExpanded={isTenantManagementExpanded} onExpandedChange={setIsTenantManagementExpanded}
    >
      <form className="finance-account-form" onSubmit={handleSaveTenant} onChangeCapture={tenantChanges.onChangeCapture} data-unsaved-sector-form={tenantChanges.isDirty ? "true" : undefined}>
        <label className="operations-inline-group">
          <span>Nom du locataire</span>
          <input
            type="text"
            placeholder="Ex: Issa Guido"
            value={tenantForm.name}
            onChange={(event) =>
              setTenantForm((prev) => ({
                ...prev,
                name: event.target.value
              }))
            }
            required
          />
        </label>
        <label className="operations-inline-group">
          <span>Logement occupé</span>
          <input
            type="text"
            placeholder="Ex: Appartement 2 chambres salon, Boutique n°3"
            value={tenantForm.unitLabel}
            onChange={(event) =>
              setTenantForm((prev) => ({
                ...prev,
                unitLabel: event.target.value
              }))
            }
            required
          />
        </label>
        <label className="operations-inline-group">
          <span>Loyer mensuel</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ex: 30000"
            value={tenantForm.monthlyRent}
            onChange={(event) =>
              setTenantForm((prev) => ({
                ...prev,
                monthlyRent: formatEditableAmountForInput(event.target.value)
              }))
            }
            onBlur={() =>
              setTenantForm((prev) => ({
                ...prev,
                monthlyRent: formatAmountForInput(prev.monthlyRent)
              }))
            }
            required
          />
        </label>
        <label className="operations-inline-group">
          <span>Téléphone</span>
          <input
            type="text"
            placeholder="Optionnel"
            value={tenantForm.phone}
            onChange={(event) =>
              setTenantForm((prev) => ({
                ...prev,
                phone: event.target.value
              }))
            }
          />
        </label>
        <label className="operations-inline-group">
          <span>Locataire depuis</span>
          <input
            type="month"
            value={tenantForm.tenancyStart}
            onChange={(event) =>
              setTenantForm((prev) => ({
                ...prev,
                tenancyStart: event.target.value
              }))
            }
            required
          />
          <small className="hint">
            Mois d'entrée du locataire, utilisé pour calculer les retards de paiement. Pour un
            locataire déjà en place, indiquez son mois d'entrée réel.
          </small>
        </label>
        <div className="mobile-sticky-form-actions">
          <button type="submit" disabled={isSavingTenant}>
            {isSavingTenant ? (
              <>
                <ButtonSpinner />
                Enregistrement...
              </>
            ) : editingTenantId ? (
              "Enregistrer les modifications"
            ) : (
              "Ajouter le locataire"
            )}
          </button>
          {editingTenantId ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCancelEditTenant}
              disabled={isSavingTenant}
            >
              Annuler la modification
            </button>
          ) : null}
        </div>
      </form>
    </SectorDirectoryPanel>
  );
}

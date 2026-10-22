import type { Dispatch, SetStateAction, FormEvent } from "react";
import { ButtonSpinner } from "./ButtonSpinner";
import { SectorDirectoryPanel } from "./SectorDirectoryPanel";
import type { GeneralStoreShop } from "../types/shops";

type Form = { name: string; location: string; phone: string };
type Props = {
  shops: GeneralStoreShop[];
  shopForm: Form;
  setShopForm: Dispatch<SetStateAction<Form>>;
  editingShopId: string | null;
  busyShopId: string | null;
  isSavingShop: boolean;
  isShopManagementExpanded: boolean;
  setIsShopManagementExpanded: (value: boolean) => void;
  shopChanges: { isDirty: boolean; onChangeCapture: () => void };
  isLoading: boolean;
  hasLoaded: boolean;
  onReload: () => void;
  handleSaveShop: (event: FormEvent<HTMLFormElement>) => void;
  handleCancelEditShop: () => void;
  handleStartEditShop: (record: GeneralStoreShop) => void;
  handleDeleteShop: (record: GeneralStoreShop) => void;
};

export function GeneralStoreShopsPanel({
  shops, shopForm, setShopForm, editingShopId, busyShopId, isSavingShop,
  isShopManagementExpanded, setIsShopManagementExpanded, shopChanges,
  isLoading, hasLoaded, onReload, handleSaveShop, handleCancelEditShop, handleStartEditShop, handleDeleteShop
}: Props): JSX.Element {
  return (
    <SectorDirectoryPanel
      title="Boutiques" searchLabel="Rechercher une boutique"
      emptyMessage="Aucune boutique enregistrée pour le moment." noResultsMessage="Aucune boutique ne correspond à votre recherche."
      records={shops} getSearchValues={(record) => [record.name, record.location, record.phone]}
      renderDetails={(record) => (<>{record.location ? <p className="hint">{record.location}</p> : null}{record.phone ? <p className="hint">Tél: {record.phone}</p> : null}</>)}
      busyId={busyShopId} isSaving={isSavingShop} isLoading={isLoading} hasLoaded={hasLoaded}
      onReload={onReload} onEdit={handleStartEditShop} onDelete={handleDeleteShop}
      sectionId="shop-management" formTitle={editingShopId ? "Modifier une boutique" : "Ajouter une boutique"}
      formDescription="Boutiques du secteur actif."
      isExpanded={isShopManagementExpanded} onExpandedChange={setIsShopManagementExpanded}
    >
      <form className="finance-account-form" onSubmit={handleSaveShop} onChangeCapture={shopChanges.onChangeCapture} data-unsaved-sector-form={shopChanges.isDirty ? "true" : undefined}>
        <label className="operations-inline-group">
          <span>Nom de la boutique</span>
          <input
            type="text"
            placeholder="Ex: Boutique Nord"
            value={shopForm.name}
            onChange={(event) =>
              setShopForm((prev) => ({
                ...prev,
                name: event.target.value
              }))
            }
            required
          />
        </label>
        <label className="operations-inline-group">
          <span>Emplacement</span>
          <input
            type="text"
            placeholder="Optionnel, ex: Marché central"
            value={shopForm.location}
            onChange={(event) =>
              setShopForm((prev) => ({
                ...prev,
                location: event.target.value
              }))
            }
          />
        </label>
        <label className="operations-inline-group">
          <span>Téléphone</span>
          <input
            type="text"
            placeholder="Optionnel"
            value={shopForm.phone}
            onChange={(event) =>
              setShopForm((prev) => ({
                ...prev,
                phone: event.target.value
              }))
            }
          />
        </label>
        <div className="mobile-sticky-form-actions">
          <button type="submit" disabled={isSavingShop}>
            {isSavingShop ? (
              <>
                <ButtonSpinner />
                Enregistrement...
              </>
            ) : editingShopId ? (
              "Enregistrer les modifications"
            ) : (
              "Ajouter la boutique"
            )}
          </button>
          {editingShopId ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCancelEditShop}
              disabled={isSavingShop}
            >
              Annuler la modification
            </button>
          ) : null}
        </div>
      </form>
    </SectorDirectoryPanel>
  );
}

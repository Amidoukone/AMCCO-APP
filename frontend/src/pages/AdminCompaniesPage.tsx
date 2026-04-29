import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  createAdminCompanyRequest,
  deleteAdminCompanyRequest,
  listAdminCompaniesRequest,
  updateAdminCompanyRequest
} from "../lib/api";
import type { AdminCompanyItem, CreateCompanyInput, UpdateCompanyInput } from "../types/companies";
import { ROLE_LABELS } from "../config/permissions";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";

function createInitialFormState(): CreateCompanyInput {
  return {
    name: "",
    code: "",
    registrationNumber: "",
    email: "",
    phone: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateRegion: "",
    postalCode: "",
    country: "Mali",
    businessSector: "",
    contactFullName: "",
    contactJobTitle: ""
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

function formatCompanyAddress(item: AdminCompanyItem): string {
  const parts = [
    item.company.addressLine1,
    item.company.addressLine2,
    item.company.city,
    item.company.stateRegion,
    item.company.postalCode,
    item.company.country
  ].filter((value): value is string => Boolean(value && value.trim()));

  return parts.length > 0 ? parts.join(", ") : "Adresse non renseignée";
}

function createFormStateFromCompany(item: AdminCompanyItem): CreateCompanyInput {
  return {
    name: item.company.name,
    code: item.company.code,
    registrationNumber: item.company.registrationNumber ?? "",
    email: item.company.email ?? "",
    phone: item.company.phone ?? "",
    website: item.company.website ?? "",
    addressLine1: item.company.addressLine1 ?? "",
    addressLine2: item.company.addressLine2 ?? "",
    city: item.company.city ?? "",
    stateRegion: item.company.stateRegion ?? "",
    postalCode: item.company.postalCode ?? "",
    country: item.company.country ?? "Mali",
    businessSector: item.company.businessSector ?? "",
    contactFullName: item.company.contactFullName ?? "",
    contactJobTitle: item.company.contactJobTitle ?? ""
  };
}

export function AdminCompaniesPage(): JSX.Element {
  const {
    activeCompany,
    reloadProfile,
    switchCompany,
    user
  } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const [items, setItems] = useState<AdminCompanyItem[]>([]);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyCompanyId, setBusyCompanyId] = useState<string | null>(null);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<CreateCompanyInput>(createInitialFormState);
  const [companyPendingDelete, setCompanyPendingDelete] = useState<AdminCompanyItem | null>(null);

  const canManageCompanies = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const isEditingCompany = editingCompanyId !== null;

  const loadCompanies = useCallback(async () => {
    if (!canManageCompanies) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAdminCompaniesRequest(accessToken)
      );
      setItems(response.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [canManageCompanies, withAuthorizedToken]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  function resetCompanyForm(): void {
    setEditingCompanyId(null);
    setForm(createInitialFormState());
  }

  function getCompanyUpdateLockMessage(item: AdminCompanyItem): string | null {
    if (!item.company.isActive) {
      return "Cette entreprise est inactive et ne peut plus être modifiée.";
    }

    if (item.role !== "OWNER" && item.role !== "SYS_ADMIN") {
      return "Permissions insuffisantes pour modifier cette entreprise.";
    }

    return null;
  }

  function getCompanyDeleteLockMessage(item: AdminCompanyItem): string | null {
    if (!item.company.isActive) {
      return "Cette entreprise est déjà inactive.";
    }

    if (item.role !== "OWNER") {
      return "Seul le propriétaire de cette entreprise peut la supprimer.";
    }

    if (activeCompany?.id === item.company.id) {
      return "Change d'entreprise active avant de supprimer celle-ci.";
    }

    if (item.company.code === "AMCCO") {
      return "L'entreprise par défaut AMCCO ne peut pas être supprimée.";
    }

    return null;
  }

  async function handleCreateCompany(): Promise<void> {
    if (!canManageCompanies) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, value?.trim?.() ?? value])
      );

      if (editingCompanyId) {
        const response = await withAuthorizedToken((accessToken) =>
          updateAdminCompanyRequest(accessToken, editingCompanyId, payload as UpdateCompanyInput)
        );
        setSuccessMessage(`Entreprise ${response.item.company.name} modifiee.`);
        await reloadProfile();
      } else {
        const response = await withAuthorizedToken((accessToken) =>
          createAdminCompanyRequest(accessToken, payload as CreateCompanyInput)
        );
        if (!activeCompany) {
          await switchCompany(response.item.company.id);
          setSuccessMessage(
            `Entreprise ${response.item.company.name} créée et activée. L'application est maintenant initialisée.`
          );
        } else {
          setSuccessMessage(
            `Entreprise ${response.item.company.name} créée. Elle est maintenant disponible dans votre liste.`
          );
          await reloadProfile();
        }
      }

      resetCompanyForm();
      await loadCompanies();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEditCompany(item: AdminCompanyItem): void {
    const lockMessage = getCompanyUpdateLockMessage(item);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingCompanyId(item.company.id);
    setForm(createFormStateFromCompany(item));
  }

  function handleCancelEditCompany(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetCompanyForm();
  }

  function handleDeleteCompany(item: AdminCompanyItem): void {
    const lockMessage = getCompanyDeleteLockMessage(item);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    setCompanyPendingDelete(item);
  }

  async function handleConfirmDeleteCompany(): Promise<void> {
    if (!companyPendingDelete) {
      return;
    }

    const item = companyPendingDelete;
    setBusyCompanyId(companyPendingDelete.company.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteAdminCompanyRequest(accessToken, companyPendingDelete.company.id)
      );
      if (editingCompanyId === companyPendingDelete.company.id) {
        resetCompanyForm();
      }
      setSuccessMessage(`Entreprise ${item.company.name} désactivée.`);
      setCompanyPendingDelete(null);
      await reloadProfile();
      await loadCompanies();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyCompanyId(null);
    }
  }

  async function handleSwitchCompany(companyId: string): Promise<void> {
    setSwitchingCompanyId(companyId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await switchCompany(companyId);
      setSuccessMessage("Entreprise active mise à jour.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setSwitchingCompanyId(null);
    }
  }

  if (!canManageCompanies) {
    return (
      <section className="panel">
        <h2>Administration entreprises</h2>
        <p>Votre rôle ne permet pas d'administrer les entreprises.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header">
        <h2>Administration entreprises</h2>
      </header>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <div className="company-admin-header">
          <div>
            <h3>Entreprises accessibles</h3>
          </div>
          <div className="company-active-badge">
            Entreprise active: <strong>{activeCompany?.name ?? "Non définie"}</strong>
          </div>
        </div>

        {!isLoading && items.length === 0 ? <p>Aucune entreprise disponible.</p> : null}
        {!isLoading && items.length > 0 ? (
          <div className="company-card-grid">
            {items.map((item) => {
              const isActive = activeCompany?.id === item.company.id;
              const isBusy = busyCompanyId === item.company.id;
              const updateLockMessage = getCompanyUpdateLockMessage(item);
              const deleteLockMessage = getCompanyDeleteLockMessage(item);
              return (
                <article
                  key={item.company.id}
                  className={isActive ? "company-admin-card is-active" : "company-admin-card"}
                >
                  <div className="company-admin-top">
                    <div>
                      <h4>{item.company.name}</h4>
                      <p className="hint">
                        {item.company.code} | {ROLE_LABELS[item.role]}
                      </p>
                    </div>
                    <span
                      className={item.company.isActive ? "company-status-pill" : "company-status-pill is-inactive"}
                    >
                      {item.company.isActive ? (isActive ? "Active" : "Disponible") : "Inactive"}
                    </span>
                  </div>

                  <div className="company-admin-details">
                    <p>
                      <strong>Secteur:</strong> {item.company.businessSector ?? "Non renseigne"}
                    </p>
                    <p>
                      <strong>Email:</strong> {item.company.email ?? "Non renseigne"}
                    </p>
                    <p>
                      <strong>Telephone:</strong> {item.company.phone ?? "Non renseigne"}
                    </p>
                    <p>
                      <strong>Site web:</strong> {item.company.website ?? "Non renseigne"}
                    </p>
                    <p>
                      <strong>Contact:</strong>{" "}
                      {item.company.contactFullName
                        ? `${item.company.contactFullName}${
                            item.company.contactJobTitle ? ` (${item.company.contactJobTitle})` : ""
                          }`
                        : "Non renseigne"}
                    </p>
                    <p className="company-admin-address">
                      <strong>Adresse:</strong> {formatCompanyAddress(item)}
                    </p>
                  </div>

                  <div className="admin-impact-block">
                    <p className="hint">
                      <strong>État:</strong>{" "}
                      {item.company.isActive
                        ? isActive
                          ? "Entreprise active dans votre session."
                          : "Entreprise disponible pour bascule."
                        : "Entreprise désactivée (non utilisable en opération)."}
                    </p>
                    <p className="hint">
                      <strong>Impact:</strong>{" "}
                      {item.company.isActive
                        ? "Les utilisateurs peuvent continuer à créer et traiter des données."
                        : "Plus aucune création ni exécution métier sur cette entreprise; seul l'historique reste consultable."}
                    </p>
                  </div>

                  <div className="admin-actions-block">
                    <p className="hint">
                      <strong>Actions</strong>
                    </p>
                    <div className="actions-inline">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleStartEditCompany(item)}
                        disabled={isBusy}
                        title={updateLockMessage ?? undefined}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => void handleDeleteCompany(item)}
                        disabled={isBusy}
                        title={deleteLockMessage ?? undefined}
                      >
                        Désactiver
                      </button>
                    </div>

                    {!isActive ? (
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => void handleSwitchCompany(item.company.id)}
                        disabled={switchingCompanyId === item.company.id || !item.company.isActive}
                      >
                        {switchingCompanyId === item.company.id
                          ? "Activation..."
                          : "Utiliser cette entreprise"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h3>{isEditingCompany ? "Modifier une entreprise" : "Créer une entreprise"}</h3>
        <div className="company-admin-form">
          <input
            type="text"
            placeholder="Nom commercial"
            value={form.name ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            type="text"
            placeholder="Code entreprise"
            value={form.code ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
            disabled={isEditingCompany}
          />
          <input
            type="text"
            placeholder="Numéro RCCM / registre"
            value={form.registrationNumber ?? ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, registrationNumber: event.target.value }))
            }
          />
          <input
            type="email"
            placeholder="Email professionnel"
            value={form.email ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            type="tel"
            placeholder="Telephone"
            value={form.phone ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <input
            type="text"
            placeholder="Secteur principal"
            value={form.businessSector ?? ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, businessSector: event.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Contact principal"
            value={form.contactFullName ?? ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactFullName: event.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Adresse"
            value={form.addressLine1 ?? ""}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, addressLine1: event.target.value }))
            }
          />
          <input
            type="text"
            placeholder="Ville"
            value={form.city ?? ""}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
          />
          <select
            value={form.country ?? "Mali"}
            onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
          >
            <option value="Mali">Mali</option>
            <option value="Cote d'Ivoire">Cote d'Ivoire</option>
            <option value="Senegal">Sénégal</option>
            <option value="Burkina Faso">Burkina Faso</option>
            <option value="Guinee">Guinée</option>
            <option value="Niger">Niger</option>
          </select>
          <button
            type="button"
            onClick={() => void handleCreateCompany()}
            disabled={isSubmitting || !form.name?.trim() || !form.code?.trim()}
          >
            {isSubmitting
              ? "Enregistrement..."
              : isEditingCompany
                ? "Enregistrer les modifications"
                : "Enregistrer l'entreprise"}
          </button>
          {isEditingCompany ? (
            <button type="button" className="secondary-btn" onClick={handleCancelEditCompany}>
              Annuler
            </button>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={companyPendingDelete !== null}
        title="Confirmer la suppression"
        description="Cette action désactive l'entreprise dans l'interface et interrompt son usage courant."
        objectLabel="Entreprise concernée"
        objectName={companyPendingDelete?.company.name ?? ""}
        impactText="Les utilisateurs ne pourront plus travailler sur cette entreprise tant qu'elle ne sera pas réactivée."
        isConfirming={busyCompanyId === companyPendingDelete?.company.id}
        onCancel={() => {
          if (busyCompanyId) {
            return;
          }
          setCompanyPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteCompany()}
      />
    </>
  );
}

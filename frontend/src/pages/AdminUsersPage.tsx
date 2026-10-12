import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  changeAdminUserRoleRequest,
  createAdminUserRequest,
  deleteAdminUserRequest,
  listAdminUsersRequest,
  resetAdminUserPasswordRequest,
  updateAdminUserRequest
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { PageGuide } from "../components/PageGuide";
import { ButtonSpinner } from "../components/ButtonSpinner";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { buildQuickSearchText, createQuickSearchMatcher } from "../lib/quickSearch";
import type { AdminUserItem } from "../types/admin-users";
import { ROLE_CODES, type RoleCode } from "../types/role";
import { ROLE_LABELS } from "../config/permissions";

type UserDraft = {
  fullName: string;
  isActive: boolean;
  role: RoleCode;
  newPassword: string;
};

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

export function AdminUsersPage(): JSX.Element {
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();

  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const usersLoadRequestRef = useRef(0);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "EMPLOYEE" as RoleCode
  });
  const [isCreateFormExpanded, setIsCreateFormExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
  const [isCompactScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );

  const canManageUser = useMemo(() => {
    return user?.role === "SYS_ADMIN";
  }, [user?.role]);
  const canViewUsers = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);
  const usersSearchStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("admin-users-search", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const [searchQuery, setSearchQuery] = usePersistedViewState(usersSearchStorageKey, "");
  const [roleFilter, setRoleFilter] = useState<"ALL" | RoleCode>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const userSearchTextById = useMemo(() => new Map(items.map((item) => [
    item.userId,
    buildQuickSearchText([
      item.fullName,
      item.email,
      item.role,
      ROLE_LABELS[item.role]
    ])
  ])), [items]);
  const displayItems = useMemo(() => {
    const matchesSearch = createQuickSearchMatcher(searchQuery);
    return items
      .filter((item) => {
        if (roleFilter !== "ALL" && item.role !== roleFilter) {
          return false;
        }
        if (statusFilter === "ACTIVE" && !item.isActive) {
          return false;
        }
        if (statusFilter === "INACTIVE" && item.isActive) {
          return false;
        }
        return true;
      })
      .filter((item) => matchesSearch(userSearchTextById.get(item.userId) ?? ""));
  }, [items, roleFilter, searchQuery, statusFilter, userSearchTextById]);
  const activeUsersCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);
  const inactiveUsersCount = items.length - activeUsersCount;

  const setDraftsFromItems = useCallback((rows: AdminUserItem[]) => {
    const nextDrafts: Record<string, UserDraft> = {};
    for (const row of rows) {
      nextDrafts[row.userId] = {
        fullName: row.fullName,
        isActive: row.isActive,
        role: row.role,
        newPassword: ""
      };
    }
    setDrafts(nextDrafts);
  }, []);

  const loadUsers = useCallback(async () => {
    const requestId = ++usersLoadRequestRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) => listAdminUsersRequest(accessToken));
      if (requestId !== usersLoadRequestRef.current) return;
      setItems(response.items);
      setDraftsFromItems(response.items);
    } catch (error) {
      if (requestId === usersLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === usersLoadRequestRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeCompany?.id, setDraftsFromItems, withAuthorizedToken]);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    setItems([]);
    setDrafts({});
    setIsLoading(true);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  useEffect(() => {
    if (!canViewUsers) {
      setIsLoading(false);
      return;
    }
    void loadUsers();
  }, [canViewUsers, loadUsers]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmittingCreate(true);

    try {
      const response = await withAuthorizedToken((accessToken) =>
        createAdminUserRequest(accessToken, {
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          role: createForm.role
        })
      );

      setItems((prev) => [
        response.item,
        ...prev.filter((item) => item.userId !== response.item.userId)
      ]);
      setDrafts((prev) => ({
        ...prev,
        [response.item.userId]: {
          fullName: response.item.fullName,
          isActive: response.item.isActive,
          role: response.item.role,
          newPassword: ""
        }
      }));

      setCreateForm({
        fullName: "",
        email: "",
        password: "",
        role: "EMPLOYEE"
      });
      setSuccessMessage("Utilisateur créé avec succès.");
      if (window.matchMedia("(max-width: 640px)").matches) {
        setIsCreateFormExpanded(false);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  async function handleSaveProfile(userId: string): Promise<void> {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }
    const currentUser = items.find((item) => item.userId === userId);

    setBusyUserId(userId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      let response = await withAuthorizedToken((accessToken) =>
        updateAdminUserRequest(accessToken, userId, {
          fullName: draft.fullName.trim(),
          isActive: draft.isActive
        })
      );
      if (currentUser && currentUser.role !== draft.role) {
        response = await withAuthorizedToken((accessToken) =>
          changeAdminUserRoleRequest(accessToken, userId, {
            role: draft.role
          })
        );
      }
      const savedUser = response.item;
      setItems((prev) => prev.map((item) => (item.userId === savedUser.userId ? savedUser : item)));
      setDrafts((prev) => ({
        ...prev,
        [savedUser.userId]: {
          fullName: savedUser.fullName,
          isActive: savedUser.isActive,
          role: savedUser.role,
          newPassword: prev[savedUser.userId]?.newPassword ?? ""
        }
      }));
      setSuccessMessage("Profil utilisateur mis à jour.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleDeleteMembership(userId: string): Promise<void> {
    setBusyUserId(userId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteAdminUserRequest(accessToken, userId));
      setItems((prev) => prev.filter((item) => item.userId !== userId));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      setSuccessMessage("Membre retire de l'entreprise.");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleResetPassword(userId: string): Promise<void> {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }

    const password = draft.newPassword.trim();
    if (password.length < 8) {
      setErrorMessage("Le nouveau mot de passe doit contenir au moins 8 caracteres.");
      return;
    }

    setBusyUserId(userId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        resetAdminUserPasswordRequest(accessToken, userId, {
          newPassword: password
        })
      );
      setSuccessMessage("Mot de passe reinitialise et sessions invalidees.");
      setDrafts((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] ?? {
            fullName: "",
            isActive: true,
            role: "EMPLOYEE",
            newPassword: ""
          }),
          newPassword: ""
        }
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyUserId(null);
    }
  }

  function handleResetUserFilters(): void {
    setSearchQuery("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
  }

  if (!canViewUsers) {
    return (
      <section className="panel">
        <h2>Administration utilisateurs</h2>
        <p>Votre rôle ne permet pas de gérer les utilisateurs.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header mobile-title-duplicate">
        <h2>Administration utilisateurs</h2>
        <p>Gestion des accès, des rôles et de l'état des membres de l'entreprise.</p>
      </header>

      <PageGuide
        title="Guide des utilisateurs"
        description="Les droits doivent rester lisibles pour éviter les accès trop larges ou les comptes inutilisables."
        items={[
          {
            term: "Rôle",
            description: "Niveau d'accès accordé à l'utilisateur dans l'entreprise active."
          },
          {
            term: "Actif",
            description: "Compte autorisé à se connecter et à travailler dans l'application."
          },
          {
            term: "Sécurité",
            description: "Zone réservée aux actions sensibles comme la réinitialisation du mot de passe."
          },
          {
            term: "Filtre",
            description: "Vue temporaire de la liste par rôle, état ou recherche rapide."
          }
        ]}
      />

      {canManageUser ? <section className="panel admin-users-create-panel">
        <details
          className="mobile-create-disclosure"
          open={isCreateFormExpanded}
          onToggle={(event) => setIsCreateFormExpanded(event.currentTarget.open)}
        >
        <summary>Créer un utilisateur</summary>
        <form className="admin-form admin-users-create-form" onSubmit={handleCreateUser}>
          <input
            type="text"
            placeholder="Nom complet"
            value={createForm.fullName}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                fullName: event.target.value
              }))
            }
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={createForm.email}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                email: event.target.value
              }))
            }
            required
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={createForm.password}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                password: event.target.value
              }))
            }
            required
          />
          <select
            value={createForm.role}
            onChange={(event) =>
              setCreateForm((prev) => ({
                ...prev,
                role: event.target.value as RoleCode
              }))
            }
          >
            <optgroup label="Rôles classiques">
              {ROLE_CODES.filter((role) => role !== "HARDWARE_OPERATOR" && role !== "HYDROCARBON_OPERATOR" && role !== "BEVERAGE_DEPOT_OPERATOR").map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Opérateurs sectoriels">
              {ROLE_CODES.filter((role) => role === "HARDWARE_OPERATOR" || role === "HYDROCARBON_OPERATOR" || role === "BEVERAGE_DEPOT_OPERATOR").map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </optgroup>
          </select>
          {createForm.role === "HARDWARE_OPERATOR" || createForm.role === "HYDROCARBON_OPERATOR" || createForm.role === "BEVERAGE_DEPOT_OPERATOR" ? (
            <p className="hint">
              Ce compte sera limité à son secteur et rattaché uniquement à l’entreprise active
              {activeCompany?.name ? ` (${activeCompany.name})` : ""}. Utilisez une adresse e-mail dédiée.
            </p>
          ) : null}
          <div className="mobile-sticky-form-actions">
            <button type="submit" disabled={isSubmittingCreate}>
              {isSubmittingCreate ? (
                <>
                  <ButtonSpinner />
                  Enregistrement...
                </>
              ) : (
                "Ajouter l'utilisateur"
              )}
            </button>
          </div>
        </form>
        </details>
      </section> : null}

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className={canManageUser ? "panel admin-users-panel" : "panel admin-users-panel admin-users-readonly"}>
        <div className="admin-users-management-header">
          <div>
            <h3>Utilisateurs de l'entreprise</h3>
            <p className="hint">
              {displayItems.length} affiché(s) sur {items.length} utilisateur(s).
            </p>
          </div>
          <div className="admin-summary-strip">
            <article className="admin-summary-pill">
              <strong>{activeUsersCount}</strong>
              <span>Actifs</span>
            </article>
            <article className="admin-summary-pill">
              <strong>{inactiveUsersCount}</strong>
              <span>Inactifs</span>
            </article>
          </div>
        </div>
        <div className="admin-users-filters">
          <input
            type="search"
            className="quick-search-input"
            placeholder="Recherche rapide: nom, email, rôle..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <details className="admin-users-filter-disclosure" open={!isCompactScreen}>
            <summary>Rôle et statut</summary>
            <div className="admin-users-filter-disclosure-content">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as "ALL" | "ACTIVE" | "INACTIVE")
                }
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Actifs</option>
                <option value="INACTIVE">Inactifs</option>
              </select>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as "ALL" | RoleCode)}
          >
            <option value="ALL">Tous les rôles</option>
            {ROLE_CODES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
            </div>
          </details>
        </div>
        {!isLoading && items.length === 0 ? (
          <EmptyState
            title="Aucun utilisateur"
            description={
              canManageUser
                ? "Ajoutez le premier membre depuis le formulaire de création."
                : "Aucun membre n'est disponible dans cette entreprise."
            }
          />
        ) : null}
        {!isLoading && items.length > 0 && displayItems.length === 0 ? (
          <EmptyState
            title="Aucun utilisateur trouvé"
            description="Aucun membre ne correspond à la recherche ou aux filtres appliqués."
            actionLabel="Réinitialiser les filtres"
            onAction={handleResetUserFilters}
          />
        ) : null}

        {!isLoading && displayItems.length > 0 ? (
          <div className="table-wrap admin-users-table-wrap mobile-card-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Rôle</th>
                  <th>Actif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const draft = drafts[item.userId];
                  const isBusy = busyUserId === item.userId;
                  return (
                    <tr key={item.userId}>
                      <td data-label="Nom">
                        <input
                          type="text"
                          value={draft?.fullName ?? item.fullName}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.userId]: {
                                ...(prev[item.userId] ?? {
                                  fullName: item.fullName,
                                  isActive: item.isActive,
                                  role: item.role,
                                  newPassword: ""
                                }),
                                fullName: event.target.value
                              }
                            }))
                          }
                          disabled={!canManageUser || isBusy}
                        />
                      </td>
                      <td data-label="Email">{item.email}</td>
                      <td className="admin-user-role-cell" data-label="Rôle">
                        <span className="admin-user-role-badge">{ROLE_LABELS[draft?.role ?? item.role]}</span>
                        <select
                          value={draft?.role ?? item.role}
                          onChange={(event) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [item.userId]: {
                                ...(prev[item.userId] ?? {
                                  fullName: item.fullName,
                                  isActive: item.isActive,
                                  role: item.role,
                                  newPassword: ""
                                }),
                                role: event.target.value as RoleCode
                              }
                            }))
                          }
                          disabled={!canManageUser || isBusy}
                        >
                          {ROLE_CODES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Actif">
                        <label className="inline-checkbox">
                          <input
                            type="checkbox"
                            checked={draft?.isActive ?? item.isActive}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [item.userId]: {
                                ...(prev[item.userId] ?? {
                                  fullName: item.fullName,
                                  isActive: item.isActive,
                                  role: item.role,
                                  newPassword: ""
                                }),
                                isActive: event.target.checked
                              }
                              }))
                            }
                            disabled={isBusy}
                          />
                          <span>{(draft?.isActive ?? item.isActive) ? "Oui" : "Non"}</span>
                        </label>
                      </td>
                      <td className="admin-user-actions-cell" data-label="Actions">
                        <div className="actions-inline admin-user-actions-row">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleSaveProfile(item.userId)}
                            disabled={!canManageUser || isBusy}
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => void handleDeleteMembership(item.userId)}
                            disabled={isBusy}
                          >
                            Supprimer
                          </button>
                        </div>
                        <details className="admin-user-security-toggle">
                          <summary>Mot de passe</summary>
                          <div className="password-reset-inline admin-user-password-row">
                            <input
                              type="password"
                              placeholder="Nouveau mot de passe"
                              value={draft?.newPassword ?? ""}
                              onChange={(event) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.userId]: {
                                    ...(prev[item.userId] ?? {
                                      fullName: item.fullName,
                                      isActive: item.isActive,
                                      role: item.role,
                                      newPassword: ""
                                    }),
                                    newPassword: event.target.value
                                  }
                                }))
                              }
                              disabled={!canManageUser || isBusy}
                            />
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleResetPassword(item.userId)}
                              disabled={!canManageUser || isBusy}
                            >
                              Réinitialiser le mot de passe
                            </button>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}

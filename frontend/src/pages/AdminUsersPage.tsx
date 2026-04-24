import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  const { session, refreshSession, user } = useAuth();

  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [isLoading, setIsLoading] = useState(true);
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

  const canManageUser = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

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

  const withAuthorizedToken = useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      if (!session?.accessToken) {
        throw new ApiError(401, "Session absente");
      }

      try {
        return await action(session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }

        const refreshedAccessToken = await refreshSession();
        if (!refreshedAccessToken) {
          throw new ApiError(401, "Session expirée. Reconnectez-vous.");
        }
        return action(refreshedAccessToken);
      }
    },
    [refreshSession, session?.accessToken]
  );

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) => listAdminUsersRequest(accessToken));
      setItems(response.items);
      setDraftsFromItems(response.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [setDraftsFromItems, withAuthorizedToken]);

  useEffect(() => {
    if (!canManageUser) {
      setIsLoading(false);
      return;
    }
    void loadUsers();
  }, [canManageUser, loadUsers]);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmittingCreate(true);

    try {
      await withAuthorizedToken((accessToken) =>
        createAdminUserRequest(accessToken, {
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          role: createForm.role
        })
      );

      setCreateForm({
        fullName: "",
        email: "",
        password: "",
        role: "EMPLOYEE"
      });
      setSuccessMessage("Utilisateur créé avec succès.");
      await loadUsers();
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

    setBusyUserId(userId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        updateAdminUserRequest(accessToken, userId, {
          fullName: draft.fullName.trim(),
          isActive: draft.isActive
        })
      );
      setSuccessMessage("Profil utilisateur mis a jour.");
      await loadUsers();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleChangeRole(userId: string): Promise<void> {
    const draft = drafts[userId];
    if (!draft) {
      return;
    }

    setBusyUserId(userId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        changeAdminUserRoleRequest(accessToken, userId, {
          role: draft.role
        })
      );
      setSuccessMessage("Role mis a jour.");
      await loadUsers();
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
      setSuccessMessage("Membre retire de l'entreprise.");
      await loadUsers();
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

  if (!canManageUser) {
    return (
      <section className="panel">
        <h2>Administration utilisateurs</h2>
        <p>Votre rôle ne permet pas de gérer les utilisateurs.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header">
        <h2>Administration utilisateurs</h2>
        <p>Gestion des comptes, activations, roles et appartenances.</p>
      </header>

      <section className="panel">
        <h3>Créer un utilisateur</h3>
        <form className="admin-form" onSubmit={handleCreateUser}>
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
            {ROLE_CODES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isSubmittingCreate}>
            {isSubmittingCreate ? "Enregistrement..." : "Ajouter l'utilisateur"}
          </button>
        </form>
      </section>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <h3>Utilisateurs de l'entreprise</h3>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && items.length === 0 ? <p>Aucun utilisateur.</p> : null}

        {!isLoading && items.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Actif</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const draft = drafts[item.userId];
                  const isBusy = busyUserId === item.userId;
                  return (
                    <tr key={item.userId}>
                      <td>
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
                          disabled={isBusy}
                        />
                      </td>
                      <td>{item.email}</td>
                      <td>
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
                          disabled={isBusy}
                        >
                          {ROLE_CODES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
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
                      <td>
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleSaveProfile(item.userId)}
                            disabled={isBusy}
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleChangeRole(item.userId)}
                            disabled={isBusy}
                          >
                            Mettre à jour le rôle
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
                        <div className="password-reset-inline">
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
                            disabled={isBusy}
                          />
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleResetPassword(item.userId)}
                            disabled={isBusy}
                          >
                            Reinitialiser le mot de passe
                          </button>
                        </div>
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

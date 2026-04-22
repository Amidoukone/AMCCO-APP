import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listAdminCompanyActivitiesRequest,
  updateAdminCompanyActivityRequest
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import type { CompanyActivityItem } from "../types/activities";
import type { BusinessActivityCode } from "../config/businessActivities";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Operation impossible. Verifie la connexion backend.";
}

export function AdminActivitiesPage(): JSX.Element {
  const { session, refreshSession, user } = useAuth();
  const { reloadActivities } = useBusinessActivity();
  const [items, setItems] = useState<CompanyActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyActivityCode, setBusyActivityCode] = useState<BusinessActivityCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManageActivities = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

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
          throw new ApiError(401, "Session expiree. Reconnecte-toi.");
        }
        return action(refreshedAccessToken);
      }
    },
    [refreshSession, session?.accessToken]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAdminCompanyActivitiesRequest(accessToken)
      );
      setItems(response.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [withAuthorizedToken]);

  useEffect(() => {
    if (!canManageActivities) {
      setIsLoading(false);
      return;
    }
    void loadData();
  }, [canManageActivities, loadData]);

  async function handleToggleActivity(item: CompanyActivityItem): Promise<void> {
    setBusyActivityCode(item.code);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        updateAdminCompanyActivityRequest(accessToken, item.code, !item.isEnabled)
      );
      setItems((prev) =>
        prev.map((row) => (row.code === response.item.code ? response.item : row))
      );
      setSuccessMessage(
        response.item.isEnabled
          ? `Secteur ${response.item.label} active.`
          : `Secteur ${response.item.label} desactive.`
      );
      await loadData();
      await reloadActivities();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyActivityCode(null);
    }
  }

  if (!canManageActivities) {
    return (
      <section className="panel">
        <h2>Administration secteurs</h2>
        <p>Ton role ne permet pas d'administrer les secteurs d'activite.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header">
        <h2>Administration secteurs</h2>
        <p>Activation des secteurs par entreprise.</p>
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <h3>Configuration des secteurs</h3>
        <p className="hint">
          Un secteur desactive n'est plus propose pour les nouvelles transactions et taches.
          L'historique reste accessible.
        </p>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading ? (
          <div className="activity-admin-list">
            {items.map((item) => (
              <article key={item.code} className="activity-admin-card">
                <div>
                  <h4>{item.label}</h4>
                  <p className="hint">{item.description}</p>
                  <p className="hint">
                    Statut actuel: <strong>{item.isEnabled ? "Actif" : "Desactive"}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleToggleActivity(item)}
                  disabled={busyActivityCode === item.code}
                >
                  {busyActivityCode === item.code
                    ? "Mise a jour..."
                    : item.isEnabled
                      ? "Desactiver"
                      : "Activer"}
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

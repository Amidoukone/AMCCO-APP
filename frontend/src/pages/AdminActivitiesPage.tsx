import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listAdminCompanyActivitiesRequest,
  updateAdminCompanyActivityRequest
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { CompanyActivityItem } from "../types/activities";
import type { BusinessActivityCode } from "../config/businessActivities";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Operation impossible. Verifie la connexion backend.";
}

export function AdminActivitiesPage(): JSX.Element {
  const { user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const { reloadActivities } = useBusinessActivity();
  const [items, setItems] = useState<CompanyActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyActivityCode, setBusyActivityCode] = useState<BusinessActivityCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canManageActivities = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);

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
          : `Secteur ${response.item.label} désactivé.`
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
        <p>Votre rôle ne permet pas d'administrer les secteurs d'activité.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header">
        <h2>Administration secteurs</h2>
      </header>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <h3>Configuration des secteurs</h3>
        {!isLoading ? (
          <div className="activity-admin-list">
            {items.map((item) => (
              <article key={item.code} className="activity-admin-card">
                <div>
                  <h4>{item.label}</h4>
                  <div className="admin-impact-block">
                    <p className="hint">
                      <strong>État:</strong> {item.isEnabled ? "Actif" : "Désactivé"}
                    </p>
                    <p className="hint">
                      <strong>Impact:</strong>{" "}
                      {item.isEnabled
                        ? "Le secteur reste disponible pour nouvelles tâches et transactions."
                        : "Le secteur disparaît des créations; l'historique existant reste consultable."}
                    </p>
                  </div>
                </div>
                <div className="admin-actions-block">
                  <p className="hint">
                    <strong>Action</strong>
                  </p>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleToggleActivity(item)}
                    disabled={busyActivityCode === item.code}
                  >
                    {busyActivityCode === item.code
                      ? "Mise a jour..."
                      : item.isEnabled
                        ? "Désactiver"
                        : "Activer"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </>
  );
}

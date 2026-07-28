import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  listAdminCompanyActivitiesRequest,
  updateAdminCompanyActivityRequest
} from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { PageGuide } from "../components/PageGuide";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { CompanyActivityItem } from "../types/activities";
import type { BusinessActivityCode } from "../config/businessActivities";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
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
    return user?.role === "SYS_ADMIN";
  }, [user?.role]);
  const canViewActivities = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  }, [user?.role]);
  const enabledActivitiesCount = useMemo(() => items.filter((item) => item.isEnabled).length, [items]);
  const disabledActivitiesCount = items.length - enabledActivitiesCount;

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
    if (!canViewActivities) {
      setIsLoading(false);
      return;
    }
    void loadData();
  }, [canViewActivities, loadData]);

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
          ? `Secteur ${response.item.label} activé.`
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

  if (!canViewActivities) {
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
        <p>Activation des domaines métier visibles dans les tâches, transactions, tableaux de bord et rapports.</p>
      </header>

      <PageGuide
        title="Guide des secteurs"
        description="Un secteur activé devient utilisable dans les créations et alimente les indicateurs associés."
        items={[
          {
            term: "Actif",
            description: "Secteur disponible pour créer des tâches, transactions et rapports."
          },
          {
            term: "Désactivé",
            description: "Secteur masqué dans les créations; les données historiques restent consultables."
          },
          {
            term: "Impact",
            description: "Conséquence opérationnelle de l'état du secteur pour les équipes."
          },
          {
            term: "Action",
            description: "Commande utilisée par l'admin système pour activer ou désactiver le secteur."
          }
        ]}
      />

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <div className="admin-section-header">
          <div>
            <h3>Configuration des secteurs</h3>
            <p className="hint">{items.length} secteur(s) configuré(s) pour l'entreprise active.</p>
          </div>
          <div className="admin-summary-strip">
            <article className="admin-summary-pill">
              <strong>{enabledActivitiesCount}</strong>
              <span>Actifs</span>
            </article>
            <article className="admin-summary-pill">
              <strong>{disabledActivitiesCount}</strong>
              <span>Désactivés</span>
            </article>
          </div>
        </div>
        {!isLoading ? (
          items.length === 0 ? (
            <EmptyState
              title="Aucun secteur configuré"
              description="Aucun secteur métier n'est disponible pour cette entreprise."
              actionLabel="Actualiser"
              onAction={() => void loadData()}
            />
          ) : (
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
                  {canManageActivities ? <div className="admin-actions-block">
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
                        ? "Mise à jour..."
                        : item.isEnabled
                          ? "Désactiver"
                          : "Activer"}
                    </button>
                  </div> : null}
                </article>
              ))}
            </div>
          )
        ) : null}
      </section>
    </>
  );
}

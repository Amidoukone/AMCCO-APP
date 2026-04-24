import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  listAlertsRequest,
  markAlertReadRequest,
  markAllAlertsReadRequest
} from "../lib/api";
import type { AlertItem, AlertSeverity } from "../types/alerts";
import {
  buildFinanceTransactionPath,
  getFinanceTraceLines,
  getFinanceTransactionNavigationTarget
} from "../utils/traceMetadata";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Verifie la connexion backend.";
}

function severityLabel(severity: AlertSeverity): string {
  if (severity === "INFO") {
    return "Info";
  }
  if (severity === "WARNING") {
    return "Attention";
  }
  return "Critique";
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

function notifyAlertsChanged(): void {
  window.dispatchEvent(new Event("amcco-alerts-changed"));
}

export function AlertsPage(): JSX.Element {
  const navigate = useNavigate();
  const { refreshSession, session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [filters, setFilters] = useState<{
    unreadOnly: boolean;
    severity: "" | AlertSeverity;
    entityType: string;
    entityId: string;
  }>({
    unreadOnly: false,
    severity: "",
    entityType: searchParams.get("entityType") ?? "",
    entityId: searchParams.get("entityId") ?? ""
  });

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      entityType: searchParams.get("entityType") ?? "",
      entityId: searchParams.get("entityId") ?? ""
    }));
  }, [searchParams]);

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
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw new ApiError(401, "Session expiree. Reconnecte-toi.");
        }
        return action(refreshed);
      }
    },
    [refreshSession, session?.accessToken]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAlertsRequest(accessToken, {
          limit: 100,
          unreadOnly: filters.unreadOnly,
          severity: filters.severity || undefined,
          entityType: filters.entityType.trim() || undefined,
          entityId: filters.entityId.trim() || undefined
        })
      );
      setItems(response.items);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.entityId,
    filters.entityType,
    filters.severity,
    filters.unreadOnly,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRead(alertId: string): Promise<void> {
    setBusyAlertId(alertId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => markAlertReadRequest(accessToken, alertId));
      setSuccessMessage("Alerte marquee comme lue.");
      await loadData();
      notifyAlertsChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleReadAll(): Promise<void> {
    setIsMarkingAll(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => markAllAlertsReadRequest(accessToken));
      setSuccessMessage("Toutes les alertes ont ete marquees comme lues.");
      await loadData();
      notifyAlertsChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsMarkingAll(false);
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (filters.entityType.trim()) {
        next.set("entityType", filters.entityType.trim());
      } else {
        next.delete("entityType");
      }
      if (filters.entityId.trim()) {
        next.set("entityId", filters.entityId.trim());
      } else {
        next.delete("entityId");
      }
      return next;
    });
    void loadData();
  }

  return (
    <>
      <header className="section-header">
        <h2>Alertes</h2>
        <p>Centre de suivi des alertes liees aux transactions et aux taches.</p>
      </header>

      <section className="panel">
        <div className="alerts-header">
          <div>
            <h3>Vue utilisateur</h3>
            <p className="hint">{unreadCount} alerte(s) a traiter.</p>
          </div>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => void handleReadAll()}
            disabled={isMarkingAll || unreadCount === 0}
          >
            Tout marquer comme lu
          </button>
        </div>

        <form className="alerts-filter-form" onSubmit={handleFilterSubmit}>
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={filters.unreadOnly}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  unreadOnly: event.target.checked
                }))
              }
            />
            <span>Non lues uniquement</span>
          </label>

          <select
            value={filters.severity}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                severity: event.target.value as "" | AlertSeverity
              }))
            }
          >
            <option value="">Toutes les severites</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Attention</option>
            <option value="CRITICAL">Critique</option>
          </select>

          <input
            type="text"
            placeholder="Type entite (ex: TRANSACTION)"
            value={filters.entityType}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                entityType: event.target.value
              }))
            }
          />

          <input
            type="text"
            placeholder="ID entite"
            value={filters.entityId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                entityId: event.target.value
              }))
            }
          />

          <button type="submit">Filtrer</button>
        </form>
      </section>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <h3>Liste</h3>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && items.length === 0 ? <p>Aucune alerte ne correspond à ces filtres.</p> : null}
        {!isLoading && items.length > 0 ? (
          <div className="alerts-list">
            {items.map((item) => {
              const isUnread = item.readAt === null;
              const financeTraceLines = getFinanceTraceLines(item.metadata);
              const financeTarget = getFinanceTransactionNavigationTarget(
                item.entityType,
                item.entityId,
                item.metadata
              );
              return (
                <article
                  key={item.id}
                  className={`alert-card severity-${item.severity.toLowerCase()} ${isUnread ? "is-unread" : ""}`}
                >
                  <div className="alert-card-top">
                    <div>
                      <h4>{severityLabel(item.severity)}</h4>
                      <p className="hint">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <span className="task-status-chip">{isUnread ? "Non lue" : "Lue"}</span>
                  </div>
                  <p className="alert-message">{item.message}</p>
                  <div className="alert-meta">
                    <p>
                      <strong>Code:</strong> {item.code}
                    </p>
                    <p>
                      <strong>Entite:</strong> {item.entityType ?? "-"} {item.entityId ?? ""}
                    </p>
                    <p>
                      <strong>Lecture:</strong> {formatDateTime(item.readAt)}
                    </p>
                    {financeTraceLines.map((line) => (
                      <p key={`${item.id}-${line}`}>
                        <strong>Trace:</strong> {line}
                      </p>
                    ))}
                  </div>
                  {isUnread || financeTarget ? (
                    <div className="actions-inline">
                      {financeTarget ? (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => navigate(buildFinanceTransactionPath(financeTarget))}
                        >
                          {financeTarget.kind === "salary" ? "Voir le salaire" : "Voir la transaction"}
                        </button>
                      ) : null}
                      {isUnread ? (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => void handleRead(item.id)}
                          disabled={busyAlertId === item.id || isMarkingAll}
                        >
                          Marquer comme lu
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  listAlertsRequest,
  markAlertReadRequest,
  markAllAlertsReadRequest
} from "../lib/api";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { AlertItem, AlertSeverity } from "../types/alerts";
import {
  buildFinanceTransactionPath,
  getFinanceTraceLines,
  getFinanceTransactionNavigationTarget
} from "../utils/traceMetadata";

const ALERTS_PAGE_SIZE = 100;

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
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const alertsViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("alerts", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialFilters = useMemo(
    () => ({
      unreadOnly: false,
      severity: "" as "" | AlertSeverity,
      entityType: searchParams.get("entityType") ?? "",
      entityId: searchParams.get("entityId") ?? ""
    }),
    [searchParams]
  );
  const [filters, setFilters] = usePersistedViewState(alertsViewStorageKey, initialFilters);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      entityType: searchParams.get("entityType") ?? "",
      entityId: searchParams.get("entityId") ?? ""
    }));
  }, [searchParams]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAlertsRequest(accessToken, {
          limit: ALERTS_PAGE_SIZE,
          offset,
          unreadOnly: filters.unreadOnly,
          severity: filters.severity || undefined,
          entityType: filters.entityType.trim() || undefined,
          entityId: filters.entityId.trim() || undefined
        })
      );
      setItems((prev) => (append ? [...prev, ...response.items] : response.items));
      setHasMoreItems(response.items.length === ALERTS_PAGE_SIZE);
      setUnreadCount(response.unreadCount);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
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

  function applyQuickFilter(
    nextFilters: Partial<{
      unreadOnly: boolean;
      severity: "" | AlertSeverity;
      entityType: string;
      entityId: string;
    }>
  ): void {
    setFilters((prev) => ({
      ...prev,
      ...nextFilters
    }));
  }

  async function handleLoadMore(): Promise<void> {
    if (isLoading || isLoadingMore || !hasMoreItems) {
      return;
    }
    await loadData({
      offset: items.length,
      append: true
    });
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
          <div className="view-preset-strip">
            <button
              type="button"
              className={!filters.unreadOnly && filters.severity === "" ? "view-preset-btn is-active" : "view-preset-btn"}
              onClick={() => applyQuickFilter({ unreadOnly: false, severity: "" })}
            >
              Vue complete
            </button>
            <button
              type="button"
              className={filters.unreadOnly && filters.severity === "" ? "view-preset-btn is-active" : "view-preset-btn"}
              onClick={() => applyQuickFilter({ unreadOnly: true, severity: "" })}
            >
              Non lues
            </button>
            <button
              type="button"
              className={!filters.unreadOnly && filters.severity === "CRITICAL" ? "view-preset-btn is-active" : "view-preset-btn"}
              onClick={() => applyQuickFilter({ unreadOnly: false, severity: "CRITICAL" })}
            >
              Critiques
            </button>
          </div>

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

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <h3>Liste</h3>
        {!isLoading && items.length === 0 ? <p>Aucune alerte ne correspond à ces filtres.</p> : null}
        {!isLoading && items.length > 0 ? (
          <>
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
          <div className="list-pagination">
            <p className="hint list-pagination-meta">
              {items.length} alerte(s) chargee(s){hasMoreItems ? " sur plusieurs pages." : "."}
            </p>
            {hasMoreItems ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Chargement..." : "Charger plus"}
              </button>
            ) : null}
          </div>
          </>
        ) : null}
      </section>
    </>
  );
}

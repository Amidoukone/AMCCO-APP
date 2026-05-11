import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  deleteAlertRequest,
  deleteManyAlertsRequest,
  listAlertsRequest,
  markAlertReadRequest,
  markAllAlertsReadRequest
} from "../lib/api";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { AlertItem } from "../types/alerts";
import {
  buildFinanceTransactionPath,
  buildTaskPath,
  getFinanceTraceLines,
  getFinanceTransactionNavigationTarget,
  getTaskNavigationTarget,
  getTaskTraceLines
} from "../utils/traceMetadata";

const ALERTS_PAGE_SIZE = 100;

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible. Vérifiez la connexion backend.";
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

function entityTypeLabel(entityType: string | null): string {
  const normalized = entityType?.trim().toUpperCase() ?? "";
  if (normalized === "TASK" || normalized === "TASK_COMMENT") {
    return "Tâche";
  }
  if (normalized === "TRANSACTION") {
    return "Transaction";
  }
  if (normalized === "SALARY") {
    return "Salaire";
  }
  return normalized || "Système";
}

function buildAlertContextLines(item: AlertItem): string[] {
  const financeLines = getFinanceTraceLines(item.metadata);
  if (financeLines.length > 0) {
    return financeLines;
  }

  const taskLines = getTaskTraceLines(item.code, item.metadata);
  if (taskLines.length > 0) {
    return taskLines;
  }

  return [];
}

export function AlertsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany, user } = useAuth();
  const isReadOnlyOwner = user?.role === "OWNER";
  const withAuthorizedToken = useAuthorizedRequest();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const alertsViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("alerts", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialFilters = useMemo(
    () => ({
      unreadOnly: false,
      entityType: isReadOnlyOwner ? "" : searchParams.get("entityType") ?? ""
    }),
    [isReadOnlyOwner, searchParams]
  );
  const [filters, setFilters] = usePersistedViewState(alertsViewStorageKey, initialFilters);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      entityType: isReadOnlyOwner ? "" : searchParams.get("entityType") ?? ""
    }));
  }, [isReadOnlyOwner, searchParams, setFilters]);

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
          entityType:
            !isReadOnlyOwner && filters.entityType.trim().length > 0
              ? filters.entityType.trim()
              : undefined
        })
      );

      setItems((prev) => (append ? [...prev, ...response.items] : response.items));
      setHasMoreItems(response.items.length === ALERTS_PAGE_SIZE);
      setUnreadCount(response.unreadCount);
      if (!append) {
        setSelectedAlertIds((prev) =>
          prev.filter((alertId) => response.items.some((item) => item.id === alertId))
        );
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [filters.entityType, filters.unreadOnly, isReadOnlyOwner, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRead(alertId: string): Promise<void> {
    setBusyAlertId(alertId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => markAlertReadRequest(accessToken, alertId));
      setSuccessMessage("Alerte marquée comme lue.");
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
      setSuccessMessage("Toutes les alertes ont été marquées comme lues.");
      await loadData();
      notifyAlertsChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsMarkingAll(false);
    }
  }

  async function handleDelete(alertId: string): Promise<void> {
    setBusyAlertId(alertId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteAlertRequest(accessToken, alertId));
      setSelectedAlertIds((prev) => prev.filter((item) => item !== alertId));
      setSuccessMessage("Alerte supprimée.");
      await loadData();
      notifyAlertsChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleDeleteSelection(): Promise<void> {
    if (selectedAlertIds.length === 0) {
      return;
    }

    setIsDeletingSelection(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteManyAlertsRequest(accessToken, selectedAlertIds)
      );
      setSelectedAlertIds([]);
      setSuccessMessage("Alertes supprimées.");
      await loadData();
      notifyAlertsChanged();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsDeletingSelection(false);
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!isReadOnlyOwner && filters.entityType.trim()) {
        next.set("entityType", filters.entityType.trim());
      } else {
        next.delete("entityType");
      }
      return next;
    });
    void loadData();
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

  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedAlertIds.includes(item.id));
  return (
    <>
      <header className={isReadOnlyOwner ? "section-header owner-lite-header" : "section-header"}>
        <h2>Alertes</h2>
        <p>
          {isReadOnlyOwner
            ? "Vue synthétique des signaux utiles à suivre."
            : "Suivi des événements à traiter et des notifications système."}
        </p>
      </header>

      <section className="panel">
        <div className="alerts-header">
          <div className="alerts-header-copy">
            <h3>Alertes</h3>
            <p className="hint">
              {isReadOnlyOwner
                ? "Conservez uniquement les signaux importants et ouvrez directement la fiche concernée."
                : "Filtrez, lisez ou supprimez les alertes selon votre besoin."}
            </p>
          </div>
          <div className="alerts-header-actions">
            <div className="alerts-summary-strip">
              <article className="alerts-summary-pill">
                <strong>{unreadCount}</strong>
                <span>Non lues</span>
              </article>
              <article className="alerts-summary-pill">
                <strong>{items.length}</strong>
                <span>Alertes</span>
              </article>
            </div>
            <div className="actions-inline">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleReadAll()}
                disabled={isMarkingAll || unreadCount === 0}
              >
                Tout marquer comme lu
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => void handleDeleteSelection()}
                disabled={isDeletingSelection || selectedAlertIds.length === 0}
              >
                Supprimer la sélection
              </button>
            </div>
          </div>
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

          {!isReadOnlyOwner ? (
            <input
              type="text"
              placeholder="Type entité (ex: TRANSACTION)"
              value={filters.entityType}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  entityType: event.target.value
                }))
              }
            />
          ) : null}

          <button type="submit">Actualiser</button>
        </form>
      </section>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <h3>Liste</h3>
        {!isLoading && items.length > 0 ? (
          <label className="inline-checkbox">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) =>
                setSelectedAlertIds((prev) =>
                  event.target.checked
                    ? Array.from(new Set([...prev, ...items.map((item) => item.id)]))
                    : prev.filter((alertId) => !items.some((item) => item.id === alertId))
                )
              }
            />
            <span>Tout sélectionner</span>
          </label>
        ) : null}
        {!isLoading && items.length === 0 ? <p>Aucune alerte ne correspond à ces filtres.</p> : null}
        {!isLoading && items.length > 0 ? (
          <>
            <div className="alerts-list">
              {items.map((item) => {
                const isUnread = item.readAt === null;
                const isSelected = selectedAlertIds.includes(item.id);
                const contextLines = buildAlertContextLines(item);
                const previewLines = contextLines.slice(0, isReadOnlyOwner ? 1 : 2);
                const remainingLines = contextLines.slice(previewLines.length);
                const financeTarget = getFinanceTransactionNavigationTarget(
                  item.entityType,
                  item.entityId,
                  item.metadata
                );
                const taskTarget = getTaskNavigationTarget(
                  item.entityType,
                  item.entityId,
                  item.metadata
                );

                return (
                  <article
                    key={item.id}
                    className={`alert-card ${isUnread ? "is-unread" : ""}`}
                  >
                    <div className="alert-card-top">
                      <div className="alert-card-heading">
                        <div className="alert-card-badges">
                          <span className="alert-meta-pill">Alerte</span>
                          <span className={`alert-meta-pill alert-read-chip ${isUnread ? "is-unread" : "is-read"}`}>
                            {isUnread ? "Non lue" : "Lue"}
                          </span>
                          <span className="alert-meta-pill">{entityTypeLabel(item.entityType)}</span>
                        </div>
                        <p className="hint">{formatDateTime(item.createdAt)}</p>
                      </div>
                      <label className="inline-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(event) =>
                            setSelectedAlertIds((prev) =>
                              event.target.checked
                                ? [...prev, item.id].filter(
                                    (value, index, array) => array.indexOf(value) === index
                                  )
                                : prev.filter((alertId) => alertId !== item.id)
                            )
                          }
                        />
                          <span>Sélectionner</span>
                      </label>
                    </div>

                    <p className="alert-message">{item.message}</p>

                    <div className="alert-meta-row">
                      {item.entityId ? <span className="alert-meta-pill">Référence {item.entityId}</span> : null}
                      {taskTarget ? <span className="alert-meta-pill">Fiche tâche disponible</span> : null}
                      {financeTarget ? (
                        <span className="alert-meta-pill">
                          {financeTarget.kind === "salary" ? "Fiche salaire disponible" : "Fiche transaction disponible"}
                        </span>
                      ) : null}
                    </div>

                    {previewLines.length > 0 ? (
                      <p className="alert-context-preview">{previewLines.join(" | ")}</p>
                    ) : null}

                    {(remainingLines.length > 0 || item.entityType || item.entityId) ? (
                      <details className="alert-details">
                        <summary className="table-inline-summary">Voir le contexte</summary>
                        <div className="alert-meta">
                          {item.entityType || item.entityId ? (
                            <p>
                              <strong>Entité:</strong> {entityTypeLabel(item.entityType)} {item.entityId ?? ""}
                            </p>
                          ) : null}
                          {remainingLines.map((line) => (
                            <p key={`${item.id}-${line}`}>
                              <strong>Trace:</strong> {line}
                            </p>
                          ))}
                        </div>
                      </details>
                    ) : null}

                    <div className="actions-inline">
                      {taskTarget ? (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => navigate(buildTaskPath(taskTarget))}
                        >
                          Voir tâche
                        </button>
                      ) : null}
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
                      <button
                        type="button"
                        className="danger-btn"
                        onClick={() => void handleDelete(item.id)}
                        disabled={busyAlertId === item.id || isDeletingSelection || isMarkingAll}
                      >
                        Supprimer
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="list-pagination">
              <p className="hint list-pagination-meta">
                {items.length} alerte(s) chargée(s){hasMoreItems ? " sur plusieurs pages." : "."}
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

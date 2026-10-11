import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { PageGuide } from "../components/PageGuide";
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

function notifyAlertsChanged(change: { delta?: number; unreadCount?: number }): void {
  window.dispatchEvent(new CustomEvent("amcco-alerts-changed", { detail: change }));
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

function severityLabel(severity: AlertItem["severity"]): string {
  if (severity === "CRITICAL") {
    return "Critique";
  }
  if (severity === "WARNING") {
    return "Attention";
  }
  return "Info";
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
  const hasLoadedAlertsRef = useRef(false);
  const hasStartedAlertsLoadRef = useRef(false);
  const alertsLoadRequestRef = useRef(0);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [isDeletingSelection, setIsDeletingSelection] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedAlertIds, setSelectedAlertIds] = useState<string[]>([]);
  const [isAdvancedAlertFilterExpanded, setIsAdvancedAlertFilterExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
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
    const mobileViewport = window.matchMedia("(max-width: 640px)");
    const updateAdvancedFilter = (event: MediaQueryListEvent): void => {
      setIsAdvancedAlertFilterExpanded(!event.matches);
    };

    mobileViewport.addEventListener("change", updateAdvancedFilter);
    return () => mobileViewport.removeEventListener("change", updateAdvancedFilter);
  }, []);

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      entityType: isReadOnlyOwner ? "" : searchParams.get("entityType") ?? ""
    }));
  }, [isReadOnlyOwner, searchParams, setFilters]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean; silent?: boolean }) => {
    const requestId = ++alertsLoadRequestRef.current;
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    const silent = options?.silent === true;
    if (!activeCompany?.id) {
      setItems([]);
      setUnreadCount(0);
      setHasMoreItems(false);
      setIsLoadingMore(false);
      setIsLoading(false);
      return;
    }
    hasStartedAlertsLoadRef.current = true;
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoadingMore(false);
      if (!silent && !hasLoadedAlertsRef.current) setIsLoading(true);
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
      if (requestId !== alertsLoadRequestRef.current) return;

      setItems((prev) => (append ? [...prev, ...response.items] : response.items));
      setHasMoreItems(response.items.length === ALERTS_PAGE_SIZE);
      setUnreadCount(response.unreadCount);
      if (!append) {
        setSelectedAlertIds((prev) =>
          prev.filter((alertId) => response.items.some((item) => item.id === alertId))
        );
      }
    } catch (error) {
      if (requestId === alertsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === alertsLoadRequestRef.current) {
        if (append) {
          setIsLoadingMore(false);
        } else if (!silent) {
          hasLoadedAlertsRef.current = true;
          setIsLoading(false);
        }
      }
    }
  }, [activeCompany?.id, filters.entityType, filters.unreadOnly, isReadOnlyOwner, withAuthorizedToken]);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    setItems([]);
    setUnreadCount(0);
    setHasMoreItems(false);
    setSelectedAlertIds([]);
    hasLoadedAlertsRef.current = false;
    hasStartedAlertsLoadRef.current = false;
    setIsLoading(true);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  useEffect(() => {
    const delay = hasStartedAlertsLoadRef.current ? 250 : 0;
    const timeoutId = window.setTimeout(() => void loadData(), delay);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  async function handleRead(alertId: string): Promise<void> {
    setBusyAlertId(alertId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => markAlertReadRequest(accessToken, alertId));
      const wasUnread = items.some((item) => item.id === alertId && item.readAt === null);
      setItems((prev) =>
        filters.unreadOnly && wasUnread
          ? prev.filter((item) => item.id !== alertId)
          : prev.map((item) =>
              item.id === alertId ? { ...item, readAt: new Date().toISOString() } : item
            )
      );
      if (wasUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setSuccessMessage("Alerte marquée comme lue.");
      notifyAlertsChanged({ delta: wasUnread ? -1 : 0 });
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
      const readAt = new Date().toISOString();
      setItems((prev) =>
        filters.unreadOnly ? [] : prev.map((item) => ({ ...item, readAt: item.readAt ?? readAt }))
      );
      setUnreadCount(0);
      setSuccessMessage("Toutes les alertes ont été marquées comme lues.");
      notifyAlertsChanged({ unreadCount: 0 });
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
      const deletedAlert = items.find((item) => item.id === alertId);
      setItems((prev) => prev.filter((item) => item.id !== alertId));
      if (deletedAlert?.readAt === null) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      setSelectedAlertIds((prev) => prev.filter((item) => item !== alertId));
      setSuccessMessage("Alerte supprimée.");
      notifyAlertsChanged({ delta: deletedAlert?.readAt === null ? -1 : 0 });
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
      const selectedAlerts = items.filter((item) => selectedAlertIds.includes(item.id));
      await withAuthorizedToken((accessToken) =>
        deleteManyAlertsRequest(accessToken, selectedAlertIds)
      );
      setItems((prev) => prev.filter((item) => !selectedAlertIds.includes(item.id)));
      const deletedUnreadCount = selectedAlerts.filter((item) => item.readAt === null).length;
      if (deletedUnreadCount > 0) {
        setUnreadCount((prev) => Math.max(0, prev - deletedUnreadCount));
      }
      setSelectedAlertIds([]);
      setSuccessMessage("Alertes supprimées.");
      notifyAlertsChanged({ delta: -deletedUnreadCount });
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

  function handleResetFilters(): void {
    setFilters({
      unreadOnly: false,
      entityType: ""
    });
    setSelectedAlertIds([]);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("entityType");
      return next;
    });
  }

  const hasActiveAlertFilters =
    filters.unreadOnly || (!isReadOnlyOwner && filters.entityType.trim().length > 0);
  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedAlertIds.includes(item.id));
  return (
    <>
      <header
        className={`${isReadOnlyOwner ? "section-header owner-lite-header" : "section-header"} mobile-title-duplicate`}
      >
        <h2>Alertes</h2>
        <p>
          {isReadOnlyOwner
            ? "Vue synthétique des signaux utiles à suivre."
            : "Suivi des événements à traiter et des notifications système."}
        </p>
      </header>

      <PageGuide
        title="Guide des alertes"
        description="Les alertes servent à retrouver rapidement ce qui demande une lecture, une décision ou un contrôle."
        items={[
          {
            term: "Non lue",
            description: "Signal encore à examiner; il reste compté dans le compteur global."
          },
          {
            term: "Criticité",
            description: "Niveau d'attention à donner à l'événement: info, attention ou critique."
          },
          {
            term: "Entité",
            description: "Objet concerné par l'alerte: tâche, transaction, salaire ou message système."
          },
          {
            term: "Sélection",
            description: "Lot d'alertes préparé pour une action groupée, comme la suppression."
          }
        ]}
      />

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
              {unreadCount > 0 ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleReadAll()}
                  disabled={isMarkingAll}
                >
                  Tout marquer comme lu
                </button>
              ) : null}
              {selectedAlertIds.length > 0 ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void handleDeleteSelection()}
                  disabled={isDeletingSelection || isMarkingAll}
                >
                  Supprimer la sélection ({selectedAlertIds.length})
                </button>
              ) : null}
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
            <details
              className="alerts-advanced-filter"
              open={isAdvancedAlertFilterExpanded}
              onToggle={(event) => setIsAdvancedAlertFilterExpanded(event.currentTarget.open)}
            >
              <summary>Filtrer par type d'entité</summary>
              <input
                type="text"
                placeholder="Ex. transaction"
                value={filters.entityType}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    entityType: event.target.value
                  }))
                }
              />
            </details>
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
        <div className="alerts-list-header">
          <h3>Liste</h3>
          <p className="hint">
            {items.length} alerte(s) chargée(s)
            {selectedAlertIds.length > 0 ? ` | ${selectedAlertIds.length} sélectionnée(s)` : ""}
          </p>
        </div>
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
        {!isLoading && items.length === 0 ? (
          <EmptyState
            title={hasActiveAlertFilters ? "Aucune alerte filtrée" : "Aucune alerte"}
            description={
              hasActiveAlertFilters
                ? "Aucune alerte ne correspond aux filtres appliqués."
                : "Aucun signal à traiter pour le moment."
            }
            actionLabel={hasActiveAlertFilters ? "Réinitialiser les filtres" : undefined}
            onAction={hasActiveAlertFilters ? handleResetFilters : undefined}
          />
        ) : null}
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
                    className={`alert-card severity-${item.severity.toLowerCase()} ${
                      isUnread ? "is-unread" : ""
                    }`}
                  >
                    <div className="alert-card-top">
                      <div className="alert-card-heading">
                        <div className="alert-card-badges">
                          <span className={`alert-meta-pill alert-severity-chip severity-${item.severity.toLowerCase()}`}>
                            {severityLabel(item.severity)}
                          </span>
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

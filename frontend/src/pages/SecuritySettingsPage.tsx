import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, listAuditLogsRequest } from "../lib/api";
import type { AuditLogItem } from "../types/audit";
import {
  buildFinanceTransactionPath,
  formatMetadataForDisplay,
  getFinanceTraceLines,
  getFinanceTransactionNavigationTarget
} from "../utils/traceMetadata";

type AuditDisplayItem = AuditLogItem & {
  duplicateCount: number;
};

const auditActionLabels: Record<string, string> = {
  AUTH_LOGIN: "Connexion",
  AUTH_REFRESH: "Rafraichissement de session",
  AUTH_LOGOUT: "Deconnexion",
  COMPANY_CREATED: "Entreprise créée",
  COMPANY_UPDATED: "Entreprise modifiée",
  COMPANY_DELETED: "Entreprise supprimée",
  ADMIN_USER_CREATED: "Creation utilisateur",
  ADMIN_USER_UPDATED: "Mise à jour utilisateur",
  ADMIN_USER_ROLE_UPDATED: "Rôle utilisateur modifié",
  ADMIN_USER_ACTIVATED: "Utilisateur active",
  ADMIN_USER_DEACTIVATED: "Utilisateur désactivé",
  FINANCE_ACCOUNT_CREATED: "Compte financier créé",
  FINANCE_ACCOUNT_UPDATED: "Compte financier modifié",
  FINANCE_ACCOUNT_DELETED: "Compte financier supprime",
  FINANCE_SALARY_CREATED: "Salaire créé",
  FINANCE_SALARY_UPDATED: "Salaire modifié",
  FINANCE_SALARY_DELETED: "Salaire supprime",
  FINANCE_SALARY_SUBMITTED: "Salaire soumis a confirmation",
  FINANCE_SALARY_RECEIPT_CONFIRMED: "Reception salaire confirmee",
  FINANCE_SALARY_APPROVED: "Salaire approuvé",
  FINANCE_SALARY_REJECTED: "Salaire rejete",
  FINANCE_TRANSACTION_CREATED: "Transaction créée",
  FINANCE_TRANSACTION_UPDATED: "Transaction modifiée",
  FINANCE_TRANSACTION_DELETED: "Transaction supprimée",
  FINANCE_TRANSACTION_SUBMITTED: "Transaction soumise",
  FINANCE_TRANSACTION_APPROVED: "Transaction approuvée",
  FINANCE_TRANSACTION_REJECTED: "Transaction rejetée",
  TASK_CREATED: "Tâche créée",
  TASK_UPDATED: "Tâche modifiée",
  TASK_DELETED: "Tâche supprimée",
  TASK_ASSIGNED: "Tâche assignée",
  TASK_UNASSIGNED: "Tâche désassignée",
  TASK_STATUS_CHANGED: "Statut de tâche modifié",
  TASK_COMMENT_ADDED: "Commentaire ajoute",
  COMPANY_ACTIVITY_UPDATED: "Secteur mis à jour",
  COMPANY_ACTIVITY_RECLASSIFIED: "Donnees reclassees"
};

const entityTypeLabels: Record<string, string> = {
  SESSION: "Session",
  USER: "Utilisateur",
  TASK: "Tâche",
  TASK_COMMENT: "Commentaire",
  COMPANY: "Entreprise",
  TRANSACTION: "Transaction",
  SALARY: "Salaire",
  FINANCIAL_ACCOUNT: "Compte financier"
};

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Impossible de charger le journal d'audit.";
}

function toSentenceCase(raw: string): string {
  return raw
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function truncateText(value: string, limit = 140): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 3).trimEnd()}...`;
}

function summarizeUserAgent(userAgent: string): string {
  const normalized = userAgent.toLowerCase();

  if (normalized.includes("edg/")) {
    return "Microsoft Edge";
  }
  if (normalized.includes("chrome/")) {
    return "Google Chrome";
  }
  if (normalized.includes("firefox/")) {
    return "Mozilla Firefox";
  }
  if (normalized.includes("safari/") && !normalized.includes("chrome/")) {
    return "Safari";
  }

  return truncateText(userAgent, 48);
}

function formatAuditActionLabel(action: string): string {
  return auditActionLabels[action] ?? toSentenceCase(action);
}

function formatEntityTypeLabel(entityType: string): string {
  return entityTypeLabels[entityType] ?? toSentenceCase(entityType);
}

function buildMetadataSummary(action: string, metadata: unknown): string {
  const financeSummary = formatMetadataForDisplay(metadata);
  if (getFinanceTraceLines(metadata).length > 0) {
    return truncateText(financeSummary);
  }

  const root = asObject(metadata);
  if (action === "AUTH_LOGOUT") {
    return "Session fermee.";
  }

  if (!root) {
    return financeSummary !== "-" ? truncateText(financeSummary) : "-";
  }

  const ipAddress = asText(root.ipAddress);
  const userAgent = asText(root.userAgent);
  if (action === "AUTH_LOGIN" || action === "AUTH_REFRESH") {
    const parts = [];
    if (ipAddress) {
      parts.push(`IP: ${ipAddress}`);
    }
    if (userAgent) {
      parts.push(`Navigateur: ${summarizeUserAgent(userAgent)}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "Session utilisateur mise à jour.";
  }

  const previousStatus = asText(root.previousStatus);
  const nextStatus = asText(root.nextStatus);
  if (action === "TASK_STATUS_CHANGED" && (previousStatus || nextStatus)) {
    return `Statut: ${previousStatus ?? "-"} -> ${nextStatus ?? "-"}`;
  }

  if (action === "TASK_ASSIGNED" || action === "TASK_UNASSIGNED") {
    const note = asText(root.note);
    return note ? `Assignation mise à jour. Note: ${truncateText(note, 90)}` : "Assignation mise à jour.";
  }

  if (action === "TASK_UPDATED") {
    const nextTitle = asText(root.nextTitle);
    return nextTitle ? `Tâche mise à jour: ${truncateText(nextTitle, 90)}` : "Contenu de la tâche mis à jour.";
  }

  if (action === "TASK_DELETED") {
    const title = asText(root.title);
    return title ? `Tâche supprimée: ${truncateText(title, 90)}` : "Tâche supprimée.";
  }

  if (action === "TASK_COMMENT_ADDED") {
    const bodyPreview = asText(root.bodyPreview);
    return bodyPreview ? `Commentaire: ${truncateText(bodyPreview, 100)}` : "Commentaire ajoute.";
  }

  const compact = truncateText(financeSummary !== "-" ? financeSummary : JSON.stringify(metadata));
  return compact || "-";
}

function formatMetadataDetails(metadata: unknown): string | null {
  if (metadata == null) {
    return null;
  }

  if (typeof metadata === "string") {
    return metadata;
  }

  return JSON.stringify(metadata, null, 2);
}

function collapseAuditItems(items: AuditLogItem[]): AuditDisplayItem[] {
  const grouped = new Map<string, AuditDisplayItem>();

  for (const item of items) {
    const key = JSON.stringify([
      item.action,
      item.actorId,
      item.entityType,
      item.entityId,
      item.createdAt,
      item.metadata
    ]);
    const existing = grouped.get(key);
    if (existing) {
      existing.duplicateCount += 1;
      continue;
    }

    grouped.set(key, {
      ...item,
      duplicateCount: 1
    });
  }

  return Array.from(grouped.values());
}

export function SecuritySettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const { session, refreshSession, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState({
    action: "",
    actorId: "",
    entityType: searchParams.get("entityType") ?? "",
    entityId: searchParams.get("entityId") ?? "",
    limit: 50
  });

  useEffect(() => {
    setQuery((prev) => ({
      ...prev,
      entityType: searchParams.get("entityType") ?? "",
      entityId: searchParams.get("entityId") ?? ""
    }));
  }, [searchParams]);

  const canAccess = useMemo(() => user?.role === "OWNER" || user?.role === "SYS_ADMIN", [user?.role]);
  const displayItems = useMemo(() => collapseAuditItems(items), [items]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium"
      }),
    []
  );

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

  const loadAuditLogs = useCallback(async () => {
    if (!canAccess) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAuditLogsRequest(accessToken, {
          limit: query.limit,
          action: query.action.trim() || undefined,
          actorId: query.actorId.trim() || undefined,
          entityType: query.entityType.trim() || undefined,
          entityId: query.entityId.trim() || undefined
        })
      );
      setItems(response.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [
    canAccess,
    query.action,
    query.actorId,
    query.entityId,
    query.entityType,
    query.limit,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (query.entityType.trim()) {
        next.set("entityType", query.entityType.trim());
      } else {
        next.delete("entityType");
      }
      if (query.entityId.trim()) {
        next.set("entityId", query.entityId.trim());
      } else {
        next.delete("entityId");
      }
      return next;
    });
    await loadAuditLogs();
  }

  if (!canAccess) {
    return (
      <section className="panel">
        <h2>Securite et acces</h2>
        <p>Votre rôle ne permet pas d'accéder au journal d'audit.</p>
      </section>
    );
  }

  return (
    <>
      <header className="section-header">
        <h2>Securite et acces</h2>
        <p>Journal d'audit des actions sensibles sur l'entreprise.</p>
      </header>

      <section className="panel">
        <h3>Filtres</h3>
        <form className="audit-filter-form" onSubmit={handleFilterSubmit}>
          <input
            type="text"
            placeholder="Action (ex: creation utilisateur)"
            value={query.action}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                action: event.target.value
              }))
            }
          />
          <input
            type="text"
            placeholder="Identifiant acteur"
            value={query.actorId}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                actorId: event.target.value
              }))
            }
          />
          <input
            type="text"
            placeholder="Type d'entite"
            value={query.entityType}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                entityType: event.target.value
              }))
            }
          />
          <input
            type="text"
            placeholder="Identifiant entite"
            value={query.entityId}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                entityId: event.target.value
              }))
            }
          />
          <select
            value={query.limit}
            onChange={(event) =>
              setQuery((prev) => ({
                ...prev,
                limit: Number(event.target.value)
              }))
            }
          >
            <option value={25}>25 lignes</option>
            <option value={50}>50 lignes</option>
            <option value={100}>100 lignes</option>
          </select>
          <button type="submit">Filtrer</button>
        </form>
      </section>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}

      <section className="panel">
        <h3>Historique recent</h3>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && displayItems.length === 0 ? <p>Aucune entree pour ces filtres.</p> : null}
        {!isLoading && displayItems.length > 0 ? (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Acteur</th>
                  <th>Entite</th>
                  <th>Details</th>
                  <th>Navigation</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const financeTarget = getFinanceTransactionNavigationTarget(
                    item.entityType,
                    item.entityId,
                    item.metadata
                  );
                  const metadataSummary = buildMetadataSummary(item.action, item.metadata);
                  const metadataDetails = formatMetadataDetails(item.metadata);

                  return (
                    <tr key={item.id}>
                      <td>{dateFormatter.format(new Date(item.createdAt))}</td>
                      <td>
                        <div className="audit-cell-stack">
                          <strong>{formatAuditActionLabel(item.action)}</strong>
                          <small>{item.action}</small>
                          {item.duplicateCount > 1 ? (
                            <span className="audit-duplicate-badge">x{item.duplicateCount}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div className="audit-cell-stack">
                          <strong>{item.actorFullName}</strong>
                          <small>{item.actorEmail}</small>
                        </div>
                      </td>
                      <td>
                        <div className="audit-cell-stack">
                          <strong>{formatEntityTypeLabel(item.entityType)}</strong>
                          <small>{item.entityId}</small>
                        </div>
                      </td>
                      <td className="audit-metadata-cell">
                        <div className="audit-cell-stack">
                          <span>{metadataSummary}</span>
                          {metadataDetails && metadataDetails !== metadataSummary ? (
                            <details className="audit-metadata-details">
                              <summary>Voir les details</summary>
                              <pre>{metadataDetails}</pre>
                            </details>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {financeTarget ? (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => navigate(buildFinanceTransactionPath(financeTarget))}
                          >
                            {financeTarget.kind === "salary" ? "Voir le salaire" : "Voir la transaction"}
                          </button>
                        ) : (
                          <span className="hint">-</span>
                        )}
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

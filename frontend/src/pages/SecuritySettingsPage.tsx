import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { ApiError, changeOwnPasswordRequest, listAuditLogsRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { AuditLogItem } from "../types/audit";
import {
  buildTaskPath,
  buildFinanceTransactionPath,
  formatMetadataForDisplay,
  getFinanceTraceLines,
  getFinanceTransactionNavigationTarget,
  getTaskNavigationTarget,
  getTaskTraceLines
} from "../utils/traceMetadata";

type AuditDisplayItem = AuditLogItem & {
  duplicateCount: number;
};

const AUDIT_PAGE_SIZE_DEFAULT = 50;

const auditActionLabels: Record<string, string> = {
  AUTH_LOGIN: "Connexion",
  AUTH_REFRESH: "Rafraîchissement de session",
  AUTH_LOGOUT: "Déconnexion",
  COMPANY_CREATED: "Entreprise créée",
  COMPANY_UPDATED: "Entreprise modifiée",
  COMPANY_DELETED: "Entreprise supprimée",
  ADMIN_USER_CREATED: "Création utilisateur",
  ADMIN_USER_UPDATED: "Mise à jour utilisateur",
  ADMIN_USER_ROLE_UPDATED: "Rôle utilisateur modifié",
  ADMIN_USER_ACTIVATED: "Utilisateur activé",
  ADMIN_USER_DEACTIVATED: "Utilisateur désactivé",
  FINANCE_ACCOUNT_CREATED: "Compte financier créé",
  FINANCE_ACCOUNT_UPDATED: "Compte financier modifié",
  FINANCE_ACCOUNT_DELETED: "Compte financier supprimé",
  FINANCE_SALARY_CREATED: "Salaire créé",
  FINANCE_SALARY_UPDATED: "Salaire modifié",
  FINANCE_SALARY_DELETED: "Salaire supprimé",
  FINANCE_SALARY_SUBMITTED: "Salaire soumis à confirmation",
  FINANCE_SALARY_RECEIPT_CONFIRMED: "Réception salaire confirmée",
  FINANCE_SALARY_APPROVED: "Salaire approuvé",
  FINANCE_SALARY_REJECTED: "Salaire rejeté",
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
  TASK_COMMENT_ADDED: "Commentaire ajouté",
  COMPANY_ACTIVITY_UPDATED: "Secteur mis à jour",
  COMPANY_ACTIVITY_RECLASSIFIED: "Données reclassées"
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

function formatAuditIpAddress(ipAddress: string): string {
  const normalized = ipAddress.trim().toLowerCase();

  if (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "localhost"
  ) {
    return "Localhost";
  }

  return ipAddress.trim();
}

function formatAuditActionLabel(action: string): string {
  return auditActionLabels[action] ?? toSentenceCase(action);
}

function formatEntityTypeLabel(entityType: string): string {
  return entityTypeLabels[entityType] ?? toSentenceCase(entityType);
}

function toAdminMetadataLabel(key: string): string | null {
  const labels: Record<string, string> = {
    userId: "Utilisateur",
    targetUserId: "Utilisateur cible",
    email: "Email",
    targetEmail: "Email cible",
    fullName: "Nom",
    targetFullName: "Nom cible",
    role: "Role",
    previousRole: "Role precedent",
    nextRole: "Nouveau role",
    isActive: "Actif",
    name: "Nom",
    code: "Code",
    registrationNumber: "Immatriculation",
    businessSector: "Secteur entreprise",
    contactFullName: "Contact",
    contactJobTitle: "Fonction contact",
    fromCompanyId: "Entreprise source",
    toCompanyId: "Entreprise cible",
    activityLabel: "Secteur",
    activityCode: "Code secteur",
    scopeLabel: "Portee",
    accountRef: "Reference compte",
    decision: "Decision",
    payPeriod: "Periode",
    status: "Statut"
  };

  return labels[key] ?? null;
}

function buildAdminMetadataLines(metadata: unknown): string[] {
  const root = asObject(metadata);
  if (!root) {
    return [];
  }

  const hasActivityLabel =
    typeof root.activityLabel === "string" && root.activityLabel.trim().length > 0;
  const lines: string[] = [];
  for (const [key, rawValue] of Object.entries(root)) {
    if (
      key === "ipAddress" ||
      key === "userAgent" ||
      key === "account" ||
      key === "reviewer" ||
      key === "salary" ||
      key === "salaryConfirmation" ||
      key === "note" ||
      key === "bodyPreview" ||
      key === "title" ||
      key === "nextTitle" ||
      key === "previousStatus" ||
      key === "nextStatus"
    ) {
      continue;
    }

    const label = toAdminMetadataLabel(key);
    if (!label) {
      continue;
    }

    if (key === "activityCode" && hasActivityLabel) {
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      lines.push(`${label}: ${rawValue.trim()}`);
      continue;
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      lines.push(`${label}: ${String(rawValue)}`);
    }
  }

  return lines;
}

function buildMetadataSummary(action: string, metadata: unknown, isSystemAdmin: boolean): string {
  const taskLines = getTaskTraceLines(action, metadata);
  if (taskLines.length > 0) {
    return truncateText(taskLines.join(" | "));
  }

  const financeSummary = formatMetadataForDisplay(metadata);
  if (getFinanceTraceLines(metadata).length > 0) {
    return truncateText(financeSummary);
  }

  const root = asObject(metadata);
  if (action === "AUTH_LOGOUT") {
    return "Session fermée.";
  }

  if (!root) {
    return financeSummary !== "-" ? truncateText(financeSummary) : "-";
  }

  const ipAddress = asText(root.ipAddress);
  const userAgent = asText(root.userAgent);
  if (action === "AUTH_LOGIN" || action === "AUTH_REFRESH") {
    const parts = [];
    if (ipAddress) {
      parts.push(`IP: ${formatAuditIpAddress(ipAddress)}`);
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
    return bodyPreview ? `Commentaire: ${truncateText(bodyPreview, 100)}` : "Commentaire ajouté.";
  }

  const adminLines = buildAdminMetadataLines(metadata);
  if (isSystemAdmin && adminLines.length > 0) {
    return truncateText(adminLines.slice(0, 2).join(" | "), 180);
  }

  const compact = truncateText(financeSummary !== "-" ? financeSummary : JSON.stringify(metadata));
  return compact || "-";
}

function buildMetadataHighlights(action: string, metadata: unknown, isSystemAdmin: boolean): string[] {
  const taskLines = getTaskTraceLines(action, metadata);
  if (taskLines.length > 0) {
    return taskLines.slice(0, isSystemAdmin ? 5 : 3);
  }

  const financeLines = getFinanceTraceLines(metadata);
  if (financeLines.length > 0) {
    return financeLines.slice(0, isSystemAdmin ? 5 : 3);
  }

  const root = asObject(metadata);
  if (!root) {
    return [];
  }

  if (action === "AUTH_LOGIN" || action === "AUTH_REFRESH" || action === "AUTH_LOGOUT") {
    return [];
  }

  if (isSystemAdmin) {
    const adminLines = buildAdminMetadataLines(metadata);
    if (adminLines.length > 0) {
      return adminLines.slice(0, 6);
    }
  }

  const lines: string[] = [];
  const ipAddress = asText(root.ipAddress);
  const userAgent = asText(root.userAgent);
  if (ipAddress) {
    lines.push(`IP: ${formatAuditIpAddress(ipAddress)}`);
  }
  if (userAgent) {
    lines.push(`Navigateur: ${summarizeUserAgent(userAgent)}`);
  }
  return lines.slice(0, 3);
}

function splitAuditLine(line: string): { label: string | null; value: string } {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return { label: null, value: line.trim() };
  }

  return {
    label: line.slice(0, separatorIndex).trim(),
    value: line.slice(separatorIndex + 1).trim()
  };
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
  const { logout, user } = useAuth();
  const isReadOnlyOwner = user?.role === "OWNER";
  const isSystemAdmin = user?.role === "SYS_ADMIN";
  const withAuthorizedToken = useAuthorizedRequest();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [query, setQuery] = useState({
    action: "",
    actorId: "",
    entityType: searchParams.get("entityType") ?? "",
    entityId: searchParams.get("entityId") ?? "",
    limit: AUDIT_PAGE_SIZE_DEFAULT
  });

  useEffect(() => {
    setQuery((prev) => ({
      ...prev,
      entityType: searchParams.get("entityType") ?? "",
      entityId: searchParams.get("entityId") ?? ""
    }));
  }, [searchParams]);

  const canAccess = useMemo(() => user?.role === "SYS_ADMIN", [user?.role]);
  const displayItems = useMemo(() => collapseAuditItems(items), [items]);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium"
      }),
    []
  );

  const loadAuditLogs = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    if (!canAccess) {
      setIsLoading(false);
      return;
    }

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listAuditLogsRequest(accessToken, {
          limit: query.limit,
          offset,
          action: query.action.trim() || undefined,
          actorId: query.actorId.trim() || undefined,
          entityType: query.entityType.trim() || undefined,
          entityId: query.entityId.trim() || undefined
        })
      );
      setItems((prev) => (append ? [...prev, ...response.items] : response.items));
      setHasMoreItems(response.items.length === query.limit);
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

  async function handleLoadMore(): Promise<void> {
    if (isLoading || isLoadingMore || !hasMoreItems) {
      return;
    }
    await loadAuditLogs({
      offset: items.length,
      append: true
    });
  }

  function applyQuickFilter(next: Partial<typeof query>): void {
    setQuery((prev) => ({
      ...prev,
      ...next
    }));
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordErrorMessage(null);
    setPasswordSuccessMessage(null);

    if (passwordForm.newPassword.length < 8) {
      setPasswordErrorMessage("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErrorMessage("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }

    setIsChangingPassword(true);
    try {
      await withAuthorizedToken((accessToken) =>
        changeOwnPasswordRequest(accessToken, {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      );
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordSuccessMessage("Mot de passe mis à jour.");
    } catch (error) {
      setPasswordErrorMessage(
        error instanceof ApiError ? error.message : "Impossible de modifier le mot de passe."
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <header className="section-header">
        <h2>Sécurité et accès</h2>
      </header>

      <section className="panel security-personal-panel">
        <h3>Sécurité personnelle</h3>
        <p className="hint">
          {isReadOnlyOwner
            ? "Compte proprietaire en lecture seule."
            : "Gérez votre mot de passe et votre session active."}
        </p>
        <FeedbackBanner
          errorMessage={passwordErrorMessage}
          successMessage={passwordSuccessMessage}
          isLoading={isChangingPassword}
        />
        {!isReadOnlyOwner ? (
        <form className="admin-form security-password-form" onSubmit={handlePasswordSubmit}>
          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={passwordForm.currentPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                currentPassword: event.target.value
              }))
            }
            autoComplete="current-password"
            required
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                newPassword: event.target.value
              }))
            }
            autoComplete="new-password"
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={passwordForm.confirmPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                confirmPassword: event.target.value
              }))
            }
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button type="submit" disabled={isChangingPassword}>
            {isChangingPassword ? "Mise à jour..." : "Modifier le mot de passe"}
          </button>
        </form>
        ) : null}
        <div className="security-session-actions">
          <button className="secondary-btn" type="button" onClick={() => void handleLogout()}>
            Se déconnecter
          </button>
        </div>
      </section>

      {canAccess ? (
      <section className="panel">
        <h3>Filtres</h3>
        <div className="security-quick-filters">
          <button
            type="button"
            className={!query.action && !query.entityType ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => applyQuickFilter({ action: "", entityType: "", entityId: "" })}
          >
            Vue complète
          </button>
          <button
            type="button"
            className={query.action === "AUTH_LOGIN" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => applyQuickFilter({ action: "AUTH_LOGIN", entityType: "", entityId: "" })}
          >
            Connexions
          </button>
          <button
            type="button"
            className={query.entityType === "TASK" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => applyQuickFilter({ action: "", entityType: "TASK", entityId: "" })}
          >
            Tâches
          </button>
          <button
            type="button"
            className={query.entityType === "TRANSACTION" ? "view-preset-btn is-active" : "view-preset-btn"}
            onClick={() => applyQuickFilter({ action: "", entityType: "TRANSACTION", entityId: "" })}
          >
            Transactions
          </button>
        </div>
        <form className="audit-filter-form" onSubmit={handleFilterSubmit}>
          <input
            type="text"
            placeholder="Action (ex: création utilisateur)"
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
            placeholder="Type d'entité"
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
            placeholder="Identifiant entité"
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
      ) : null}

      {canAccess ? <FeedbackBanner errorMessage={errorMessage} isLoading={isLoading} /> : null}

      {canAccess ? (
      <section className="panel">
        <h3>Historique récent</h3>
        {!isLoading && displayItems.length === 0 ? <p>Aucune entrée pour ces filtres.</p> : null}
        {!isLoading && displayItems.length > 0 ? (
          <>
          <div className="table-wrap">
            <table className="admin-table audit-history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Acteur</th>
                  <th>Entité</th>
                  <th>Details</th>
                  <th>Navigation</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item) => {
                  const taskTarget = getTaskNavigationTarget(
                    item.entityType,
                    item.entityId,
                    item.metadata
                  );
                  const financeTarget = getFinanceTransactionNavigationTarget(
                    item.entityType,
                    item.entityId,
                    item.metadata
                  );
                  const metadataSummary = buildMetadataSummary(
                    item.action,
                    item.metadata,
                    isSystemAdmin
                  );
                  const metadataHighlights = buildMetadataHighlights(
                    item.action,
                    item.metadata,
                    isSystemAdmin
                  );

                  return (
                    <tr key={item.id}>
                      <td className="audit-date-cell">
                        <span className="audit-date-text">
                          {dateFormatter.format(new Date(item.createdAt))}
                        </span>
                      </td>
                      <td className="audit-action-cell">
                        <div className="audit-cell-stack">
                          <strong className="audit-primary-text audit-action-title">
                            {formatAuditActionLabel(item.action)}
                          </strong>
                          {item.duplicateCount > 1 ? (
                            <span className="audit-duplicate-badge">x{item.duplicateCount}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="audit-actor-cell">
                        <div className="audit-cell-stack audit-actor-stack">
                          <strong className="audit-primary-text audit-actor-name">
                            {item.actorFullName || "Utilisateur inconnu"}
                          </strong>
                          <small className="audit-secondary-text">{item.actorEmail}</small>
                        </div>
                      </td>
                      <td>
                        <div className="audit-cell-stack">
                          <strong className="audit-entity-badge">
                            {formatEntityTypeLabel(item.entityType)}
                          </strong>
                          <small className="audit-secondary-text audit-entity-id">
                            {item.entityId}
                          </small>
                        </div>
                      </td>
                      <td className="audit-metadata-cell">
                        <div className="audit-cell-stack">
                          <span className="audit-summary-text">{metadataSummary}</span>
                          {metadataHighlights.length > 0 ? (
                            <div className="audit-highlight-lines">
                              {metadataHighlights.map((line) => {
                                const { label, value } = splitAuditLine(line);

                                return (
                                  <div key={`${item.id}-${line}`} className="audit-highlight-row">
                                    {label ? (
                                      <strong className="audit-highlight-label">{label}:</strong>
                                    ) : null}
                                    <span className="audit-highlight-value">{value}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {taskTarget ? (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => navigate(buildTaskPath(taskTarget))}
                          >
                            Voir tâche
                          </button>
                        ) : financeTarget ? (
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
          <div className="list-pagination">
            <p className="hint list-pagination-meta">
              {items.length} entree(s) chargee(s){hasMoreItems ? " sur plusieurs pages." : "."}
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
      ) : null}
    </>
  );
}

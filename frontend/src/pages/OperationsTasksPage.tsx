import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { matchesQuickSearch } from "../lib/quickSearch";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  ApiError,
  assignOperationsTaskRequest,
  assignOperationsTasksBulkRequest,
  createOperationsTaskRequest,
  deleteOperationsTaskRequest,
  listOperationsMembersRequest,
  listOperationsTasksRequest,
  updateOperationsTaskRequest,
  updateOperationsTaskStatusRequest
} from "../lib/api";
import {
  getBusinessActivityLabel,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { ActivityFieldDefinition } from "../types/activities";
import type { OperationTask, OperationTaskMember, TaskScope, TaskStatus } from "../types/tasks";

const TASKS_PAGE_SIZE = 200;

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

function statusLabel(status: TaskStatus): string {
  if (status === "TODO") {
    return "À faire";
  }
  if (status === "IN_PROGRESS") {
    return "En cours";
  }
  if (status === "DONE") {
    return "Terminée";
  }
  return "Bloquée";
}

function statusToneClass(status: TaskStatus): string {
  if (status === "TODO") {
    return "todo";
  }
  if (status === "IN_PROGRESS") {
    return "in-progress";
  }
  if (status === "DONE") {
    return "done";
  }
  return "blocked";
}

function statusShortMetric(status: TaskStatus): string {
  if (status === "TODO") {
    return "À lancer";
  }
  if (status === "IN_PROGRESS") {
    return "En exécution";
  }
  if (status === "DONE") {
    return "Clôturées";
  }
  return "À débloquer";
}

function memberLabel(member: OperationTaskMember): string {
  return `${member.fullName} (${member.role})`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, previous[field.key] ?? ""]));
}

function formatMetadataSummary(
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): string {
  const items = fields
    .map((field) => {
      const value = metadata[field.key]?.trim();
      return value ? `${field.label}: ${value}` : null;
    })
    .filter((value): value is string => value !== null);

  if (items.length > 0) {
    return items.join(" | ");
  }

  const fallbackItems = Object.entries(metadata)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${value}`);
  return fallbackItems.length > 0 ? fallbackItems.join(" | ") : "-";
}

function createDefaultTaskForm(): {
  title: string;
  description: string;
  dueDate: string;
  assignedToId: string;
  metadata: Record<string, string>;
} {
  return {
    title: "",
    description: "",
    dueDate: "",
    assignedToId: "",
    metadata: {}
  };
}

export function OperationsTasksPage(): JSX.Element {
  const navigate = useNavigate();
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const {
    isLoading: isLoadingActivities,
    selectedActivity,
    selectedActivityCode,
    selectedProfile
  } = useBusinessActivity();
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [members, setMembers] = useState<OperationTaskMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const tasksViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("operations-tasks", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const tasksSearchStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("operations-tasks-search", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialFilters = useMemo(
    () => ({
      status: "ALL" as "ALL" | TaskStatus,
      scope: "ALL" as TaskScope,
      unassignedOnly: false
    }),
    []
  );
  const [filters, setFilters] = usePersistedViewState(tasksViewStorageKey, initialFilters);
  const [searchQuery, setSearchQuery] = usePersistedViewState(tasksSearchStorageKey, "");

  const [createForm, setCreateForm] = useState(createDefaultTaskForm);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({});
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [bulkAssignForm, setBulkAssignForm] = useState({
    assignedToId: "",
    note: ""
  });
  const [taskPendingDelete, setTaskPendingDelete] = useState<OperationTask | null>(null);

  const canAssignTasks = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);
  const canCreateTasks = useMemo(() => {
    return Boolean(user);
  }, [user]);

  const taskMetadataFields = selectedProfile?.tasks.metadataFields ?? [];
  const displayTasks = useMemo(() => {
    return tasks.filter((task) =>
      matchesQuickSearch(searchQuery, [
        task.title,
        task.description,
        task.createdByEmail,
        task.createdByFullName,
        task.assignedToEmail,
        task.assignedToFullName,
        task.activityCode ? getBusinessActivityLabel(task.activityCode) : "",
        ...Object.values(task.metadata)
      ])
    );
  }, [searchQuery, tasks]);

  const statusSummary = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      BLOCKED: 0
    };

    for (const task of displayTasks) {
      counts[task.status] += 1;
    }

    return counts;
  }, [displayTasks]);

  const statusCards = useMemo(
    () =>
      (["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as TaskStatus[]).map((status) => ({
        status,
        label: statusLabel(status),
        metricLabel: statusShortMetric(status),
        total: statusSummary[status],
        isActiveFilter: filters.status === status
      })),
    [filters.status, statusSummary]
  );

  const selectedTaskIds = useMemo(() => {
    return displayTasks.filter((task) => selectedTasks[task.id]).map((task) => task.id);
  }, [displayTasks, selectedTasks]);
  const selectedTotalCount = useMemo(() => {
    return Object.values(selectedTasks).filter((isSelected) => isSelected === true).length;
  }, [selectedTasks]);

  const allVisibleSelected = useMemo(() => {
    if (displayTasks.length === 0) {
      return false;
    }
    return displayTasks.every((task) => selectedTasks[task.id]);
  }, [displayTasks, selectedTasks]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    if (!selectedActivityCode) {
      setTasks([]);
      setMembers([]);
      setHasMoreTasks(false);
      setIsLoading(false);
      return;
    }

    if (append) {
      setIsLoadingMoreTasks(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const query = {
        limit: TASKS_PAGE_SIZE,
        offset,
        status: filters.status === "ALL" ? undefined : filters.status,
        activityCode: selectedActivityCode,
        scope: canAssignTasks ? filters.scope : ("ASSIGNED_TO_ME" as TaskScope),
        unassignedOnly: canAssignTasks ? filters.unassignedOnly : undefined
      };

      const taskResponse = await withAuthorizedToken((accessToken) =>
        listOperationsTasksRequest(accessToken, query)
      );
      setHasMoreTasks(taskResponse.items.length === TASKS_PAGE_SIZE);
      setTasks((prev) => {
        if (!append) {
          return taskResponse.items;
        }
        const seen = new Set(prev.map((task) => task.id));
        return [...prev, ...taskResponse.items.filter((task) => !seen.has(task.id))];
      });
      setAssignments((prev) => {
        const next = append ? { ...prev } : {};
        for (const task of taskResponse.items) {
          next[task.id] = prev[task.id] ?? task.assignedToId ?? "";
        }
        return next;
      });
      setSelectedTasks((prev) => {
        const next = { ...prev };
        for (const task of taskResponse.items) {
          if (next[task.id] === undefined) {
            next[task.id] = false;
          }
        }
        return next;
      });
      setAssignmentNotes((prev) => {
        const next = append ? { ...prev } : {};
        for (const task of taskResponse.items) {
          next[task.id] = prev[task.id] ?? "";
        }
        return next;
      });

      if (!append && canAssignTasks) {
        const membersResponse = await withAuthorizedToken((accessToken) =>
          listOperationsMembersRequest(accessToken, {
            activityCode: selectedActivityCode
          })
        );
        setMembers(membersResponse.items);
      } else {
        setMembers([]);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMoreTasks(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [
    canAssignTasks,
    filters.scope,
    filters.status,
    filters.unassignedOnly,
    selectedActivityCode,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleLoadMoreTasks(): Promise<void> {
    if (isLoading || isLoadingMoreTasks || !hasMoreTasks) {
      return;
    }
    await loadData({
      offset: tasks.length,
      append: true
    });
  }

  useEffect(() => {
    setCreateForm((prev) => ({
      ...prev,
      metadata: syncMetadataState(prev.metadata, taskMetadataFields)
    }));
  }, [taskMetadataFields]);

  async function handleCreateTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canCreateTasks || !selectedActivityCode) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        editingTaskId
          ? updateOperationsTaskRequest(accessToken, editingTaskId, {
              title: createForm.title.trim(),
              description: createForm.description.trim() || undefined,
              metadata: createForm.metadata,
              dueDate: createForm.dueDate
                ? new Date(createForm.dueDate).toISOString()
                : undefined
            })
          : createOperationsTaskRequest(accessToken, {
              title: createForm.title.trim(),
              description: createForm.description.trim() || undefined,
              activityCode: selectedActivityCode as BusinessActivityCode,
              assignedToId: canAssignTasks ? createForm.assignedToId || undefined : undefined,
              metadata: createForm.metadata,
              dueDate: createForm.dueDate
                ? new Date(createForm.dueDate).toISOString()
                : undefined
            })
      );
      setEditingTaskId(null);
      setCreateForm({
        ...createDefaultTaskForm(),
        metadata: syncMetadataState({}, taskMetadataFields)
      });
      setSuccessMessage(editingTaskId ? "Tâche modifiée." : "Tâche créée.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function getTaskEditLockMessage(task: OperationTask): string | null {
    if (task.status === "DONE") {
      return "Une tâche terminée ne peut plus être modifiée.";
    }
    if (canAssignTasks) {
      return null;
    }
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez modifier que les tâches que vous avez créées.";
    }
    return null;
  }

  function getTaskDeleteLockMessage(task: OperationTask): string | null {
    if (task.status === "DONE") {
      return "Une tâche terminée ne peut plus être supprimée.";
    }
    if (canAssignTasks) {
      return null;
    }
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez supprimer que les tâches que vous avez créées.";
    }
    return null;
  }

  function handleStartEditTask(task: OperationTask): void {
    const lockMessage = getTaskEditLockMessage(task);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    setEditingTaskId(task.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreateForm({
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "",
      assignedToId: task.assignedToId ?? "",
      metadata: syncMetadataState(task.metadata, taskMetadataFields)
    });
  }

  function handleCancelEditTask(): void {
    setEditingTaskId(null);
    setCreateForm({
      ...createDefaultTaskForm(),
      metadata: syncMetadataState({}, taskMetadataFields)
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  function handleDeleteTask(task: OperationTask): void {
    const lockMessage = getTaskDeleteLockMessage(task);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    setTaskPendingDelete(task);
  }

  async function handleConfirmDeleteTask(): Promise<void> {
    if (!taskPendingDelete) {
      return;
    }

    const task = taskPendingDelete;
    setBusyTaskId(task.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteOperationsTaskRequest(accessToken, task.id));
      if (editingTaskId === task.id) {
        handleCancelEditTask();
      }
      setSuccessMessage("Tâche supprimée.");
      setTaskPendingDelete(null);
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleSaveAssignment(taskId: string): Promise<void> {
    if (!canAssignTasks) {
      return;
    }
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    const selected = assignments[taskId] ?? "";
    const selectedOrNull = selected || null;
    if (task.assignedToId === selectedOrNull) {
      return;
    }

    setBusyTaskId(taskId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        assignOperationsTaskRequest(
          accessToken,
          taskId,
          selectedOrNull,
          assignmentNotes[taskId]?.trim() || undefined
        )
      );
      setSuccessMessage("Assignation mise à jour.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleBulkAssign(): Promise<void> {
    if (!canAssignTasks || selectedTaskIds.length === 0) {
      return;
    }
    setIsBulkAssigning(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        assignOperationsTasksBulkRequest(accessToken, {
          taskIds: selectedTaskIds,
          assignedToId: bulkAssignForm.assignedToId || null,
          note: bulkAssignForm.note.trim() || undefined
        })
      );
      setSuccessMessage(`${response.items.length} tâche(s) mises à jour en lot.`);
      setSelectedTasks({});
      setBulkAssignForm({
        assignedToId: "",
        note: ""
      });
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBulkAssigning(false);
    }
  }

  async function handleChangeStatus(taskId: string, status: TaskStatus): Promise<void> {
    setBusyTaskId(taskId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        updateOperationsTaskStatusRequest(accessToken, taskId, status)
      );
      setSuccessMessage("Statut mis a jour.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  }

  function canUpdateTask(task: OperationTask): boolean {
    if (canAssignTasks) {
      return true;
    }
    return task.assignedToId === user?.id;
  }

  function openTaskDetails(taskId: string): void {
    navigate(`/operations/tasks/${taskId}`);
  }

  function preventCardNavigation(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  function preventCardKeyboardNavigation(event: KeyboardEvent<HTMLElement>): void {
    event.stopPropagation();
  }

  function onTaskCardKeyDown(event: KeyboardEvent<HTMLElement>, taskId: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTaskDetails(taskId);
    }
  }

  return (
    <>
      <header className="section-header">
        <h2>Suivi des tâches</h2>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activité dans
          l'administration.
        </p>
      ) : null}

      <section className="panel">
        <h3>Filtres</h3>
        <form
          className="operations-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
          <div className="view-preset-strip">
            <button
              type="button"
              className={
                filters.status === "ALL" &&
                (canAssignTasks ? filters.scope === "ALL" : true) &&
                !filters.unassignedOnly
                  ? "view-preset-btn is-active"
                  : "view-preset-btn"
              }
              onClick={() =>
                setFilters({
                  status: "ALL",
                  scope: canAssignTasks ? "ALL" : "ASSIGNED_TO_ME",
                  unassignedOnly: false
                })
              }
            >
              Vue complete
            </button>
            <button
              type="button"
              className={
                filters.status === "ALL" && filters.scope === "ASSIGNED_TO_ME" && !filters.unassignedOnly
                  ? "view-preset-btn is-active"
                  : "view-preset-btn"
              }
              onClick={() =>
                setFilters({
                  status: "ALL",
                  scope: "ASSIGNED_TO_ME",
                  unassignedOnly: false
                })
              }
            >
              Mes taches
            </button>
            <button
              type="button"
              className={filters.status === "BLOCKED" ? "view-preset-btn is-active" : "view-preset-btn"}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  status: "BLOCKED",
                  unassignedOnly: false
                }))
              }
            >
              Bloquees
            </button>
            {canAssignTasks ? (
              <button
                type="button"
                className={filters.unassignedOnly ? "view-preset-btn is-active" : "view-preset-btn"}
                onClick={() =>
                  setFilters({
                    status: "ALL",
                    scope: "ALL",
                    unassignedOnly: true
                  })
                }
              >
                Non assignees
              </button>
            ) : null}
          </div>
          <input
            type="search"
            className="quick-search-input"
            placeholder="Recherche rapide: tache, responsable, createur..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />

          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                status: event.target.value as "ALL" | TaskStatus
              }))
            }
          >
            <option value="ALL">Tous les statuts</option>
            <option value="TODO">À faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="DONE">Terminée</option>
            <option value="BLOCKED">Bloquée</option>
          </select>

          {canAssignTasks ? (
            <select
              value={filters.scope}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  scope: event.target.value as TaskScope
                }))
              }
            >
              <option value="ALL">Toutes les tâches</option>
              <option value="MINE">Mes tâches (créées + assignées)</option>
              <option value="ASSIGNED_TO_ME">Assignées à moi</option>
              <option value="CREATED_BY_ME">Creees par moi</option>
            </select>
          ) : (
            <></>
          )}

          {canAssignTasks ? (
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={filters.unassignedOnly}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    unassignedOnly: event.target.checked
                  }))
                }
              />
              <span>Non assignées uniquement</span>
            </label>
          ) : null}

          <button type="submit">Filtrer</button>
        </form>
      </section>

      <section className="panel operations-status-panel">
        <div className="operations-status-panel-header">
          <div>
            <h3>Pilotage des statuts</h3>
          </div>
          <div className="operations-status-panel-note">
            <strong>{tasks.length}</strong>
            <span>tâche(s) visibles dans cette vue</span>
          </div>
        </div>
        <div className="operations-status-grid">
          {statusCards.map((card) => (
            <article
              key={card.status}
              className={
                card.isActiveFilter
                  ? `operations-status-card status-tone-${statusToneClass(card.status)} is-active`
                  : `operations-status-card status-tone-${statusToneClass(card.status)}`
              }
            >
              <div className="operations-status-card-top">
                <span className={`task-status-chip status-${card.status.toLowerCase()}`}>
                  {card.label}
                </span>
                <strong>{card.total}</strong>
              </div>
              <p className="operations-status-card-metric">{card.metricLabel}</p>
            </article>
          ))}
        </div>
      </section>

      {canCreateTasks ? (
        <section className="panel">
          <h3>{editingTaskId ? "Modifier une tâche" : "Nouvelle tâche"}</h3>
          <form className="operations-task-form" onSubmit={handleCreateTask}>
            <div className="operations-task-form-primary">
              <input
                type="text"
                placeholder="Titre de la tâche"
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    title: event.target.value
                  }))
                }
                required
              />
              <input
                type="text"
                placeholder={
                  selectedProfile?.tasks.requiresDescription
                    ? "Description requise"
                    : "Description (optionnelle)"
                }
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    description: event.target.value
                  }))
                }
              />
            </div>
            <div className="scope-field">
              <span className="scope-field-label">Secteur de rattachement</span>
              <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            </div>
            <label className="operations-inline-group">
              <span>Échéance (optionnelle)</span>
              <input
                type="datetime-local"
                value={createForm.dueDate}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value
                  }))
                }
              />
            </label>
            {canAssignTasks ? (
              <div className="scope-field">
                <span className="scope-field-label">Assignation initiale</span>
                <label className="operations-inline-group">
                  <span>Responsable au démarrage</span>
                  <select
                    value={createForm.assignedToId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        assignedToId: event.target.value
                      }))
                    }
                  >
                    <option value="">Non assignée</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {memberLabel(member)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="scope-field">
                <span className="scope-field-label">Assignation initiale</span>
                <strong>Cette tâche sera assignée à votre compte.</strong>
              </div>
            )}
            {taskMetadataFields.length > 0 ? (
              <details className="operations-task-form-options">
                <summary>Champs avancés</summary>
                <div className="operations-task-form-options-body">
                  {taskMetadataFields.map((field) => (
                    <input
                      key={field.key}
                      type="text"
                      placeholder={`${field.label}${field.required ? " *" : ""}`}
                      value={createForm.metadata[field.key] ?? ""}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          metadata: {
                            ...prev.metadata,
                            [field.key]: event.target.value
                          }
                        }))
                      }
                      required={field.required}
                      title={field.helpText}
                    />
                  ))}
                </div>
              </details>
            ) : null}
            <button
              type="submit"
              disabled={!selectedActivityCode || isLoadingActivities}
            >
              {editingTaskId ? "Enregistrer les modifications" : "Enregistrer la tâche"}
            </button>
            {editingTaskId ? (
              <button type="button" className="secondary-btn" onClick={handleCancelEditTask}>
                Annuler
              </button>
            ) : null}
          </form>
        </section>
      ) : null}

      {canAssignTasks ? (
        <section className="panel operations-bulk-bar">
          <div className="operations-bulk-bar-header">
            <h3>Assignation en lot</h3>
            <p className="hint">
              {selectedTaskIds.length} selectionnee(s) sur {displayTasks.length} visible(s)
              {selectedTotalCount !== selectedTaskIds.length
                ? ` (${selectedTotalCount} au total)`
                : ""}
            </p>
          </div>
          <div className="operations-bulk-form">
            <select
              value={bulkAssignForm.assignedToId}
              onChange={(event) =>
                setBulkAssignForm((prev) => ({
                  ...prev,
                  assignedToId: event.target.value
                }))
              }
              disabled={isBulkAssigning}
            >
              <option value="">Non assignée</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberLabel(member)}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Commentaire d'assignation (optionnel)"
              value={bulkAssignForm.note}
              onChange={(event) =>
                setBulkAssignForm((prev) => ({
                  ...prev,
                  note: event.target.value
                }))
              }
              disabled={isBulkAssigning}
            />
            <button
              type="button"
              onClick={() => void handleBulkAssign()}
              disabled={isBulkAssigning || selectedTaskIds.length === 0}
            >
              Mettre à jour {selectedTaskIds.length} tâche(s)
            </button>
          </div>
        </section>
      ) : null}

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel">
        <div className="operations-list-header">
          <h3>Taches</h3>
          {canAssignTasks && displayTasks.length > 0 ? (
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedTasks((prev) => ({
                    ...prev,
                    ...Object.fromEntries(
                      displayTasks.map((task) => [task.id, event.target.checked])
                    )
                  }))
                }
              />
              <span>Tout sélectionner</span>
            </label>
          ) : null}
        </div>
        {!isLoading && tasks.length === 0 ? <p>Aucune tâche.</p> : null}
        {!isLoading && tasks.length > 0 && displayTasks.length === 0 ? (
          <p>Aucune tÃ¢che ne correspond a la recherche.</p>
        ) : null}
        {!isLoading && displayTasks.length > 0 ? (
          <>
          <div className="operations-task-list">
            {displayTasks.map((task) => {
              const isBusy = busyTaskId === task.id;
              const canUpdate = canUpdateTask(task);
              const isCompleted = task.status === "DONE";
              const editLockMessage = getTaskEditLockMessage(task);
              const deleteLockMessage = getTaskDeleteLockMessage(task);
              const selectedAssignee = assignments[task.id] ?? "";
              const selectedOrNull = selectedAssignee || null;
              const assignmentChanged = task.assignedToId !== selectedOrNull;

              return (
                <article
                  key={task.id}
                  className="operations-task-card clickable"
                  onClick={() => openTaskDetails(task.id)}
                  onKeyDown={(event) => onTaskCardKeyDown(event, task.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className="operations-task-top"
                    onClick={preventCardNavigation}
                    onKeyDown={preventCardKeyboardNavigation}
                  >
                    {canAssignTasks ? (
                      <input
                        type="checkbox"
                        checked={selectedTasks[task.id] === true}
                        onChange={(event) =>
                          setSelectedTasks((prev) => ({
                            ...prev,
                            [task.id]: event.target.checked
                          }))
                        }
                      />
                    ) : null}
                    <span className={`task-status-chip status-${task.status.toLowerCase()}`}>
                      {statusLabel(task.status)}
                    </span>
                    <span className={`task-status-inline-note status-tone-${statusToneClass(task.status)}`}>
                      {statusShortMetric(task.status)}
                    </span>
                  </div>

                  <h4 className="operations-task-title">{task.title}</h4>
                  <p className="operations-task-description">
                    {task.description?.trim() || "Aucune description fournie."}
                  </p>

                  <div className="operations-task-meta">
                    <p>
                      <strong>Activité:</strong> {getBusinessActivityLabel(task.activityCode)}
                    </p>
                    <p>
                      <strong>Assigné:</strong>{" "}
                      {task.assignedToFullName ? `${task.assignedToFullName} (${task.assignedToEmail})` : "Non assignée"}
                    </p>
                    <p>
                      <strong>Créateur:</strong> {task.createdByFullName} ({task.createdByEmail})
                    </p>
                    <p>
                      <strong>Échéance:</strong> {formatDate(task.dueDate)}
                    </p>
                    <p>
                      <strong>Mise à jour:</strong> {formatDate(task.updatedAt)}
                    </p>
                    {Object.keys(task.metadata).length > 0 ? (
                      <p className="operations-task-metadata">
                        <strong>Contexte:</strong> {formatMetadataSummary(task.metadata, taskMetadataFields)}
                      </p>
                    ) : null}
                  </div>

                  <div
                    className="operations-actions"
                    onClick={preventCardNavigation}
                    onKeyDown={preventCardKeyboardNavigation}
                  >
                    <div className="operations-actions-primary">
                      <button
                        type="button"
                        className="secondary-btn operations-primary-action"
                        onClick={() => openTaskDetails(task.id)}
                      >
                        Voir
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleStartEditTask(task)}
                        disabled={isBusy || editingTaskId === task.id}
                        title={editLockMessage ?? undefined}
                      >
                        Modifier
                      </button>
                    </div>

                    {isCompleted ? (
                      <div className="operations-task-closed-note">
                        Tâche terminée: statut, modification et assignation verrouillés.
                      </div>
                    ) : (
                      <details className="operations-actions-secondary">
                        <summary>Plus d'actions</summary>
                        <div className="operations-actions-secondary-content">
                        <div className="operations-inline-group">
                          <label>Statut</label>
                          {canUpdate ? (
                            <select
                              value={task.status}
                              onChange={(event) =>
                                void handleChangeStatus(task.id, event.target.value as TaskStatus)
                              }
                              disabled={isBusy || isBulkAssigning}
                            >
                              <option value="TODO">À faire</option>
                              <option value="IN_PROGRESS">En cours</option>
                              <option value="DONE">Terminée</option>
                              <option value="BLOCKED">Bloquée</option>
                            </select>
                          ) : (
                            <span className="hint">Lecture seule</span>
                          )}
                        </div>

                        {canAssignTasks ? (
                          <div className="operations-assign-card">
                            <div className="operations-inline-group">
                              <label>Assigner à</label>
                              <select
                                value={selectedAssignee}
                                onChange={(event) =>
                                  setAssignments((prev) => ({
                                    ...prev,
                                    [task.id]: event.target.value
                                  }))
                                }
                                disabled={isBusy || isBulkAssigning}
                              >
                                <option value="">Non assignée</option>
                                {members.map((member) => (
                                  <option key={member.userId} value={member.userId}>
                                    {memberLabel(member)}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="operations-inline-group">
                              <label>Note (optionnel)</label>
                              <input
                                type="text"
                                placeholder="Motif d'assignation"
                                value={assignmentNotes[task.id] ?? ""}
                                onChange={(event) =>
                                  setAssignmentNotes((prev) => ({
                                    ...prev,
                                    [task.id]: event.target.value
                                  }))
                                }
                                disabled={isBusy || isBulkAssigning}
                              />
                            </div>

                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => void handleSaveAssignment(task.id)}
                              disabled={!assignmentChanged || isBusy || isBulkAssigning}
                            >
                              Enregistrer assignation
                            </button>
                          </div>
                        ) : null}
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => void handleDeleteTask(task)}
                            disabled={isBusy}
                            title={deleteLockMessage ?? undefined}
                          >
                            Supprimer
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="list-pagination">
            <p className="hint list-pagination-meta">
              {displayTasks.length} tache(s) affichee(s)
              {displayTasks.length !== tasks.length ? ` sur ${tasks.length} chargee(s)` : ""}
              {hasMoreTasks ? " sur plusieurs pages." : "."}
            </p>
            {hasMoreTasks ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleLoadMoreTasks()}
                disabled={isLoadingMoreTasks}
              >
                {isLoadingMoreTasks ? "Chargement..." : "Charger plus"}
              </button>
            ) : null}
          </div>
          </>
        ) : null}
      </section>

      <ConfirmDialog
        open={taskPendingDelete !== null}
        title="Confirmer la suppression"
        description="Cette action retire définitivement la tâche de la vue opérationnelle."
        objectLabel="Tâche concernée"
        objectName={taskPendingDelete?.title ?? ""}
        impactText="L'historique lié à cette tâche ne sera plus consultable depuis cet écran."
        isConfirming={busyTaskId === taskPendingDelete?.id}
        onCancel={() => {
          if (busyTaskId) {
            return;
          }
          setTaskPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteTask()}
      />
    </>
  );
}

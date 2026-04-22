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
import type { ActivityFieldDefinition } from "../types/activities";
import type { OperationTask, OperationTaskMember, TaskScope, TaskStatus } from "../types/tasks";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Operation impossible. Verifie la connexion backend.";
}

function statusLabel(status: TaskStatus): string {
  if (status === "TODO") {
    return "A faire";
  }
  if (status === "IN_PROGRESS") {
    return "En cours";
  }
  if (status === "DONE") {
    return "Terminee";
  }
  return "Bloquee";
}

function statusDescription(status: TaskStatus): string {
  if (status === "TODO") {
    return "Tache en attente de demarrage ou de reprise.";
  }
  if (status === "IN_PROGRESS") {
    return "Execution en cours sur le terrain ou au bureau.";
  }
  if (status === "DONE") {
    return "Execution terminee et tache cloturee.";
  }
  return "Blocage actif, arbitrage ou action de debloquage requis.";
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
    return "A lancer";
  }
  if (status === "IN_PROGRESS") {
    return "En execution";
  }
  if (status === "DONE") {
    return "Cloturees";
  }
  return "A debloquer";
}

function memberLabel(member: OperationTaskMember): string {
  return `${member.fullName} (${member.role})`;
}

function workloadLabel(openTasksCount: number): string {
  if (openTasksCount >= 12) {
    return "Charge elevee";
  }
  if (openTasksCount >= 6) {
    return "Charge moyenne";
  }
  return "Charge legere";
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
  const { session, refreshSession, user } = useAuth();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [filters, setFilters] = useState<{
    status: "ALL" | TaskStatus;
    scope: TaskScope;
    unassignedOnly: boolean;
  }>({
    status: "ALL",
    scope: "ALL",
    unassignedOnly: false
  });

  const [createForm, setCreateForm] = useState(createDefaultTaskForm);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({});
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [bulkAssignForm, setBulkAssignForm] = useState({
    assignedToId: "",
    note: ""
  });

  const canAssignTasks = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);
  const canCreateTasks = useMemo(() => {
    return Boolean(user);
  }, [user]);

  const taskMetadataFields = selectedProfile?.tasks.metadataFields ?? [];
  const taskWorkflow = selectedProfile?.tasks.workflow ?? [];

  const statusSummary = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      BLOCKED: 0
    };

    for (const task of tasks) {
      counts[task.status] += 1;
    }

    return counts;
  }, [tasks]);

  const statusCards = useMemo(
    () =>
      (["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as TaskStatus[]).map((status) => ({
        status,
        label: statusLabel(status),
        description: statusDescription(status),
        metricLabel: statusShortMetric(status),
        total: statusSummary[status],
        isActiveFilter: filters.status === status
      })),
    [filters.status, statusSummary]
  );

  const selectedTaskIds = useMemo(() => {
    return tasks.filter((task) => selectedTasks[task.id]).map((task) => task.id);
  }, [selectedTasks, tasks]);

  const allVisibleSelected = useMemo(() => {
    if (tasks.length === 0) {
      return false;
    }
    return tasks.every((task) => selectedTasks[task.id]);
  }, [selectedTasks, tasks]);

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
    if (!selectedActivityCode) {
      setTasks([]);
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const query = {
        limit: 200,
        status: filters.status === "ALL" ? undefined : filters.status,
        activityCode: selectedActivityCode,
        scope: canAssignTasks ? filters.scope : ("ASSIGNED_TO_ME" as TaskScope),
        unassignedOnly: canAssignTasks ? filters.unassignedOnly : undefined
      };

      const taskResponse = await withAuthorizedToken((accessToken) =>
        listOperationsTasksRequest(accessToken, query)
      );
      setTasks(taskResponse.items);
      setAssignments(Object.fromEntries(taskResponse.items.map((task) => [task.id, task.assignedToId ?? ""])));
      setSelectedTasks((prev) =>
        Object.fromEntries(taskResponse.items.map((task) => [task.id, prev[task.id] === true]))
      );
      setAssignmentNotes((prev) =>
        Object.fromEntries(taskResponse.items.map((task) => [task.id, prev[task.id] ?? ""]))
      );

      if (canAssignTasks) {
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
      setIsLoading(false);
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
      setSuccessMessage(editingTaskId ? "Tache modifiee." : "Tache creee.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function getTaskEditLockMessage(task: OperationTask): string | null {
    if (task.status === "DONE") {
      return "Une tache terminee ne peut plus etre modifiee.";
    }
    if (canAssignTasks) {
      return null;
    }
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez modifier que les taches que vous avez creees.";
    }
    return null;
  }

  function getTaskDeleteLockMessage(task: OperationTask): string | null {
    if (task.status === "DONE") {
      return "Une tache terminee ne peut plus etre supprimee.";
    }
    if (canAssignTasks) {
      return null;
    }
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez supprimer que les taches que vous avez creees.";
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

  async function handleDeleteTask(task: OperationTask): Promise<void> {
    const lockMessage = getTaskDeleteLockMessage(task);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    if (!window.confirm(`Confirmer la suppression de la tache ${task.title} ?`)) {
      return;
    }

    setBusyTaskId(task.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteOperationsTaskRequest(accessToken, task.id));
      if (editingTaskId === task.id) {
        handleCancelEditTask();
      }
      setSuccessMessage("Tache supprimee.");
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
      setSuccessMessage("Assignation mise a jour.");
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
      setSuccessMessage(`${response.items.length} tache(s) mises a jour en lot.`);
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
        <h2>Suivi des taches</h2>
        <p>
          Planification, assignation et suivi de l'execution terrain pour le secteur{" "}
          <strong>{selectedActivity?.label ?? "aucun secteur actif"}</strong>.
        </p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activite dans
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
            <option value="TODO">A faire</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="DONE">Terminee</option>
            <option value="BLOCKED">Bloquee</option>
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
              <option value="ALL">Toutes les taches</option>
              <option value="MINE">Mes taches (creees + assignees)</option>
              <option value="ASSIGNED_TO_ME">Assignees a moi</option>
              <option value="CREATED_BY_ME">Creees par moi</option>
            </select>
          ) : (
            <p className="hint">Vue collaborateur: taches qui vous sont assignees.</p>
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
              <span>Non assignees uniquement</span>
            </label>
          ) : null}

          <button type="submit">Filtrer</button>
        </form>
        <p className="hint">
          La liste suit le secteur actif: {selectedActivity?.label ?? "aucun secteur actif"}.
        </p>
      </section>

      <section className="panel operations-status-panel">
        <div className="operations-status-panel-header">
          <div>
            <h3>Pilotage des statuts</h3>
            <p className="hint">
              Lecture rapide du flux de traitement pour le secteur actif.
            </p>
          </div>
          <div className="operations-status-panel-note">
            <strong>{tasks.length}</strong>
            <span>tache(s) visibles dans cette vue</span>
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
              <p className="operations-status-card-description">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      {canCreateTasks ? (
        <section className="panel">
          <h3>{editingTaskId ? "Modifier une tache" : "Nouvelle tache"}</h3>
          <form className="operations-task-form" onSubmit={handleCreateTask}>
            <input
              type="text"
              placeholder="Titre de la tache"
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
            <div className="scope-field">
              <span className="scope-field-label">Secteur de rattachement</span>
              <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            </div>
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
            {canAssignTasks ? (
              <select
                value={createForm.assignedToId}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    assignedToId: event.target.value
                  }))
                }
              >
                <option value="">Non assignee</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {memberLabel(member)}
                  </option>
                ))}
              </select>
            ) : (
              <div className="scope-field">
                <span className="scope-field-label">Assignation initiale</span>
                <strong>Cette tache sera assignee a votre compte.</strong>
              </div>
            )}
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
            <button
              type="submit"
              disabled={!selectedActivityCode || isLoadingActivities}
            >
              {editingTaskId ? "Enregistrer les modifications" : "Enregistrer la tache"}
            </button>
            {editingTaskId ? (
              <button type="button" className="secondary-btn" onClick={handleCancelEditTask}>
                Annuler
              </button>
            ) : null}
          </form>
          <div className="sector-form-guidance">
            {taskMetadataFields.length > 0 ? (
              <div className="metadata-field-list">
                {taskMetadataFields.map((field) => (
                  <p key={field.key} className="hint">
                    <strong>{field.label}</strong>: {field.helpText}
                  </p>
                ))}
              </div>
            ) : null}
            {taskWorkflow.length > 0 ? (
              <div className="workflow-chip-list">
                {taskWorkflow.map((step) => (
                  <span key={step.code} className="workflow-chip" title={step.description}>
                    {step.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {canAssignTasks && members.length > 0 ? (
        <section className="panel">
          <h3>Charge equipe</h3>
          <p className="hint">
            Vue d'ensemble calculee pour le secteur actif:{" "}
            {selectedActivity?.label ?? "aucun secteur actif"}.
          </p>
          <div className="operations-member-grid">
            {members.map((member) => (
              <article key={member.userId} className="operations-member-card">
                <h4>{member.fullName}</h4>
                <p className="hint">
                  {member.role} | {workloadLabel(member.openTasksCount)}
                </p>
                <p className="hint">
                  Ouvertes: {member.openTasksCount} | En cours: {member.inProgressTasksCount} | Bloquees:{" "}
                  {member.blockedTasksCount}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {canAssignTasks ? (
        <section className="panel">
          <h3>Assignation en lot</h3>
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
              <option value="">Non assignee</option>
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
              Mettre a jour {selectedTaskIds.length} tache(s)
            </button>
          </div>
          <p className="hint">
            Les taches terminees ne peuvent plus etre reassignees. Les taches a faire passent
            automatiquement En cours lors de l'assignation.
          </p>
        </section>
      ) : null}

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <div className="operations-list-header">
          <h3>Taches</h3>
          {canAssignTasks && tasks.length > 0 ? (
            <label className="inline-checkbox">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedTasks(
                    Object.fromEntries(tasks.map((task) => [task.id, event.target.checked]))
                  )
                }
              />
              <span>Tout selectionner</span>
            </label>
          ) : null}
        </div>
        {isLoading ? <p>Chargement...</p> : null}
        {!isLoading && tasks.length === 0 ? <p>Aucune tache.</p> : null}
        {!isLoading && tasks.length > 0 ? (
          <div className="operations-task-list">
            {tasks.map((task) => {
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

                  <div className="operations-task-status-band">
                    <div className="operations-task-status-main">
                      <span className="operations-task-status-label">Statut operationnel</span>
                      <strong>{statusLabel(task.status)}</strong>
                    </div>
                    <p className="operations-task-status-text">{statusDescription(task.status)}</p>
                  </div>

                  <div className="operations-task-meta">
                    <p>
                      <strong>Activite:</strong> {getBusinessActivityLabel(task.activityCode)}
                    </p>
                    <p>
                      <strong>Assigne:</strong>{" "}
                      {task.assignedToFullName ? `${task.assignedToFullName} (${task.assignedToEmail})` : "Non assignee"}
                    </p>
                    <p>
                      <strong>Createur:</strong> {task.createdByFullName} ({task.createdByEmail})
                    </p>
                    <p>
                      <strong>Echeance:</strong> {formatDate(task.dueDate)}
                    </p>
                    <p>
                      <strong>Mise a jour:</strong> {formatDate(task.updatedAt)}
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
                    <div className="actions-inline">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleStartEditTask(task)}
                        disabled={isBusy || editingTaskId === task.id}
                        title={editLockMessage ?? undefined}
                      >
                        Modifier
                      </button>
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

                    {isCompleted ? (
                      <div className="operations-task-closed-note">
                        Tache terminee: statut, modification et assignation verrouilles.
                      </div>
                    ) : (
                      <>
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
                              <option value="TODO">A faire</option>
                              <option value="IN_PROGRESS">En cours</option>
                              <option value="DONE">Terminee</option>
                              <option value="BLOCKED">Bloquee</option>
                            </select>
                          ) : (
                            <span className="hint">Lecture seule</span>
                          )}
                        </div>

                        {canAssignTasks ? (
                          <div className="operations-assign-card">
                            <div className="operations-inline-group">
                              <label>Assigner a</label>
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
                                <option value="">Non assignee</option>
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
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </>
  );
}

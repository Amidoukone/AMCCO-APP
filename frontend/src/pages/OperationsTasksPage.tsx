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
  listOperationsMembersRequest,
  listOperationsTasksRequest,
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

  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    dueDate: "",
    assignedToId: "",
    metadata: {} as Record<string, string>
  });

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({});
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [bulkAssignForm, setBulkAssignForm] = useState({
    assignedToId: "",
    note: ""
  });

  const canManageTasks = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);

  const taskMetadataFields = selectedProfile?.tasks.metadataFields ?? [];
  const taskWorkflow = selectedProfile?.tasks.workflow ?? [];

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
        scope: canManageTasks ? filters.scope : ("MINE" as TaskScope),
        unassignedOnly: canManageTasks ? filters.unassignedOnly : undefined
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

      if (canManageTasks) {
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
    canManageTasks,
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
    if (!canManageTasks || !selectedActivityCode) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        createOperationsTaskRequest(accessToken, {
          title: createForm.title.trim(),
          description: createForm.description.trim() || undefined,
          activityCode: selectedActivityCode as BusinessActivityCode,
          assignedToId: createForm.assignedToId || undefined,
          metadata: createForm.metadata,
          dueDate: createForm.dueDate ? new Date(createForm.dueDate).toISOString() : undefined
        })
      );
      setCreateForm({
        title: "",
        description: "",
        dueDate: "",
        assignedToId: "",
        metadata: syncMetadataState({}, taskMetadataFields)
      });
      setSuccessMessage("Tache creee.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function handleSaveAssignment(taskId: string): Promise<void> {
    if (!canManageTasks) {
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
    if (!canManageTasks || selectedTaskIds.length === 0) {
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
    if (canManageTasks) {
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
          <strong>{selectedActivity?.label ?? "non defini"}</strong>.
        </p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Active d'abord un secteur d'activite dans
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

          {canManageTasks ? (
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
            <p className="hint">Vue employee: taches creees par vous ou assignees a vous.</p>
          )}

          {canManageTasks ? (
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

          <button type="submit">Appliquer</button>
        </form>
        <p className="hint">
          La liste est automatiquement alignee sur le secteur actif:{" "}
          {selectedActivity?.label ?? "non defini"}.
        </p>
      </section>

      {canManageTasks ? (
        <section className="panel">
          <h3>Nouvelle tache</h3>
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
                  ? "Description metier requise"
                  : "Description (optionnel)"
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
              <strong>{selectedActivity?.label ?? "Non defini"}</strong>
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
              Creer tache
            </button>
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

      {canManageTasks && members.length > 0 ? (
        <section className="panel">
          <h3>Charge d'assignation</h3>
          <p className="hint">
            Charge calculee sur le secteur actif: {selectedActivity?.label ?? "non defini"}.
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

      {canManageTasks ? (
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
              placeholder="Note d'assignation (optionnel)"
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
              Assigner {selectedTaskIds.length} tache(s)
            </button>
          </div>
          <p className="hint">
            Les taches terminees sont proteges contre re-assignation. Les taches TODO deviennent automatiquement En
            cours quand elles sont assignees.
          </p>
        </section>
      ) : null}

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      <section className="panel">
        <div className="operations-list-header">
          <h3>Taches</h3>
          {canManageTasks && tasks.length > 0 ? (
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
                    {canManageTasks ? (
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
                  </div>

                  <h4 className="operations-task-title">{task.title}</h4>
                  <p className="operations-task-description">
                    {task.description?.trim() || "Aucune description fournie."}
                  </p>

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
                    {isCompleted ? (
                      <div className="operations-task-closed-note">
                        Tache terminee: statut et assignation verrouilles.
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

                        {canManageTasks ? (
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

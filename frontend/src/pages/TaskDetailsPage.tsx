import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  addTaskCommentRequest,
  ApiError,
  assignOperationsTaskRequest,
  getOperationsTaskRequest,
  listOperationsMembersRequest,
  listOperationsTaskTimelineRequest,
  listTaskCommentsRequest,
  updateOperationsTaskStatusRequest
} from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { getBusinessActivityLabel, type BusinessActivityCode } from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { getTaskTraceLines } from "../utils/traceMetadata";
import type {
  OperationTask,
  OperationTaskMember,
  OperationTaskTimelineEvent,
  TaskComment,
  TaskStatus
} from "../types/tasks";

const TASK_DETAIL_PAGE_SIZE = 50;

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

function timelineActionLabel(action: string): string {
  if (action === "TASK_CREATED") {
    return "Création de la tâche";
  }
  if (action === "TASK_UPDATED") {
    return "Modification de la tâche";
  }
  if (action === "TASK_ASSIGNED") {
    return "Assignation";
  }
  if (action === "TASK_UNASSIGNED") {
    return "Desassignation";
  }
  if (action === "TASK_STATUS_CHANGED") {
    return "Changement de statut";
  }
  if (action === "TASK_COMMENT_ADDED") {
    return "Commentaire ajoute";
  }
  return action;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function timelineDetail(event: OperationTaskTimelineEvent): string {
  const metadata = asObject(event.metadata);
  if (event.action === "TASK_STATUS_CHANGED") {
    const previousStatus = typeof metadata.previousStatus === "string" ? metadata.previousStatus : null;
    const nextStatus = typeof metadata.nextStatus === "string" ? metadata.nextStatus : null;
    if (previousStatus && nextStatus) {
      return `${statusLabel(previousStatus as TaskStatus)} -> ${statusLabel(nextStatus as TaskStatus)}`;
    }
  }
  if (event.action === "TASK_ASSIGNED") {
    return "Tâche assignée.";
  }
  if (event.action === "TASK_UPDATED") {
    return "Contenu de la tâche mis à jour.";
  }
  if (event.action === "TASK_UNASSIGNED") {
    return "Tâche retirée de l'assigné précédent.";
  }
  if (event.action === "TASK_CREATED") {
    return "Tâche créée.";
  }
  return "";
}

function timelineContextLines(event: OperationTaskTimelineEvent): string[] {
  const metadata = asObject(event.metadata);
  const lines: string[] = getTaskTraceLines(event.action, metadata);

  const activityCode =
    typeof metadata.activityCode === "string" ? metadata.activityCode : null;
  if (activityCode && !lines.some((line) => line.startsWith("Secteur: "))) {
    lines.push(`Secteur: ${getBusinessActivityLabel(activityCode as BusinessActivityCode)}`);
  }

  const note = typeof metadata.note === "string" ? metadata.note.trim() : "";
  if (note && !lines.some((line) => line.startsWith("Note: "))) {
    lines.push(`Note: ${note}`);
  }

  const dueDate = typeof metadata.dueDate === "string" ? metadata.dueDate : null;
  if (dueDate) {
    lines.push(`Échéance: ${formatDate(dueDate)}`);
  }

  const taskWorkflow = Array.isArray(metadata.taskWorkflow)
    ? metadata.taskWorkflow.filter((item): item is string => typeof item === "string")
    : [];
  if (taskWorkflow.length > 0) {
    lines.push(`Workflow: ${taskWorkflow.join(" -> ")}`);
  }

  const bodyPreview =
    typeof metadata.bodyPreview === "string" ? metadata.bodyPreview.trim() : "";
  if (bodyPreview && !lines.some((line) => line.startsWith("Commentaire: "))) {
    lines.push(`Aperçu: ${bodyPreview}`);
  }

  return lines;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("fr-FR");
}

function formatMetadataLabel(key: string, fieldLabels: Record<string, string>): string {
  return fieldLabels[key] ?? key;
}

type TimelineEntry =
  | { id: string; createdAt: string; kind: "event"; event: OperationTaskTimelineEvent }
  | { id: string; createdAt: string; kind: "comment"; comment: TaskComment };

export function TaskDetailsPage(): JSX.Element {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const { profiles, selectedActivityCode, setSelectedActivityCode } = useBusinessActivity();
  const [task, setTask] = useState<OperationTask | null>(null);
  const [timeline, setTimeline] = useState<OperationTaskTimelineEvent[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [members, setMembers] = useState<OperationTaskMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMoreTimeline, setIsLoadingMoreTimeline] = useState(false);
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignment, setAssignment] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [newComment, setNewComment] = useState("");

  const canManageTasks = useMemo(() => {
    return user?.role === "OWNER" || user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);
  const loadData = useCallback(async (options?: {
    append?: boolean;
    timelineOffset?: number;
    commentsOffset?: number;
  }) => {
    const append = options?.append === true;
    if (!taskId) {
      return;
    }
    if (append) {
      setIsLoadingMoreTimeline(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await withAuthorizedToken(async (accessToken) => {
        const [taskResponse, timelineResponse, commentsResponse] = await Promise.all([
          getOperationsTaskRequest(accessToken, taskId),
          listOperationsTaskTimelineRequest(accessToken, taskId, {
            limit: TASK_DETAIL_PAGE_SIZE,
            offset: options?.timelineOffset ?? 0
          }),
          listTaskCommentsRequest(accessToken, taskId, {
            limit: TASK_DETAIL_PAGE_SIZE,
            offset: options?.commentsOffset ?? 0
          })
        ]);
        const membersResponse =
          !append && canManageTasks
            ? await listOperationsMembersRequest(accessToken, {
                activityCode: taskResponse.item.activityCode ?? undefined
              })
            : { items: [] };
        return {
          task: taskResponse.item,
          timeline: timelineResponse.items,
          comments: commentsResponse.items,
          members: membersResponse.items
        };
      });
      setTask(data.task);
      setHasMoreTimeline(data.timeline.length === TASK_DETAIL_PAGE_SIZE);
      setHasMoreComments(data.comments.length === TASK_DETAIL_PAGE_SIZE);
      setTimeline((prev) => {
        if (!append) {
          return data.timeline;
        }
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...data.timeline.filter((item) => !seen.has(item.id))];
      });
      setComments((prev) => {
        if (!append) {
          return data.comments;
        }
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...data.comments.filter((item) => !seen.has(item.id))];
      });
      if (!append) {
        setMembers(data.members);
      }
      setAssignment(data.task.assignedToId ?? "");
      if (data.task.activityCode && data.task.activityCode !== selectedActivityCode) {
        setSelectedActivityCode(data.task.activityCode);
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMoreTimeline(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [canManageTasks, selectedActivityCode, setSelectedActivityCode, taskId, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleLoadMoreTimeline(): Promise<void> {
    if (isLoading || isLoadingMoreTimeline || (!hasMoreTimeline && !hasMoreComments)) {
      return;
    }
    await loadData({
      append: true,
      timelineOffset: timeline.length,
      commentsOffset: comments.length
    });
  }

  async function handleAssign(): Promise<void> {
    if (!taskId || !task || !canManageTasks) {
      return;
    }
    const nextAssignedToId = assignment || null;
    if (task.assignedToId === nextAssignedToId) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        assignOperationsTaskRequest(accessToken, taskId, nextAssignedToId, assignmentNote.trim() || undefined)
      );
      setAssignmentNote("");
      setSuccessMessage("Assignation mise à jour.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(status: TaskStatus): Promise<void> {
    if (!taskId || !task) {
      return;
    }
    if (task.status === status) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => updateOperationsTaskStatusRequest(accessToken, taskId, status));
      setSuccessMessage("Statut mis a jour.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddComment(): Promise<void> {
    if (!taskId) {
      return;
    }
    const body = newComment.trim();
    if (!body) {
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => addTaskCommentRequest(accessToken, taskId, body));
      setNewComment("");
      setSuccessMessage("Commentaire ajoute.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  const canUpdateStatus = useMemo(() => {
    if (!task || !user) {
      return false;
    }
    if (task.status === "DONE") {
      return false;
    }
    if (canManageTasks) {
      return true;
    }
    return task.assignedToId === user.id;
  }, [canManageTasks, task, user]);

  const isTaskCompleted = task?.status === "DONE";

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...timeline.map((event) => ({
        id: `event-${event.id}`,
        createdAt: event.createdAt,
        kind: "event" as const,
        event
      })),
      ...comments.map((comment) => ({
        id: `comment-${comment.id}`,
        createdAt: comment.createdAt,
        kind: "comment" as const,
        comment
      }))
    ];

    entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return entries;
  }, [comments, timeline]);

  const taskProfile = useMemo(() => {
    if (!task?.activityCode) {
      return null;
    }
    return profiles.find((item) => item.activityCode === task.activityCode) ?? null;
  }, [profiles, task?.activityCode]);

  const taskMetadataLabels = useMemo(
    () =>
      Object.fromEntries(
        (taskProfile?.tasks.metadataFields ?? []).map((field) => [field.key, field.label])
      ),
    [taskProfile]
  );

  return (
    <>
      <header className="section-header">
        <p>
          <Link to="/operations/tasks" className="task-back-link">
            Retour à la liste des tâches
          </Link>
        </p>
        <h2>Détail de la tâche</h2>
        {task ? (
          <p>
            Cette fiche est rattachée au secteur <strong>{getBusinessActivityLabel(task.activityCode)}</strong>.
          </p>
        ) : null}
      </header>

      {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
      {successMessage ? <p className="success-box">{successMessage}</p> : null}

      {isLoading ? <p>Chargement...</p> : null}

      {!isLoading && task ? (
        <section className="panel">
          <div className="task-detail-header">
            <h3>{task.title}</h3>
            <span className={`task-status-chip status-${task.status.toLowerCase()}`}>{statusLabel(task.status)}</span>
          </div>
          <div className={`task-status-hero status-tone-${statusToneClass(task.status)}`}>
            <div className="task-status-hero-main">
              <span className="task-status-hero-label">État actuel</span>
              <strong>{statusLabel(task.status)}</strong>
            </div>
          </div>
          <div className="actions-inline">
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                navigate(`/alerts?entityType=TASK&entityId=${encodeURIComponent(task.id)}`)
              }
            >
              Voir alertes
            </button>
          </div>
          <p className="operations-task-description">{task.description?.trim() || "Aucune description fournie."}</p>

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
              <strong>Créée le:</strong> {formatDate(task.createdAt)}
            </p>
            <p>
              <strong>Dernière mise à jour:</strong> {formatDate(task.updatedAt)}
            </p>
          </div>

          {Object.keys(task.metadata).length > 0 ? (
            <div className="metadata-detail-list">
              {Object.entries(task.metadata).map(([key, value]) => (
                <p key={key} className="hint">
                  <strong>{formatMetadataLabel(key, taskMetadataLabels)}:</strong> {value}
                </p>
              ))}
            </div>
          ) : null}

          {isTaskCompleted ? (
            <div className="task-detail-closed-note">
              <strong>Tâche terminée</strong>
              <p>Cette tâche est clôturée. Les actions de statut et d'assignation sont masquées.</p>
            </div>
          ) : (
            <div className="task-detail-actions">
              {canUpdateStatus ? (
                <div className="operations-inline-group">
                  <label>Statut</label>
                  <select
                    value={task.status}
                    onChange={(event) => void handleStatusChange(event.target.value as TaskStatus)}
                    disabled={isSaving}
                  >
                    <option value="TODO">À faire</option>
                    <option value="IN_PROGRESS">En cours</option>
                    <option value="DONE">Terminée</option>
                    <option value="BLOCKED">Bloquée</option>
                  </select>
                </div>
              ) : null}

              {canManageTasks ? (
                <div className="operations-assign-card">
                  <div className="operations-inline-group">
                    <label>Assigner à</label>
                    <select
                      value={assignment}
                      onChange={(event) => setAssignment(event.target.value)}
                      disabled={isSaving}
                    >
                      <option value="">Non assignée</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.fullName} ({member.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="operations-inline-group">
                    <label>Commentaire (optionnel)</label>
                    <input
                      type="text"
                      value={assignmentNote}
                      onChange={(event) => setAssignmentNote(event.target.value)}
                      placeholder="Ajouter un commentaire d'assignation"
                      disabled={isSaving}
                    />
                  </div>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleAssign()}
                    disabled={isSaving}
                  >
                    Enregistrer assignation
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {!isLoading && task ? (
        <section className="panel">
          <h3>Ajouter un commentaire</h3>
          <div className="task-comment-form">
            <textarea
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              placeholder="Ecrire un suivi terrain, un blocage, une decision..."
              rows={4}
              disabled={isSaving}
            />
            <button
              type="button"
              className="secondary-btn"
              onClick={() => void handleAddComment()}
              disabled={isSaving || newComment.trim().length === 0}
            >
              Ajouter le commentaire
            </button>
          </div>
        </section>
      ) : null}

      {!isLoading && task ? (
        <section className="panel">
          <h3>Timeline operationnelle</h3>
          {timelineEntries.length === 0 ? <p>Aucun evenement pour le moment.</p> : null}
          {timelineEntries.length > 0 ? (
            <>
              <ol className="task-timeline">
                {timelineEntries.map((entry) => (
                  <li
                    key={entry.id}
                    className={entry.kind === "comment" ? "task-timeline-item is-comment" : "task-timeline-item"}
                  >
                    {entry.kind === "event" ? (
                      <>
                        <p className="task-timeline-title">{timelineActionLabel(entry.event.action)}</p>
                        <p className="task-timeline-meta">
                          {new Date(entry.event.createdAt).toLocaleString("fr-FR")} | {entry.event.actorFullName} (
                          {entry.event.actorEmail})
                        </p>
                        {timelineDetail(entry.event) ? (
                          <p className="task-timeline-detail">{timelineDetail(entry.event)}</p>
                        ) : null}
                        {timelineContextLines(entry.event).map((line) => (
                          <p key={`${entry.event.id}-${line}`} className="task-timeline-detail">
                            {line}
                          </p>
                        ))}
                      </>
                    ) : (
                      <>
                        <p className="task-timeline-title">Commentaire</p>
                        <p className="task-timeline-meta">
                          {new Date(entry.comment.createdAt).toLocaleString("fr-FR")} | {entry.comment.authorFullName} (
                          {entry.comment.authorEmail})
                        </p>
                        <p className="task-timeline-comment-body">{entry.comment.body}</p>
                      </>
                    )}
                  </li>
                ))}
              </ol>
              <div className="list-pagination">
                <p className="hint list-pagination-meta">
                  {timelineEntries.length} element(s) de suivi charge(s)
                  {hasMoreTimeline || hasMoreComments ? " sur plusieurs pages." : "."}
                </p>
                {hasMoreTimeline || hasMoreComments ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => void handleLoadMoreTimeline()}
                    disabled={isLoadingMoreTimeline}
                  >
                    {isLoadingMoreTimeline ? "Chargement..." : "Charger plus"}
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

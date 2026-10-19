import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { useAuth } from "../context/AuthContext";
import {
  addTaskAttachmentRequest,
  addTaskCommentRequest,
  ApiError,
  assignOperationsTaskRequest,
  getTaskAttachmentUploadAuthRequest,
  getOperationsTaskRequest,
  listOperationsMembersRequest,
  listTaskAttachmentsRequest,
  listOperationsTaskTimelineRequest,
  listTaskCommentsRequest,
  updateOperationsTaskStatusRequest
} from "../lib/api";
import {
  resolveImageKitFileName,
  resolveImageKitFileSize,
  resolveImageKitStorageKey,
  type ImageKitUploadResult
} from "../lib/imagekitUpload";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { getBusinessActivityLabel, type BusinessActivityCode } from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { getTaskTraceLines } from "../utils/traceMetadata";
import type {
  OperationTask,
  OperationTaskMember,
  OperationTaskTimelineEvent,
  TaskAttachment,
  TaskComment,
  TaskStatus
} from "../types/tasks";

const TASK_DETAIL_PAGE_SIZE = 50;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

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
  if (action === "TASK_ATTACHMENT_ADDED") {
    return "Pièce jointe ajoutee";
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
  if (event.action === "TASK_ATTACHMENT_ADDED") {
    return "Pièce jointe ajoutee.";
  }
  return "";
}

function timelineContextLines(event: OperationTaskTimelineEvent): string[] {
  const metadata = asObject(event.metadata);
  const lines: string[] = getTaskTraceLines(event.action, metadata).filter(
    (line) => !line.startsWith("Secteur: ") && !line.startsWith("Échéance: ")
  );

  const note = typeof metadata.note === "string" ? metadata.note.trim() : "";
  if (note && !lines.some((line) => line.startsWith("Note: "))) {
    lines.push(`Note: ${note}`);
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
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const { enabledActivities, profiles, setSelectedActivityCode } = useBusinessActivity();
  const [task, setTask] = useState<OperationTask | null>(null);
  const [timeline, setTimeline] = useState<OperationTaskTimelineEvent[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [members, setMembers] = useState<OperationTaskMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const loadRequestRef = useRef(0);
  const timelineLoadRequestRef = useRef(0);
  const loadedHistoryTaskRef = useRef<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMoreTimeline, setIsLoadingMoreTimeline] = useState(false);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [isCompactScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );
  const [isAttachmentUploadExpanded, setIsAttachmentUploadExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
  const [isCommentFormExpanded, setIsCommentFormExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(
    () => typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches
  );
  const isTimelineExpandedRef = useRef(isTimelineExpanded);
  isTimelineExpandedRef.current = isTimelineExpanded;
  const [hasMoreTimeline, setHasMoreTimeline] = useState(false);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignment, setAssignment] = useState("");
  const [assignmentNote, setAssignmentNote] = useState("");
  const [newComment, setNewComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const canManageTasks = useMemo(() => {
    return user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);
  const isReadOnlyOwner = user?.role === "OWNER";
  const loadData = useCallback(async (options?: {
    append?: boolean;
    silent?: boolean;
    timelineOffset?: number;
    commentsOffset?: number;
  }) => {
    const requestId = ++loadRequestRef.current;
    const timelineRequestId = ++timelineLoadRequestRef.current;
    const append = options?.append === true;
    const silent = options?.silent === true;
    const includeHistory = append;
    if (!append && loadedHistoryTaskRef.current !== taskId) {
      loadedHistoryTaskRef.current = null;
      setTimeline([]);
      setComments([]);
      setHasMoreTimeline(false);
      setHasMoreComments(false);
      setIsLoadingHistory(false);
    }
    if (!taskId) {
      return;
    }
    if (append) {
      setIsLoadingMoreTimeline(true);
    } else {
      setIsLoadingMoreTimeline(false);
      if (!silent) setIsLoading(true);
      setIsLoadingMembers(canManageTasks);
    }
    setErrorMessage(null);
    try {
      const data = await withAuthorizedToken(async (accessToken) => {
        const taskResponsePromise = append
          ? Promise.resolve(null)
          : getOperationsTaskRequest(accessToken, taskId);
        const timelineResponsePromise = includeHistory
          ? listOperationsTaskTimelineRequest(accessToken, taskId, {
              limit: TASK_DETAIL_PAGE_SIZE,
              offset: options?.timelineOffset ?? 0
            })
          : Promise.resolve({ items: [] as OperationTaskTimelineEvent[] });
        const commentsResponsePromise = includeHistory
          ? listTaskCommentsRequest(accessToken, taskId, {
              limit: TASK_DETAIL_PAGE_SIZE,
              offset: options?.commentsOffset ?? 0
            })
          : Promise.resolve({ items: [] as TaskComment[] });
        const attachmentsResponsePromise = append
          ? Promise.resolve({ items: [] as TaskAttachment[] })
          : listTaskAttachmentsRequest(accessToken, taskId);
        const taskResponse = await taskResponsePromise;
        if (taskResponse && canManageTasks) {
          void withAuthorizedToken((membersAccessToken) =>
            listOperationsMembersRequest(membersAccessToken, {
              activityCode: taskResponse.item.activityCode ?? undefined
            })
          )
            .then((membersResponse) => {
              if (requestId === loadRequestRef.current) {
                setMembers(membersResponse.items);
                setIsLoadingMembers(false);
              }
            })
            .catch((error) => {
              if (requestId === loadRequestRef.current) {
                setErrorMessage(toErrorMessage(error));
                setIsLoadingMembers(false);
              }
            });
        } else if (!append) {
          setMembers([]);
          setIsLoadingMembers(false);
        }
        const [timelineResponse, commentsResponse, attachmentsResponse] = await Promise.all([
          timelineResponsePromise,
          commentsResponsePromise,
          attachmentsResponsePromise
        ]);
        return {
          task: taskResponse?.item ?? null,
          timeline: timelineResponse.items,
          comments: commentsResponse.items,
          attachments: attachmentsResponse.items
        };
      });
      if (requestId !== loadRequestRef.current) return;
      if (data.task) {
        setTask(data.task);
        setAssignment(data.task.assignedToId ?? "");
      }
      if (includeHistory) {
        loadedHistoryTaskRef.current = taskId;
        setHasMoreComments(data.comments.length === TASK_DETAIL_PAGE_SIZE);
      }
      if (includeHistory && timelineRequestId === timelineLoadRequestRef.current) {
        setHasMoreTimeline(data.timeline.length === TASK_DETAIL_PAGE_SIZE);
        setTimeline((prev) => {
          if (!append) {
            return data.timeline;
          }
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...data.timeline.filter((item) => !seen.has(item.id))];
        });
      }
      if (includeHistory) {
        setComments((prev) => {
          if (!append) {
            return data.comments;
          }
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...data.comments.filter((item) => !seen.has(item.id))];
        });
      }
      if (!append) {
        setAttachments(data.attachments);
      }
    } catch (error) {
      if (requestId === loadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === loadRequestRef.current) {
        if (append) {
          setIsLoadingMoreTimeline(false);
        } else if (!silent) {
          setIsLoading(false);
        }
      }
    }
  }, [activeCompany?.id, canManageTasks, taskId, withAuthorizedToken]);

  useEffect(() => {
    if (
      task &&
      task.companyId === activeCompany?.id &&
      task.activityCode &&
      enabledActivities.some((activity) => activity.code === task.activityCode)
    ) setSelectedActivityCode(task.activityCode);
  }, [activeCompany?.id, enabledActivities, setSelectedActivityCode, task?.activityCode, task?.companyId]);

  const loadHistory = useCallback(async () => {
    if (!taskId || loadedHistoryTaskRef.current === taskId) return;
    const requestId = ++timelineLoadRequestRef.current;
    setIsLoadingHistory(true);
    try {
      const [timelineResponse, commentsResponse] = await withAuthorizedToken(async (accessToken) =>
        Promise.all([
          listOperationsTaskTimelineRequest(accessToken, taskId, {
            limit: TASK_DETAIL_PAGE_SIZE,
            offset: 0
          }),
          listTaskCommentsRequest(accessToken, taskId, {
            limit: TASK_DETAIL_PAGE_SIZE,
            offset: 0
          })
        ])
      );
      if (requestId !== timelineLoadRequestRef.current) return;
      loadedHistoryTaskRef.current = taskId;
      setTimeline(timelineResponse.items);
      setHasMoreTimeline(timelineResponse.items.length === TASK_DETAIL_PAGE_SIZE);
      setComments(commentsResponse.items);
      setHasMoreComments(commentsResponse.items.length === TASK_DETAIL_PAGE_SIZE);
    } catch (error) {
      if (requestId === timelineLoadRequestRef.current) {
        setErrorMessage(toErrorMessage(error));
      }
    } finally {
      if (requestId === timelineLoadRequestRef.current) setIsLoadingHistory(false);
    }
  }, [taskId, withAuthorizedToken]);

  const refreshTimeline = useCallback(async () => {
    if (!taskId || !isTimelineExpandedRef.current) return;
    const requestId = ++timelineLoadRequestRef.current;
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listOperationsTaskTimelineRequest(accessToken, taskId, {
          limit: TASK_DETAIL_PAGE_SIZE,
          offset: 0
        })
      );
      if (requestId !== timelineLoadRequestRef.current) return;
      setTimeline(response.items);
      setHasMoreTimeline(response.items.length === TASK_DETAIL_PAGE_SIZE);
    } catch (error) {
      if (requestId === timelineLoadRequestRef.current) {
        setErrorMessage(toErrorMessage(error));
      }
    }
  }, [taskId, withAuthorizedToken]);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    loadRequestRef.current += 1;
    timelineLoadRequestRef.current += 1;
    setTask(null);
    setTimeline([]);
    setComments([]);
    setAttachments([]);
    setMembers([]);
    setIsLoadingMembers(false);
    setHasMoreTimeline(false);
    setHasMoreComments(false);
    loadedHistoryTaskRef.current = null;
    setIsLoadingHistory(false);
    setIsLoading(true);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isLoading && task?.id === taskId && isTimelineExpanded) {
      void loadHistory();
    }
  }, [isLoading, isTimelineExpanded, loadHistory, task]);

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
      const response = await withAuthorizedToken((accessToken) =>
        assignOperationsTaskRequest(accessToken, taskId, nextAssignedToId, assignmentNote.trim() || undefined)
      );
      setTask(response.item);
      setAssignment(response.item.assignedToId ?? "");
      setAssignmentNote("");
      setSuccessMessage("Assignation mise à jour.");
      void refreshTimeline();
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
      const response = await withAuthorizedToken((accessToken) =>
        updateOperationsTaskStatusRequest(accessToken, taskId, status)
      );
      setTask(response.item);
      setSuccessMessage("Statut mis à jour.");
      void refreshTimeline();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddComment(): Promise<void> {
    if (!taskId || isReadOnlyOwner) {
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
      const response = await withAuthorizedToken((accessToken) =>
        addTaskCommentRequest(accessToken, taskId, body)
      );
      setComments((prev) => [response.item, ...prev.filter((item) => item.id !== response.item.id)]);
      setNewComment("");
      setSuccessMessage("Commentaire ajoute.");
      void refreshTimeline();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadTaskAttachment(
    currentTaskId: string,
    selectedFile: File
  ): Promise<TaskAttachment[]> {
    const attachmentResponse = await withAuthorizedToken(async (accessToken) => {
      const authResp = await getTaskAttachmentUploadAuthRequest(accessToken, currentTaskId);
      const auth = authResp.item;

      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileName", selectedFile.name);
      formData.append("useUniqueFileName", "true");
      formData.append("folder", auth.folder);
      formData.append("publicKey", auth.publicKey);
      formData.append("token", auth.token);
      formData.append("signature", auth.signature);
      formData.append("expire", String(auth.expire));

      const uploadResponse = await fetch(auth.uploadUrl, {
        method: "POST",
        body: formData
      });

      if (!uploadResponse.ok) {
        let detail = "Echec de l'upload sur ImageKit.";
        try {
          const payload = (await uploadResponse.json()) as { message?: string };
          if (payload.message) {
            detail = payload.message;
          }
        } catch {
          // no-op
        }
        throw new ApiError(uploadResponse.status, detail);
      }

      const uploaded = (await uploadResponse.json()) as ImageKitUploadResult;

      return addTaskAttachmentRequest(accessToken, currentTaskId, {
        storageKey: resolveImageKitStorageKey(uploaded, selectedFile.name),
        fileName: resolveImageKitFileName(uploaded, selectedFile.name),
        mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
        fileSize: resolveImageKitFileSize(uploaded, selectedFile.size)
      });
    });

    return attachmentResponse.items;
  }

  async function handleAddAttachment(): Promise<void> {
    if (!taskId || isReadOnlyOwner) {
      return;
    }
    if (!attachmentFile) {
      setErrorMessage("Sélectionne un fichier à joindre.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const items = await uploadTaskAttachment(taskId, attachmentFile);
      setAttachmentFile(null);
      setAttachments(items);
      setSuccessMessage("Pièce jointe ajoutee.");
      if (isCompactScreen) {
        setIsAttachmentUploadExpanded(false);
      }
      void refreshTimeline();
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
    if (isReadOnlyOwner) {
      return false;
    }
    if (task.status === "DONE") {
      return false;
    }
    if (canManageTasks) {
      return true;
    }
    return task.assignedToId === user.id;
  }, [canManageTasks, isReadOnlyOwner, task, user]);

  const canManageTaskContent = Boolean(
    task && user && (canManageTasks || task.createdById === user.id)
  );

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
        <p className="task-detail-back-link-row">
          <Link
            to={task?.activityCode && enabledActivities.some((activity) => activity.code === task.activityCode)
              ? `/operations/tasks?activityCode=${encodeURIComponent(task.activityCode)}`
              : "/operations/tasks"}
            className="task-back-link"
          >
            Retour à la liste des tâches
          </Link>
        </p>
        <h2>Détail de la tâche</h2>
        {task && canManageTasks ? (
          <p>
            Cette fiche est rattachée au secteur <strong>{getBusinessActivityLabel(task.activityCode)}</strong>.
          </p>
        ) : null}
      </header>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
        loadingLabel="Chargement de la tâche..."
      />

      {!isLoading && task && !isReadOnlyOwner ? (
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
          {canManageTasks || (user?.role !== "OWNER" && task.createdById === user?.id && enabledActivities.some((activity) => activity.code === task.activityCode)) ? (
            <div className="actions-inline">
              {user?.role !== "OWNER" && task.createdById === user?.id && task.activityCode && enabledActivities.some((activity) => activity.code === task.activityCode) ? (
                <Link
                  className="secondary-btn"
                  to={`/operations/tasks?activityCode=${encodeURIComponent(task.activityCode)}&editTaskId=${encodeURIComponent(task.id)}#task-create`}
                >
                  Modifier cette tâche
                </Link>
              ) : null}
              {canManageTasks ? (
                <button
                  type="button"
                  className="secondary-btn mobile-hide-task-secondary-action"
                  onClick={() =>
                    navigate(`/alerts?entityType=TASK&entityId=${encodeURIComponent(task.id)}`)
                  }
                >
                  Voir alertes
                </button>
              ) : null}
            </div>
          ) : null}
          <p
            className={
              task.description?.trim()
                ? "operations-task-description"
                : "operations-task-description mobile-empty-description"
            }
          >
            {task.description?.trim() || (
              <span className="mobile-generic-placeholder">Aucune description fournie.</span>
            )}
          </p>

          <div className="operations-task-meta">
            <p>
              <strong>Activité:</strong> {getBusinessActivityLabel(task.activityCode)}
            </p>
            <p>
              <strong>Assigné:</strong>{" "}
              {task.assignedToFullName ? `${task.assignedToFullName} (${task.assignedToEmail})` : "Non assignée"}
            </p>
            <p className="task-detail-meta-secondary">
              <strong>Créateur:</strong> {task.createdByFullName} ({task.createdByEmail})
            </p>
            <p>
              <strong>Échéance:</strong> {formatDate(task.dueDate)}
            </p>
            <p className="task-detail-meta-secondary">
              <strong>Créée le:</strong> {formatDate(task.createdAt)}
            </p>
            <p className="task-detail-meta-secondary">
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
                      disabled={isSaving || isLoadingMembers}
                    >
                      <option value="">Non assignée</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.fullName} ({member.role})
                        </option>
                      ))}
                    </select>
                    {isLoadingMembers ? (
                      <small role="status">Chargement des personnes assignables...</small>
                    ) : null}
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
          <div className="task-detail-header">
            <h3>Pièces jointes</h3>
            <span className="hint">
              {attachments.length} fichier{attachments.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="proof-list task-attachment-list">
            {attachments.length === 0 ? <p>Aucune pièce jointe ajoutée.</p> : null}
            {attachments.length > 0 ? (
              <ul>
                {attachments.map((attachment) => (
                  <li key={attachment.id}>
                    {attachment.publicUrl ? (
                      <a href={attachment.publicUrl} target="_blank" rel="noreferrer">
                        {attachment.fileName}
                      </a>
                    ) : (
                      <span>{attachment.fileName} (lien indisponible)</span>
                    )}
                    <small>
                      {formatFileSize(attachment.fileSize)} |{" "}
                      {new Date(attachment.uploadedAt).toLocaleString("fr-FR")} |{" "}
                      {attachment.uploadedByFullName} ({attachment.uploadedByEmail})
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {canManageTaskContent ? (
            <details
              className="mobile-create-disclosure task-attachment-upload-disclosure"
              open={isAttachmentUploadExpanded}
              onToggle={(event) => setIsAttachmentUploadExpanded(event.currentTarget.open)}
            >
              <summary>Ajouter une pièce jointe</summary>
              <div className="proof-inline-form task-attachment-inline-form">
                <input
                  key={`${attachmentFile?.name ?? "empty"}-${attachmentFile?.size ?? 0}`}
                  type="file"
                  aria-label="Pièce jointe pour la tâche"
                  accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                  onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                  disabled={isSaving}
                />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => void handleAddAttachment()}
                  disabled={isSaving || !attachmentFile}
                >
                  Ajouter une pièce jointe
                </button>
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {!isLoading && task && canManageTaskContent ? (
        <details
          className="panel mobile-create-disclosure task-comment-disclosure"
          open={isCommentFormExpanded}
          onToggle={(event) => setIsCommentFormExpanded(event.currentTarget.open)}
        >
          <summary>Ajouter un commentaire</summary>
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
        </details>
      ) : null}

      {!isLoading && task ? (
        <section className={canManageTasks ? "panel" : "panel task-detail-lite-panel"}>
          <details
            className="mobile-create-disclosure task-timeline-disclosure"
            open={isTimelineExpanded}
            onToggle={(event) => setIsTimelineExpanded(event.currentTarget.open)}
          >
          <summary>{canManageTasks ? "Historique et commentaires" : "Historique"}</summary>
          <div className="task-timeline-content">
          {isLoadingHistory ? <p role="status">Chargement de l’historique…</p> : null}
          {!isLoadingHistory && timelineEntries.length === 0 ? <p>Aucun événement pour le moment.</p> : null}
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
          </div>
          </details>
        </section>
      ) : null}
    </>
  );
}

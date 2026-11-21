import { useActionScope } from "../lib/useActionScope";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useFormChanges } from "../lib/useFormChanges";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { EmptyState } from "../components/EmptyState";
import { SectorWorkspaceNav } from "../components/SectorWorkspaceNav";
import { SectorDirectoryPanel } from "../components/SectorDirectoryPanel";
import { getActiveSectorReferenceView } from "../config/sectorWorkspaces";
import { getSectorFieldWorkspace } from "../config/sectorFieldWorkspaces";
import { ButtonSpinner } from "../components/ButtonSpinner";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  resolveImageKitFileName,
  resolveImageKitFileSize,
  resolveImageKitStorageKey,
  type ImageKitUploadResult
} from "../lib/imagekitUpload";
import {
  addTaskAttachmentRequest,
  ApiError,
  assignOperationsTaskRequest,
  createDailyActivityCategoryRequest,
  createOperationsTaskRequest,
  deleteDailyActivityCategoryRequest,
  deleteOperationsTaskRequest,
  getGeneralStoreLedgerRowsRequest,
  getOperationsTaskRequest,
  getTaskAttachmentUploadAuthRequest,
  listBtpProjectsRequest,
  listDailyActivityCategoriesRequest,
  listOperationsMembersRequest,
  listOperationsTasksRequest,
  updateDailyActivityCategoryRequest,
  updateOperationsTaskRequest,
  updateOperationsTaskStatusRequest
} from "../lib/api";
import {
  formatAmountForDisplay,
  formatAmountForInput,
  formatEditableAmountForInput,
  normalizeAmountForApi
} from "../lib/amountFormatting";
import {
  getBusinessActivityLabel,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { ActivityFieldDefinition } from "../types/activities";
import type { OperationTask, OperationTaskMember, TaskAttachment, TaskScope, TaskStatus } from "../types/tasks";
import type { GeneralStoreShop } from "../types/shops";
import type { BtpProject } from "../types/projects";
import type { DailyActivityCategory } from "../types/daily-activity-categories";
import type { GeneralStoreOperationsReportRow } from "../types/reporting";
import { getSectorRecordContext, getSectorSearchHint } from "../utils/sectorRecordContext";

import {
  TASKS_PAGE_SIZE,
  TASKS_SERVICE_SUGGESTION_HISTORY_SIZE,
  TASKS_MOBILE_PAGE_SIZE,
  TASKS_VISIBLE_PAGE_SIZE_OPTIONS,
  DEFAULT_TASKS_VISIBLE_PAGE_SIZE,
  getTasksFetchPageSize,
  AGRICULTURE_TASK_KIND_KEY,
  AGRICULTURE_TASK_LABELS,
  BTP_TASK_KIND_KEY,
  BTP_TASK_LABELS,
  FOOD_TASK_KIND_KEY,
  FOOD_TASK_LABELS,
  RENTAL_TASK_KIND_KEY,
  RENTAL_TASK_LABELS,
  HOTEL_TASK_KIND_KEY,
  HOTEL_TASK_LABELS,
  AGENCY_TASK_KIND_KEY,
  AGENCY_TASK_LABELS,
  FISH_FARMING_TASK_KIND_KEY,
  FISH_FARMING_TASK_LABELS,
  LIVESTOCK_TASK_KIND_KEY,
  LIVESTOCK_TASK_LABELS,
  GENERAL_EXPENSE_KIND_KEY,
  GENERAL_EXPENSE_KIND_LABELS,
  isGeneralExpenseKind,
  DAILY_ACTIVITY_KIND_KEY,
  DAILY_ACTIVITY_AMOUNT_KEY,
  DAILY_PROTOCOL_CATEGORY,
  toErrorMessage,
  formatFileSize,
  statusLabel,
  statusToneClass,
  statusShortMetric,
  memberLabel,
  formatDate,
  syncMetadataState,
  isAgricultureTaskKind,
  isBtpTaskKind,
  isFoodTaskKind,
  isRentalTaskKind,
  isHotelTaskKind,
  isAgencyTaskKind,
  isFishFarmingTaskKind,
  isLivestockTaskKind,
  formatMetadataValue,
  formatMetadataSummary,
  isRequiredDailyAgreementField,
  createDefaultTaskForm
} from "../utils/operationsTasks";

export function OperationsTasksPage(): JSX.Element {
  const [tasksListPageSize] = useState(getTasksFetchPageSize);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEditTaskId = new URLSearchParams(location.search).get("editTaskId");
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const {
    enabledActivities,
    isLoading: isLoadingActivities,
    selectedActivityCode,
    selectedProfile
  } = useBusinessActivity();
  // Service category suggestions still use the loaded history. Retain its
  // previous depth until those suggestions have a dedicated source.
  const tasksFetchPageSize = selectedActivityCode === "SERVICES" && tasksListPageSize === TASKS_PAGE_SIZE
    ? TASKS_SERVICE_SUGGESTION_HISTORY_SIZE : tasksListPageSize;
  const fieldWorkspace = getSectorFieldWorkspace(selectedActivityCode);
  const isCategoriesView = getActiveSectorReferenceView(location.pathname, location.search, selectedActivityCode, user?.role)?.view === "categories";
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [members, setMembers] = useState<OperationTaskMember[]>([]);
  const [shops, setShops] = useState<GeneralStoreShop[]>([]);
  const [shopLedgerRows, setShopLedgerRows] = useState<GeneralStoreOperationsReportRow[]>([]);
  const [loadedShopLedgerContext, setLoadedShopLedgerContext] = useState<string | null>(null);
  const [projects, setProjects] = useState<BtpProject[]>([]);
  const [loadedProjectsContext, setLoadedProjectsContext] = useState<string | null>(null);
  const [dailyActivityCategories, setDailyActivityCategories] = useState<DailyActivityCategory[]>([]);
  const [categoryForm, setCategoryForm] = useState({ name: "" });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [isDailyActivityCategoriesExpanded, setIsDailyActivityCategoriesExpanded] = useState(false);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState<DailyActivityCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const hasLoadedTasksRef = useRef(false);
  const tasksLoadRequestRef = useRef(0);
  const membersLoadRequestRef = useRef(0);
  const loadedMembersContextRef = useRef<string | null>(null);
  const membersContextRef = useRef("");
  const shopLedgerLoadRequestRef = useRef(0);
  const projectsLoadRequestRef = useRef(0);
  const dailyCategoriesLoadRequestRef = useRef(0);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const editingTaskActivityRef = useRef<BusinessActivityCode | null>(null);
  const sectorFormScopeRef = useRef({ companyId: activeCompany?.id, activityCode: selectedActivityCode });
  const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingTaskForm, setIsSavingTaskForm] = useState(false);
  const [isTaskFormExpanded, setIsTaskFormExpanded] = useState(
    () => !fieldWorkspace && (typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches)
  );
  const [isTaskAttachmentExpanded, setIsTaskAttachmentExpanded] = useState(
    () => !fieldWorkspace && (typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches)
  );
  const actionScopeKey = JSON.stringify([activeCompany?.id, user?.id, user?.role, selectedActivityCode]);
  const captureActionScope = useActionScope(actionScopeKey);
  useEffect(() => {
    setIsSavingTaskForm(false);
    setIsSavingCategory(false);
    setIsBulkAssigning(false);
    setBusyTaskId(null);
    setBusyCategoryId(null);
  }, [actionScopeKey]);
  const taskFormScope = `${activeCompany?.id ?? ""}:${selectedActivityCode ?? ""}`;
  const [mountedTaskFormScope, setMountedTaskFormScope] = useState<string | null>(null);
  const isTaskFormOpen = isTaskFormExpanded || Boolean(editingTaskId) || Boolean(requestedEditTaskId);
  const shouldRenderTaskForm = isTaskFormOpen || mountedTaskFormScope === taskFormScope;
  useEffect(() => {
    if (isTaskFormOpen) setMountedTaskFormScope(taskFormScope);
  }, [taskFormScope, isTaskFormOpen]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 640px)");
    const updateTaskAttachment = (event: MediaQueryListEvent): void => {
      setIsTaskAttachmentExpanded(!event.matches);
    };

    mobileViewport.addEventListener("change", updateTaskAttachment);
    return () => mobileViewport.removeEventListener("change", updateTaskAttachment);
  }, []);

  const tasksViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("operations-tasks", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const tasksSearchStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("operations-tasks-search", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const tasksVisiblePageSizeStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("operations-tasks-visible-page-size", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialFilters = useMemo(
    () => ({
      status: "ALL" as "ALL" | TaskStatus
    }),
    []
  );
  const [filters, setFilters] = usePersistedViewState(tasksViewStorageKey, initialFilters);
  const [searchQuery, setSearchQuery] = usePersistedViewState(tasksSearchStorageKey, "");
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const [visibleTasksPageSize, setVisibleTasksPageSize] = usePersistedViewState(
    tasksVisiblePageSizeStorageKey,
    DEFAULT_TASKS_VISIBLE_PAGE_SIZE
  );
  const [visibleTasksPage, setVisibleTasksPage] = useState(1);
  const requestedStatus = new URLSearchParams(location.search).get("status");
  useEffect(() => {
    if (!requestedStatus || !["TODO", "IN_PROGRESS", "DONE", "BLOCKED"].includes(requestedStatus)) return;
    setFilters({ status: requestedStatus as TaskStatus });
    setSearchQuery("");
    setVisibleTasksPage(1);
  }, [requestedStatus, activeCompany?.id, selectedActivityCode, setFilters, setSearchQuery]);

  const [createForm, setCreateForm] = useState(createDefaultTaskForm);
  const [taskAttachmentFile, setTaskAttachmentFile] = useState<File | null>(null);

  const formScope = `${activeCompany?.id ?? ""}:${selectedActivityCode ?? ""}`;
  const categoryChanges = useFormChanges(categoryForm, `${formScope}:category:${editingCategoryId ?? "new"}`);
  const taskChanges = useFormChanges({ createForm, attachment: taskAttachmentFile?.name }, `${formScope}:task:${editingTaskId ?? "new"}`);

  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [assignmentNotes, setAssignmentNotes] = useState<Record<string, string>>({});
  const [selectedTasks, setSelectedTasks] = useState<Record<string, boolean>>({});
  const [bulkAssignForm, setBulkAssignForm] = useState({
    assignedToId: "",
    note: ""
  });
  const [taskPendingDelete, setTaskPendingDelete] = useState<OperationTask | null>(null);
  const isReadOnlyOwner = user?.role === "OWNER";

  const canAssignTasks = useMemo(() => {
    return user?.role === "SYS_ADMIN" || user?.role === "SUPERVISOR";
  }, [user?.role]);
  const canViewAllTasks = useMemo(() => {
    return Boolean(user);
  }, [user]);
  const canCreateTasks = useMemo(() => {
    return Boolean(user) && user?.role !== "OWNER";
  }, [user]);
  const canManageDailyActivityCategories = useMemo(() => {
    return (
      user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT" || user?.role === "SUPERVISOR"
    );
  }, [user?.role]);

  const taskMetadataFields = selectedProfile?.tasks.metadataFields ?? [];
  const previousCategoriesView = useRef(isCategoriesView);
  useEffect(() => {
    if (previousCategoriesView.current === isCategoriesView) return;
    previousCategoriesView.current = isCategoriesView;
    // Navigation was confirmed by the shared guard before changing views.
    categoryChanges.markClean();
    setEditingCategoryId(null);
    setCategoryForm({ name: "" });
    setIsDailyActivityCategoriesExpanded(false);
    taskChanges.markClean();
    setEditingTaskId(null);
    editingTaskActivityRef.current = null;
    setCreateForm({ ...createDefaultTaskForm(), metadata: syncMetadataState({}, taskMetadataFields) });
    setTaskAttachmentFile(null);
    setIsTaskFormExpanded(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [isCategoriesView, taskMetadataFields]);

  useEffect(() => {
    if (selectedActivityCode !== "DAILY_ACTIVITIES" || location.hash !== "#daily-activity-categories" || !canManageDailyActivityCategories) return;
    if (!isCategoriesView) {
      navigate(`/operations/tasks?activityCode=DAILY_ACTIVITIES&view=categories#daily-activity-categories`, { replace: true });
    } else {
      setIsDailyActivityCategoriesExpanded(true);
      navigate(`${location.pathname}${location.search}`, { replace: true });
    }
  }, [selectedActivityCode, location.hash, location.pathname, location.search, isCategoriesView, canManageDailyActivityCategories, navigate]);
  useEffect(() => {
    const previous = sectorFormScopeRef.current;
    if (previous.companyId === activeCompany?.id && previous.activityCode === selectedActivityCode) return;
    sectorFormScopeRef.current = { companyId: activeCompany?.id, activityCode: selectedActivityCode };
    const hadUnsavedWork = taskChanges.isDirty;
    setEditingTaskId(null);
    editingTaskActivityRef.current = null;
    setCreateForm({
      ...createDefaultTaskForm(),
      metadata: syncMetadataState({}, taskMetadataFields)
    });
    setTaskAttachmentFile(null);
    setTasks([]);
    setHasMoreTasks(false);
    hasLoadedTasksRef.current = false;
    setIsLoading(true);
    setEditingCategoryId(null);
    categoryChanges.markClean();
    setCategoryForm({ name: "" });
    setIsDailyActivityCategoriesExpanded(false);
    if (fieldWorkspace && location.hash !== "#task-create") setIsTaskFormExpanded(false);
    setErrorMessage(null);
    setSuccessMessage(hadUnsavedWork ? "Le formulaire a été réinitialisé pour le nouveau secteur." : null);
  }, [activeCompany?.id, editingTaskId, taskChanges.isDirty, selectedActivityCode, taskMetadataFields]);
  const hasRequiredTaskMetadata = taskMetadataFields.some((field) => field.required);
  const visibleTaskMetadataFields = selectedActivityCode === "TRANSPORT"
    ? taskMetadataFields.filter((field) => [
        "transportCategory", "transportTaskKind", "vehicleRef", "routeRef"
      ].includes(field.key))
    : selectedActivityCode === "HYDROCARBON"
      ? taskMetadataFields.filter((field) =>
          ["hydrocarbonCategory", "hydrocarbonTaskKind", "locationRef"].includes(field.key) ||
          (field.key === "hydrocarbonAssetRef" && createForm.metadata.hydrocarbonCategory === "Citerne")
        )
    : taskMetadataFields;
  const sectorTasks = useMemo(
    () => tasks.filter((task) => task.companyId === activeCompany?.id && task.activityCode === selectedActivityCode),
    [activeCompany?.id, selectedActivityCode, tasks]
  );
  const serviceCategorySuggestions = useMemo(() => {
    if (selectedActivityCode !== "SERVICES") return [];
    const values = new Set(["Morgue"]);
    for (const task of sectorTasks) {
      if (task.activityCode === "SERVICES" && task.metadata.serviceCategory?.trim()) {
        values.add(task.metadata.serviceCategory.trim());
      }
    }
    return [...values].sort((left, right) => left.localeCompare(right, "fr"));
  }, [selectedActivityCode, sectorTasks]);
  const displayTasks = sectorTasks;

  const totalVisibleTaskPages = useMemo(() => {
    return Math.max(1, Math.ceil(displayTasks.length / visibleTasksPageSize));
  }, [displayTasks.length, visibleTasksPageSize]);
  const paginatedTasks = useMemo(() => {
    const startIndex = (visibleTasksPage - 1) * visibleTasksPageSize;
    return displayTasks.slice(startIndex, startIndex + visibleTasksPageSize);
  }, [displayTasks, visibleTasksPage, visibleTasksPageSize]);
  const visibleTasksRange = useMemo(() => {
    if (displayTasks.length === 0) {
      return { start: 0, end: 0 };
    }

    const start = (visibleTasksPage - 1) * visibleTasksPageSize + 1;
    const end = Math.min(visibleTasksPage * visibleTasksPageSize, displayTasks.length);
    return { start, end };
  }, [displayTasks.length, visibleTasksPage, visibleTasksPageSize]);

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

  const currentMembersContext = `${activeCompany?.id ?? ""}:${selectedActivityCode ?? ""}`;
  membersContextRef.current = currentMembersContext;

  const loadMembers = useCallback(async () => {
    if (isLoadingActivities) return;
    if (!selectedActivityCode || !canAssignTasks) {
      setMembers([]);
      setIsLoadingMembers(false);
      return;
    }
    const requestContext = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
    if (loadedMembersContextRef.current === requestContext) return;
    const requestId = ++membersLoadRequestRef.current;
    setIsLoadingMembers(true);

    try {
      const response = await withAuthorizedToken((accessToken) =>
        listOperationsMembersRequest(accessToken, { activityCode: selectedActivityCode })
      );
      if (
        requestId !== membersLoadRequestRef.current ||
        membersContextRef.current !== requestContext
      ) return;
      loadedMembersContextRef.current = requestContext;
      setMembers(response.items);
    } catch (error) {
      if (requestId === membersLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === membersLoadRequestRef.current) setIsLoadingMembers(false);
    }
  }, [activeCompany?.id, canAssignTasks, isLoadingActivities, selectedActivityCode, withAuthorizedToken]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean; silent?: boolean }) => {
    const requestId = ++tasksLoadRequestRef.current;
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    const silent = options?.silent === true;
    const pageSize = tasksFetchPageSize;
    if (isLoadingActivities) {
      setIsLoadingMoreTasks(false);
      return;
    }
    if (!selectedActivityCode) {
      setTasks([]);
      setHasMoreTasks(false);
      setIsLoadingMoreTasks(false);
      setIsLoading(false);
      return;
    }

    if (append) {
      setIsLoadingMoreTasks(true);
    } else {
      setIsLoadingMoreTasks(false);
      if (!silent) setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const query = {
        limit: pageSize,
        offset,
        search: debouncedSearch || undefined,
        status: filters.status === "ALL" ? undefined : filters.status,
        activityCode: selectedActivityCode,
        scope: canViewAllTasks ? ("ALL" as TaskScope) : ("ASSIGNED_TO_ME" as TaskScope)
      };

      const taskResponse = await withAuthorizedToken((accessToken) =>
        listOperationsTasksRequest(accessToken, query)
      );
      if (requestId !== tasksLoadRequestRef.current) return;
      setHasMoreTasks(taskResponse.items.length === pageSize);
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
      setAssignmentNotes((prev) => {
        const next = append ? { ...prev } : {};
        for (const task of taskResponse.items) {
          next[task.id] = prev[task.id] ?? "";
        }
        return next;
      });
    } catch (error) {
      if (requestId === tasksLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === tasksLoadRequestRef.current) {
        if (append) {
          setIsLoadingMoreTasks(false);
        } else if (!silent) {
          hasLoadedTasksRef.current = true;
          setIsLoading(false);
        }
      }
    }
  }, [
    canViewAllTasks,
    activeCompany?.id,
    filters.status,
    debouncedSearch,
    isLoadingActivities,
    selectedActivityCode,
    tasksFetchPageSize,
    withAuthorizedToken
  ]);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    membersLoadRequestRef.current += 1;
    loadedMembersContextRef.current = null;
    setTasks([]);
    setAssignments({});
    setAssignmentNotes({});
    setHasMoreTasks(false);
    setIsLoadingMoreTasks(false);
    setMembers([]);
    setShops([]);
    setShopLedgerRows([]);
    setProjects([]);
    setDailyActivityCategories([]);
    setLoadedShopLedgerContext(null);
    setLoadedProjectsContext(null);
    setIsLoading(true);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  useEffect(() => {
    membersLoadRequestRef.current += 1;
    loadedMembersContextRef.current = null;
    setMembers([]);
    setIsLoadingMembers(false);
  }, [activeCompany?.id, selectedActivityCode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if ((canCreateTasks && isTaskFormExpanded) || editingTaskId) {
      void loadMembers();
    }
  }, [canCreateTasks, editingTaskId, isTaskFormExpanded, loadMembers]);

  useEffect(() => {
    if (location.hash !== "#task-create" || isLoading) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsTaskFormExpanded(true);
      const target = document.getElementById("task-create");
      if (!target) {
        return;
      }
      target.scrollIntoView({ block: "start" });
      navigate(`${location.pathname}${location.search}`, { replace: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isLoading, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!editingTaskId) return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById("task-create")?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editingTaskId]);

  useEffect(() => {
    if (!editingCategoryId) return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById("daily-activity-categories")?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editingCategoryId]);

  const loadShopLedger = useCallback(async () => {
    const requestId = ++shopLedgerLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "GENERAL_STORE") {
      setShopLedgerRows([]);
      setLoadedShopLedgerContext(null);
      setShops([]);
      return;
    }
    if (!isTaskFormExpanded && !editingTaskId) {
      return;
    }
    const contextKey = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
    if (loadedShopLedgerContext === contextKey) {
      return;
    }
    setShopLedgerRows([]);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        getGeneralStoreLedgerRowsRequest(accessToken)
      );
      if (requestId !== shopLedgerLoadRequestRef.current) return;
      setShops(payload.shops);
      setShopLedgerRows(payload.rows);
      setLoadedShopLedgerContext(contextKey);
    } catch {
      if (requestId === shopLedgerLoadRequestRef.current) {
        setShops([]);
        setShopLedgerRows([]);
        setErrorMessage("Chargement des boutiques impossible. Vérifiez la connexion backend.");
      }
    }
  }, [activeCompany?.id, editingTaskId, isLoadingActivities, isTaskFormExpanded, loadedShopLedgerContext, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadShopLedger();
  }, [loadShopLedger]);

  const loadProjects = useCallback(async () => {
    const requestId = ++projectsLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "BTP") {
      setProjects([]);
      setLoadedProjectsContext(null);
      return;
    }
    if (!isTaskFormExpanded && !editingTaskId) {
      return;
    }
    const contextKey = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
    if (loadedProjectsContext === contextKey) {
      return;
    }
    setProjects([]);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listBtpProjectsRequest(accessToken)
      );
      if (requestId !== projectsLoadRequestRef.current) return;
      setProjects(payload.items);
      setLoadedProjectsContext(contextKey);
    } catch (error) {
      if (requestId === projectsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    }
  }, [activeCompany?.id, editingTaskId, isLoadingActivities, isTaskFormExpanded, loadedProjectsContext, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const loadDailyActivityCategories = useCallback(async () => {
    const requestId = ++dailyCategoriesLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "DAILY_ACTIVITIES") {
      setDailyActivityCategories([]);
      setHasLoadedCategories(false);
      setIsLoadingCategories(false);
      return;
    }
    setIsLoadingCategories(true);
    setHasLoadedCategories(false);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listDailyActivityCategoriesRequest(accessToken)
      );
      if (requestId !== dailyCategoriesLoadRequestRef.current) return;
      setDailyActivityCategories(payload.items);
      setHasLoadedCategories(true);
    } catch (error) {
      if (requestId === dailyCategoriesLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === dailyCategoriesLoadRequestRef.current) setIsLoadingCategories(false);
    }
  }, [activeCompany?.id, isLoadingActivities, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadDailyActivityCategories();
  }, [loadDailyActivityCategories]);

  function resetCategoryForm(): void {
    setEditingCategoryId(null);
    categoryChanges.markClean();
    setCategoryForm({ name: "" });
  }

  async function handleSaveCategory(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingCategory(true);
    try {
      const payload = { name: categoryForm.name.trim() };
      const response = await withAuthorizedToken((accessToken) =>
        editingCategoryId
          ? updateDailyActivityCategoryRequest(accessToken, editingCategoryId, payload)
          : createDailyActivityCategoryRequest(accessToken, payload)
      );
      if (!isCurrentAction()) return;
      setDailyActivityCategories((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      setSuccessMessage(editingCategoryId ? "Catégorie modifiée." : "Catégorie ajoutée.");
      resetCategoryForm();
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingCategory(false);
    }
  }

  function handleStartEditCategory(category: DailyActivityCategory): void {
    if (!categoryChanges.confirmDiscard()) return;
    categoryChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingCategoryId(category.id);
    setIsDailyActivityCategoriesExpanded(true);
    setCategoryForm({ name: category.name });
  }

  function handleCancelEditCategory(): void {
    if (!categoryChanges.confirmDiscard()) return;
    categoryChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetCategoryForm();
  }

  function handleDeleteCategory(category: DailyActivityCategory): void {
    setCategoryPendingDelete(category);
  }

  async function handleConfirmDeleteCategory(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!categoryPendingDelete) {
      return;
    }
    const category = categoryPendingDelete;
    setBusyCategoryId(category.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteDailyActivityCategoryRequest(accessToken, category.id));
      if (!isCurrentAction()) return;
      if (editingCategoryId === category.id) {
        resetCategoryForm();
      }
      setSuccessMessage("Catégorie supprimée.");
      setCategoryPendingDelete(null);
      setDailyActivityCategories((prev) => prev.filter((item) => item.id !== category.id));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyCategoryId(null);
    }
  }

  useEffect(() => {
    setVisibleTasksPage(1);
  }, [searchQuery, filters.status, selectedActivityCode]);

  useEffect(() => {
    setVisibleTasksPage((previousPage) =>
      previousPage > totalVisibleTaskPages ? totalVisibleTaskPages : previousPage
    );
  }, [totalVisibleTaskPages]);

  async function handleLoadMoreTasks(): Promise<void> {
    if (isLoading || isLoadingMoreTasks || !hasMoreTasks) {
      return;
    }
    await loadData({
      offset: tasks.length,
      append: true
    });
  }

  function renderVisibleTasksPagination(placement: "top" | "bottom" = "top"): JSX.Element | null {
    if (displayTasks.length === 0) {
      return null;
    }

    return (
      <div className={`list-pagination list-view-pagination mobile-pagination-${placement}`}>
        <div className="list-view-pagination-meta">
          <p className="hint list-pagination-meta">
            Tâches {visibleTasksRange.start} à {visibleTasksRange.end} sur {displayTasks.length} affichée(s)
            {displayTasks.length !== tasks.length ? ` (${tasks.length} chargée(s) localement)` : ""}
            {hasMoreTasks ? " et d'autres pages serveur sont disponibles." : "."}
          </p>
          <label className="list-view-page-size">
            <span>Cartes par page</span>
            <select
              value={visibleTasksPageSize}
              onChange={(event) => setVisibleTasksPageSize(Number(event.target.value))}
            >
              {TASKS_VISIBLE_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="list-view-pagination-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setVisibleTasksPage((previousPage) => Math.max(1, previousPage - 1))}
            disabled={visibleTasksPage <= 1}
          >
            Précédent
          </button>
          <p className="hint list-view-page-indicator">
            Page {visibleTasksPage} sur {totalVisibleTaskPages}
          </p>
          <button
            type="button"
            className="secondary-btn"
            onClick={() =>
              setVisibleTasksPage((previousPage) => Math.min(totalVisibleTaskPages, previousPage + 1))
            }
            disabled={visibleTasksPage >= totalVisibleTaskPages}
          >
            Suivant
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    setCreateForm((prev) => ({
      ...prev,
      metadata: syncMetadataState(prev.metadata, taskMetadataFields)
    }));
  }, [taskMetadataFields, fieldWorkspace]);

  async function uploadTaskAttachment(
    taskId: string,
    selectedFile: File
  ): Promise<TaskAttachment[]> {
    const attachmentResponse = await withAuthorizedToken(async (accessToken) => {
      const authResp = await getTaskAttachmentUploadAuthRequest(accessToken, taskId);
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
        let detail = "Échec de l'upload sur ImageKit.";
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

      return addTaskAttachmentRequest(accessToken, taskId, {
        storageKey: resolveImageKitStorageKey(uploaded, selectedFile.name),
        fileName: resolveImageKitFileName(uploaded, selectedFile.name),
        mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
        fileSize: resolveImageKitFileSize(uploaded, selectedFile.size)
      });
    });

    return attachmentResponse.items;
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    if (!canCreateTasks || !selectedActivityCode) {
      return;
    }
    if (editingTaskId && editingTaskActivityRef.current !== selectedActivityCode) {
      setErrorMessage("Cette tâche appartient à un autre secteur. Rouvrez-la depuis son secteur.");
      return;
    }
    const wasEditingTask = Boolean(editingTaskId);
    const attachmentFileToUpload = editingTaskId ? null : taskAttachmentFile;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingTaskForm(true);
    try {
      let taskMetadata = createForm.metadata.remainingStockValue
        ? {
            ...createForm.metadata,
            remainingStockValue: normalizeAmountForApi(createForm.metadata.remainingStockValue)
          }
        : createForm.metadata;
      if (selectedActivityCode === "DAILY_ACTIVITIES" && taskMetadata[DAILY_ACTIVITY_AMOUNT_KEY]) {
        taskMetadata = {
          ...taskMetadata,
          [DAILY_ACTIVITY_AMOUNT_KEY]: normalizeAmountForApi(taskMetadata[DAILY_ACTIVITY_AMOUNT_KEY])
        };
      }
      for (const key of ["agreementCapitalAmount", "agreementProfitAmount"]) {
        if (selectedActivityCode === "DAILY_ACTIVITIES" && taskMetadata[key]) {
          taskMetadata = { ...taskMetadata, [key]: normalizeAmountForApi(taskMetadata[key]) };
        }
      }
      const response = await withAuthorizedToken((accessToken) =>
        editingTaskId
          ? updateOperationsTaskRequest(accessToken, editingTaskId, {
              title: createForm.title.trim(),
              description: createForm.description.trim() || undefined,
              metadata: taskMetadata,
              dueDate: createForm.dueDate
                ? new Date(createForm.dueDate).toISOString()
                : undefined
            })
          : createOperationsTaskRequest(accessToken, {
              title: createForm.title.trim(),
              description: createForm.description.trim() || undefined,
              activityCode: selectedActivityCode as BusinessActivityCode,
              assignedToId: canAssignTasks ? createForm.assignedToId || undefined : undefined,
              metadata: taskMetadata,
              dueDate: createForm.dueDate
                ? new Date(createForm.dueDate).toISOString()
                : undefined
            })
      );
      if (!isCurrentAction()) return;
      setEditingTaskId(null);
      editingTaskActivityRef.current = null;
      taskChanges.markClean();
      if (window.matchMedia("(max-width: 640px)").matches) {
        setIsTaskFormExpanded(false);
      }
      setCreateForm({
        ...createDefaultTaskForm(),
        metadata: syncMetadataState({}, taskMetadataFields)
      });
      setTaskAttachmentFile(null);
      setSuccessMessage(
        attachmentFileToUpload && !editingTaskId
          ? "Tâche créée. Envoi de la pièce jointe en cours…"
          : editingTaskId
            ? "Tâche modifiée."
            : "Tâche créée."
      );
      if (wasEditingTask) {
        setTasks((prev) =>
          prev.map((task) => (task.id === response.item.id ? response.item : task))
        );
      } else {
        const createdTaskIsVisible =
          response.item.activityCode === selectedActivityCode &&
          (filters.status === "ALL" || filters.status === response.item.status) &&
          (canViewAllTasks || response.item.assignedToId === user?.id);
        if (createdTaskIsVisible) {
          setVisibleTasksPage(1);
          setTasks((prev) => [
            response.item,
            ...prev.filter((task) => task.id !== response.item.id)
          ]);
          if (tasks.length + 1 >= tasksFetchPageSize) {
            setHasMoreTasks(true);
          }
          setAssignments((prev) => ({
            ...prev,
            [response.item.id]: prev[response.item.id] ?? response.item.assignedToId ?? ""
          }));
          setAssignmentNotes((prev) => ({
            ...prev,
            [response.item.id]: prev[response.item.id] ?? ""
          }));
        }
      }
      if (!editingTaskId && attachmentFileToUpload) {
        void uploadTaskAttachment(response.item.id, attachmentFileToUpload)
          .then(() => {
            if (!isCurrentAction()) return;
            setSuccessMessage("Tâche créée avec pièce jointe.");
          })
          .catch((error) => {
            if (!isCurrentAction()) return;
            setErrorMessage(
              `Tâche créée, mais la pièce jointe n'a pas pu être ajoutée. ${toErrorMessage(error)}`
            );
            setSuccessMessage("Tâche créée. Vous pouvez réessayer depuis le détail.");
          });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingTaskForm(false);
    }
  }

  function getTaskEditLockMessage(task: OperationTask): string | null {
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez modifier que les tâches que vous avez créées.";
    }
    return null;
  }

  function getTaskDeleteLockMessage(task: OperationTask): string | null {
    if (user?.role === "SYS_ADMIN") {
      return null;
    }
    if (task.createdById !== user?.id) {
      return "Vous ne pouvez supprimer que les tâches que vous avez créées.";
    }
    return null;
  }

  function canDeleteTask(task: OperationTask): boolean {
    return getTaskDeleteLockMessage(task) === null;
  }

  function handleStartEditTask(task: OperationTask): void {
    const lockMessage = getTaskEditLockMessage(task);
    if (lockMessage) {
      setErrorMessage(lockMessage);
      setSuccessMessage(null);
      return;
    }

    if (!taskChanges.confirmDiscard()) return;
    taskChanges.markClean();
    setEditingTaskId(task.id);
    editingTaskActivityRef.current = task.activityCode;
    setIsTaskFormExpanded(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTaskAttachmentFile(null);
    const metadata = syncMetadataState(task.metadata, taskMetadataFields);
    if (task.activityCode === "TRANSPORT" && !metadata.transportCategory) {
      const categoryOptions = taskMetadataFields.find((field) => field.key === "transportCategory")?.options ?? [];
      const legacyAssetType = task.metadata.assetType?.trim() ?? "";
      metadata.transportCategory = categoryOptions.includes(legacyAssetType) ? legacyAssetType : "Autre";
    }
    if (task.activityCode === "HYDROCARBON") {
      metadata.hydrocarbonCategory ||= metadata.hydrocarbonAssetRef ? "Citerne" : "Autre";
      metadata.hydrocarbonTaskKind ||= "SUIVI_GENERAL";
    }
    setCreateForm({
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : "",
      assignedToId: task.assignedToId ?? "",
      metadata
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTaskId = params.get("editTaskId");
    const requestedActivityCode = params.get("activityCode");
    const clearRequest = (): void => {
      params.delete("editTaskId");
      navigate({ pathname: location.pathname, search: params.toString(), hash: "" }, { replace: true });
    };
    if (!requestedTaskId || isLoadingActivities) return;
    if (!canCreateTasks) {
      setErrorMessage("Votre rôle ne permet pas de modifier cette tâche.");
      clearRequest();
      return;
    }
    if (requestedActivityCode && !enabledActivities.some((activity) => activity.code === requestedActivityCode)) {
      setErrorMessage("Le secteur demandé n'est plus disponible pour la modification.");
      params.delete("activityCode");
      clearRequest();
      return;
    }
    if (!selectedProfile || !selectedActivityCode) {
      setErrorMessage("Aucun secteur actif n'est disponible pour modifier cette tâche.");
      clearRequest();
      return;
    }
    if (requestedActivityCode && requestedActivityCode !== selectedActivityCode) return;

    let cancelled = false;
    void withAuthorizedToken((accessToken) => getOperationsTaskRequest(accessToken, requestedTaskId))
      .then(({ item }) => {
        if (cancelled) return;
        if (item.activityCode !== selectedActivityCode || item.createdById !== user?.id) {
          setErrorMessage("Cette tâche ne peut pas être modifiée depuis le secteur actuel.");
          clearRequest();
          return;
        }
        handleStartEditTask(item);
        clearRequest();
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(toErrorMessage(error));
        clearRequest();
      });
    return () => { cancelled = true; };
  }, [canCreateTasks, enabledActivities, isLoadingActivities, location.pathname, location.search, navigate, selectedActivityCode, selectedProfile, taskMetadataFields, user?.id, withAuthorizedToken]);

  function handleCancelEditTask(): void {
    if (!taskChanges.confirmDiscard()) return;
    taskChanges.markClean();
    setEditingTaskId(null);
    editingTaskActivityRef.current = null;
    setIsTaskFormExpanded(false);
    setCreateForm({
      ...createDefaultTaskForm(),
      metadata: syncMetadataState({}, taskMetadataFields)
    });
    setTaskAttachmentFile(null);
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
    const isCurrentAction = captureActionScope();
    if (!taskPendingDelete) {
      return;
    }

    const task = taskPendingDelete;
    setBusyTaskId(task.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteOperationsTaskRequest(accessToken, task.id));
      if (!isCurrentAction()) return;
      if (editingTaskId === task.id) {
        handleCancelEditTask();
      }
      setTasks((prev) => prev.filter((item) => item.id !== task.id));
      setSuccessMessage("Tâche supprimée.");
      setTaskPendingDelete(null);
      if (hasMoreTasks) {
        void loadData({
          offset: Math.max(0, tasks.length - 1),
          append: true
        });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTaskId(null);
    }
  }

  async function handleSaveAssignment(taskId: string): Promise<void> {
    const isCurrentAction = captureActionScope();
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
      const response = await withAuthorizedToken((accessToken) =>
        assignOperationsTaskRequest(
          accessToken,
          taskId,
          selectedOrNull,
          assignmentNotes[taskId]?.trim() || undefined
        )
      );
      if (!isCurrentAction()) return;
      const remainsInCurrentList = taskMatchesCurrentList(response.item);
      setTasks((prev) =>
        remainsInCurrentList
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : prev.filter((item) => item.id !== response.item.id)
      );
      setSuccessMessage("Assignation mise à jour.");
      if (!remainsInCurrentList && hasMoreTasks) {
        void loadData({ offset: Math.max(0, tasks.length - 1), append: true });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTaskId(null);
    }
  }

  async function handleBulkAssign(): Promise<void> {
    return;
  }

  async function handleChangeStatus(taskId: string, status: TaskStatus): Promise<void> {
    const isCurrentAction = captureActionScope();
    setBusyTaskId(taskId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        updateOperationsTaskStatusRequest(accessToken, taskId, status)
      );
      if (!isCurrentAction()) return;
      const remainsInCurrentList = taskMatchesCurrentList(response.item);
      setTasks((prev) =>
        remainsInCurrentList
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : prev.filter((item) => item.id !== response.item.id)
      );
      setSuccessMessage("Statut mis à jour.");
      if (!remainsInCurrentList && hasMoreTasks) {
        void loadData({ offset: Math.max(0, tasks.length - 1), append: true });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTaskId(null);
    }
  }

  function canUpdateTask(task: OperationTask): boolean {
    if (user?.role === "OWNER") {
      return false;
    }
    if (canAssignTasks) {
      return true;
    }
    return task.assignedToId === user?.id || task.createdById === user?.id;
  }

  function taskMatchesCurrentList(task: OperationTask): boolean {
    return (
      task.activityCode === selectedActivityCode &&
      (filters.status === "ALL" || filters.status === task.status) &&
      (canViewAllTasks || task.assignedToId === user?.id)
    );
  }

  function openTaskDetails(taskId: string): void {
    navigate(`/operations/tasks/${taskId}`);
  }

  function scrollToTaskSection(sectionId: string): void {
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (section instanceof HTMLDetailsElement) section.open = true;
      section?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
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

  function renderTasksList(): JSX.Element {
    return (
      <section id="tasks-list" className="panel">
        <div className="operations-list-header">
          <h3>{fieldWorkspace?.title ?? "Tâches"}</h3>
          {false ? (
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
          ) : !isReadOnlyOwner ? <p className="hint">{displayTasks.length} tâche(s) filtrée(s)</p> : null}
        </div>
        {!isLoading && sectorTasks.length === 0 ? (
          <EmptyState
            title={errorMessage ? "Liste indisponible" : searchQuery.trim() ? "Aucun résultat" : "Aucune tâche dans cette vue"}
            description={errorMessage ? "Le chargement a échoué. Actualisez la liste pour réessayer." : searchQuery.trim() ? "Aucune tâche ne correspond à la recherche et aux filtres sélectionnés. Effacez la recherche ou modifiez les filtres." : "Créez la première tâche du secteur actif ou changez les filtres pour retrouver les actions existantes."}
            actionLabel={canCreateTasks ? "Préparer une tâche" : undefined}
            onAction={canCreateTasks ? () => {
              setIsTaskFormExpanded(true);
              window.requestAnimationFrame(() => {
                document.getElementById("task-create")?.scrollIntoView({
                  block: "start",
                  behavior: "smooth"
                });
              });
            } : undefined}
          />
        ) : null}
        {!isLoading && sectorTasks.length > 0 && displayTasks.length === 0 ? (
          <EmptyState
            title="Aucun résultat"
            description="Aucune tâche ne correspond à la recherche ou aux filtres appliqués."
            actionLabel="Réinitialiser les filtres"
            onAction={() => {
              setSearchQuery("");
              setFilters({
                status: "ALL"
              });
            }}
          />
        ) : null}
        {!isLoading && displayTasks.length > 0 ? (
          <>
          {renderVisibleTasksPagination()}
          <div
            className="operations-task-list operations-task-list-scroll"
            role="region"
            aria-label="Liste des tâches"
            tabIndex={0}
          >
            {paginatedTasks.map((task) => {
              const isBusy = busyTaskId === task.id;
              const sectorContext = getSectorRecordContext(task.activityCode, task.metadata);
              const canUpdate = canUpdateTask(task);
              const isCompleted = task.status === "DONE";
              const editLockMessage = getTaskEditLockMessage(task);
              const deleteLockMessage = getTaskDeleteLockMessage(task);
              const canDelete = canDeleteTask(task);
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
                    <span className={`task-status-chip status-${task.status.toLowerCase()}`}>
                      {statusLabel(task.status)}
                    </span>
                  </div>

                  <h4 className="operations-task-title">{task.title}</h4>
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
                    {sectorContext.length > 0 ? (
                      <p className="sector-record-context">
                        {sectorContext.map(({ label, value }) => (
                          <span key={label}><strong>{label} :</strong> {value}</span>
                        ))}
                      </p>
                    ) : null}
                    <p>
                      <strong>Activité:</strong> {getBusinessActivityLabel(task.activityCode)}
                    </p>
                    <p>
                      <strong>Assigné:</strong>{" "}
                      {task.assignedToFullName ? `${task.assignedToFullName} (${task.assignedToEmail})` : "Non assignée"}
                    </p>
                    {canAssignTasks ? (
                      <p className="operations-task-meta-secondary">
                        <strong>Créateur:</strong> {task.createdByFullName} ({task.createdByEmail})
                      </p>
                    ) : null}
                    <p>
                      <strong>Échéance:</strong> {formatDate(task.dueDate)}
                    </p>
                    <p className="operations-task-meta-secondary">
                      <strong>Création:</strong> {formatDate(task.createdAt)}
                    </p>
                  </div>

                  {canUpdate ? (
                    <div
                      className="operations-task-actions"
                      onClick={preventCardNavigation}
                      onKeyDown={preventCardKeyboardNavigation}
                    >
                      <div className="operations-inline-actions">
                        <select
                          value={task.status}
                          onChange={(event) =>
                            void handleChangeStatus(task.id, event.target.value as TaskStatus)
                          }
                          disabled={isBusy}
                        >
                          <option value="TODO">À faire</option>
                          <option value="IN_PROGRESS">En cours</option>
                          <option value="DONE">Terminée</option>
                          <option value="BLOCKED">Bloquée</option>
                        </select>
                      </div>

                      {canAssignTasks && !isCompleted ? (
                        <div className="operations-inline-actions">
                          <select
                            value={selectedAssignee}
                            onChange={(event) =>
                              setAssignments((prev) => ({
                                ...prev,
                                [task.id]: event.target.value
                              }))
                            }
                            disabled={isBusy}
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
                            placeholder="Note d'assignation"
                            value={assignmentNotes[task.id] ?? ""}
                            onChange={(event) =>
                              setAssignmentNotes((prev) => ({
                                ...prev,
                                [task.id]: event.target.value
                              }))
                            }
                            disabled={isBusy}
                          />
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => void handleSaveAssignment(task.id)}
                            disabled={isBusy || !assignmentChanged}
                          >
                            Assigner
                          </button>
                        </div>
                      ) : null}

                      <div className="operations-inline-actions">
                        {editLockMessage ? (
                          <span className="hint">{editLockMessage}</span>
                        ) : (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleStartEditTask(task)}
                            disabled={isBusy}
                          >
                            Modifier
                          </button>
                        )}
                        {deleteLockMessage ? (
                          <span className="hint">{deleteLockMessage}</span>
                        ) : canDelete ? (
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => handleDeleteTask(task)}
                            disabled={isBusy}
                          >
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          {renderVisibleTasksPagination("bottom")}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <header className="section-header mobile-title-duplicate">
        <h2>{selectedActivityCode === "DAILY_ACTIVITIES" ? "Activités et accords" : "Suivi des tâches"}</h2>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activité dans
          l'administration.
        </p>
      ) : null}

      <SectorWorkspaceNav actions={isCategoriesView ? [{
        label: "Ajouter une catégorie",
        onClick: () => {
          if (!categoryChanges.confirmDiscard()) return;
          resetCategoryForm();
          setIsDailyActivityCategoriesExpanded(true);
          scrollToTaskSection("daily-activity-categories");
        }
      }] : [
        { label: "Voir les tâches", onClick: () => scrollToTaskSection("tasks-list") },
        ...(canCreateTasks ? [{
          label: selectedActivityCode === "DAILY_ACTIVITIES" ? "Créer une activité" : "Créer une tâche",
          onClick: () => {
            setIsTaskFormExpanded(true);
            scrollToTaskSection("task-create");
          }
        }] : []),
        ...(selectedActivityCode === "DAILY_ACTIVITIES" && canCreateTasks ? [{
          label: "Créer une fiche d’accord",
          onClick: () => {
            if (!taskChanges.confirmDiscard()) return;
            taskChanges.markClean();
            setEditingTaskId(null);
            editingTaskActivityRef.current = null;
            setCreateForm({ ...createDefaultTaskForm(), metadata: { ...syncMetadataState({}, taskMetadataFields), dailyActivityKind: DAILY_PROTOCOL_CATEGORY } });
            setTaskAttachmentFile(null);
            setErrorMessage(null);
            setSuccessMessage(null);
            setIsTaskFormExpanded(true);
            scrollToTaskSection("task-create");
          }
        }] : []),
        ...(selectedActivityCode === "DAILY_ACTIVITIES" && canManageDailyActivityCategories ? [{
          label: "Gérer les catégories",
          onClick: () => {
            navigate("/operations/tasks?activityCode=DAILY_ACTIVITIES&view=categories");
          }
        }] : [])
      ]} />

      {isCategoriesView ? (
        <>
          <FeedbackBanner errorMessage={errorMessage} successMessage={successMessage} isLoading={false} />
          <SectorDirectoryPanel
            key={activeCompany?.id}
            title="Catégories d’activité"
            searchLabel="Rechercher une catégorie"
            emptyMessage="Aucune catégorie enregistrée pour le moment."
            noResultsMessage="Aucune catégorie ne correspond à la recherche."
            records={dailyActivityCategories.filter((category) => category.companyId === activeCompany?.id)}
            getSearchValues={(category) => [category.name]}
            renderDetails={(category) => !category.isActive ? <p className="hint">Désactivée</p> : null}
            busyId={busyCategoryId}
            isSaving={isSavingCategory}
            isLoading={isLoadingCategories}
            hasLoaded={hasLoadedCategories}
            onReload={() => void loadDailyActivityCategories()}
            onEdit={handleStartEditCategory}
            onDelete={handleDeleteCategory}
            sectionId="daily-activity-categories"
            formTitle={editingCategoryId ? "Modifier une catégorie" : "Ajouter une catégorie"}
            formDescription="Les activités déjà enregistrées conservent leur historique."
            isExpanded={isDailyActivityCategoriesExpanded || Boolean(editingCategoryId)}
            onExpandedChange={setIsDailyActivityCategoriesExpanded}
          >
            <form className="finance-account-form" onSubmit={handleSaveCategory} onChangeCapture={categoryChanges.onChangeCapture} data-unsaved-sector-form={categoryChanges.isDirty ? "true" : undefined}>
              <label className="operations-inline-group">
                <span>Nom de la catégorie</span>
                <input
                  type="text"
                  placeholder="Ex: Rendez-vous"
                  value={categoryForm.name}
                  onChange={(event) => setCategoryForm({ name: event.target.value })}
                  required
                />
              </label>
              <div className="mobile-sticky-form-actions">
                <button type="submit" disabled={isSavingCategory}>
                  {isSavingCategory ? (
                    <>
                      <ButtonSpinner />
                      Enregistrement...
                    </>
                  ) : editingCategoryId ? (
                    "Enregistrer les modifications"
                  ) : (
                    "Ajouter la catégorie"
                  )}
                </button>
                {editingCategoryId ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleCancelEditCategory}
                    disabled={isSavingCategory}
                  >
                    Annuler la modification
                  </button>
                ) : null}
              </div>
            </form>
          </SectorDirectoryPanel>
        </>
      ) : null}

      {!isCategoriesView ? (<>
      {fieldWorkspace ? <p className="hint">{fieldWorkspace.helpText}</p> : null}

      <section className="panel">
        {!isReadOnlyOwner ? <h3>Recherche</h3> : null}
        <form
          className="operations-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >
          <input
            type="search"
            className="quick-search-input"
            placeholder={`Rechercher : ${getSectorSearchHint(selectedActivityCode)}...`}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value.slice(0, 200))}
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

          <button type="submit" className="mobile-hide-redundant-action">Actualiser</button>
        </form>
        <p className="hint" role="status">{searchQuery.trim() !== debouncedSearch || isLoading
          ? "Recherche dans l’historique du secteur…"
          : "Recherche dans tout l’historique autorisé du secteur, avec les filtres sélectionnés."}</p>
      </section>

      {fieldWorkspace ? renderTasksList() : null}

      {false ? <section className="panel operations-status-panel">
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
      </section> : null}

      {canCreateTasks ? (
        <details
          id="task-create"
          className="panel mobile-form-anchor mobile-create-disclosure"
          open={isTaskFormOpen}
          onToggle={(event) => setIsTaskFormExpanded(event.currentTarget.open)}
        >
          <summary>{editingTaskId ? (selectedActivityCode === "DAILY_ACTIVITIES" ? "Modifier une activité" : "Modifier une tâche") : requestedEditTaskId ? "Ouverture de la tâche..." : selectedActivityCode === "DAILY_ACTIVITIES" ? "Nouvelle activité" : "Nouvelle tâche"}</summary>
          {requestedEditTaskId && !editingTaskId ? <p className="hint" role="status">Chargement de la tâche à modifier...</p> : shouldRenderTaskForm ? (
          <form
            className="operations-task-form"
            onSubmit={handleCreateTask}
            onChangeCapture={taskChanges.onChangeCapture}
            data-unsaved-sector-form={taskChanges.isDirty || isSavingTaskForm ? "true" : undefined}
          >
            <div className="operations-task-form-primary">
              <input
                type="text"
                placeholder={selectedActivityCode === "TRANSPORT"
                  ? "Ex. : Entretien du véhicule TR-001"
                  : selectedActivityCode === "DAILY_ACTIVITIES" ? "Titre de l’activité" : "Titre de la tâche"}
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    title: event.target.value
                  }))
                }
                required
              />
              <textarea
                placeholder={
                  selectedActivityCode === "TRANSPORT"
                    ? "Décrivez le trajet, l'intervention ou le problème à traiter."
                    : selectedProfile?.tasks.requiresDescription
                    ? "Description requise"
                    : "Description facultative"
                }
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    description: event.target.value
                  }))
                }
                rows={3}
                maxLength={4000}
                required={selectedProfile?.tasks.requiresDescription ?? false}
              />
            </div>
            <label className="operations-inline-group">
              <span>
                {selectedProfile?.tasks.requiresDueDate
                  ? "Échéance requise"
                  : "Échéance (optionnelle)"}
              </span>
              <input
                type="datetime-local"
                value={createForm.dueDate}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    dueDate: event.target.value
                  }))
                }
                required={selectedProfile?.tasks.requiresDueDate ?? false}
              />
            </label>
            {canAssignTasks ? (
              <div className="scope-field">
                <label className="operations-inline-group">
                  <span>Responsable</span>
                  <select
                    value={createForm.assignedToId}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        assignedToId: event.target.value
                      }))
                    }
                    required={selectedProfile?.tasks.requiresAssignee ?? false}
                  >
                    <option value="">Non assignée</option>
                    {isLoadingMembers ? (
                      <option value="" disabled>Chargement des membres…</option>
                    ) : null}
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
                <strong>Cette tâche vous sera attribuée.</strong>
              </div>
            )}
            {visibleTaskMetadataFields.length > 0 ? (
              <details className="operations-task-form-options" open={hasRequiredTaskMetadata}>
                <summary>{selectedActivityCode === "TRANSPORT" ? "Détails Transport" : selectedActivityCode === "HYDROCARBON" ? "Détails Hydrocarbure" : "Champs liés au secteur"}</summary>
                <div className="operations-task-form-options-body">
                  {selectedActivityCode === "TRANSPORT" ? (
                    <p className="hint">Choisissez le véhicule concerné. Le trajet et la référence du véhicule sont facultatifs.</p>
                  ) : null}
                  {selectedActivityCode === "HYDROCARBON" ? (
                    <p className="hint">Choisissez le produit ou l'équipement, puis le type de suivi. La référence est demandée pour une citerne.</p>
                  ) : null}
                  {visibleTaskMetadataFields.filter((field) => {
                    if (selectedActivityCode !== "DAILY_ACTIVITIES") return true;
                    const isProtocol = createForm.metadata[DAILY_ACTIVITY_KIND_KEY] === DAILY_PROTOCOL_CATEGORY;
                    if (field.key.startsWith("agreement") && !isProtocol) return false;
                    if (field.key === "amount" && isProtocol) return false;
                    if (["agreementCapitalAmount", "agreementProfitAmount", "agreementPaymentAccount"].includes(field.key) && createForm.metadata.agreementType !== "Financier") return false;
                    return true;
                  }).map((field) => (
                    field.options?.length ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <select
                          value={createForm.metadata[field.key] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                [field.key]: value,
                                ...(selectedActivityCode === "TRANSPORT" && field.key === "transportCategory"
                                  ? { assetType: value }
                                  : {})
                              }
                            }));
                          }}
                          title={field.helpText}
                          required={field.required || isRequiredDailyAgreementField(field.key, createForm.metadata)}
                        >
                          <option value="">Choisir une catégorie</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {field.key === "hydrocarbonTaskKind"
                                ? ({
                                    APPROVISIONNEMENT: "Approvisionnement",
                                    LIVRAISON_VENTE: "Livraison ou vente",
                                    ENTRETIEN: "Entretien",
                                    CONTROLE: "Contrôle",
                                    SUIVI_GENERAL: "Suivi général"
                                  } as Record<string, string>)[option] ?? option
                                : option}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : field.key === AGRICULTURE_TASK_KIND_KEY && selectedActivityCode === "AGRICULTURE" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'intervention</option>
                        <option value="PREPARATION">{AGRICULTURE_TASK_LABELS.PREPARATION}</option>
                        <option value="SOWING">{AGRICULTURE_TASK_LABELS.SOWING}</option>
                        <option value="MAINTENANCE">{AGRICULTURE_TASK_LABELS.MAINTENANCE}</option>
                        <option value="TREATMENT">{AGRICULTURE_TASK_LABELS.TREATMENT}</option>
                        <option value="HARVEST">{AGRICULTURE_TASK_LABELS.HARVEST}</option>
                        <option value="STORAGE">{AGRICULTURE_TASK_LABELS.STORAGE}</option>
                        <option value="FOLLOW_UP">{AGRICULTURE_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === BTP_TASK_KIND_KEY && selectedActivityCode === "BTP" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'action chantier</option>
                        <option value="SITE_PREPARATION">{BTP_TASK_LABELS.SITE_PREPARATION}</option>
                        <option value="EARTHWORKS">{BTP_TASK_LABELS.EARTHWORKS}</option>
                        <option value="FOUNDATION">{BTP_TASK_LABELS.FOUNDATION}</option>
                        <option value="STRUCTURAL_WORK">{BTP_TASK_LABELS.STRUCTURAL_WORK}</option>
                        <option value="MASONRY">{BTP_TASK_LABELS.MASONRY}</option>
                        <option value="MEP">{BTP_TASK_LABELS.MEP}</option>
                        <option value="FINISHING">{BTP_TASK_LABELS.FINISHING}</option>
                        <option value="PROCUREMENT">{BTP_TASK_LABELS.PROCUREMENT}</option>
                        <option value="QUALITY_CONTROL">{BTP_TASK_LABELS.QUALITY_CONTROL}</option>
                        <option value="RESERVE">{BTP_TASK_LABELS.RESERVE}</option>
                        <option value="HANDOVER">{BTP_TASK_LABELS.HANDOVER}</option>
                        <option value="FOLLOW_UP">{BTP_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === "shopRef" && selectedActivityCode === "GENERAL_STORE" ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <select
                          value={shops.find((shop) => shop.name === (createForm.metadata.shopRef ?? ""))?.id ?? ""}
                          onChange={(event) => {
                            const selectedShop = shops.find((shop) => shop.id === event.target.value);
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                shopRef: selectedShop?.name ?? ""
                              }
                            }));
                          }}
                          title={field.helpText}
                          required={field.required}
                        >
                          <option value="">Choisir une boutique</option>
                          {shops.map((shop) => (
                            <option key={shop.id} value={shop.id}>
                              {shop.name}
                            </option>
                          ))}
                        </select>
                        {createForm.metadata.shopRef ? (
                          (() => {
                            const ledgerRow = shopLedgerRows.find(
                              (row) => row.shopRef === createForm.metadata.shopRef
                            );
                            return (
                              <small className="hint">
                                Achats: {formatAmountForDisplay(ledgerRow?.purchaseAmount ?? "0")} XOF |
                                Déjà recouvré: {formatAmountForDisplay(ledgerRow?.collectedAmount ?? "0")} XOF |
                                Solde dû: {formatAmountForDisplay(ledgerRow?.balanceAmount ?? "0")} XOF
                              </small>
                            );
                          })()
                        ) : null}
                      </label>
                    ) : field.key === "remainingStockValue" && selectedActivityCode === "GENERAL_STORE" ? (
                      (() => {
                        const ledgerRow = shopLedgerRows.find(
                          (row) => row.shopRef === createForm.metadata.shopRef
                        );
                        const purchaseValue = Number(ledgerRow?.purchaseAmount ?? "0");
                        const collectedValue = Number(ledgerRow?.collectedAmount ?? "0");
                        const remainingValue = Number(
                          (createForm.metadata.remainingStockValue ?? "").replace(",", ".").replace(/\s/g, "")
                        );
                        const hasRemainingValue = createForm.metadata.remainingStockValue?.trim();
                        const estimatedSold = hasRemainingValue ? purchaseValue - remainingValue : null;
                        const variance = estimatedSold !== null ? estimatedSold - collectedValue : null;
                        return (
                          <label key={field.key} className="operations-inline-group">
                            <span>{field.label}</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Ex: 30000"
                              value={createForm.metadata.remainingStockValue ?? ""}
                              onChange={(event) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  metadata: {
                                    ...prev.metadata,
                                    remainingStockValue: formatEditableAmountForInput(event.target.value)
                                  }
                                }))
                              }
                              onBlur={() =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  metadata: {
                                    ...prev.metadata,
                                    remainingStockValue: formatAmountForInput(
                                      prev.metadata.remainingStockValue ?? ""
                                    )
                                  }
                                }))
                              }
                              title={field.helpText}
                              required={field.required}
                            />
                            {estimatedSold !== null && variance !== null ? (
                              <small className="hint">
                                Vendu estimé: {formatAmountForDisplay(String(estimatedSold))} XOF | Écart vs
                                recouvré: {formatAmountForDisplay(String(variance))} XOF
                              </small>
                            ) : (
                              <small className="hint">
                                Valeur des articles encore présents en boutique aujourd'hui.
                              </small>
                            )}
                          </label>
                        );
                      })()
                    ) : field.key === "projectRef" && selectedActivityCode === "BTP" ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <select
                          value={
                            projects.find((project) => project.name === (createForm.metadata.projectRef ?? ""))
                              ?.id ?? ""
                          }
                          onChange={(event) => {
                            const selectedProject = projects.find(
                              (project) => project.id === event.target.value
                            );
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                projectRef: selectedProject?.name ?? ""
                              }
                            }));
                          }}
                          title={field.helpText}
                          required={field.required}
                        >
                          <option value="">Choisir un chantier</option>
                          {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : field.key === FOOD_TASK_KIND_KEY && selectedActivityCode === "FOOD" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'action alimentaire</option>
                        <option value="RECEPTION">{FOOD_TASK_LABELS.RECEPTION}</option>
                        <option value="STOCK_CONTROL">{FOOD_TASK_LABELS.STOCK_CONTROL}</option>
                        <option value="EXPIRY_CHECK">{FOOD_TASK_LABELS.EXPIRY_CHECK}</option>
                        <option value="COLD_CHAIN_CHECK">{FOOD_TASK_LABELS.COLD_CHAIN_CHECK}</option>
                        <option value="SHELF_ROTATION">{FOOD_TASK_LABELS.SHELF_ROTATION}</option>
                        <option value="SUPPLIER_FOLLOW_UP">{FOOD_TASK_LABELS.SUPPLIER_FOLLOW_UP}</option>
                        <option value="PRODUCT_WITHDRAWAL">{FOOD_TASK_LABELS.PRODUCT_WITHDRAWAL}</option>
                        <option value="CLEANING">{FOOD_TASK_LABELS.CLEANING}</option>
                        <option value="INVENTORY">{FOOD_TASK_LABELS.INVENTORY}</option>
                        <option value="QUALITY_CONTROL">{FOOD_TASK_LABELS.QUALITY_CONTROL}</option>
                        <option value="DELIVERY">{FOOD_TASK_LABELS.DELIVERY}</option>
                        <option value="FOLLOW_UP">{FOOD_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === RENTAL_TASK_KIND_KEY && selectedActivityCode === "RENTAL" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'action locative</option>
                        <option value="RELANCE">{RENTAL_TASK_LABELS.RELANCE}</option>
                        <option value="VISIT">{RENTAL_TASK_LABELS.VISIT}</option>
                        <option value="MOVE_IN">{RENTAL_TASK_LABELS.MOVE_IN}</option>
                        <option value="MOVE_OUT">{RENTAL_TASK_LABELS.MOVE_OUT}</option>
                        <option value="MAINTENANCE">{RENTAL_TASK_LABELS.MAINTENANCE}</option>
                        <option value="FOLLOW_UP">{RENTAL_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === HOTEL_TASK_KIND_KEY && selectedActivityCode === "HOTEL_LODGING" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'action hôtelière</option>
                        <option value="CHECK_IN">{HOTEL_TASK_LABELS.CHECK_IN}</option>
                        <option value="CHECK_OUT">{HOTEL_TASK_LABELS.CHECK_OUT}</option>
                        <option value="ROOM_PREPARATION">{HOTEL_TASK_LABELS.ROOM_PREPARATION}</option>
                        <option value="HOUSEKEEPING">{HOTEL_TASK_LABELS.HOUSEKEEPING}</option>
                        <option value="MAINTENANCE">{HOTEL_TASK_LABELS.MAINTENANCE}</option>
                        <option value="RESTAURANT_SERVICE">{HOTEL_TASK_LABELS.RESTAURANT_SERVICE}</option>
                        <option value="LAUNDRY">{HOTEL_TASK_LABELS.LAUNDRY}</option>
                        <option value="EVENT_SETUP">{HOTEL_TASK_LABELS.EVENT_SETUP}</option>
                        <option value="GUEST_FOLLOW_UP">{HOTEL_TASK_LABELS.GUEST_FOLLOW_UP}</option>
                        <option value="SUPPLIER_FOLLOW_UP">{HOTEL_TASK_LABELS.SUPPLIER_FOLLOW_UP}</option>
                        <option value="NIGHT_AUDIT">{HOTEL_TASK_LABELS.NIGHT_AUDIT}</option>
                        <option value="FOLLOW_UP">{HOTEL_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === AGENCY_TASK_KIND_KEY && selectedActivityCode === "REAL_ESTATE_AGENCY" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'action agence</option>
                        <option value="MANDATE_INTAKE">{AGENCY_TASK_LABELS.MANDATE_INTAKE}</option>
                        <option value="PROPERTY_VALUATION">{AGENCY_TASK_LABELS.PROPERTY_VALUATION}</option>
                        <option value="LISTING_PUBLICATION">{AGENCY_TASK_LABELS.LISTING_PUBLICATION}</option>
                        <option value="CLIENT_PROSPECTING">{AGENCY_TASK_LABELS.CLIENT_PROSPECTING}</option>
                        <option value="VISIT_SCHEDULE">{AGENCY_TASK_LABELS.VISIT_SCHEDULE}</option>
                        <option value="OFFER_FOLLOW_UP">{AGENCY_TASK_LABELS.OFFER_FOLLOW_UP}</option>
                        <option value="DOCUMENT_COLLECTION">{AGENCY_TASK_LABELS.DOCUMENT_COLLECTION}</option>
                        <option value="NOTARY_FOLLOW_UP">{AGENCY_TASK_LABELS.NOTARY_FOLLOW_UP}</option>
                        <option value="CONTRACT_SIGNING">{AGENCY_TASK_LABELS.CONTRACT_SIGNING}</option>
                        <option value="OWNER_REPORTING">{AGENCY_TASK_LABELS.OWNER_REPORTING}</option>
                        <option value="COMMISSION_COLLECTION">{AGENCY_TASK_LABELS.COMMISSION_COLLECTION}</option>
                        <option value="FOLLOW_UP">{AGENCY_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === FISH_FARMING_TASK_KIND_KEY && selectedActivityCode === "FISH_FARMING" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'intervention</option>
                        <option value="FEEDING">{FISH_FARMING_TASK_LABELS.FEEDING}</option>
                        <option value="WATER_CONTROL">{FISH_FARMING_TASK_LABELS.WATER_CONTROL}</option>
                        <option value="TREATMENT">{FISH_FARMING_TASK_LABELS.TREATMENT}</option>
                        <option value="SORTING">{FISH_FARMING_TASK_LABELS.SORTING}</option>
                        <option value="HARVEST">{FISH_FARMING_TASK_LABELS.HARVEST}</option>
                        <option value="STOCKING">{FISH_FARMING_TASK_LABELS.STOCKING}</option>
                        <option value="FOLLOW_UP">{FISH_FARMING_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === LIVESTOCK_TASK_KIND_KEY && selectedActivityCode === "LIVESTOCK" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type d'intervention</option>
                        <option value="FEEDING">{LIVESTOCK_TASK_LABELS.FEEDING}</option>
                        <option value="HEALTH_CHECK">{LIVESTOCK_TASK_LABELS.HEALTH_CHECK}</option>
                        <option value="VACCINATION">{LIVESTOCK_TASK_LABELS.VACCINATION}</option>
                        <option value="TREATMENT">{LIVESTOCK_TASK_LABELS.TREATMENT}</option>
                        <option value="CLEANING">{LIVESTOCK_TASK_LABELS.CLEANING}</option>
                        <option value="BREEDING">{LIVESTOCK_TASK_LABELS.BREEDING}</option>
                        <option value="SALE_PREP">{LIVESTOCK_TASK_LABELS.SALE_PREP}</option>
                        <option value="FOLLOW_UP">{LIVESTOCK_TASK_LABELS.FOLLOW_UP}</option>
                      </select>
                    ) : field.key === GENERAL_EXPENSE_KIND_KEY && selectedActivityCode === "GENERAL_EXPENSES" ? (
                      <select
                        key={field.key}
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
                        title={field.helpText}
                        required={field.required}
                      >
                        <option value="">Choisir le type de dépense concerné</option>
                        <option value="PDG_SUPPLIES">{GENERAL_EXPENSE_KIND_LABELS.PDG_SUPPLIES}</option>
                        <option value="PDG_TRANSPORT">{GENERAL_EXPENSE_KIND_LABELS.PDG_TRANSPORT}</option>
                        <option value="PDG_SUPPLIER_PAYMENT">{GENERAL_EXPENSE_KIND_LABELS.PDG_SUPPLIER_PAYMENT}</option>
                        <option value="PDG_TRANSFER_ADVANCE">{GENERAL_EXPENSE_KIND_LABELS.PDG_TRANSFER_ADVANCE}</option>
                        <option value="PDG_INVESTMENT">{GENERAL_EXPENSE_KIND_LABELS.PDG_INVESTMENT}</option>
                        <option value="PDG_LOAN">{GENERAL_EXPENSE_KIND_LABELS.PDG_LOAN}</option>
                        <option value="PDG_OVERHEAD">{GENERAL_EXPENSE_KIND_LABELS.PDG_OVERHEAD}</option>
                        <option value="EMPLOYEE_MEALS">{GENERAL_EXPENSE_KIND_LABELS.EMPLOYEE_MEALS}</option>
                        <option value="EMPLOYEE_FUEL">{GENERAL_EXPENSE_KIND_LABELS.EMPLOYEE_FUEL}</option>
                        <option value="EMPLOYEE_VEHICLE_UPKEEP">{GENERAL_EXPENSE_KIND_LABELS.EMPLOYEE_VEHICLE_UPKEEP}</option>
                        <option value="EMPLOYEE_SUPPLIES">{GENERAL_EXPENSE_KIND_LABELS.EMPLOYEE_SUPPLIES}</option>
                        <option value="EMPLOYEE_OTHER">{GENERAL_EXPENSE_KIND_LABELS.EMPLOYEE_OTHER}</option>
                      </select>
                    ) : field.key === DAILY_ACTIVITY_KIND_KEY && selectedActivityCode === "DAILY_ACTIVITIES" ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <select
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
                          title={field.helpText}
                          required={field.required}
                        >
                          <option value="">Choisir le type d'activité</option>
                          {dailyActivityCategories
                            .filter((category) => category.isActive || category.name === createForm.metadata[field.key])
                            .map((category) => (
                              <option key={category.id} value={category.name}>
                                {category.name}
                              </option>
                            ))}
                        </select>
                        {dailyActivityCategories.length === 0 ? (
                          <small className="hint">
                            Aucune catégorie disponible. Ajoutez-en une ci-dessous.
                          </small>
                        ) : null}
                      </label>
                    ) : (field.key === DAILY_ACTIVITY_AMOUNT_KEY || field.key === "agreementCapitalAmount" || field.key === "agreementProfitAmount") && selectedActivityCode === "DAILY_ACTIVITIES" ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={field.key === DAILY_ACTIVITY_AMOUNT_KEY ? "Ex: 5000" : "Ex: 1 500 000"}
                          value={createForm.metadata[field.key] ?? ""}
                          onChange={(event) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                [field.key]: formatEditableAmountForInput(event.target.value)
                              }
                            }))
                          }
                          onBlur={() =>
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                [field.key]: formatAmountForInput(prev.metadata[field.key] ?? "")
                              }
                            }))
                          }
                          title={field.helpText}
                          required={field.required || isRequiredDailyAgreementField(field.key, createForm.metadata)}
                        />
                      </label>
                    ) : (
                      <input
                        key={field.key}
                        type="text"
                        list={selectedActivityCode === "SERVICES" && field.key === "serviceCategory" ? "task-service-categories" : undefined}
                        placeholder={field.label}
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
                        title={field.helpText}
                        required={field.required ||
                          (selectedActivityCode === "HYDROCARBON" && field.key === "hydrocarbonAssetRef" && createForm.metadata.hydrocarbonCategory === "Citerne") ||
                          isRequiredDailyAgreementField(field.key, createForm.metadata)}
                      />
                    )
                  ))}
                </div>
                {selectedActivityCode === "SERVICES" ? (
                  <datalist id="task-service-categories">
                    {serviceCategorySuggestions.map((value) => <option key={value} value={value} />)}
                  </datalist>
                ) : null}
              </details>
            ) : null}
            {!editingTaskId ? (
              <details
                className="operations-task-form-options operations-task-attachment-disclosure"
                open={isTaskAttachmentExpanded}
                onToggle={(event) => setIsTaskAttachmentExpanded(event.currentTarget.open)}
              >
                <summary>
                  {taskAttachmentFile ? `Pièce jointe · ${taskAttachmentFile.name}` : "Pièce jointe (facultatif)"}
                </summary>
                <fieldset className="task-attachment-callout">
                  <legend>Ajouter un fichier</legend>
                  <div className="task-attachment-callout-copy">
                    <p className="hint">
                      Le fichier sera envoyé après l'enregistrement. Formats acceptés : PDF, JPG ou PNG.
                    </p>
                  </div>
                  <label className="task-attachment-upload" htmlFor="task-attachment-file">
                    <span>Fichier joint</span>
                    <input
                      key={`${taskAttachmentFile?.name ?? "empty"}-${taskAttachmentFile?.size ?? 0}`}
                      id="task-attachment-file"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                      onChange={(event) => {
                        const selectedFile = event.target.files?.[0] ?? null;
                        setTaskAttachmentFile(selectedFile);
                        if (selectedFile) {
                          setIsTaskAttachmentExpanded(true);
                        }
                      }}
                      disabled={isSavingTaskForm}
                    />
                  </label>
                  <div className="task-attachment-selected">
                    {taskAttachmentFile ? (
                      <>
                        <strong>{taskAttachmentFile.name}</strong>
                        <span>{formatFileSize(taskAttachmentFile.size)}</span>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => setTaskAttachmentFile(null)}
                          disabled={isSavingTaskForm}
                        >
                          Retirer
                        </button>
                      </>
                    ) : (
                      <span>Aucun fichier sélectionné.</span>
                    )}
                  </div>
                </fieldset>
              </details>
            ) : null}
            <div className="mobile-sticky-form-actions">
              <button
                type="submit"
                disabled={!selectedActivityCode || isLoadingActivities || isSavingTaskForm}
              >
                {isSavingTaskForm ? (
                  <>
                    <ButtonSpinner />
                    Enregistrement...
                  </>
                ) : editingTaskId ? (
                  "Enregistrer les modifications"
                ) : (
                  selectedActivityCode === "DAILY_ACTIVITIES" ? "Enregistrer l’activité" : "Enregistrer la tâche"
                )}
              </button>
              {editingTaskId ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCancelEditTask}
                  disabled={isSavingTaskForm}
                >
                  Annuler
                </button>
              ) : null}
            </div>
          </form>
          ) : null}
        </details>
      ) : null}

      {false && canAssignTasks ? (
        <section className="panel operations-bulk-bar">
          <div className="operations-bulk-bar-header">
            <h3>Assignation en lot</h3>
            <p className="hint">
              {selectedTaskIds.length} sélectionnée(s) sur {displayTasks.length} visible(s)
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

      {!fieldWorkspace ? renderTasksList() : null}
      </>) : null}

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

      <ConfirmDialog
        open={categoryPendingDelete !== null}
        title="Confirmer la suppression de la catégorie"
        description="Cette action retire la catégorie de la liste de sélection du formulaire."
        objectLabel="Catégorie concernée"
        objectName={categoryPendingDelete?.name ?? ""}
        impactText="Les activités déjà enregistrées avec cette catégorie ne sont pas modifiées."
        isConfirming={busyCategoryId === categoryPendingDelete?.id}
        onCancel={() => {
          if (busyCategoryId) {
            return;
          }
          setCategoryPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteCategory()}
      />
    </>
  );
}

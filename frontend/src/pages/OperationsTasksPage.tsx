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
import { EmptyState } from "../components/EmptyState";
import { PageGuide } from "../components/PageGuide";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { matchesQuickSearch } from "../lib/quickSearch";
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
  createOperationsTaskRequest,
  deleteOperationsTaskRequest,
  getReportsOverviewRequest,
  getTaskAttachmentUploadAuthRequest,
  listBtpProjectsRequest,
  listGeneralStoreShopsRequest,
  listOperationsMembersRequest,
  listOperationsTasksRequest,
  updateOperationsTaskRequest,
  updateOperationsTaskStatusRequest
} from "../lib/api";
import {
  formatAmountForDisplay,
  formatAmountForInput
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
import type { GeneralStoreOperationsReportRow } from "../types/reporting";

const TASKS_PAGE_SIZE = 200;
const TASKS_VISIBLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_TASKS_VISIBLE_PAGE_SIZE = 25;
const AGRICULTURE_TASK_KIND_KEY = "agricultureTaskKind";
type AgricultureTaskKind =
  | "PREPARATION"
  | "SOWING"
  | "MAINTENANCE"
  | "TREATMENT"
  | "HARVEST"
  | "STORAGE"
  | "FOLLOW_UP";
const AGRICULTURE_TASK_LABELS: Record<AgricultureTaskKind, string> = {
  PREPARATION: "Préparation",
  SOWING: "Semis",
  MAINTENANCE: "Entretien",
  TREATMENT: "Traitement",
  HARVEST: "Récolte",
  STORAGE: "Stockage",
  FOLLOW_UP: "Suivi terrain"
};
const BTP_WORK_PACKAGE_OPTIONS = [
  "Terrassement",
  "Fondation",
  "Gros oeuvre",
  "Second oeuvre",
  "Finition",
  "Autre"
];
const BTP_TASK_KIND_KEY = "btpTaskKind";
type BtpTaskKind =
  | "SITE_PREPARATION"
  | "EARTHWORKS"
  | "FOUNDATION"
  | "STRUCTURAL_WORK"
  | "MASONRY"
  | "MEP"
  | "FINISHING"
  | "PROCUREMENT"
  | "QUALITY_CONTROL"
  | "RESERVE"
  | "HANDOVER"
  | "FOLLOW_UP";
const BTP_TASK_LABELS: Record<BtpTaskKind, string> = {
  SITE_PREPARATION: "Préparation chantier",
  EARTHWORKS: "Terrassement",
  FOUNDATION: "Fondation",
  STRUCTURAL_WORK: "Structure",
  MASONRY: "Maconnerie",
  MEP: "Electricite / plomberie",
  FINISHING: "Finition",
  PROCUREMENT: "Approvisionnement",
  QUALITY_CONTROL: "Contrôle qualité",
  RESERVE: "Réserve / reprise",
  HANDOVER: "Réception",
  FOLLOW_UP: "Suivi chantier"
};
const FOOD_TASK_KIND_KEY = "foodTaskKind";
type FoodTaskKind =
  | "RECEPTION"
  | "STOCK_CONTROL"
  | "EXPIRY_CHECK"
  | "COLD_CHAIN_CHECK"
  | "SHELF_ROTATION"
  | "SUPPLIER_FOLLOW_UP"
  | "PRODUCT_WITHDRAWAL"
  | "CLEANING"
  | "INVENTORY"
  | "QUALITY_CONTROL"
  | "DELIVERY"
  | "FOLLOW_UP";
const FOOD_TASK_LABELS: Record<FoodTaskKind, string> = {
  RECEPTION: "Réception stock",
  STOCK_CONTROL: "Contrôle stock",
  EXPIRY_CHECK: "Contrôle DLC",
  COLD_CHAIN_CHECK: "Contrôle froid",
  SHELF_ROTATION: "Rotation rayon",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  PRODUCT_WITHDRAWAL: "Retrait produit",
  CLEANING: "Nettoyage",
  INVENTORY: "Inventaire",
  QUALITY_CONTROL: "Contrôle qualité",
  DELIVERY: "Livraison",
  FOLLOW_UP: "Suivi alimentaire"
};
const RENTAL_TASK_KIND_KEY = "rentalTaskKind";
type RentalTaskKind = "RELANCE" | "VISIT" | "MOVE_IN" | "MOVE_OUT" | "MAINTENANCE" | "FOLLOW_UP";
const RENTAL_TASK_LABELS: Record<RentalTaskKind, string> = {
  RELANCE: "Relance loyer",
  VISIT: "Visite",
  MOVE_IN: "Entree locataire",
  MOVE_OUT: "Sortie locataire",
  MAINTENANCE: "Maintenance",
  FOLLOW_UP: "Autre"
};
const HOTEL_TASK_KIND_KEY = "hotelTaskKind";
type HotelTaskKind =
  | "CHECK_IN"
  | "CHECK_OUT"
  | "ROOM_PREPARATION"
  | "HOUSEKEEPING"
  | "MAINTENANCE"
  | "RESTAURANT_SERVICE"
  | "LAUNDRY"
  | "EVENT_SETUP"
  | "GUEST_FOLLOW_UP"
  | "SUPPLIER_FOLLOW_UP"
  | "NIGHT_AUDIT"
  | "FOLLOW_UP";
const HOTEL_TASK_LABELS: Record<HotelTaskKind, string> = {
  CHECK_IN: "Check-in",
  CHECK_OUT: "Check-out",
  ROOM_PREPARATION: "Préparation chambre",
  HOUSEKEEPING: "Menage",
  MAINTENANCE: "Maintenance",
  RESTAURANT_SERVICE: "Service restauration",
  LAUNDRY: "Blanchisserie",
  EVENT_SETUP: "Préparation événement",
  GUEST_FOLLOW_UP: "Suivi client",
  SUPPLIER_FOLLOW_UP: "Suivi fournisseur",
  NIGHT_AUDIT: "Audit nuit",
  FOLLOW_UP: "Suivi hotelier"
};
const AGENCY_TASK_KIND_KEY = "agencyTaskKind";
type AgencyTaskKind =
  | "MANDATE_INTAKE"
  | "PROPERTY_VALUATION"
  | "LISTING_PUBLICATION"
  | "CLIENT_PROSPECTING"
  | "VISIT_SCHEDULE"
  | "OFFER_FOLLOW_UP"
  | "DOCUMENT_COLLECTION"
  | "NOTARY_FOLLOW_UP"
  | "CONTRACT_SIGNING"
  | "OWNER_REPORTING"
  | "COMMISSION_COLLECTION"
  | "FOLLOW_UP";
const AGENCY_TASK_LABELS: Record<AgencyTaskKind, string> = {
  MANDATE_INTAKE: "Prise mandat",
  PROPERTY_VALUATION: "Estimation bien",
  LISTING_PUBLICATION: "Publication annonce",
  CLIENT_PROSPECTING: "Prospection client",
  VISIT_SCHEDULE: "Visite",
  OFFER_FOLLOW_UP: "Suivi offre",
  DOCUMENT_COLLECTION: "Collecte documents",
  NOTARY_FOLLOW_UP: "Suivi notaire",
  CONTRACT_SIGNING: "Signature contrat",
  OWNER_REPORTING: "Reporting propriétaire",
  COMMISSION_COLLECTION: "Recouvrement commission",
  FOLLOW_UP: "Suivi dossier"
};
const FISH_FARMING_TASK_KIND_KEY = "fishTaskKind";
type FishFarmingTaskKind =
  | "FEEDING"
  | "WATER_CONTROL"
  | "TREATMENT"
  | "SORTING"
  | "HARVEST"
  | "STOCKING"
  | "FOLLOW_UP";
const FISH_FARMING_TASK_LABELS: Record<FishFarmingTaskKind, string> = {
  FEEDING: "Nourrissage",
  WATER_CONTROL: "Contrôle eau",
  TREATMENT: "Traitement sanitaire",
  SORTING: "Tri / calibrage",
  HARVEST: "Récolte",
  STOCKING: "Mise en charge",
  FOLLOW_UP: "Suivi bassin"
};
const LIVESTOCK_TASK_KIND_KEY = "livestockTaskKind";
type LivestockTaskKind =
  | "FEEDING"
  | "HEALTH_CHECK"
  | "VACCINATION"
  | "TREATMENT"
  | "CLEANING"
  | "BREEDING"
  | "SALE_PREP"
  | "FOLLOW_UP";
const LIVESTOCK_TASK_LABELS: Record<LivestockTaskKind, string> = {
  FEEDING: "Nourrissage",
  HEALTH_CHECK: "Contrôle sanitaire",
  VACCINATION: "Vaccination",
  TREATMENT: "Traitement",
  CLEANING: "Nettoyage enclos",
  BREEDING: "Reproduction",
  SALE_PREP: "Préparation vente",
  FOLLOW_UP: "Suivi élevage"
};
const GENERAL_EXPENSE_KIND_KEY = "generalExpenseKind";
type GeneralExpenseKind =
  | "PDG_SUPPLIES"
  | "PDG_TRANSPORT"
  | "PDG_SUPPLIER_PAYMENT"
  | "PDG_TRANSFER_ADVANCE"
  | "PDG_INVESTMENT"
  | "PDG_LOAN"
  | "PDG_OVERHEAD"
  | "EMPLOYEE_MEALS"
  | "EMPLOYEE_FUEL"
  | "EMPLOYEE_VEHICLE_UPKEEP"
  | "EMPLOYEE_SUPPLIES"
  | "EMPLOYEE_OTHER";
const GENERAL_EXPENSE_KIND_LABELS: Record<GeneralExpenseKind, string> = {
  PDG_SUPPLIES: "PDG - Achat matériel / fournitures",
  PDG_TRANSPORT: "PDG - Carburant / transport",
  PDG_SUPPLIER_PAYMENT: "PDG - Paiement fournisseur / prestataire",
  PDG_TRANSFER_ADVANCE: "PDG - Virement / avance / transfert",
  PDG_INVESTMENT: "PDG - Investissement",
  PDG_LOAN: "PDG - Prêt",
  PDG_OVERHEAD: "PDG - Frais généraux / divers",
  EMPLOYEE_MEALS: "Employé - Repas",
  EMPLOYEE_FUEL: "Employé - Carburant",
  EMPLOYEE_VEHICLE_UPKEEP: "Employé - Entretien véhicule",
  EMPLOYEE_SUPPLIES: "Employé - Fournitures / consommables",
  EMPLOYEE_OTHER: "Employé - Autre dépense"
};

function isGeneralExpenseKind(value: string | undefined): value is GeneralExpenseKind {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(GENERAL_EXPENSE_KIND_LABELS, value as string);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
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

function isAgricultureTaskKind(value: string | undefined): value is AgricultureTaskKind {
  return (
    value === "PREPARATION" ||
    value === "SOWING" ||
    value === "MAINTENANCE" ||
    value === "TREATMENT" ||
    value === "HARVEST" ||
    value === "STORAGE" ||
    value === "FOLLOW_UP"
  );
}

function isBtpTaskKind(value: string | undefined): value is BtpTaskKind {
  return (
    value === "SITE_PREPARATION" ||
    value === "EARTHWORKS" ||
    value === "FOUNDATION" ||
    value === "STRUCTURAL_WORK" ||
    value === "MASONRY" ||
    value === "MEP" ||
    value === "FINISHING" ||
    value === "PROCUREMENT" ||
    value === "QUALITY_CONTROL" ||
    value === "RESERVE" ||
    value === "HANDOVER" ||
    value === "FOLLOW_UP"
  );
}

function isFoodTaskKind(value: string | undefined): value is FoodTaskKind {
  return (
    value === "RECEPTION" ||
    value === "STOCK_CONTROL" ||
    value === "EXPIRY_CHECK" ||
    value === "COLD_CHAIN_CHECK" ||
    value === "SHELF_ROTATION" ||
    value === "SUPPLIER_FOLLOW_UP" ||
    value === "PRODUCT_WITHDRAWAL" ||
    value === "CLEANING" ||
    value === "INVENTORY" ||
    value === "QUALITY_CONTROL" ||
    value === "DELIVERY" ||
    value === "FOLLOW_UP"
  );
}

function isRentalTaskKind(value: string | undefined): value is RentalTaskKind {
  return (
    value === "RELANCE" ||
    value === "VISIT" ||
    value === "MOVE_IN" ||
    value === "MOVE_OUT" ||
    value === "MAINTENANCE" ||
    value === "FOLLOW_UP"
  );
}

function isHotelTaskKind(value: string | undefined): value is HotelTaskKind {
  return (
    value === "CHECK_IN" ||
    value === "CHECK_OUT" ||
    value === "ROOM_PREPARATION" ||
    value === "HOUSEKEEPING" ||
    value === "MAINTENANCE" ||
    value === "RESTAURANT_SERVICE" ||
    value === "LAUNDRY" ||
    value === "EVENT_SETUP" ||
    value === "GUEST_FOLLOW_UP" ||
    value === "SUPPLIER_FOLLOW_UP" ||
    value === "NIGHT_AUDIT" ||
    value === "FOLLOW_UP"
  );
}

function isAgencyTaskKind(value: string | undefined): value is AgencyTaskKind {
  return (
    value === "MANDATE_INTAKE" ||
    value === "PROPERTY_VALUATION" ||
    value === "LISTING_PUBLICATION" ||
    value === "CLIENT_PROSPECTING" ||
    value === "VISIT_SCHEDULE" ||
    value === "OFFER_FOLLOW_UP" ||
    value === "DOCUMENT_COLLECTION" ||
    value === "NOTARY_FOLLOW_UP" ||
    value === "CONTRACT_SIGNING" ||
    value === "OWNER_REPORTING" ||
    value === "COMMISSION_COLLECTION" ||
    value === "FOLLOW_UP"
  );
}

function isFishFarmingTaskKind(value: string | undefined): value is FishFarmingTaskKind {
  return (
    value === "FEEDING" ||
    value === "WATER_CONTROL" ||
    value === "TREATMENT" ||
    value === "SORTING" ||
    value === "HARVEST" ||
    value === "STOCKING" ||
    value === "FOLLOW_UP"
  );
}

function isLivestockTaskKind(value: string | undefined): value is LivestockTaskKind {
  return (
    value === "FEEDING" ||
    value === "HEALTH_CHECK" ||
    value === "VACCINATION" ||
    value === "TREATMENT" ||
    value === "CLEANING" ||
    value === "BREEDING" ||
    value === "SALE_PREP" ||
    value === "FOLLOW_UP"
  );
}

function formatMetadataValue(key: string, value: string): string {
  if (key === AGRICULTURE_TASK_KIND_KEY && isAgricultureTaskKind(value)) {
    return AGRICULTURE_TASK_LABELS[value];
  }
  if (key === BTP_TASK_KIND_KEY && isBtpTaskKind(value)) {
    return BTP_TASK_LABELS[value];
  }
  if (key === FOOD_TASK_KIND_KEY && isFoodTaskKind(value)) {
    return FOOD_TASK_LABELS[value];
  }
  if (key === RENTAL_TASK_KIND_KEY && isRentalTaskKind(value)) {
    return RENTAL_TASK_LABELS[value];
  }
  if (key === HOTEL_TASK_KIND_KEY && isHotelTaskKind(value)) {
    return HOTEL_TASK_LABELS[value];
  }
  if (key === AGENCY_TASK_KIND_KEY && isAgencyTaskKind(value)) {
    return AGENCY_TASK_LABELS[value];
  }
  if (key === FISH_FARMING_TASK_KIND_KEY && isFishFarmingTaskKind(value)) {
    return FISH_FARMING_TASK_LABELS[value];
  }
  if (key === LIVESTOCK_TASK_KIND_KEY && isLivestockTaskKind(value)) {
    return LIVESTOCK_TASK_LABELS[value];
  }
  if (key === GENERAL_EXPENSE_KIND_KEY && isGeneralExpenseKind(value)) {
    return GENERAL_EXPENSE_KIND_LABELS[value];
  }
  return value;
}

function formatMetadataSummary(
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): string {
  const items = fields
    .map((field) => {
      const value = metadata[field.key]?.trim();
      return value ? `${field.label}: ${formatMetadataValue(field.key, value)}` : null;
    })
    .filter((value): value is string => value !== null);

  if (items.length > 0) {
    return items.join(" | ");
  }

  const fallbackItems = Object.entries(metadata)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}: ${formatMetadataValue(key, value)}`);
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
    selectedActivityCode,
    selectedProfile
  } = useBusinessActivity();
  const [tasks, setTasks] = useState<OperationTask[]>([]);
  const [members, setMembers] = useState<OperationTaskMember[]>([]);
  const [shops, setShops] = useState<GeneralStoreShop[]>([]);
  const [shopLedgerRows, setShopLedgerRows] = useState<GeneralStoreOperationsReportRow[]>([]);
  const [projects, setProjects] = useState<BtpProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isLoadingMoreTasks, setIsLoadingMoreTasks] = useState(false);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingTaskForm, setIsSavingTaskForm] = useState(false);

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
  const [visibleTasksPageSize, setVisibleTasksPageSize] = usePersistedViewState(
    tasksVisiblePageSizeStorageKey,
    DEFAULT_TASKS_VISIBLE_PAGE_SIZE
  );
  const [visibleTasksPage, setVisibleTasksPage] = useState(1);

  const [createForm, setCreateForm] = useState(createDefaultTaskForm);
  const [taskAttachmentFile, setTaskAttachmentFile] = useState<File | null>(null);

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
    return user?.role === "OWNER" || canAssignTasks;
  }, [canAssignTasks, user?.role]);
  const canCreateTasks = useMemo(() => {
    return Boolean(user) && user?.role !== "OWNER";
  }, [user]);

  const taskMetadataFields = selectedProfile?.tasks.metadataFields ?? [];
  const hasRequiredTaskMetadata = taskMetadataFields.some((field) => field.required);
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
        scope: canViewAllTasks ? ("ALL" as TaskScope) : ("ASSIGNED_TO_ME" as TaskScope)
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
    canViewAllTasks,
    filters.status,
    selectedActivityCode,
    withAuthorizedToken
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadShops = useCallback(async () => {
    if (selectedActivityCode !== "GENERAL_STORE") {
      setShops([]);
      return;
    }
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listGeneralStoreShopsRequest(accessToken)
      );
      setShops(payload.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, [selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  const loadShopLedger = useCallback(async () => {
    if (selectedActivityCode !== "GENERAL_STORE") {
      setShopLedgerRows([]);
      return;
    }
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        getReportsOverviewRequest(accessToken, { activityCode: "GENERAL_STORE" })
      );
      setShopLedgerRows(payload.item.generalStoreOperationsReport?.rows ?? []);
    } catch {
      setShopLedgerRows([]);
    }
  }, [selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadShopLedger();
  }, [loadShopLedger]);

  const loadProjects = useCallback(async () => {
    if (selectedActivityCode !== "BTP") {
      setProjects([]);
      return;
    }
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listBtpProjectsRequest(accessToken)
      );
      setProjects(payload.items);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, [selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

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

  function renderVisibleTasksPagination(): JSX.Element | null {
    if (displayTasks.length === 0) {
      return null;
    }

    return (
      <div className="list-pagination list-view-pagination">
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
  }, [taskMetadataFields]);

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
    event.preventDefault();
    if (!canCreateTasks || !selectedActivityCode) {
      return;
    }
    const wasEditingTask = Boolean(editingTaskId);
    const attachmentFileToUpload = editingTaskId ? null : taskAttachmentFile;
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingTaskForm(true);
    try {
      const response = await withAuthorizedToken((accessToken) =>
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
      let attachmentUploadError: string | null = null;
      if (!editingTaskId && attachmentFileToUpload) {
        setBusyTaskId(response.item.id);
        try {
          await uploadTaskAttachment(response.item.id, attachmentFileToUpload);
        } catch (error) {
          attachmentUploadError = toErrorMessage(error);
        } finally {
          setBusyTaskId(null);
        }
      }
      setEditingTaskId(null);
      setCreateForm({
        ...createDefaultTaskForm(),
        metadata: syncMetadataState({}, taskMetadataFields)
      });
      setTaskAttachmentFile(null);
      setSuccessMessage(editingTaskId ? "Tâche modifiée." : "Tâche créée.");
      await loadData();
      if (!wasEditingTask) {
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
      if (attachmentUploadError) {
        setErrorMessage(
          `Tâche créée, mais la pièce jointe n'a pas pu être ajoutée. ${attachmentUploadError}`
        );
        setSuccessMessage("Tâche créée. Vous pouvez réessayer depuis le détail.");
        return;
      }
      if (attachmentFileToUpload) {
        setSuccessMessage("Tâche créée avec pièce jointe.");
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSavingTaskForm(false);
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
    if (user?.role === "SYS_ADMIN") {
      return null;
    }
    if (task.status === "DONE") {
      return "Une tâche terminée ne peut plus être supprimée.";
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

    setEditingTaskId(task.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    setTaskAttachmentFile(null);
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
    return;
  }

  async function handleChangeStatus(taskId: string, status: TaskStatus): Promise<void> {
    setBusyTaskId(taskId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        updateOperationsTaskStatusRequest(accessToken, taskId, status)
      );
      setSuccessMessage("Statut mis à jour.");
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTaskId(null);
    }
  }

  function canUpdateTask(task: OperationTask): boolean {
    if (user?.role === "OWNER") {
      return false;
    }
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

      <PageGuide
        title="Guide des tâches"
        description="Les tâches structurent le suivi terrain par secteur, responsable, statut et échéance."
        items={[
          {
            term: "À faire",
            description: "Travail créé mais pas encore démarré."
          },
          {
            term: "En cours",
            description: "Travail actif, suivi par le responsable ou le superviseur."
          },
          {
            term: "Bloquée",
            description: "Tâche arrêtée par un problème qui demande une décision ou un appui."
          },
          {
            term: "Retard",
            description: "Tâche ouverte dont l'échéance est dépassée."
          }
        ]}
      />

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
            placeholder="Recherche rapide: tâche, responsable, createur..."
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

          <button type="submit">Actualiser</button>
        </form>
      </section>

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
                    required={selectedProfile?.tasks.requiresAssignee ?? false}
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
                <strong>Cette tâche vous sera attribuée.</strong>
              </div>
            )}
            {taskMetadataFields.length > 0 ? (
              <details className="operations-task-form-options" open={hasRequiredTaskMetadata}>
                <summary>Champs avancés</summary>
                <div className="operations-task-form-options-body">
                  {taskMetadataFields.map((field) => (
                    field.key === AGRICULTURE_TASK_KIND_KEY && selectedActivityCode === "AGRICULTURE" ? (
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
                              inputMode="decimal"
                              placeholder="Ex: 30000"
                              value={createForm.metadata.remainingStockValue ?? ""}
                              onChange={(event) =>
                                setCreateForm((prev) => ({
                                  ...prev,
                                  metadata: {
                                    ...prev.metadata,
                                    remainingStockValue: formatAmountForInput(event.target.value)
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
                    ) : field.key === "workPackage" && selectedActivityCode === "BTP" ? (
                      <label key={field.key} className="operations-inline-group">
                        <span>{field.label}</span>
                        <select
                          value={createForm.metadata.workPackage ?? ""}
                          onChange={(event) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              metadata: {
                                ...prev.metadata,
                                workPackage: event.target.value
                              }
                            }))
                          }
                          title={field.helpText}
                          required={field.required}
                        >
                          <option value="">Choisir un lot</option>
                          {BTP_WORK_PACKAGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
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
                    ) : (
                      <input
                        key={field.key}
                        type="text"
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
                        required={field.required}
                      />
                    )
                  ))}
                </div>
              </details>
            ) : null}
            {!editingTaskId ? (
              <fieldset className="task-attachment-callout">
                <legend>Pièce jointe</legend>
                <div className="task-attachment-callout-copy">
                  <strong>Ajouter un document ou une image maintenant</strong>
                  <p className="hint">
                    Le fichier sera envoyé automatiquement après l'enregistrement de la tâche.
                    Formats acceptés: PDF, JPG ou PNG.
                  </p>
                </div>
                <label className="task-attachment-upload" htmlFor="task-attachment-file">
                  <span>Fichier joint</span>
                  <input
                    key={`${taskAttachmentFile?.name ?? "empty"}-${taskAttachmentFile?.size ?? 0}`}
                    id="task-attachment-file"
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                    onChange={(event) => setTaskAttachmentFile(event.target.files?.[0] ?? null)}
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
            ) : null}
            <div className="mobile-sticky-form-actions">
              <button
                type="submit"
                disabled={!selectedActivityCode || isLoadingActivities || isSavingTaskForm}
              >
                {isSavingTaskForm
                  ? "Enregistrement..."
                  : editingTaskId
                    ? "Enregistrer les modifications"
                    : "Enregistrer la tâche"}
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
        </section>
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

      <section className="panel">
        <div className="operations-list-header">
          <h3>Tâches</h3>
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
        {!isLoading && tasks.length === 0 ? (
          <EmptyState
            title="Aucune tâche dans cette vue"
            description="Créez la première tâche du secteur actif ou changez les filtres pour retrouver les actions existantes."
            actionLabel={canCreateTasks ? "Préparer une tâche" : undefined}
            onAction={canCreateTasks ? () => window.scrollTo({ top: 0, behavior: "smooth" }) : undefined}
          />
        ) : null}
        {!isLoading && tasks.length > 0 && displayTasks.length === 0 ? (
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
          <div className="operations-task-list">
            {paginatedTasks.map((task) => {
              const isBusy = busyTaskId === task.id;
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
                    {canAssignTasks ? (
                      <p>
                        <strong>Créateur:</strong> {task.createdByFullName} ({task.createdByEmail})
                      </p>
                    ) : null}
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
                      <div className="operations-actions-secondary-content">
                        <div className="operations-task-closed-note">
                          Tâche terminée: statut, modification et assignation verrouillés.
                        </div>
                        {canDelete ? (
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => void handleDeleteTask(task)}
                            disabled={isBusy}
                            title={deleteLockMessage ?? undefined}
                          >
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    ) : !canAssignTasks ? (
                      <div className="operations-actions-secondary-content">
                        {canUpdate ? (
                          <div className="operations-inline-group">
                            <label>Statut</label>
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
                          </div>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            className="danger-btn"
                            onClick={() => void handleDeleteTask(task)}
                            disabled={isBusy}
                            title={deleteLockMessage ?? undefined}
                          >
                            Supprimer
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <details className="operations-actions-secondary">
                        <summary>Plus d'actions</summary>
                        <div className="operations-actions-secondary-content">
                        {canUpdate ? (
                          <div className="operations-inline-group">
                            <label>Statut</label>
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
                          </div>
                        ) : null}

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
                          {canDelete ? (
                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => void handleDeleteTask(task)}
                              disabled={isBusy}
                              title={deleteLockMessage ?? undefined}
                            >
                              Supprimer
                            </button>
                          ) : null}
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
              {displayTasks.length} tâche(s) affichée(s)
              {displayTasks.length !== tasks.length ? ` sur ${tasks.length} chargée(s)` : ""}
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


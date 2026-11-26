import { useActionScope } from "../lib/useActionScope";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DeferredViewBoundary } from "../components/DeferredViewBoundary";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  getSectorReferenceView,
  getActiveSectorReferenceView,
  hasSectorReferenceWorkspace
} from "../config/sectorWorkspaces";
import { SectorTransactionActions } from "../components/SectorTransactionActions";
import { SectorTransactionSummary } from "../components/SectorTransactionSummary";
import { BeverageStockPanel } from "../components/BeverageStockPanel";
import { useBeverageStock } from "../lib/useBeverageStock";
import {
  getSectorTransactionWorkspace,
  type SectorTransactionPreset
} from "../config/sectorTransactionWorkspaces";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useFormChanges } from "../lib/useFormChanges";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { EmptyState } from "../components/EmptyState";
import { SectorWorkspaceNav } from "../components/SectorWorkspaceNav";
import { ButtonSpinner } from "../components/ButtonSpinner";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  resolveImageKitFileName,
  resolveImageKitFileSize,
  resolveImageKitStorageKey,
  type ImageKitUploadResult
} from "../lib/imagekitUpload";
import { buildPersistedViewStorageKey, usePersistedViewState } from "../lib/usePersistedViewState";
import {
  addFinanceTransactionProofRequest,
  ApiError,
  createActivityArticleRequest,
  createBtpProjectRequest,
  createFinanceAccountRequest,
  createFinanceTransactionRequest,
  createGeneralStoreShopRequest,
  createRentalTenantRequest,
  deleteActivityArticleRequest,
  deleteBtpProjectRequest,
  deleteFinanceAccountRequest,
  deleteFinanceTransactionRequest,
  deleteGeneralStoreShopRequest,
  deleteRentalTenantRequest,
  getFinanceProofUploadAuthRequest,
  getFinanceTransactionRequest,
  getFinanceDumpTruckSummaryRequest,
  listActivityArticlesRequest,
  listBtpProjectsRequest,
  listDailyActivityCategoriesRequest,
  listFinanceAccountsRequest,
  listFinanceTransactionProofsRequest,
  listFinanceTransactionsRequest,
  listGeneralStoreShopsRequest,
  listRentalTenantsRequest,
  updateActivityArticleRequest,
  updateBtpProjectRequest,
  updateFinanceAccountRequest,
  updateFinanceTransactionRequest,
  updateGeneralStoreShopRequest,
  updateRentalTenantRequest
} from "../lib/api";
import { getBusinessActivityLabel, type BusinessActivityCode } from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { financeStatusLabel } from "../utils/dashboardDisplay";
import type { ActivityArticle } from "../types/articles";
import type { RentalTenant } from "../types/tenants";
import type { GeneralStoreShop } from "../types/shops";
import type { BtpProject } from "../types/projects";
import type { DailyActivityCategory } from "../types/daily-activity-categories";
import type { FinancialAccount, FinancialAccountScopeType, DumpTruckSummaryItem, FinancialTransaction, TransactionProof } from "../types/finance";
import {
  formatAccountScopeLabel,
  getAccountGovernanceLines,
  getTransactionGovernanceLines
} from "../utils/governanceDisplay";
import { canAccessFeature, canManageSectorTransactions } from "../config/permissions";
import { getSectorRecordContext, getSectorSearchHint } from "../utils/sectorRecordContext";
import {
  BEVERAGE_OPERATION_KIND_KEY,
  DAILY_AGREEMENT_OPERATION_KEY,
  DAILY_AGREEMENT_OPERATION_LABELS,
  DAILY_PROTOCOL_CATEGORY,
  DEFAULT_ALLOWED_CURRENCIES,
  DEFAULT_TRANSACTION_VISIBLE_PAGE_SIZE,
  DUMP_TRUCK_OPERATION_KEY,
  type DailyAgreementOperationKind,
  EMPTY_METADATA_FIELDS,
  GENERAL_EXPENSE_KIND_KEY,
  HARDWARE_OPERATION_KIND_KEY,
  TRANSACTIONS_MOBILE_PAGE_SIZE,
  TRANSACTION_SUGGESTION_HISTORY_SIZE,
  TRANSACTION_VISIBLE_PAGE_SIZE_OPTIONS,
  buildDefaultAccountForm,
  buildDefaultArticleForm,
  buildDefaultProjectForm,
  buildDefaultShopForm,
  buildDefaultTenantForm,
  cleanSectorFinanceMetadata,
  currentMonthInputValue,
  deriveGeneralExpensesAmount,
  deriveSectorAmount,
  formatAmountForDisplay,
  formatAmountForInput,
  formatEditableAmountForInput,
  formatFileSize,
  formatMetadataSummary,
  getAgencyOperationKind,
  getAgricultureOperationKind,
  getBeverageOperationKind,
  getBtpOperationKind,
  getDailyAgreementOperationType,
  getDefaultTransactionType,
  getFishFarmingOperationKind,
  getFoodOperationKind,
  getGeneralExpenseKind,
  getGeneralExpenseOwner,
  getHardwareOperationKind,
  getHotelOperationKind,
  getLivestockOperationKind,
  getLockedAccountMessage,
  getRentalOperationKind,
  getSectorOperationKindValue,
  getSectorTransactionLabel,
  getStoreOperationKind,
  getTransactionsFetchPageSize,
  getVisibleFinanceMetadataFields,
  getWaterOperationKind,
  isAccountVisibleForSelectedActivity,
  isMoneyMetadataField,
  isQuickFillSectorActivity,
  needsTransactionSuggestionHistory,
  normalizeAccountFormForActivities,
  normalizeAmountForApi,
  sameAccountForm,
  sameStringRecord,
  syncMetadataState,
  toAmountNumber,
  toDateTimeLocalInput,
  toErrorMessage
} from "../utils/financeTransactions";

const FinanceTransactionForm = lazy(() => import("../components/FinanceTransactionForm").then(({ FinanceTransactionForm }) => ({ default: FinanceTransactionForm })));
const HardwareArticlesPanel = lazy(() => import("../components/HardwareArticlesPanel").then(({ HardwareArticlesPanel }) => ({ default: HardwareArticlesPanel })));
const RentalTenantsPanel = lazy(() => import("../components/RentalTenantsPanel").then(({ RentalTenantsPanel }) => ({ default: RentalTenantsPanel })));
const GeneralStoreShopsPanel = lazy(() => import("../components/GeneralStoreShopsPanel").then(({ GeneralStoreShopsPanel }) => ({ default: GeneralStoreShopsPanel })));
const BtpProjectsPanel = lazy(() => import("../components/BtpProjectsPanel").then(({ BtpProjectsPanel }) => ({ default: BtpProjectsPanel })));

export function FinanceTransactionsPage(): JSX.Element {
  const [transactionsFetchPageSize] = useState(getTransactionsFetchPageSize);
  const [suggestionHistoryPageSize] = useState(() =>
    window.matchMedia("(max-width: 640px)").matches ? TRANSACTIONS_MOBILE_PAGE_SIZE : TRANSACTION_SUGGESTION_HISTORY_SIZE
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const {
    enabledActivities,
    isLoading: isLoadingActivities,
    profiles,
    selectedActivity,
    selectedActivityCode,
    selectedProfile,
    setSelectedActivityCode
  } = useBusinessActivity();
  const financeEnabledActivities = enabledActivities;
  const beverageStock = useBeverageStock(activeCompany?.id, selectedActivityCode === "BEVERAGE_DEPOT" && !isLoadingActivities);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isAccountListExpanded, setIsAccountListExpanded] = useState(false);
  const [isAccountFormExpanded, setIsAccountFormExpanded] = useState(false);
  const [dailyActivityCategories, setDailyActivityCategories] = useState<DailyActivityCategory[]>([]);
  const dailyCategoriesLoadRequestRef = useRef(0);
  const [articles, setArticles] = useState<ActivityArticle[]>([]);
  const articlesLoadRequestRef = useRef(0);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [hasLoadedArticles, setHasLoadedArticles] = useState(false);
  const [hardwareCustomArticleMode, setHardwareCustomArticleMode] = useState(false);
  const [showGeneralExpenseCalculator, setShowGeneralExpenseCalculator] = useState(false);
  const [articleForm, setArticleForm] = useState(buildDefaultArticleForm());
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [busyArticleId, setBusyArticleId] = useState<string | null>(null);
  const [isSavingArticle, setIsSavingArticle] = useState(false);
  const [articlePendingDelete, setArticlePendingDelete] = useState<ActivityArticle | null>(null);
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const tenantsLoadRequestRef = useRef(0);
  const loadedTenantsContextRef = useRef<string | null>(null);
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [hasLoadedTenants, setHasLoadedTenants] = useState(false);
  const [tenantForm, setTenantForm] = useState(buildDefaultTenantForm());
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [busyTenantId, setBusyTenantId] = useState<string | null>(null);
  const [isSavingTenant, setIsSavingTenant] = useState(false);
  const [tenantPendingDelete, setTenantPendingDelete] = useState<RentalTenant | null>(null);
  const [shops, setShops] = useState<GeneralStoreShop[]>([]);
  const shopsLoadRequestRef = useRef(0);
  const loadedShopsContextRef = useRef<string | null>(null);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [hasLoadedShops, setHasLoadedShops] = useState(false);
  const [shopForm, setShopForm] = useState(buildDefaultShopForm());
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [busyShopId, setBusyShopId] = useState<string | null>(null);
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [shopPendingDelete, setShopPendingDelete] = useState<GeneralStoreShop | null>(null);
  const [projects, setProjects] = useState<BtpProject[]>([]);
  const projectsLoadRequestRef = useRef(0);
  const loadedProjectsContextRef = useRef<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);
  const [projectForm, setProjectForm] = useState(buildDefaultProjectForm());
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<BtpProject | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [dumpTruckSummaryPeriod, setDumpTruckSummaryPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dumpTruckSummaryItems, setDumpTruckSummaryItems] = useState<DumpTruckSummaryItem[]>([]);
  const [isLoadingDumpTruckSummary, setIsLoadingDumpTruckSummary] = useState(false);
  const [dumpTruckSummaryError, setDumpTruckSummaryError] = useState<string | null>(null);
  const transactionsRef = useRef<FinancialTransaction[]>([]);
  transactionsRef.current = transactions;
  const [sectorSuggestionHistory, setSectorSuggestionHistory] = useState<FinancialTransaction[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [linkedTransaction, setLinkedTransaction] = useState<FinancialTransaction | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedTransactionsRef = useRef(false);
  const transactionsLoadRequestRef = useRef(0);
  const sectorSuggestionLoadRequestRef = useRef(0);
  const accountsLoadRequestRef = useRef(0);
  const loadedCompanyIdRef = useRef(activeCompany?.id);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [isLoadingMoreTransactions, setIsLoadingMoreTransactions] = useState(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const isReadOnlyOwner = user?.role === "OWNER";

  const canCreateAccount = useMemo(() => {
    return user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canManageGlobalAccounts = useMemo(() => {
    return user?.role === "SYS_ADMIN";
  }, [user?.role]);

  const canManageTransactions = useMemo(() => {
    return user ? canManageSectorTransactions(user.role) : false;
  }, [user?.role]);

  const sectorReferenceView = getSectorReferenceView(selectedActivityCode, user?.role);
  const referenceView = sectorReferenceView?.pathname ? null : sectorReferenceView;
  const activeReferenceView = getActiveSectorReferenceView(location.pathname, location.search, selectedActivityCode, user?.role);
  const isHardwareArticlesView = activeReferenceView?.view === "articles";
  const isDirectorySector = hasSectorReferenceWorkspace(selectedActivityCode);
  const transactionWorkspace = getSectorTransactionWorkspace(selectedActivityCode);
  const isListFirstSector = isDirectorySector || Boolean(transactionWorkspace);

  const canMutateTransaction = useCallback(
    (transaction: FinancialTransaction): boolean => {
      if (!canManageTransactions || !user) {
        return false;
      }

      if (user.role === "SYS_ADMIN") {
        return true;
      }

      return transaction.createdById === user.id;
    },
    [canManageTransactions, user?.id, user?.role]
  );

  const canManageAnyAccount = canCreateAccount;

  const canManageSalaries = useMemo(() => {
    return user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

  const [accountForm, setAccountForm] = useState(() =>
    buildDefaultAccountForm(
      selectedActivityCode,
      user?.role === "SYS_ADMIN"
    )
  );
  const transactionsViewStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("finance-transactions", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const transactionsSearchStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("finance-transactions-search", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const transactionsVisiblePageSizeStorageKey = useMemo(() => {
    return buildPersistedViewStorageKey("finance-transactions-visible-page-size", activeCompany?.id, user?.id);
  }, [activeCompany?.id, user?.id]);
  const initialFilters = useMemo(
    () =>
      ({
        type: "ALL" as "ALL" | FinancialTransaction["type"]
      }),
    []
  );
  const [filters, setFilters] = usePersistedViewState(transactionsViewStorageKey, initialFilters);
  const [searchQuery, setSearchQuery] = usePersistedViewState(transactionsSearchStorageKey, "");
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const [visibleTransactionsPageSize, setVisibleTransactionsPageSize] = usePersistedViewState(
    transactionsVisiblePageSizeStorageKey,
    DEFAULT_TRANSACTION_VISIBLE_PAGE_SIZE
  );
  const [visibleTransactionsPage, setVisibleTransactionsPage] = useState(1);

  const [transactionForm, setTransactionForm] = useState({
    accountId: "",
    type: getDefaultTransactionType(selectedActivityCode),
    amount: "",
    currency: "XOF",
    description: "",
    metadata: {} as Record<string, string>,
    occurredAt: ""
  });
  const [transactionProofFile, setTransactionProofFile] = useState<File | null>(null);
  const editingTransactionActivityRef = useRef<BusinessActivityCode | null>(null);
  const sectorFormScopeRef = useRef({ companyId: activeCompany?.id, activityCode: selectedActivityCode });
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [isTransactionFormExpanded, setIsTransactionFormExpanded] = useState(
    () => !isListFirstSector && (typeof window === "undefined" || !window.matchMedia("(max-width: 640px)").matches)
  );
  const [isArticleManagementExpanded, setIsArticleManagementExpanded] = useState(false);
  const [isTenantManagementExpanded, setIsTenantManagementExpanded] = useState(false);
  const [isShopManagementExpanded, setIsShopManagementExpanded] = useState(false);
  const [isProjectManagementExpanded, setIsProjectManagementExpanded] = useState(false);
  const formScope = `${activeCompany?.id ?? ""}:${selectedActivityCode ?? ""}`;
  const actionScopeKey = JSON.stringify([formScope, user?.id, user?.role]);
  const captureActionScope = useActionScope(actionScopeKey);

  useEffect(() => {
    setIsSavingTransaction(false);
    setIsSavingAccount(false);
    setIsSavingArticle(false);
    setIsSavingTenant(false);
    setIsSavingShop(false);
    setIsSavingProject(false);
    setBusyTransactionId(null);
    setBusyAccountId(null);
    setBusyArticleId(null);
    setBusyTenantId(null);
    setBusyShopId(null);
    setBusyProjectId(null);
    setLoadingProofsByTransaction({});
  }, [actionScopeKey]);
  const [mountedTransactionFormScope, setMountedTransactionFormScope] = useState<string | null>(null);
  const isTransactionFormOpen = isTransactionFormExpanded || Boolean(editingTransactionId);
  const shouldRenderTransactionForm = isTransactionFormOpen || mountedTransactionFormScope === formScope;
  useEffect(() => {
    if (isTransactionFormOpen) setMountedTransactionFormScope(formScope);
  }, [formScope, isTransactionFormOpen]);
  const accountChanges = useFormChanges(accountForm, `${formScope}:account:${editingAccountId ?? "new"}`);
  const articleChanges = useFormChanges(articleForm, `${formScope}:article:${editingArticleId ?? "new"}`);
  const tenantChanges = useFormChanges(tenantForm, `${formScope}:tenant:${editingTenantId ?? "new"}`);
  const shopChanges = useFormChanges(shopForm, `${formScope}:shop:${editingShopId ?? "new"}`);
  const projectChanges = useFormChanges(projectForm, `${formScope}:project:${editingProjectId ?? "new"}`);
  const transactionChanges = useFormChanges({ transactionForm, proof: transactionProofFile?.name }, `${formScope}:transaction:${editingTransactionId ?? "new"}`);
  const [isCompactScreen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
  );

  const [proofFiles, setProofFiles] = useState<Record<string, File | null>>({});
  const [proofsByTransaction, setProofsByTransaction] = useState<Record<string, TransactionProof[]>>(
    {}
  );
  const [accountPendingDelete, setAccountPendingDelete] = useState<FinancialAccount | null>(null);
  const [transactionPendingDelete, setTransactionPendingDelete] = useState<FinancialTransaction | null>(
    null
  );
  const [openProofs, setOpenProofs] = useState<Record<string, boolean>>({});
  const [loadingProofsByTransaction, setLoadingProofsByTransaction] = useState<Record<string, boolean>>(
    {}
  );

  const financeMetadataFields = selectedProfile?.finance.metadataFields ?? EMPTY_METADATA_FIELDS;
  const suggestionTransactions = useMemo(() => {
    const records = new Map(sectorSuggestionHistory.map((item) => [item.id, item]));
    for (const item of transactions) records.set(item.id, item);
    return [...records.values()].filter((item) => item.companyId === activeCompany?.id && item.activityCode === selectedActivityCode);
  }, [activeCompany?.id, sectorSuggestionHistory, selectedActivityCode, transactions]);
  const visibleFinanceMetadataFields = useMemo(
    () =>
      getVisibleFinanceMetadataFields(
        selectedActivityCode,
        transactionForm.type,
        transactionForm.metadata,
        financeMetadataFields
      ),
    [financeMetadataFields, selectedActivityCode, transactionForm.metadata, transactionForm.type]
  );
  const hardwareOperationKind = selectedActivityCode === "HARDWARE"
    ? getHardwareOperationKind(transactionForm.type, transactionForm.metadata)
    : "GLOBAL";
  const hardwareRecipients = useMemo(() => Array.from(new Set(
    suggestionTransactions
      .filter((item) => item.activityCode === "HARDWARE")
      .map((item) => item.metadata.recipientRef?.trim())
      .filter((value): value is string => Boolean(value))
  )).sort((left, right) => left.localeCompare(right, "fr")), [suggestionTransactions]);
  const storeOperationKind = selectedActivityCode === "GENERAL_STORE"
    ? getStoreOperationKind(transactionForm.type, transactionForm.metadata)
    : "ACHAT";
  const foodOperationKind = selectedActivityCode === "FOOD"
    ? getFoodOperationKind(transactionForm.type, transactionForm.metadata)
    : "PRODUCT_SALE";
  const agricultureOperationKind = selectedActivityCode === "AGRICULTURE"
    ? getAgricultureOperationKind(transactionForm.type, transactionForm.metadata)
    : "INPUT_PURCHASE";
  const btpOperationKind = selectedActivityCode === "BTP"
    ? getBtpOperationKind(transactionForm.type, transactionForm.metadata)
    : "MATERIAL_PURCHASE";
  const rentalOperationKind = selectedActivityCode === "RENTAL"
    ? getRentalOperationKind(transactionForm.type, transactionForm.metadata)
    : "LOYER";
  const hotelOperationKind = selectedActivityCode === "HOTEL_LODGING"
    ? getHotelOperationKind(transactionForm.type, transactionForm.metadata)
    : "ROOM_PAYMENT";
  const allowedCurrencies = selectedProfile?.finance.allowedCurrencies ?? DEFAULT_ALLOWED_CURRENCIES;
  const dailyAgreementOperationKind = (() => {
    const value = transactionForm.metadata[DAILY_AGREEMENT_OPERATION_KEY];
    return value === "AGREEMENT_PROFIT" || value === "CAPITAL_RETURN" || value === "AGREEMENT_EXPENSE"
      ? value
      : "PARTNER_PAYMENT";
  })() as DailyAgreementOperationKind;
  const waterOperationKind = selectedActivityCode === "WATER"
    ? getWaterOperationKind(transactionForm.type, transactionForm.metadata)
    : "WATER_SALE";
  const beverageOperationKind = selectedActivityCode === "BEVERAGE_DEPOT"
    ? getBeverageOperationKind(transactionForm.type, transactionForm.metadata)
    : "VENTE";
  const originalBeverageEdit = transactions.find((item) => item.id === editingTransactionId) ?? (linkedTransaction?.id === editingTransactionId ? linkedTransaction : undefined);
  const isLegacyBeverageEdit = selectedActivityCode === "BEVERAGE_DEPOT" && Boolean(editingTransactionId) && !originalBeverageEdit?.metadata.beverageProductId;
  const selectedBeverageProduct = beverageStock.items.find((product) => product.id === transactionForm.metadata.beverageProductId);
  const isArchivedBeverageEdit = selectedActivityCode === "BEVERAGE_DEPOT" &&
    Boolean(originalBeverageEdit?.metadata.beverageProductId) && !beverageStock.loading && !beverageStock.error &&
    !beverageStock.items.some((product) => product.id === originalBeverageEdit?.metadata.beverageProductId);
  const recentSalePrice = useMemo(() => {
    if (!selectedBeverageProduct || editingTransactionId || beverageOperationKind !== "VENTE") return null;
    const sales = suggestionTransactions.filter((item) =>
      item.activityCode === "BEVERAGE_DEPOT" && item.status === "APPROVED" && item.type === "CASH_IN" &&
      item.currency === transactionForm.currency && item.metadata.beverageOperationKind === "VENTE" &&
      item.metadata.beverageProductId === selectedBeverageProduct.id && Number(item.metadata.saleUnitPrice) > 0
    );
    sales.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.createdAt.localeCompare(a.createdAt));
    const price = sales[0]?.metadata.saleUnitPrice;
    // The form saves whole currency units. Never offer a rounded historical price.
    return price && Number.isSafeInteger(Number(price)) ? price : null;
  }, [selectedBeverageProduct, editingTransactionId, beverageOperationKind, suggestionTransactions, transactionForm.currency]);
  const nextSaleProductRef = useRef<HTMLSelectElement>(null);
  const nextSaleFocusScope = useRef<string | null>(null);
  useEffect(() => {
    if (nextSaleFocusScope.current !== actionScopeKey || !isTransactionFormExpanded || beverageStock.error) {
      nextSaleFocusScope.current = null;
      return;
    }
    if (!beverageStock.loading) {
      nextSaleFocusScope.current = null;
      nextSaleProductRef.current?.focus();
    }
  }, [actionScopeKey, isTransactionFormExpanded, beverageStock.loading, beverageStock.error, isSavingTransaction]);

  const agencyOperationKind = selectedActivityCode === "REAL_ESTATE_AGENCY"
    ? getAgencyOperationKind(transactionForm.type, transactionForm.metadata)
    : "SALE_COMMISSION";
  const fishFarmingOperationKind = selectedActivityCode === "FISH_FARMING"
    ? getFishFarmingOperationKind(transactionForm.type, transactionForm.metadata)
    : "FINGERLING_PURCHASE";
  const livestockOperationKind = selectedActivityCode === "LIVESTOCK"
    ? getLivestockOperationKind(transactionForm.type, transactionForm.metadata)
    : "ANIMAL_PURCHASE";
  const generalExpenseKind = selectedActivityCode === "GENERAL_EXPENSES"
    ? getGeneralExpenseKind(transactionForm.metadata)
    : "EMPLOYEE_OTHER";
  const generalExpenseOwner = getGeneralExpenseOwner(generalExpenseKind);
  const generalExpenseSuggestions = useMemo(() => {
    if (selectedActivityCode !== "GENERAL_EXPENSES" || editingTransactionId) {
      return [];
    }
    const seen = new Set<string>();
    return [...suggestionTransactions]
      .filter((item) =>
        item.companyId === activeCompany?.id &&
        item.activityCode === "GENERAL_EXPENSES" &&
        (item.status === "SUBMITTED" || item.status === "APPROVED") &&
        allowedCurrencies.includes(item.currency) &&
        getGeneralExpenseKind(item.metadata) === generalExpenseKind &&
        (!transactionForm.description.trim() ||
          (item.description ?? "").toLocaleLowerCase("fr").includes(transactionForm.description.trim().toLocaleLowerCase("fr")))
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .filter((item) => {
        const key = [item.description?.trim().toLocaleLowerCase("fr") ?? "", item.amount,
          item.metadata.quantity ?? "", item.metadata.unitPrice ?? ""].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [activeCompany?.id, allowedCurrencies, editingTransactionId, generalExpenseKind, selectedActivityCode, transactionForm.description, suggestionTransactions]);
  const generalExpenseDescriptionSuggestions = useMemo(() => {
    if (selectedActivityCode !== "GENERAL_EXPENSES") {
      return [];
    }
    const seen = new Set<string>();
    const values: string[] = [];
    for (const item of [...suggestionTransactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))) {
      if (item.activityCode !== "GENERAL_EXPENSES" || getGeneralExpenseKind(item.metadata) !== generalExpenseKind) {
        continue;
      }
      const value = item.description?.trim();
      if (!value) {
        continue;
      }
      const key = value.toLocaleLowerCase("fr");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push(value);
      if (values.length >= 12) {
        break;
      }
    }
    return values;
  }, [generalExpenseKind, selectedActivityCode, suggestionTransactions]);
  const currentSectorOperationKind = isQuickFillSectorActivity(selectedActivityCode)
    ? getSectorOperationKindValue(selectedActivityCode, transactionForm.type, transactionForm.metadata)
    : "";
  const sectorTransactionSuggestions = useMemo(() => {
    if (!isQuickFillSectorActivity(selectedActivityCode) || editingTransactionId) {
      return [];
    }
    const seen = new Set<string>();
    return [...suggestionTransactions]
      .filter((item) =>
        item.companyId === activeCompany?.id &&
        item.activityCode === selectedActivityCode &&
        (item.status === "SUBMITTED" || item.status === "APPROVED") &&
        allowedCurrencies.includes(item.currency) &&
        getSectorOperationKindValue(selectedActivityCode, item.type, item.metadata) === currentSectorOperationKind &&
        (!transactionForm.description.trim() ||
          (item.description ?? "").toLocaleLowerCase("fr").includes(transactionForm.description.trim().toLocaleLowerCase("fr")))
      )
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .filter((item) => {
        const key = [
          item.description?.trim().toLocaleLowerCase("fr") ?? "",
          item.amount,
          Object.entries(item.metadata)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, value]) => `${key}=${value}`)
            .join(",")
        ].join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [activeCompany?.id, allowedCurrencies, currentSectorOperationKind, editingTransactionId, selectedActivityCode, suggestionTransactions, transactionForm.description]);
  const sectorDescriptionSuggestions = useMemo(() => {
    if (!isQuickFillSectorActivity(selectedActivityCode)) {
      return [];
    }
    const seen = new Set<string>();
    const values: string[] = [];
    for (const item of [...suggestionTransactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))) {
      if (
        item.activityCode !== selectedActivityCode ||
        getSectorOperationKindValue(selectedActivityCode, item.type, item.metadata) !== currentSectorOperationKind
      ) {
        continue;
      }
      const value = item.description?.trim();
      if (!value) {
        continue;
      }
      const key = value.toLocaleLowerCase("fr");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      values.push(value);
      if (values.length >= 12) {
        break;
      }
    }
    return values;
  }, [currentSectorOperationKind, selectedActivityCode, suggestionTransactions]);
  const hasRequiredFinanceDetails = Boolean(
    selectedProfile?.finance.requiresDescription ||
      visibleFinanceMetadataFields.some((field) => field.required) ||
      selectedActivityCode === "HARDWARE" ||
      selectedActivityCode === "GENERAL_STORE" ||
      selectedActivityCode === "FOOD" ||
      selectedActivityCode === "AGRICULTURE" ||
      selectedActivityCode === "BTP" ||
      selectedActivityCode === "RENTAL" ||
      selectedActivityCode === "HOTEL_LODGING" ||
      selectedActivityCode === "WATER" ||
      selectedActivityCode === "REAL_ESTATE_AGENCY" ||
      selectedActivityCode === "FISH_FARMING" ||
      selectedActivityCode === "LIVESTOCK" ||
      selectedActivityCode === "GENERAL_EXPENSES"
  );
  const enabledActivityCodes = useMemo(
    () => financeEnabledActivities.map((item) => item.code),
    [financeEnabledActivities]
  );
  const requestedTransactionId = searchParams.get("transactionId");
  const requestedTransactionIdRef = useRef(requestedTransactionId);
  const sectorTransactions = useMemo(
    () => transactions.filter((item) => item.companyId === activeCompany?.id && item.activityCode === selectedActivityCode),
    [activeCompany?.id, selectedActivityCode, transactions]
  );

  const selectedTransaction = useMemo(
    () => sectorTransactions.find((item) => item.id === selectedTransactionId) ??
      (linkedTransaction?.id === selectedTransactionId &&
        linkedTransaction.companyId === activeCompany?.id &&
        (linkedTransaction.activityCode === selectedActivityCode ||
          (linkedTransaction.activityCode !== null && !enabledActivityCodes.includes(linkedTransaction.activityCode)))
        ? linkedTransaction : null),
    [activeCompany?.id, enabledActivityCodes, linkedTransaction, sectorTransactions, selectedActivityCode, selectedTransactionId]
  );
  const isSelectedTransactionArchived = Boolean(
    selectedTransaction?.activityCode && !enabledActivityCodes.includes(selectedTransaction.activityCode)
  );
  const selectedTransactionMetadataFields = selectedTransaction?.activityCode
    ? profiles.find((profile) => profile.activityCode === selectedTransaction.activityCode)?.finance.metadataFields ?? financeMetadataFields
    : financeMetadataFields;
  const canMutateSelectedTransaction = useMemo(
    () => (selectedTransaction && !isSelectedTransactionArchived ? canMutateTransaction(selectedTransaction) : false),
    [canMutateTransaction, isSelectedTransactionArchived, selectedTransaction]
  );
  const serviceCategorySuggestions = useMemo(() => {
    if (selectedActivityCode !== "SERVICES") return [];
    const values = new Set(["Morgue"]);
    for (const item of suggestionTransactions) {
      if (item.activityCode === "SERVICES" && item.metadata.serviceCategory?.trim()) {
        values.add(item.metadata.serviceCategory.trim());
      }
    }
    return [...values].sort((left, right) => left.localeCompare(right, "fr"));
  }, [selectedActivityCode, suggestionTransactions]);
  const displayTransactions = sectorTransactions;
  const totalVisibleTransactionPages = useMemo(() => {
    return Math.max(1, Math.ceil(displayTransactions.length / visibleTransactionsPageSize));
  }, [displayTransactions.length, visibleTransactionsPageSize]);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (visibleTransactionsPage - 1) * visibleTransactionsPageSize;
    return displayTransactions.slice(startIndex, startIndex + visibleTransactionsPageSize);
  }, [displayTransactions, visibleTransactionsPage, visibleTransactionsPageSize]);
  const visibleTransactionsRange = useMemo(() => {
    if (displayTransactions.length === 0) {
      return { start: 0, end: 0 };
    }

    const start = (visibleTransactionsPage - 1) * visibleTransactionsPageSize + 1;
    const end = Math.min(visibleTransactionsPage * visibleTransactionsPageSize, displayTransactions.length);
    return { start, end };
  }, [displayTransactions.length, visibleTransactionsPage, visibleTransactionsPageSize]);
  const resetAccountForm = useCallback(() => {
    setEditingAccountId(null);
    accountChanges.markClean();
    setAccountForm(buildDefaultAccountForm(selectedActivityCode, canManageGlobalAccounts));
  }, [canManageGlobalAccounts, selectedActivityCode]);

  const resetArticleForm = useCallback(() => {
    setEditingArticleId(null);
    articleChanges.markClean();
    setArticleForm(buildDefaultArticleForm());
  }, []);

  const resetTenantForm = useCallback(() => {
    setEditingTenantId(null);
    tenantChanges.markClean();
    setTenantForm(buildDefaultTenantForm());
  }, []);

  const resetShopForm = useCallback(() => {
    setEditingShopId(null);
    shopChanges.markClean();
    setShopForm(buildDefaultShopForm());
  }, []);

  const resetProjectForm = useCallback(() => {
    setEditingProjectId(null);
    projectChanges.markClean();
    setProjectForm(buildDefaultProjectForm());
  }, []);

  const resetTransactionForm = useCallback(() => {
    setEditingTransactionId(null);
    editingTransactionActivityRef.current = null;
    transactionChanges.markClean();
    setTransactionProofFile(null);
    const defaultMetadata = syncMetadataState({}, financeMetadataFields);
    setTransactionForm((prev) => ({
      accountId: accounts.some((account) => account.id === prev.accountId)
        ? prev.accountId
        : accounts[0]?.id ?? "",
      type: getDefaultTransactionType(selectedActivityCode),
      amount: "",
      currency: allowedCurrencies.includes(prev.currency)
        ? prev.currency
        : allowedCurrencies[0] ?? "XOF",
      description: "",
      metadata:
        selectedActivityCode === "HARDWARE"
          ? { ...defaultMetadata, [HARDWARE_OPERATION_KIND_KEY]: "ITEM_ENTRY" }
          : selectedActivityCode === "BEVERAGE_DEPOT"
            ? { ...defaultMetadata, [BEVERAGE_OPERATION_KIND_KEY]: "VENTE" }
          : defaultMetadata,
      // Kept from the previous entry so entering many lines from the same paper
      // ledger (same day, same account) doesn't require reselecting them each time.
      occurredAt: prev.occurredAt
    }));
  }, [accounts, allowedCurrencies, financeMetadataFields, selectedActivityCode]);

  const referenceViewKey = activeReferenceView?.view ?? "transactions";
  const previousReferenceView = useRef(referenceViewKey);
  useEffect(() => {
    const previousView = previousReferenceView.current;
    if (previousView === referenceViewKey) return;
    previousReferenceView.current = referenceViewKey;
    if (previousView === "articles") resetArticleForm();
    else if (previousView === "tenants") resetTenantForm();
    else if (previousView === "shops") resetShopForm();
    else if (previousView === "projects") resetProjectForm();
    else resetTransactionForm();
    setIsArticleManagementExpanded(false);
    setIsTenantManagementExpanded(false);
    setIsShopManagementExpanded(false);
    setIsProjectManagementExpanded(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [referenceViewKey, resetArticleForm, resetTenantForm, resetShopForm, resetProjectForm, resetTransactionForm]);

  useEffect(() => {
    const previous = sectorFormScopeRef.current;
    if (previous.companyId === activeCompany?.id && previous.activityCode === selectedActivityCode) return;
    sectorFormScopeRef.current = { companyId: activeCompany?.id, activityCode: selectedActivityCode };
    const hadUnsavedWork = transactionChanges.isDirty;
    setEditingTransactionId(null);
    editingTransactionActivityRef.current = null;
    transactionChanges.markClean();
    setTransactionProofFile(null);
    setTransactionForm({
      accountId: "",
      type: getDefaultTransactionType(selectedActivityCode),
      amount: "",
      currency: allowedCurrencies[0] ?? "XOF",
      description: "",
      metadata: syncMetadataState({}, financeMetadataFields),
      occurredAt: ""
    });
    if (isListFirstSector && location.hash !== "#transaction-create") setIsTransactionFormExpanded(false);
    resetAccountForm();
    resetArticleForm();
    resetTenantForm();
    resetShopForm();
    resetProjectForm();
    setTransactions([]);
    setHasMoreTransactions(false);
    hasLoadedTransactionsRef.current = false;
    setIsLoading(true);
    setSelectedTransactionId(new URLSearchParams(location.search).get("transactionId"));
    setLinkedTransaction(null);
    setErrorMessage(null);
    setSuccessMessage(hadUnsavedWork ? "Le formulaire a été réinitialisé pour le nouveau secteur." : null);
  }, [activeCompany?.id, allowedCurrencies, editingTransactionId, financeMetadataFields, transactionChanges.isDirty, location.search, resetAccountForm, resetArticleForm, resetProjectForm, resetShopForm, resetTenantForm, selectedActivityCode]);

  const canManageAccount = useCallback(
    (account: FinancialAccount): boolean => {
      if (!canManageAnyAccount) {
        return false;
      }
      return true;
    },
    [canManageAnyAccount]
  );
  const financePageCards = useMemo(() => {
    const cashInTotal = displayTransactions
      .filter((item) => item.type === "CASH_IN")
      .reduce((sum, item) => sum + toAmountNumber(item.amount), 0);
    const cashOutTotal = displayTransactions
      .filter((item) => item.type === "CASH_OUT")
      .reduce((sum, item) => sum + toAmountNumber(item.amount), 0);
    const netBalance = cashInTotal - cashOutTotal;

    const cards = [
      {
        title: "Entrées",
        value: formatAmountForDisplay(cashInTotal),
        note: "Montant cumulé"
      },
      {
        title: "Sorties",
        value: formatAmountForDisplay(cashOutTotal),
        note: "Montant cumulé"
      },
      {
        title: "Solde net",
        value: formatAmountForDisplay(netBalance),
        note: "Entrées - sorties"
      }
    ];

    return cards;
  }, [displayTransactions, transactions]);
  const dumpTruckSummaryCards = useMemo(() => {
    if (selectedActivityCode !== "TRANSPORT") {
      return [];
    }
    const summaries = dumpTruckSummaryItems.length > 0
      ? dumpTruckSummaryItems
      : [{ currency: "XOF", operationsCount: 0, incomeTotal: "0", amccoTotal: "0", expensesTotal: "0", netSettlementTotal: "0" }];
    return summaries.flatMap((summary) => [
      {
        title: `Recettes camion benne · ${summary.currency}`,
        value: formatAmountForDisplay(summary.incomeTotal),
        note: `${summary.operationsCount} opération(s) comptabilisée(s)`
      },
      {
        title: `Part AMCCO · ${summary.currency}`,
        value: formatAmountForDisplay(summary.amccoTotal),
        note: "Part AMCCO saisie sur les recettes"
      },
      {
        title: `Dépenses benne · ${summary.currency}`,
        value: formatAmountForDisplay(summary.expensesTotal),
        note: "Sorties hors versements AMCCO"
      },
      {
        title: `Versement net estimé · ${summary.currency}`,
        value: formatAmountForDisplay(summary.netSettlementTotal),
        note: "Montant − part AMCCO − dépenses"
      }
    ]);
  }, [dumpTruckSummaryItems, selectedActivityCode]);

  const handleOpenTransactionDetails = useCallback(
    (transactionId: string, activityCode: BusinessActivityCode | null) => {
      requestedTransactionIdRef.current = transactionId;
      setSelectedTransactionId(transactionId);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("transactionId", transactionId);
        if (activityCode) {
          next.set("activityCode", activityCode);
        }
        return next;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (!requestedTransactionId || selectedTransaction?.id !== requestedTransactionId) return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById("transaction-detail")?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [requestedTransactionId, selectedTransaction?.id]);

  const handleCloseTransactionDetails = useCallback(() => {
    requestedTransactionIdRef.current = null;
    setSelectedTransactionId(null);
    setLinkedTransaction(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("transactionId");
      const activityCode = next.get("activityCode");
      if (activityCode && !enabledActivityCodes.includes(activityCode as BusinessActivityCode)) {
        next.delete("activityCode");
      }
      return next;
    });
  }, [enabledActivityCodes, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++dailyCategoriesLoadRequestRef.current;
    if (isLoadingActivities || selectedActivityCode !== "DAILY_ACTIVITIES") {
      setDailyActivityCategories([]);
      return;
    }
    if (!isTransactionFormExpanded) return;
    void withAuthorizedToken((accessToken) => listDailyActivityCategoriesRequest(accessToken, { activeOnly: true }))
      .then((response) => {
        if (!cancelled && requestId === dailyCategoriesLoadRequestRef.current) {
          setDailyActivityCategories(response.items);
        }
      })
      .catch((error) => {
        if (!cancelled && requestId === dailyCategoriesLoadRequestRef.current) {
          setErrorMessage(toErrorMessage(error));
        }
      });
    return () => { cancelled = true; };
  }, [activeCompany?.id, isLoadingActivities, isTransactionFormExpanded, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    if (selectedActivityCode !== "DAILY_ACTIVITIES" || dailyActivityCategories.length === 0) return;
    setTransactionForm((previous) => {
      const validCategory = dailyActivityCategories.some((category) => category.name === previous.metadata.dailyActivityKind);
      const candidate = previous.metadata[DAILY_AGREEMENT_OPERATION_KEY] as DailyAgreementOperationKind;
      const operationKind = candidate in DAILY_AGREEMENT_OPERATION_LABELS ? candidate : "PARTNER_PAYMENT";
      return {
        ...previous,
        type: getDailyAgreementOperationType(operationKind),
        metadata: {
          ...previous.metadata,
          dailyActivityKind: validCategory ? previous.metadata.dailyActivityKind : DAILY_PROTOCOL_CATEGORY,
          [DAILY_AGREEMENT_OPERATION_KEY]: operationKind
        }
      };
    });
  }, [dailyActivityCategories, selectedActivityCode]);

  useEffect(() => {
    if (location.hash !== "#transaction-create" || isLoading) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsTransactionFormExpanded(true);
      const target = document.getElementById("transaction-create");
      if (!target) {
        return;
      }
      target.scrollIntoView({ block: "start" });
      navigate(`${location.pathname}${location.search}`, { replace: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isLoading, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    requestedTransactionIdRef.current = requestedTransactionId;
    if (!requestedTransactionId) {
      setSelectedTransactionId(null);
      setLinkedTransaction(null);
      return;
    }

    setSelectedTransactionId(requestedTransactionId);
  }, [requestedTransactionId]);

  useEffect(() => {
    if (requestedTransactionId && !isLoadingActivities && !isLoading && !selectedActivityCode) {
      setErrorMessage("Aucun secteur actif n'est disponible pour ouvrir cette transaction.");
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete("transactionId");
        return next;
      }, { replace: true });
      return;
    }
    if (
      !requestedTransactionId || isLoadingActivities || isLoading || !selectedActivityCode ||
      sectorTransactions.some((item) => item.id === requestedTransactionId) ||
      (linkedTransaction?.id === requestedTransactionId && linkedTransaction.companyId === activeCompany?.id)
    ) return;

    let cancelled = false;
    const clearInvalidLink = (): void => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous);
        next.delete("transactionId");
        return next;
      }, { replace: true });
    };
    void withAuthorizedToken((accessToken) =>
      getFinanceTransactionRequest(accessToken, requestedTransactionId)
    ).then(({ item }) => {
      if (cancelled) return;
      if (item.companyId !== activeCompany?.id || !item.activityCode) {
        setErrorMessage("Cette transaction n'est pas disponible dans cet espace sectoriel.");
        clearInvalidLink();
        return;
      }
      if (enabledActivityCodes.includes(item.activityCode) && item.activityCode !== selectedActivityCode) {
        setSelectedActivityCode(item.activityCode);
        setSearchParams((previous) => {
          const next = new URLSearchParams(previous);
          next.set("activityCode", item.activityCode as BusinessActivityCode);
          return next;
        }, { replace: true });
      }
      setLinkedTransaction(item);
    }).catch((error) => {
      if (cancelled) return;
      setErrorMessage(toErrorMessage(error));
      clearInvalidLink();
    });
    return () => { cancelled = true; };
  }, [activeCompany?.id, enabledActivityCodes, isLoading, isLoadingActivities, linkedTransaction?.id, linkedTransaction?.companyId, requestedTransactionId, sectorTransactions, selectedActivityCode, setSearchParams, setSelectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    setVisibleTransactionsPage(1);
  }, [searchQuery, filters.type, selectedActivityCode]);

  useEffect(() => {
    if (isLoadingActivities || selectedActivityCode !== "TRANSPORT" || !activeCompany?.id) {
      setDumpTruckSummaryItems([]);
      setDumpTruckSummaryError(null);
      setIsLoadingDumpTruckSummary(false);
      return;
    }

    let cancelled = false;
    setIsLoadingDumpTruckSummary(true);
    setDumpTruckSummaryError(null);
    withAuthorizedToken((accessToken) =>
      getFinanceDumpTruckSummaryRequest(accessToken, dumpTruckSummaryPeriod)
    )
      .then((response) => {
        if (!cancelled) setDumpTruckSummaryItems(response.items);
      })
      .catch((error) => {
        if (!cancelled) setDumpTruckSummaryError(toErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDumpTruckSummary(false);
      });

    return () => { cancelled = true; };
  }, [activeCompany?.id, dumpTruckSummaryPeriod, isLoadingActivities, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    setVisibleTransactionsPage((previousPage) =>
      previousPage > totalVisibleTransactionPages ? totalVisibleTransactionPages : previousPage
    );
  }, [totalVisibleTransactionPages]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean; silent?: boolean }) => {
    const requestId = ++transactionsLoadRequestRef.current;
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    const silent = options?.silent === true;
    const pageSize = transactionsFetchPageSize;
    if (isLoadingActivities) {
      setIsLoadingMoreTransactions(false);
      return;
    }
    if (append) {
      setIsLoadingMoreTransactions(true);
    } else {
      setIsLoadingMoreTransactions(false);
      if (!silent) setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken(async (accessToken) => {
        if (!selectedActivityCode) {
          return {
            transactions: [] as FinancialTransaction[]
          };
        }

        const transactionsResp = await listFinanceTransactionsRequest(accessToken, {
          limit: pageSize,
          offset,
          search: debouncedSearch || undefined,
          type: filters.type === "ALL" ? undefined : filters.type,
          activityCode: selectedActivityCode
        });
        return { transactions: transactionsResp.items };
      });
      if (requestId !== transactionsLoadRequestRef.current) return;
      setHasMoreTransactions(payload.transactions.length === pageSize);
      setTransactions((prev) => {
        if (!append) {
          return payload.transactions;
        }
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...payload.transactions.filter((item) => !seen.has(item.id))];
      });
      if (!append) {
        setSelectedTransactionId((prev) => {
          const requestedId = requestedTransactionIdRef.current;
          if (requestedId) {
            return requestedId;
          }
          return payload.transactions.some((item) => item.id === prev)
            ? prev
            : (payload.transactions[0]?.id ?? null);
        });
        const txIds = new Set(payload.transactions.map((item) => item.id));
        setProofsByTransaction((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
        );
        setOpenProofs((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
        );
        setLoadingProofsByTransaction((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([transactionId]) => txIds.has(transactionId)))
        );
      }
    } catch (error) {
      if (requestId === transactionsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === transactionsLoadRequestRef.current) {
        if (append) {
          setIsLoadingMoreTransactions(false);
        } else if (!silent) {
          hasLoadedTransactionsRef.current = true;
          setIsLoading(false);
        }
      }
    }
  }, [activeCompany?.id, debouncedSearch, filters.type, isLoadingActivities, selectedActivityCode, transactionsFetchPageSize, withAuthorizedToken]);

  const suggestionHistoryCache = useRef<{ key: string; loadedAt: number } | null>(null);
  const historyType = isQuickFillSectorActivity(selectedActivityCode) || filters.type === "ALL" ? undefined : filters.type;
  const historySearch = isQuickFillSectorActivity(selectedActivityCode) ? undefined : debouncedSearch || undefined;
  const loadSectorSuggestionHistory = useCallback(async () => {
    const requestId = ++sectorSuggestionLoadRequestRef.current;
    if (
      isLoadingActivities ||
      !isTransactionFormExpanded ||
      !selectedActivityCode ||
      !needsTransactionSuggestionHistory(selectedActivityCode)
    ) {
      if (!needsTransactionSuggestionHistory(selectedActivityCode)) {
        suggestionHistoryCache.current = null;
        setSectorSuggestionHistory([]);
      }
      return;
    }

    const key = JSON.stringify([actionScopeKey, historyType, historySearch, suggestionHistoryPageSize]);
    const cached = suggestionHistoryCache.current;
    if (cached?.key === key && Date.now() - cached.loadedAt < 60_000) return;
    suggestionHistoryCache.current = null;
    setSectorSuggestionHistory([]);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listFinanceTransactionsRequest(accessToken, {
          limit: suggestionHistoryPageSize,
          offset: 0,
          activityCode: selectedActivityCode,
          type: historyType,
          search: historySearch
        })
      );
      if (requestId === sectorSuggestionLoadRequestRef.current) {
        suggestionHistoryCache.current = { key, loadedAt: Date.now() };
        setSectorSuggestionHistory(response.items);
      }
    } catch {
      if (requestId === sectorSuggestionLoadRequestRef.current) {
        setSectorSuggestionHistory(transactionsRef.current);
      }
    }
  }, [
    actionScopeKey,
    historySearch,
    historyType,
    isLoadingActivities,
    isTransactionFormExpanded,
    selectedActivityCode,
    suggestionHistoryPageSize,
    withAuthorizedToken
  ]);

  const loadAccounts = useCallback(async () => {
    const requestId = ++accountsLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (!selectedActivityCode) {
      setAccounts([]);
      setHasLoadedAccounts(true);
      setIsLoadingAccounts(false);
      setEditingAccountId(null);
      setTransactionForm((prev) => ({ ...prev, accountId: "" }));
      return;
    }
    setIsLoadingAccounts(true);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listFinanceAccountsRequest(accessToken, { activityCode: selectedActivityCode })
      );
      if (requestId !== accountsLoadRequestRef.current) return;
      setAccounts(response.items);
      setHasLoadedAccounts(true);
      setEditingAccountId((previous) =>
        previous && response.items.some((account) => account.id === previous) ? previous : null
      );
      setTransactionForm((prev) => ({
        ...prev,
        accountId: response.items.some((account) => account.id === prev.accountId)
          ? prev.accountId
          : (response.items[0]?.id ?? "")
      }));
    } catch (error) {
      if (requestId === accountsLoadRequestRef.current) {
        setErrorMessage(toErrorMessage(error));
      }
    } finally {
      if (requestId === accountsLoadRequestRef.current) {
        setIsLoadingAccounts(false);
      }
    }
  }, [activeCompany?.id, isLoadingActivities, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    accountsLoadRequestRef.current += 1;
    setAccounts([]);
    setHasLoadedAccounts(false);
    setIsLoadingAccounts(false);
    setIsAccountListExpanded(false);
  }, [activeCompany?.id, selectedActivityCode]);

  useEffect(() => {
    if (loadedCompanyIdRef.current === activeCompany?.id) return;
    loadedCompanyIdRef.current = activeCompany?.id;
    suggestionHistoryCache.current = null;
    accountsLoadRequestRef.current += 1;
    setAccounts([]);
    setTransactions([]);
    setSelectedTransactionId(null);
    setEditingTransactionId(null);
    setSectorSuggestionHistory([]);
    setProofsByTransaction({});
    setOpenProofs({});
    setLoadingProofsByTransaction({});
    setDailyActivityCategories([]);
    setArticles([]);
    setTenants([]);
    setShops([]);
    setProjects([]);
    setIsLoading(true);
    setErrorMessage(null);
  }, [activeCompany?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadSectorSuggestionHistory();
    return () => {
      sectorSuggestionLoadRequestRef.current += 1;
    };
  }, [loadSectorSuggestionHistory]);

  useEffect(() => {
    if (isTransactionFormExpanded) void loadAccounts();
  }, [isTransactionFormExpanded, loadAccounts]);

  const loadArticles = useCallback(async () => {
    const requestId = ++articlesLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "HARDWARE") {
      setArticles([]);
      return;
    }
    if (!isTransactionFormExpanded && !isArticleManagementExpanded && !isHardwareArticlesView) return;
    setIsLoadingArticles(true);
    setHasLoadedArticles(false);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listActivityArticlesRequest(accessToken, "HARDWARE")
      );
      if (requestId !== articlesLoadRequestRef.current) return;
      setArticles(payload.items);
      setHasLoadedArticles(true);
    } catch (error) {
      if (requestId === articlesLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === articlesLoadRequestRef.current) setIsLoadingArticles(false);
    }
  }, [activeCompany?.id, isArticleManagementExpanded, isHardwareArticlesView, isLoadingActivities, isTransactionFormExpanded, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const loadTenants = useCallback(async () => {
    const requestId = ++tenantsLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "RENTAL") {
      setTenants([]);
      return;
    }
    if (!isTransactionFormExpanded && !isTenantManagementExpanded && activeReferenceView?.view !== "tenants") return;
    setIsLoadingTenants(true);
    setHasLoadedTenants(false);
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listRentalTenantsRequest(accessToken)
      );
      if (requestId !== tenantsLoadRequestRef.current) return;
      loadedTenantsContextRef.current = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
      setTenants(payload.items);
      setHasLoadedTenants(true);
    } catch (error) {
      if (requestId === tenantsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === tenantsLoadRequestRef.current) setIsLoadingTenants(false);
    }
  }, [activeCompany?.id, activeReferenceView?.view, isLoadingActivities, isTenantManagementExpanded, isTransactionFormExpanded, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    if (loadedTenantsContextRef.current !== `${activeCompany?.id ?? ""}:${selectedActivityCode}`) void loadTenants();
  }, [activeCompany?.id, loadTenants, selectedActivityCode]);

  const loadShops = useCallback(async () => {
    const requestId = ++shopsLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "GENERAL_STORE") {
      setShops([]);
      return;
    }
    if (!isTransactionFormExpanded && !isShopManagementExpanded && activeReferenceView?.view !== "shops") return;
    setIsLoadingShops(true);
    setHasLoadedShops(false);
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listGeneralStoreShopsRequest(accessToken)
      );
      if (requestId !== shopsLoadRequestRef.current) return;
      loadedShopsContextRef.current = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
      setShops(payload.items);
      setHasLoadedShops(true);
    } catch (error) {
      if (requestId === shopsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === shopsLoadRequestRef.current) setIsLoadingShops(false);
    }
  }, [activeCompany?.id, activeReferenceView?.view, isLoadingActivities, isShopManagementExpanded, isTransactionFormExpanded, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    if (loadedShopsContextRef.current !== `${activeCompany?.id ?? ""}:${selectedActivityCode}`) void loadShops();
  }, [activeCompany?.id, loadShops, selectedActivityCode]);

  const loadProjects = useCallback(async () => {
    const requestId = ++projectsLoadRequestRef.current;
    if (isLoadingActivities) return;
    if (selectedActivityCode !== "BTP") {
      setProjects([]);
      return;
    }
    if (!isTransactionFormExpanded && !isProjectManagementExpanded && activeReferenceView?.view !== "projects") return;
    setIsLoadingProjects(true);
    setHasLoadedProjects(false);
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken((accessToken) =>
        listBtpProjectsRequest(accessToken)
      );
      if (requestId !== projectsLoadRequestRef.current) return;
      loadedProjectsContextRef.current = `${activeCompany?.id ?? ""}:${selectedActivityCode}`;
      setProjects(payload.items);
      setHasLoadedProjects(true);
    } catch (error) {
      if (requestId === projectsLoadRequestRef.current) setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === projectsLoadRequestRef.current) setIsLoadingProjects(false);
    }
  }, [activeCompany?.id, activeReferenceView?.view, isLoadingActivities, isProjectManagementExpanded, isTransactionFormExpanded, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    if (loadedProjectsContextRef.current !== `${activeCompany?.id ?? ""}:${selectedActivityCode}`) void loadProjects();
  }, [activeCompany?.id, loadProjects, selectedActivityCode]);

  async function handleLoadMoreTransactions(): Promise<void> {
    if (isLoading || isLoadingMoreTransactions || !hasMoreTransactions) {
      return;
    }
    await loadData({
      offset: transactions.length,
      append: true
    });
  }

  function renderVisibleTransactionsPagination(placement: "top" | "bottom" = "top"): JSX.Element | null {
    if (displayTransactions.length === 0) {
      return null;
    }

    return (
      <div className={`list-pagination finance-transactions-pagination mobile-pagination-${placement}`}>
        <div className="finance-transactions-pagination-meta">
          <p className="hint list-pagination-meta">
            Transactions {visibleTransactionsRange.start} à {visibleTransactionsRange.end} sur{" "}
            {displayTransactions.length} affichée(s)
            {displayTransactions.length !== transactions.length
              ? ` (${transactions.length} chargee(s) localement)`
              : ""}
            {hasMoreTransactions ? " et d'autres pages serveur sont disponibles." : "."}
          </p>
          <label className="finance-transactions-page-size">
            <span>Lignes par page</span>
            <select
              value={visibleTransactionsPageSize}
              onChange={(event) => setVisibleTransactionsPageSize(Number(event.target.value))}
            >
              {TRANSACTION_VISIBLE_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="finance-transactions-pagination-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setVisibleTransactionsPage((previousPage) => Math.max(1, previousPage - 1))}
            disabled={visibleTransactionsPage <= 1}
          >
            Précédent
          </button>
          <p className="hint finance-transactions-page-indicator">
            Page {visibleTransactionsPage} sur {totalVisibleTransactionPages}
          </p>
          <button
            type="button"
            className="secondary-btn"
            onClick={() =>
              setVisibleTransactionsPage((previousPage) =>
                Math.min(totalVisibleTransactionPages, previousPage + 1)
              )
            }
            disabled={visibleTransactionsPage >= totalVisibleTransactionPages}
          >
            Suivant
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    setTransactionForm((prev) => {
      const nextCurrency = allowedCurrencies.includes(prev.currency)
        ? prev.currency
        : (allowedCurrencies[0] ?? "XOF");
      const nextMetadata = syncMetadataState(prev.metadata, financeMetadataFields);

      if (prev.currency === nextCurrency && sameStringRecord(prev.metadata, nextMetadata)) {
        return prev;
      }

      return {
        ...prev,
        currency: nextCurrency,
        metadata: nextMetadata
      };
    });
  }, [allowedCurrencies, financeMetadataFields, transactionWorkspace]);

  useEffect(() => {
    setTransactionForm((prev) => {
      if (editingTransactionId) {
        return prev;
      }
      if (selectedActivityCode === "BEVERAGE_DEPOT" && !prev.metadata[BEVERAGE_OPERATION_KIND_KEY]) {
        const kind = prev.type === "CASH_IN" ? "VENTE" : "ACHAT_STOCK";
        return { ...prev, metadata: { ...prev.metadata, [BEVERAGE_OPERATION_KIND_KEY]: kind } };
      }
      const hasDraftInput =
        prev.amount.trim().length > 0 ||
        prev.description.trim().length > 0 ||
        prev.occurredAt.trim().length > 0 ||
        Object.values(prev.metadata).some((value) => value.trim().length > 0);
      const nextType = getDefaultTransactionType(selectedActivityCode);
      return hasDraftInput || prev.type === nextType ? prev : { ...prev, type: nextType };
    });
  }, [editingTransactionId, selectedActivityCode]);

  useEffect(() => {
    setAccountForm((prev) => {
      const next = normalizeAccountFormForActivities(prev, enabledActivityCodes, selectedActivityCode);
      return sameAccountForm(prev, next) ? prev : next;
    });
  }, [enabledActivityCodes, selectedActivityCode]);

  useEffect(() => {
    if (canManageGlobalAccounts) {
      return;
    }

    setAccountForm((prev) =>
      prev.scopeType === "GLOBAL"
        ? {
            ...buildDefaultAccountForm(selectedActivityCode, false),
            name: prev.name,
            accountRef: prev.accountRef,
            openingBalance: prev.openingBalance
          }
        : prev
    );
  }, [canManageGlobalAccounts, selectedActivityCode]);

  async function handleSaveAccount(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingAccount(true);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const payload = {
          name: accountForm.name.trim(),
          accountRef: accountForm.accountRef.trim() || undefined,
          openingBalance: normalizeAmountForApi(accountForm.openingBalance),
          scopeType: accountForm.scopeType,
          primaryActivityCode:
            accountForm.scopeType === "DEDICATED" && accountForm.primaryActivityCode
              ? accountForm.primaryActivityCode
              : undefined,
          allowedActivityCodes:
            accountForm.scopeType === "RESTRICTED" ? accountForm.allowedActivityCodes : []
        };

        return editingAccountId
          ? updateFinanceAccountRequest(accessToken, editingAccountId, payload)
          : createFinanceAccountRequest(accessToken, payload);
      });
      if (!isCurrentAction()) return;
      accountsLoadRequestRef.current += 1;
      setSuccessMessage(
        editingAccountId ? "Compte financier modifié." : "Compte financier créé."
      );
      setAccounts((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      resetAccountForm();
      setTransactionForm((prev) => ({
        ...prev,
        accountId: response.item.id
      }));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingAccount(false);
    }
  }

  function scrollToFinanceSection(sectionId: string): void {
    window.requestAnimationFrame(() => {
      const section = document.getElementById(sectionId);
      if (section instanceof HTMLDetailsElement) section.open = true;
      section?.scrollIntoView({
        block: "start",
        behavior: "smooth"
      });
    });
  }

  function handleStartEditAccount(account: FinancialAccount): void {
    const lockedMessage = getLockedAccountMessage(account);
    if (lockedMessage) {
      setErrorMessage(lockedMessage);
      setSuccessMessage(null);
      return;
    }

    if (!accountChanges.confirmDiscard()) return;
    accountChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingAccountId(account.id);
    setIsAccountFormExpanded(true);
    scrollToFinanceSection("account-create");
    setAccountForm({
      name: account.name,
      accountRef: account.accountRef ?? "",
      openingBalance: formatAmountForInput(account.balance),
      scopeType: account.scopeType,
      primaryActivityCode: account.primaryActivityCode ?? "",
      allowedActivityCodes: account.allowedActivityCodes
    });
  }

  function handleCancelEditAccount(): void {
    if (!accountChanges.confirmDiscard()) return;
    accountChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetAccountForm();
  }

  function handleDeleteAccount(account: FinancialAccount): void {
    const lockedMessage = getLockedAccountMessage(account);
    if (lockedMessage) {
      setErrorMessage(lockedMessage);
      setSuccessMessage(null);
      return;
    }

    setAccountPendingDelete(account);
  }

  async function handleConfirmDeleteAccount(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!accountPendingDelete) {
      return;
    }

    const account = accountPendingDelete;
    setBusyAccountId(account.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteFinanceAccountRequest(accessToken, account.id));
      if (!isCurrentAction()) return;
      accountsLoadRequestRef.current += 1;
      if (editingAccountId === account.id) {
        resetAccountForm();
      }
      setSuccessMessage("Compte financier supprimé.");
      setAccountPendingDelete(null);
      setAccounts((prev) => prev.filter((item) => item.id !== account.id));
      setTransactionForm((prev) =>
        prev.accountId === account.id
          ? { ...prev, accountId: accounts.find((item) => item.id !== account.id)?.id ?? "" }
          : prev
      );
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyAccountId(null);
    }
  }

  async function handleSaveArticle(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingArticle(true);

    try {
      const payload = {
        name: articleForm.name.trim(),
        defaultMargin: articleForm.defaultMargin.trim()
          ? normalizeAmountForApi(articleForm.defaultMargin)
          : undefined,
        defaultPurchaseUnitPrice: articleForm.defaultPurchaseUnitPrice.trim()
          ? normalizeAmountForApi(articleForm.defaultPurchaseUnitPrice)
          : undefined
      };

      const response = await withAuthorizedToken((accessToken) =>
        editingArticleId
          ? updateActivityArticleRequest(accessToken, "HARDWARE", editingArticleId, payload)
          : createActivityArticleRequest(accessToken, "HARDWARE", payload)
      );
      if (!isCurrentAction()) return;
      setArticles((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      setSuccessMessage(editingArticleId ? "Article modifié." : "Article créé.");
      resetArticleForm();
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingArticle(false);
    }
  }

  function handleStartEditArticle(article: ActivityArticle): void {
    if (!articleChanges.confirmDiscard()) return;
    articleChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingArticleId(article.id);
    setIsArticleManagementExpanded(true);
    scrollToFinanceSection("article-management");
    setArticleForm({
      name: article.name,
      defaultMargin: article.defaultMargin ? formatAmountForInput(article.defaultMargin) : "",
      defaultPurchaseUnitPrice: article.defaultPurchaseUnitPrice
        ? formatAmountForInput(article.defaultPurchaseUnitPrice)
        : ""
    });
  }

  function handleCancelEditArticle(): void {
    if (!articleChanges.confirmDiscard()) return;
    articleChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetArticleForm();
  }

  function handleDeleteArticle(article: ActivityArticle): void {
    setArticlePendingDelete(article);
  }

  async function handleConfirmDeleteArticle(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!articlePendingDelete) {
      return;
    }

    const article = articlePendingDelete;
    setBusyArticleId(article.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteActivityArticleRequest(accessToken, "HARDWARE", article.id)
      );
      if (!isCurrentAction()) return;
      if (editingArticleId === article.id) {
        resetArticleForm();
      }
      setSuccessMessage("Article supprimé.");
      setArticlePendingDelete(null);
      setArticles((prev) => prev.filter((item) => item.id !== article.id));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyArticleId(null);
    }
  }

  async function handleSaveTenant(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingTenant(true);

    try {
      const payload = {
        name: tenantForm.name.trim(),
        unitLabel: tenantForm.unitLabel.trim(),
        monthlyRent: normalizeAmountForApi(tenantForm.monthlyRent),
        phone: tenantForm.phone.trim() ? tenantForm.phone.trim() : undefined,
        tenancyStart: tenantForm.tenancyStart.trim() || undefined
      };

      const response = await withAuthorizedToken((accessToken) =>
        editingTenantId
          ? updateRentalTenantRequest(accessToken, editingTenantId, payload)
          : createRentalTenantRequest(accessToken, payload)
      );
      if (!isCurrentAction()) return;
      setTenants((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      setSuccessMessage(editingTenantId ? "Locataire modifié." : "Locataire ajouté.");
      resetTenantForm();
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingTenant(false);
    }
  }

  function handleStartEditTenant(tenant: RentalTenant): void {
    if (!tenantChanges.confirmDiscard()) return;
    tenantChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingTenantId(tenant.id);
    setIsTenantManagementExpanded(true);
    scrollToFinanceSection("tenant-management");
    setTenantForm({
      name: tenant.name,
      unitLabel: tenant.unitLabel,
      monthlyRent: formatAmountForInput(tenant.monthlyRent),
      phone: tenant.phone ?? "",
      tenancyStart: tenant.tenancyStart || currentMonthInputValue()
    });
  }

  function handleCancelEditTenant(): void {
    if (!tenantChanges.confirmDiscard()) return;
    tenantChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetTenantForm();
  }

  function handleDeleteTenant(tenant: RentalTenant): void {
    setTenantPendingDelete(tenant);
  }

  async function handleConfirmDeleteTenant(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!tenantPendingDelete) {
      return;
    }

    const tenant = tenantPendingDelete;
    setBusyTenantId(tenant.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteRentalTenantRequest(accessToken, tenant.id));
      if (!isCurrentAction()) return;
      if (editingTenantId === tenant.id) {
        resetTenantForm();
      }
      setSuccessMessage("Locataire supprimé.");
      setTenantPendingDelete(null);
      setTenants((prev) => prev.filter((item) => item.id !== tenant.id));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTenantId(null);
    }
  }

  async function handleSaveShop(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingShop(true);

    try {
      const payload = {
        name: shopForm.name.trim(),
        location: shopForm.location.trim() ? shopForm.location.trim() : undefined,
        phone: shopForm.phone.trim() ? shopForm.phone.trim() : undefined
      };

      const response = await withAuthorizedToken((accessToken) =>
        editingShopId
          ? updateGeneralStoreShopRequest(accessToken, editingShopId, payload)
          : createGeneralStoreShopRequest(accessToken, payload)
      );
      if (!isCurrentAction()) return;
      setShops((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      setSuccessMessage(editingShopId ? "Boutique modifiée." : "Boutique ajoutée.");
      resetShopForm();
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingShop(false);
    }
  }

  function handleStartEditShop(shop: GeneralStoreShop): void {
    if (!shopChanges.confirmDiscard()) return;
    shopChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingShopId(shop.id);
    setIsShopManagementExpanded(true);
    scrollToFinanceSection("shop-management");
    setShopForm({
      name: shop.name,
      location: shop.location ?? "",
      phone: shop.phone ?? ""
    });
  }

  function handleCancelEditShop(): void {
    if (!shopChanges.confirmDiscard()) return;
    shopChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetShopForm();
  }

  function handleDeleteShop(shop: GeneralStoreShop): void {
    setShopPendingDelete(shop);
  }

  async function handleConfirmDeleteShop(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!shopPendingDelete) {
      return;
    }

    const shop = shopPendingDelete;
    setBusyShopId(shop.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteGeneralStoreShopRequest(accessToken, shop.id));
      if (!isCurrentAction()) return;
      if (editingShopId === shop.id) {
        resetShopForm();
      }
      setSuccessMessage("Boutique supprimée.");
      setShopPendingDelete(null);
      setShops((prev) => prev.filter((item) => item.id !== shop.id));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyShopId(null);
    }
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingProject(true);

    try {
      const payload = {
        name: projectForm.name.trim(),
        clientRef: projectForm.clientRef.trim() ? projectForm.clientRef.trim() : undefined,
        contractRef: projectForm.contractRef.trim() ? projectForm.contractRef.trim() : undefined,
        location: projectForm.location.trim() ? projectForm.location.trim() : undefined
      };

      const response = await withAuthorizedToken((accessToken) =>
        editingProjectId
          ? updateBtpProjectRequest(accessToken, editingProjectId, payload)
          : createBtpProjectRequest(accessToken, payload)
      );
      if (!isCurrentAction()) return;
      setProjects((prev) => {
        const exists = prev.some((item) => item.id === response.item.id);
        return exists
          ? prev.map((item) => (item.id === response.item.id ? response.item : item))
          : [response.item, ...prev];
      });
      setSuccessMessage(editingProjectId ? "Chantier modifié." : "Chantier ajouté.");
      resetProjectForm();
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setIsSavingProject(false);
    }
  }

  function handleStartEditProject(project: BtpProject): void {
    if (!projectChanges.confirmDiscard()) return;
    projectChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingProjectId(project.id);
    setIsProjectManagementExpanded(true);
    scrollToFinanceSection("project-management");
    setProjectForm({
      name: project.name,
      clientRef: project.clientRef ?? "",
      contractRef: project.contractRef ?? "",
      location: project.location ?? ""
    });
  }

  function handleCancelEditProject(): void {
    if (!projectChanges.confirmDiscard()) return;
    projectChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetProjectForm();
  }

  function handleDeleteProject(project: BtpProject): void {
    setProjectPendingDelete(project);
  }

  async function handleConfirmDeleteProject(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!projectPendingDelete) {
      return;
    }

    const project = projectPendingDelete;
    setBusyProjectId(project.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteBtpProjectRequest(accessToken, project.id));
      if (!isCurrentAction()) return;
      if (editingProjectId === project.id) {
        resetProjectForm();
      }
      setSuccessMessage("Chantier supprimé.");
      setProjectPendingDelete(null);
      setProjects((prev) => prev.filter((item) => item.id !== project.id));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyProjectId(null);
    }
  }

  async function handleSaveTransaction(event: FormEvent<HTMLFormElement>): Promise<void> {
    const isCurrentAction = captureActionScope();
    event.preventDefault();
    if (!selectedActivityCode || isSavingTransaction) {
      return;
    }
    if (selectedActivityCode === "BEVERAGE_DEPOT" && !isLegacyBeverageEdit && !isArchivedBeverageEdit && (beverageOperationKind === "VENTE" || beverageOperationKind === "ACHAT_STOCK")) {
      if (beverageStock.loading || beverageStock.error || !selectedBeverageProduct) {
        setErrorMessage("Choisissez un produit dans le stock disponible. Ajoutez d'abord le produit si nécessaire.");
        return;
      }
      const editedSale = [...transactions, ...(linkedTransaction ? [linkedTransaction] : [])].find((item) => item.id === editingTransactionId && item.metadata.beverageProductId === selectedBeverageProduct.id && item.metadata.beverageOperationKind === "VENTE" && item.status !== "REJECTED");
      const available = Number(selectedBeverageProduct.quantity) + (editedSale ? toAmountNumber(editedSale.metadata.quantity ?? "0") : 0);
      if (beverageOperationKind === "VENTE" && toAmountNumber(transactionForm.metadata.quantity ?? "0") > available) {
        setErrorMessage(`Stock insuffisant pour ${selectedBeverageProduct.name}. Disponible : ${available} ${selectedBeverageProduct.unit}.`);
        void beverageStock.refresh();
        return;
      }
    }
    if (editingTransactionId && editingTransactionActivityRef.current !== selectedActivityCode) {
      setErrorMessage("Cette transaction appartient à un autre secteur. Rouvrez-la depuis son secteur.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const continueSale = selectedActivityCode === "BEVERAGE_DEPOT" && beverageOperationKind === "VENTE" &&
      !editingTransactionId && submitter instanceof HTMLButtonElement && submitter.value === "continue-sale";
    const proofFileToUpload = transactionProofFile;
    const transactionSavedLabel = editingTransactionId
      ? "Transaction modifiée"
      : "Transaction enregistrée";
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingTransaction(true);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const cleanedMetadata = cleanSectorFinanceMetadata(
          selectedActivityCode,
          transactionForm.type,
          transactionForm.metadata
        );
        const metadata = Object.fromEntries(
          Object.entries(cleanedMetadata).map(([key, value]) => [
            key,
            isMoneyMetadataField(key) && value ? normalizeAmountForApi(value) : value
          ])
        );
        const payload = {
          accountId: transactionForm.accountId,
          type: transactionForm.type,
          amount: normalizeAmountForApi(transactionForm.amount),
          currency: transactionForm.currency.trim().toUpperCase(),
          activityCode: selectedActivityCode as BusinessActivityCode,
          description: transactionForm.description.trim() || undefined,
          metadata,
          occurredAt: transactionForm.occurredAt
            ? new Date(transactionForm.occurredAt).toISOString()
            : undefined
        };

        return editingTransactionId
          ? updateFinanceTransactionRequest(accessToken, editingTransactionId, payload)
          : createFinanceTransactionRequest(accessToken, payload);
      });
      if (!isCurrentAction()) return;
      transactionsLoadRequestRef.current += 1;
      sectorSuggestionLoadRequestRef.current += 1;
      setIsLoadingMoreTransactions(false);
      const transactionMatchesCurrentList =
        response.item.activityCode === selectedActivityCode &&
        (filters.type === "ALL" || response.item.type === filters.type);
      setTransactions((prev) => {
        const next = prev.filter((item) => item.id !== response.item.id);
        return transactionMatchesCurrentList
          ? [response.item, ...next].sort(
              (left, right) =>
                right.occurredAt.localeCompare(left.occurredAt) ||
                right.createdAt.localeCompare(left.createdAt)
            )
          : next;
      });
      setLinkedTransaction((prev) => prev?.id === response.item.id ? response.item : prev);
      if (needsTransactionSuggestionHistory(selectedActivityCode)) {
        setSectorSuggestionHistory((prev) => [
          response.item,
          ...prev.filter((item) => item.id !== response.item.id)
        ]);
      }
      if (continueSale) {
        nextSaleFocusScope.current = actionScopeKey;
      } else {
        handleOpenTransactionDetails(response.item.id, response.item.activityCode);
        if (window.matchMedia("(max-width: 640px)").matches) setIsTransactionFormExpanded(false);
      }
      setSuccessMessage(
        proofFileToUpload
          ? `${transactionSavedLabel}. Envoi de la preuve en cours…`
          : editingTransactionId
            ? "Transaction modifiée."
            : continueSale ? "Vente enregistrée. Choisissez le produit suivant." : "Transaction enregistrée."
      );
      resetTransactionForm();
      void loadAccounts();
      if (selectedActivityCode === "BEVERAGE_DEPOT") void beverageStock.refresh();
      if (proofFileToUpload) {
        void uploadTransactionProof(response.item.id, proofFileToUpload)
          .then((proofItems) => {
            if (!isCurrentAction()) return;
            setProofsByTransaction((prev) => ({
              ...prev,
              [response.item.id]: proofItems
            }));
            setOpenProofs((prev) => ({
              ...prev,
              [response.item.id]: true
            }));
            setSuccessMessage(`${transactionSavedLabel} et preuve ajoutée.`);
          })
          .catch((error) => {
            if (!isCurrentAction()) return;
            setErrorMessage(
              `${transactionSavedLabel}, mais la preuve n'a pas pu être ajoutée. ${toErrorMessage(error)}`
            );
            setSuccessMessage(`${transactionSavedLabel}. Vous pouvez réessayer depuis le détail.`);
          });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
      if (selectedActivityCode === "BEVERAGE_DEPOT" && error instanceof ApiError && error.statusCode === 409) void beverageStock.refresh();
    } finally {
      if (isCurrentAction()) setIsSavingTransaction(false);
    }
  }

  function handleStartEditTransaction(transaction: FinancialTransaction): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!canMutateTransaction(transaction)) {
      setErrorMessage("Vous pouvez modifier uniquement les transactions que vous avez créées.");
      return;
    }

    if (!transactionChanges.confirmDiscard()) return;
    setTransactionProofFile(null);
    setEditingTransactionId(transaction.id);
    editingTransactionActivityRef.current = transaction.activityCode;
    transactionChanges.markClean();
    setIsTransactionFormExpanded(true);
    scrollToFinanceSection("transaction-create");
    const metadata = syncMetadataState(transaction.metadata, financeMetadataFields);
    if (transaction.activityCode === "TRANSPORT" && !metadata.transportCategory) {
      const categoryOptions = financeMetadataFields.find((field) => field.key === "transportCategory")?.options ?? [];
      const legacyAssetType = transaction.metadata.assetType?.trim() ?? "";
      const inferredCategory = categoryOptions.includes(legacyAssetType) ? legacyAssetType : "Autre";
      metadata.transportCategory = inferredCategory === "Camion benne" &&
        (!metadata[DUMP_TRUCK_OPERATION_KEY] || !metadata.vehicleRef)
        ? "Autre"
        : inferredCategory;
    }
    setTransactionForm({
      accountId: transaction.accountId,
      type: transaction.type,
      amount: formatAmountForInput(transaction.amount),
      currency: transaction.currency,
      description: transaction.description ?? "",
      metadata,
      occurredAt: toDateTimeLocalInput(transaction.occurredAt)
    });
  }

  function handleCancelEditTransaction(): void {
    if (!transactionChanges.confirmDiscard()) return;
    transactionChanges.markClean();
    setErrorMessage(null);
    setSuccessMessage(null);
    resetTransactionForm();
  }

  function applyGeneralExpenseSuggestion(suggestion: FinancialTransaction): void {
    transactionChanges.onChangeCapture();
    const kind = getGeneralExpenseKind(suggestion.metadata);
    setTransactionForm((prev) => {
      const metadata = cleanSectorFinanceMetadata("GENERAL_EXPENSES", "CASH_OUT", {
        ...prev.metadata,
        [GENERAL_EXPENSE_KIND_KEY]: kind,
        quantity: suggestion.metadata.quantity ?? "",
        unitPrice: suggestion.metadata.unitPrice ?? ""
      });
      return {
        ...prev,
        accountId: accounts.some((account) => account.id === suggestion.accountId)
          ? suggestion.accountId
          : prev.accountId,
        type: "CASH_OUT",
        amount: formatAmountForInput(deriveGeneralExpensesAmount(metadata) ?? suggestion.amount),
        currency: suggestion.currency,
        description: suggestion.description ?? "",
        metadata
      };
    });
  }

  function applySectorTransactionSuggestion(suggestion: FinancialTransaction): void {
    transactionChanges.onChangeCapture();
    if (!isQuickFillSectorActivity(selectedActivityCode)) {
      return;
    }
    const activityCode = selectedActivityCode;
    setTransactionForm((prev) => {
      const metadata = cleanSectorFinanceMetadata(activityCode, suggestion.type, {
        ...suggestion.metadata
      });
      const derivedAmount = deriveSectorAmount(activityCode, suggestion.type, metadata);
      return {
        ...prev,
        accountId: accounts.some((account) => account.id === suggestion.accountId)
          ? suggestion.accountId
          : prev.accountId,
        type: suggestion.type,
        amount: formatAmountForInput(derivedAmount ?? suggestion.amount),
        currency: suggestion.currency,
        description: suggestion.description ?? "",
        metadata
      };
    });
  }

  async function handleDeleteTransaction(transaction: FinancialTransaction): Promise<void> {
    if (!canMutateTransaction(transaction)) {
      setErrorMessage("Vous pouvez supprimer uniquement les transactions que vous avez créées.");
      return;
    }
    setTransactionPendingDelete(transaction);
  }

  async function handleConfirmDeleteTransaction(): Promise<void> {
    const isCurrentAction = captureActionScope();
    if (!transactionPendingDelete) {
      return;
    }

    const transaction = transactionPendingDelete;
    setBusyTransactionId(transaction.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteFinanceTransactionRequest(accessToken, transaction.id)
      );
      if (!isCurrentAction()) return;
      sectorSuggestionLoadRequestRef.current += 1;
      if (selectedTransactionId === transaction.id) {
        handleCloseTransactionDetails();
      }
      if (editingTransactionId === transaction.id) {
        resetTransactionForm();
      }
      setSuccessMessage("Transaction supprimée.");
      setTransactionPendingDelete(null);
      if (transaction.activityCode === "BEVERAGE_DEPOT") void beverageStock.refresh();
      setTransactions((prev) => prev.filter((item) => item.id !== transaction.id));
      setLinkedTransaction((prev) => prev?.id === transaction.id ? null : prev);
      setSectorSuggestionHistory((prev) => prev.filter((item) => item.id !== transaction.id));
      setProofsByTransaction((prev) => {
        const next = { ...prev };
        delete next[transaction.id];
        return next;
      });
      setOpenProofs((prev) => {
        const next = { ...prev };
        delete next[transaction.id];
        return next;
      });
      void loadAccounts();
      if (hasMoreTransactions) {
        void loadData({ offset: Math.max(0, transactions.length - 1), append: true });
      }
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTransactionId(null);
    }
  }

  async function uploadTransactionProof(
    transactionId: string,
    selectedFile: File
  ): Promise<TransactionProof[]> {
    const proofResponse = await withAuthorizedToken(async (accessToken) => {
      const authResp = await getFinanceProofUploadAuthRequest(accessToken, transactionId);
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

      return addFinanceTransactionProofRequest(accessToken, transactionId, {
        storageKey: resolveImageKitStorageKey(uploaded, selectedFile.name),
        fileName: resolveImageKitFileName(uploaded, selectedFile.name),
        mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
        fileSize: resolveImageKitFileSize(uploaded, selectedFile.size)
      });
    });

    return proofResponse.items;
  }

  async function handleAddProof(transactionId: string): Promise<void> {
    const isCurrentAction = captureActionScope();
    const selectedFile = proofFiles[transactionId];
    if (!selectedFile) {
      setErrorMessage("Sélectionne un fichier de preuve.");
      return;
    }

    setBusyTransactionId(transactionId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const proofResponse = await withAuthorizedToken(async (accessToken) => {
        const authResp = await getFinanceProofUploadAuthRequest(accessToken, transactionId);
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

        return addFinanceTransactionProofRequest(accessToken, transactionId, {
          storageKey: resolveImageKitStorageKey(uploaded, selectedFile.name),
          fileName: resolveImageKitFileName(uploaded, selectedFile.name),
          mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
          fileSize: resolveImageKitFileSize(uploaded, selectedFile.size)
        });
      });
      if (!isCurrentAction()) return;

      setSuccessMessage("Preuve ajoutée.");
      setProofFiles((prev) => ({ ...prev, [transactionId]: null }));
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: proofResponse.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setBusyTransactionId(null);
    }
  }

  async function handleToggleProofs(transactionId: string): Promise<void> {
    const isCurrentAction = captureActionScope();
    const isOpen = openProofs[transactionId] === true;
    if (isOpen) {
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: false
      }));
      return;
    }

    const alreadyLoaded = Array.isArray(proofsByTransaction[transactionId]);
    if (alreadyLoaded) {
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
      return;
    }

    setLoadingProofsByTransaction((prev) => ({
      ...prev,
      [transactionId]: true
    }));
    setErrorMessage(null);
    try {
      const response = await withAuthorizedToken((accessToken) =>
        listFinanceTransactionProofsRequest(accessToken, transactionId)
      );
      if (!isCurrentAction()) return;
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: response.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
    } catch (error) {
      if (!isCurrentAction()) return;
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (isCurrentAction()) setLoadingProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: false
      }));
    }
  }

  function openReferenceForm(): void {
    if (!activeReferenceView) return;
    if (activeReferenceView.view === "articles") {
      if (isSavingArticle || !articleChanges.confirmDiscard()) return;
      resetArticleForm();
      setIsArticleManagementExpanded(true);
    } else if (activeReferenceView.view === "tenants") {
      if (isSavingTenant || !tenantChanges.confirmDiscard()) return;
      resetTenantForm();
      setIsTenantManagementExpanded(true);
    } else if (activeReferenceView.view === "shops") {
      if (isSavingShop || !shopChanges.confirmDiscard()) return;
      resetShopForm();
      setIsShopManagementExpanded(true);
    } else {
      if (isSavingProject || !projectChanges.confirmDiscard()) return;
      resetProjectForm();
      setIsProjectManagementExpanded(true);
    }
    scrollToFinanceSection(activeReferenceView.sectionId);
  }

  useEffect(() => {
    if (isLoadingActivities || !referenceView || location.hash !== `#${referenceView.sectionId}`) return;
    if (!activeReferenceView) {
      const next = new URLSearchParams(location.search);
      next.set("view", referenceView.view);
      next.delete("transactionId");
      navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
      return;
    }
    if (activeReferenceView.view === "articles") setIsArticleManagementExpanded(true);
    else if (activeReferenceView.view === "tenants") setIsTenantManagementExpanded(true);
    else if (activeReferenceView.view === "shops") setIsShopManagementExpanded(true);
    else setIsProjectManagementExpanded(true);
    scrollToFinanceSection(activeReferenceView.sectionId);
    navigate({ pathname: location.pathname, search: location.search, hash: "" }, { replace: true });
  }, [activeReferenceView, isLoadingActivities, location.hash, location.pathname, location.search, navigate, referenceView, setSearchParams]);

  function openSectorTransaction(preset: SectorTransactionPreset): boolean {
    if (!selectedActivityCode || !canManageTransactions || isSavingTransaction ||
      !transactionWorkspace?.presets.some((candidate) => candidate.id === preset.id) ||
      !selectedProfile?.finance.allowedTransactionTypes.includes(preset.type)) return false;
    if (!transactionChanges.confirmDiscard()) return false;
    resetTransactionForm();
    setShowGeneralExpenseCalculator(false);
    setTransactionForm((previous) => ({
      ...previous,
      type: preset.type,
      metadata: cleanSectorFinanceMetadata(selectedActivityCode, preset.type, {
        ...syncMetadataState({}, financeMetadataFields), ...preset.metadata
      })
    }));
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsTransactionFormExpanded(true);
    scrollToFinanceSection("transaction-create");
    return true;
  }

  function renderTransactionProof(): JSX.Element {
    return (
<details
            className="finance-transaction-form-options finance-proof-callout"
            open={Boolean(transactionProofFile)}
          >
            <summary>
              {transactionProofFile ? `Justificatif · ${transactionProofFile.name}` : "Justificatif (optionnel)"}
            </summary>
            <div className="finance-transaction-form-options-body">
              <div className="finance-proof-callout-copy">
                <p className="hint">
                  Le fichier sera envoyé automatiquement après l'enregistrement de la transaction.
                  Formats acceptés: PDF, JPG ou PNG.
                </p>
              </div>
              <label className="finance-proof-upload" htmlFor="transaction-proof-file">
                <span>Fichier de preuve</span>
                <input
                  key={`${transactionProofFile?.name ?? "empty"}-${transactionProofFile?.size ?? 0}`}
                  id="transaction-proof-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                  onChange={(event) => setTransactionProofFile(event.target.files?.[0] ?? null)}
                  disabled={isSavingTransaction}
                />
              </label>
              {transactionProofFile ? (
                <div className="finance-proof-selected">
                  <strong>{transactionProofFile.name}</strong>
                  <span>{formatFileSize(transactionProofFile.size)}</span>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setTransactionProofFile(null)}
                    disabled={isSavingTransaction}
                  >
                    Retirer
                  </button>
                </div>
              ) : null}
            </div>
          </details>
    );
  }

  function renderTransactionsList(): JSX.Element {
    return (
<section id="transactions-list" className="panel finance-page-panel">
        <h3>{transactionWorkspace?.listTitle ?? "Transactions"}</h3>
        {!isLoading && sectorTransactions.length === 0 ? (
          <EmptyState
            title={errorMessage ? "Liste indisponible" : searchQuery.trim() ? "Aucun résultat" : "Aucune transaction dans cette vue"}
            description={errorMessage ? "Le chargement a échoué. Actualisez la liste pour réessayer." : searchQuery.trim() ? "Aucune transaction ne correspond à la recherche et aux filtres sélectionnés. Effacez la recherche ou modifiez les filtres." : "Enregistrez une première entrée ou sortie, ou changez les filtres pour retrouver les transactions existantes."}
            actionLabel={canManageTransactions ? "Préparer une transaction" : undefined}
            onAction={canManageTransactions ? () => {
              setIsTransactionFormExpanded(true);
              window.requestAnimationFrame(() => {
                document.getElementById("transaction-create")?.scrollIntoView({
                  block: "start",
                  behavior: "smooth"
                });
              });
            } : undefined}
          />
        ) : null}
        {!isLoading && sectorTransactions.length > 0 && displayTransactions.length === 0 ? (
          <EmptyState
            title="Aucun résultat"
            description="Aucune transaction ne correspond à la recherche ou aux filtres appliqués."
            actionLabel="Réinitialiser les filtres"
            onAction={() => {
              setSearchQuery("");
              setFilters({
                type: "ALL"
              });
            }}
          />
        ) : null}
        {!isLoading && displayTransactions.length > 0 ? (
          <>
          {renderVisibleTransactionsPagination()}
          <div
            className="table-wrap finance-transactions-table-wrap mobile-card-table"
            role="region"
            aria-label="Liste des transactions"
            tabIndex={0}
          >
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Compte</th>
                  <th>Montant</th>
                  <th>Justificatifs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map((tx) => {
                  const isBusy = busyTransactionId === tx.id;
                  const sectorContext = getSectorRecordContext(tx.activityCode, tx.metadata);
                  const operationLabel = getSectorTransactionLabel(tx);
                  const isProofsOpen = openProofs[tx.id] === true;
                  const proofs = proofsByTransaction[tx.id] ?? [];
                  const isProofsLoading = loadingProofsByTransaction[tx.id] === true;
                  const canEditTransaction = canMutateTransaction(tx);
                  const canDeleteTransaction = canMutateTransaction(tx);

                  return (
                    <tr
                      key={tx.id}
                      className={`finance-transaction-row ${
                        tx.type === "CASH_IN" ? "is-cash-in" : "is-cash-out"
                      }`}
                    >
                      <td data-label="Date">
                        {new Date(tx.occurredAt).toLocaleString("fr-FR")}
                        <span className={`finance-transaction-mobile-status is-${tx.status.toLowerCase()}`}>
                          {financeStatusLabel(tx.status)}
                        </span>
                      </td>
                      <td data-label="Compte">
                        <strong>{tx.accountName}</strong>
                        <div className="hint">
                          {tx.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {tx.activityCode
                            ? getBusinessActivityLabel(tx.activityCode)
                            : "Charge transversale entreprise"}
                        </div>
                        {operationLabel ? <div className="finance-transaction-description">{operationLabel}</div> : null}
                        {tx.description?.trim() ? (
                          <div className="finance-transaction-description">{tx.description}</div>
                        ) : null}
                        {sectorContext.length > 0 ? (
                          <div className="sector-record-context">
                            {sectorContext.map(({ label, value }) => (
                              <span key={label}><strong>{label} :</strong> {value}</span>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td data-label="Montant" className="finance-transaction-amount-cell">
                        {formatAmountForDisplay(tx.amount)} {tx.currency}
                      </td>
                      <td data-label="Justificatifs" className="finance-transaction-proof-cell">
                        <div>
                          {tx.proofsCount} preuve{tx.proofsCount > 1 ? "s" : ""}
                        </div>
                        <p
                          className={`hint finance-transaction-proof-requirement ${
                            tx.requiresProof ? "is-required" : "is-optional"
                          }`}
                        >
                          {tx.requiresProof ? "Justificatif requis" : "Justificatif libre"}
                        </p>
                      </td>
                      <td data-label="Actions" className="finance-transaction-actions-cell">
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => handleOpenTransactionDetails(tx.id, tx.activityCode)}
                          >
                            Voir le détail
                          </button>
                          {canEditTransaction ? (
                            <button
                              type="button"
                              className="secondary-btn mobile-hide-secondary-transaction-action"
                              onClick={() => handleStartEditTransaction(tx)}
                              disabled={isBusy}
                            >
                              Modifier
                            </button>
                          ) : null}
                          {canDeleteTransaction ? (
                            <button
                              type="button"
                              className="danger-btn mobile-hide-secondary-transaction-action"
                              onClick={() => void handleDeleteTransaction(tx)}
                              disabled={isBusy}
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </div>
                        <details className="table-inline-details">
                          <summary className="table-inline-summary">Contexte et justificatifs</summary>
                          <div className="table-inline-content">
                            <p className="hint">
                              <strong>Portée du compte:</strong>{" "}
                              {formatAccountScopeLabel({
                                scopeType: tx.accountScopeType,
                                primaryActivityCode: tx.accountPrimaryActivityCode,
                                allowedActivityCodes: tx.accountAllowedActivityCodes
                              })}
                            </p>
                            {tx.description?.trim() ? (
                              <p className="hint">
                                <strong>Description:</strong> {tx.description}
                              </p>
                            ) : null}
                            <p className="hint">
                              <strong>Contexte:</strong>{" "}
                              {formatMetadataSummary(tx.metadata, financeMetadataFields)}
                            </p>
                            {getTransactionGovernanceLines(tx).map((line) => (
                              <p key={`${tx.id}-${line}`} className="hint">
                                {line}
                              </p>
                            ))}
                            <div className="table-inline-meta">
                              {tx.proofsCount > 0 ? (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => void handleToggleProofs(tx.id)}
                                  disabled={isProofsLoading}
                                >
                                  {isProofsOpen ? "Masquer les preuves" : "Voir les preuves"}
                                </button>
                              ) : (
                                <p className="hint proof-none">Aucune preuve disponible</p>
                              )}
                            </div>
                            {isProofsOpen ? (
                              <div className="proof-list">
                                {isProofsLoading ? <p>Chargement des preuves...</p> : null}
                                {!isProofsLoading && proofs.length === 0 ? (
                                  <p>Aucune preuve ajoutee.</p>
                                ) : null}
                                {!isProofsLoading && proofs.length > 0 ? (
                                  <ul>
                                    {proofs.map((proof) => (
                                      <li key={proof.id}>
                                        {proof.publicUrl ? (
                                          <a href={proof.publicUrl} target="_blank" rel="noreferrer">
                                            {proof.fileName}
                                          </a>
                                        ) : (
                                          <span>{proof.fileName} (lien indisponible)</span>
                                        )}
                                        <small>
                                          {formatFileSize(proof.fileSize)} |{" "}
                                          {new Date(proof.uploadedAt).toLocaleString("fr-FR")}
                                        </small>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}

                            {canMutateTransaction(tx) ? <div className="proof-inline-form">
                              <input
                                type="file"
                                aria-label={`Preuve pour la transaction ${tx.accountName}`}
                                accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                                onChange={(event) =>
                                  setProofFiles((prev) => ({
                                    ...prev,
                                    [tx.id]: event.target.files?.[0] ?? null
                                  }))
                                }
                                disabled={isBusy}
                              />
                              <button
                                type="button"
                                className="secondary-btn"
                                onClick={() => void handleAddProof(tx.id)}
                                disabled={isBusy}
                              >
                                Ajouter une preuve
                              </button>
                            </div> : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMoreTransactions ? (
            <div className="list-pagination">
              <p className="hint list-pagination-meta">
                {displayTransactions.length} transaction(s) filtrée(s)
                {displayTransactions.length !== transactions.length
                  ? ` sur ${transactions.length} chargee(s)`
                  : ""}
                {" sur plusieurs pages."}
              </p>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleLoadMoreTransactions()}
                disabled={isLoading || isLoadingMoreTransactions || searchQuery.trim() !== debouncedSearch}
              >
                {isLoadingMoreTransactions ? "Chargement..." : "Charger plus"}
              </button>
            </div>
          ) : null}
          {renderVisibleTransactionsPagination("bottom")}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <>
      <header
        className={`${isReadOnlyOwner ? "section-header owner-lite-header" : "section-header"} mobile-title-duplicate`}
      >
        <h2>{activeReferenceView ? `${activeReferenceView.label} · ${selectedActivity?.label ?? "Secteur actif"}` : "Transactions financières"}</h2>
        <p>{activeReferenceView ? "Consultez les fiches du secteur et ouvrez une saisie à la demande." : "Suivi financier opérationnel."}</p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activité dans
          l'administration.
        </p>
      ) : null}

      <SectorWorkspaceNav actions={activeReferenceView ? [{ label: activeReferenceView.createLabel, onClick: openReferenceForm }] : [
        { label: "Voir les transactions", onClick: () => scrollToFinanceSection("transactions-list") },
        ...(canManageTransactions && !transactionWorkspace ? [{
          label: "Enregistrer une transaction",
          onClick: () => {
            setIsTransactionFormExpanded(true);
            scrollToFinanceSection("transaction-create");
          }
        }] : []),
        ...(referenceView ? [{
          label: `Gérer les ${referenceView.label.toLocaleLowerCase("fr")}`,
          onClick: () => navigate(`/finance/transactions?activityCode=${selectedActivityCode}&view=${referenceView.view}`)
        }] : []),
        ...(selectedActivityCode === "GENERAL_STORE" && user && !isReadOnlyOwner && canAccessFeature(user.role, "operationsTasks") ? [{
          label: "Préparer un inventaire",
          onClick: () => navigate("/operations/tasks?activityCode=GENERAL_STORE#task-create")
        }] : [])
      ]} />

      {selectedActivityCode === "BEVERAGE_DEPOT" ? <BeverageStockPanel key={activeCompany?.id} {...beverageStock}
        canManage={Boolean(user && ["SYS_ADMIN", "ACCOUNTANT", "BEVERAGE_DEPOT_OPERATOR"].includes(user.role))}
        canCount={Boolean(user && ["SYS_ADMIN", "ACCOUNTANT"].includes(user.role))}
        onOperation={(product, kind) => {
          const preset = transactionWorkspace?.presets.find((item) => item.metadata?.beverageOperationKind === kind);
          if (!preset || !openSectorTransaction(preset)) return;
          setTransactionForm((previous) => ({ ...previous, metadata: { ...previous.metadata, beverageProductId: product.id,
            productName: product.name, beverageUnit: product.unit, purchaseUnitPrice: kind === "VENTE" ? product.averageUnitCost : "" } }));
        }} /> : null}
      {!activeReferenceView && transactionWorkspace && canManageTransactions ? (
        <SectorTransactionActions workspace={transactionWorkspace} onSelect={openSectorTransaction} disabled={isLoadingActivities || isSavingTransaction} />
      ) : null}

      {!activeReferenceView ? (<>
      {transactionWorkspace ? renderTransactionsList() : null}
      {transactionWorkspace ? <SectorTransactionSummary transactions={displayTransactions} /> : (<>
      <p className="hint">Indicateurs calculés sur les transactions chargées après recherche et filtres. Consultez les rapports pour les totaux de la période complète.</p>
      <section className={isReadOnlyOwner ? "grid finance-summary-grid owner-lite-metrics" : "grid finance-summary-grid"}>
        {financePageCards.map((card) => (
          <article key={card.title} className="metric-card finance-overview-card">
            <h2>{card.title}</h2>
            <p className="metric-value">{card.value}</p>
            <p className="metric-note">{card.note}</p>
          </article>
        ))}
      </section>

      </>)}

      {dumpTruckSummaryCards.length > 0 ? (
        <section className="panel finance-page-panel" aria-label="Synthèse des camions bennes">
          <div>
            <h2>Camion benne</h2>
            <p className="hint">
              Synthèse complète des opérations soumises ou approuvées pour la période sélectionnée.
            </p>
            <label className="operations-inline-group">
              <span>Période</span>
              <input
                type="month"
                value={dumpTruckSummaryPeriod}
                onChange={(event) => setDumpTruckSummaryPeriod(event.target.value)}
              />
            </label>
          </div>
          {isLoadingDumpTruckSummary ? <p className="hint">Chargement de la synthèse…</p> : null}
          {dumpTruckSummaryError ? <p className="error-box">{dumpTruckSummaryError}</p> : null}
          <div className="grid finance-summary-grid">
            {dumpTruckSummaryCards.map((card) => (
              <article key={card.title} className="metric-card finance-overview-card">
                <h3>{card.title}</h3>
                <p className="metric-value">{card.value}</p>
                <p className="metric-note">{card.note}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {canCreateAccount ? (
        <section className="panel finance-page-panel">
          <details
            id="account-create"
            className="finance-section-toggle"
            open={isAccountFormExpanded || Boolean(editingAccountId)}
            onToggle={(event) => setIsAccountFormExpanded(event.currentTarget.open)}
          >
            <summary className="finance-section-summary">
              <span>{editingAccountId ? "Modifier un compte financier" : "Créer un compte financier"}</span>
              <small>
                {editingAccountId
                  ? "Modification d'un compte."
                  : "Nouveau compte financier."}
              </small>
            </summary>
            <form className="finance-account-form" onSubmit={handleSaveAccount} onChangeCapture={accountChanges.onChangeCapture} data-unsaved-sector-form={accountChanges.isDirty ? "true" : undefined}>
            <label className="operations-inline-group">
              <span>Nom du compte</span>
              <input
                type="text"
                placeholder="Ex: Caisse principale"
                value={accountForm.name}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    name: event.target.value
                  }))
                }
                required
              />
            </label>
            <label className="operations-inline-group">
              <span>Référence</span>
              <input
                type="text"
                placeholder="Optionnel"
                value={accountForm.accountRef}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    accountRef: event.target.value
                  }))
                }
              />
            </label>
            <label className="operations-inline-group">
              <span>Solde initial</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ex: 100000"
                value={accountForm.openingBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    openingBalance: formatEditableAmountForInput(event.target.value)
                  }))
                }
                onBlur={() =>
                  setAccountForm((prev) => ({
                    ...prev,
                    openingBalance: formatAmountForInput(prev.openingBalance)
                  }))
                }
                required
              />
            </label>
            {canCreateAccount ? (
              <label className="operations-inline-group">
                <span>Portée du compte</span>
                <select
                  value={accountForm.scopeType}
                  onChange={(event) => {
                    const scopeType = event.target.value as FinancialAccountScopeType;
                    setAccountForm((prev) => ({
                      ...prev,
                      scopeType,
                      primaryActivityCode:
                        scopeType === "DEDICATED"
                          ? (selectedActivityCode ?? prev.primaryActivityCode)
                          : prev.primaryActivityCode,
                      allowedActivityCodes:
                        scopeType === "RESTRICTED" && selectedActivityCode
                          ? [selectedActivityCode]
                          : prev.allowedActivityCodes
                    }));
                  }}
                >
                  <option value="GLOBAL">Entreprise entière</option>
                  <option value="DEDICATED">Un seul secteur</option>
                  <option value="RESTRICTED">Secteurs sélectionnés</option>
                </select>
              </label>
            ) : null}
            {accountForm.scopeType === "DEDICATED" ? (
              <p className="hint">
                Un compte dédié à un seul secteur sera visible par l’opérateur de ce secteur.
              </p>
            ) : null}
            {false ? (
              <p className="hint">
                Les comptes globaux entreprise sont réservés au propriétaire et à l'admin système.
              </p>
            ) : null}
            {accountForm.scopeType === "DEDICATED" ? (
              <label className="operations-inline-group">
                <span>Secteur dédié</span>
                <select
                  value={accountForm.primaryActivityCode}
                  onChange={(event) =>
                    setAccountForm((prev) => ({
                      ...prev,
                      primaryActivityCode: event.target.value as BusinessActivityCode
                    }))
                  }
                  required
                >
                  <option value="" disabled>
                    Sélectionner le secteur dédié
                  </option>
                  {financeEnabledActivities.map((activity) => (
                    <option key={activity.code} value={activity.code}>
                      {activity.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {accountForm.scopeType === "RESTRICTED" ? (
              <div className="metadata-field-list">
                {financeEnabledActivities.map((activity) => {
                  const checked = accountForm.allowedActivityCodes.includes(activity.code);
                  return (
                    <label key={activity.code} className="inline-checkbox">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setAccountForm((prev) => ({
                            ...prev,
                            allowedActivityCodes: event.target.checked
                              ? [...prev.allowedActivityCodes, activity.code].filter(
                                  (value, index, array) => array.indexOf(value) === index
                                )
                              : prev.allowedActivityCodes.filter((value) => value !== activity.code)
                          }))
                        }
                      />
                      <span>{activity.label}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
            <div className="mobile-sticky-form-actions">
              <button type="submit" disabled={isSavingAccount}>
                {isSavingAccount ? (
                  <>
                    <ButtonSpinner />
                    Enregistrement...
                  </>
                ) : editingAccountId ? (
                  "Enregistrer les modifications"
                ) : (
                  "Créer le compte"
                )}
              </button>
              {editingAccountId ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCancelEditAccount}
                  disabled={isSavingAccount}
                >
                  Annuler la modification
                </button>
              ) : null}
            </div>
            </form>
          </details>
        </section>
      ) : null}

      </>) : null}

      {isHardwareArticlesView ? (
        <>
          <FeedbackBanner errorMessage={errorMessage} successMessage={successMessage} />
          <DeferredViewBoundary key={formScope} hasUnsavedChanges={articleChanges.isDirty}><Suspense fallback={<p role="status">Chargement des articles…</p>}><HardwareArticlesPanel
            articles={articles} articleForm={articleForm} setArticleForm={setArticleForm}
            editingArticleId={editingArticleId} busyArticleId={busyArticleId}
            isSavingArticle={isSavingArticle} articleChanges={articleChanges}
            isArticleManagementExpanded={isArticleManagementExpanded}
            setIsArticleManagementExpanded={setIsArticleManagementExpanded}
            isLoadingArticles={isLoadingArticles} hasLoadedArticles={hasLoadedArticles}
            onReload={() => void loadArticles()} handleSaveArticle={handleSaveArticle}
            handleCancelEditArticle={handleCancelEditArticle}
            handleStartEditArticle={handleStartEditArticle} handleDeleteArticle={handleDeleteArticle}
          /></Suspense></DeferredViewBoundary>
        </>
      ) : null}

      {activeReferenceView?.view === "tenants" ? (
        <>
          <FeedbackBanner errorMessage={errorMessage} successMessage={successMessage} />
          <DeferredViewBoundary key={formScope} hasUnsavedChanges={tenantChanges.isDirty}><Suspense fallback={<p role="status">Chargement des locataires…</p>}><RentalTenantsPanel
            key={formScope} tenants={tenants.filter((record) => record.companyId === activeCompany?.id)} tenantForm={tenantForm} setTenantForm={setTenantForm}
            editingTenantId={editingTenantId} busyTenantId={busyTenantId} isSavingTenant={isSavingTenant}
            isTenantManagementExpanded={isTenantManagementExpanded} setIsTenantManagementExpanded={setIsTenantManagementExpanded}
            tenantChanges={tenantChanges} isLoading={isLoadingTenants} hasLoaded={hasLoadedTenants}
            onReload={() => void loadTenants()} handleSaveTenant={handleSaveTenant}
            handleCancelEditTenant={handleCancelEditTenant} handleStartEditTenant={handleStartEditTenant} handleDeleteTenant={handleDeleteTenant}
          /></Suspense></DeferredViewBoundary>
        </>
      ) : null}

      {activeReferenceView?.view === "shops" ? (
        <>
          <FeedbackBanner errorMessage={errorMessage} successMessage={successMessage} />
          <DeferredViewBoundary key={formScope} hasUnsavedChanges={shopChanges.isDirty}><Suspense fallback={<p role="status">Chargement des boutiques…</p>}><GeneralStoreShopsPanel
            key={formScope} shops={shops.filter((record) => record.companyId === activeCompany?.id)} shopForm={shopForm} setShopForm={setShopForm}
            editingShopId={editingShopId} busyShopId={busyShopId} isSavingShop={isSavingShop}
            isShopManagementExpanded={isShopManagementExpanded} setIsShopManagementExpanded={setIsShopManagementExpanded}
            shopChanges={shopChanges} isLoading={isLoadingShops} hasLoaded={hasLoadedShops}
            onReload={() => void loadShops()} handleSaveShop={handleSaveShop}
            handleCancelEditShop={handleCancelEditShop} handleStartEditShop={handleStartEditShop} handleDeleteShop={handleDeleteShop}
          /></Suspense></DeferredViewBoundary>
        </>
      ) : null}

      {activeReferenceView?.view === "projects" ? (
        <>
          <FeedbackBanner errorMessage={errorMessage} successMessage={successMessage} />
          <DeferredViewBoundary key={formScope} hasUnsavedChanges={projectChanges.isDirty}><Suspense fallback={<p role="status">Chargement des chantiers…</p>}><BtpProjectsPanel
            key={formScope} projects={projects.filter((record) => record.companyId === activeCompany?.id)} projectForm={projectForm} setProjectForm={setProjectForm}
            editingProjectId={editingProjectId} busyProjectId={busyProjectId} isSavingProject={isSavingProject}
            isProjectManagementExpanded={isProjectManagementExpanded} setIsProjectManagementExpanded={setIsProjectManagementExpanded}
            projectChanges={projectChanges} isLoading={isLoadingProjects} hasLoaded={hasLoadedProjects}
            onReload={() => void loadProjects()} handleSaveProject={handleSaveProject}
            handleCancelEditProject={handleCancelEditProject} handleStartEditProject={handleStartEditProject} handleDeleteProject={handleDeleteProject}
          /></Suspense></DeferredViewBoundary>
        </>
      ) : null}

      {!activeReferenceView ? (<>

      {canManageSalaries ? (
        <section className="panel finance-page-panel">
          <div className="dashboard-panel-header">
            <div>
              <h3>Salaires</h3>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => navigate("/finance/salaries")}
            >
              Ouvrir la page salaires
            </button>
          </div>
        </section>
      ) : null}

      <section className="panel finance-page-panel finance-transactions-filters">
        <h3>Recherche</h3>
        <form
          className="operations-filter-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadData();
          }}
        >

          <details className="finance-transaction-type-filter" open={!isCompactScreen}>
            <summary>Type de transaction</summary>
            <div className="finance-transaction-type-filter-content">
          <label className="operations-inline-group">
            <span>Type de transaction</span>
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  type: event.target.value as "ALL" | FinancialTransaction["type"]
                }))
              }
            >
              <option value="ALL">Tous les types</option>
              <option value="CASH_IN">Entrée</option>
              <option value="CASH_OUT">Sortie</option>
            </select>
          </label>
            </div>
          </details>
          <label className="operations-inline-group">
            <span>Recherche rapide</span>
            <input
              type="search"
              className="quick-search-input"
              placeholder={`Rechercher : ${getSectorSearchHint(selectedActivityCode)}...`}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value.slice(0, 200))}
            />
          </label>
          <button type="submit" className="mobile-hide-redundant-action">Actualiser</button>
        </form>
        <p className="hint" role="status">{searchQuery.trim() !== debouncedSearch || isLoading
          ? "Recherche dans l’historique du secteur…"
          : "Recherche dans tout l’historique autorisé du secteur, avec les filtres sélectionnés."}</p>
      </section>

      {isListFirstSector && !transactionWorkspace ? renderTransactionsList() : null}

      {!transactionWorkspace || canManageTransactions ? (
      <section className="panel finance-page-panel">
        <details
          id="transaction-create"
          className="finance-section-toggle mobile-form-anchor mobile-create-disclosure"
          open={isTransactionFormExpanded || Boolean(editingTransactionId)}
          onToggle={(event) => setIsTransactionFormExpanded(event.currentTarget.open)}
        >
          <summary className="finance-section-summary">
            <span>{editingTransactionId ? "Modifier une transaction" : "Enregistrer une transaction"}</span>
            <small>
              {editingTransactionId
                ? "Modification de transaction."
                : "Nouvelle transaction."}
            </small>
          </summary>
          {accounts.length === 0 ? (
            <p className="hint">
              Aucun compte financier n'est disponible pour le secteur actif. Contactez le
              propriétaire, l'admin système ou le comptable.
            </p>
          ) : null}
          {shouldRenderTransactionForm ? <DeferredViewBoundary key={formScope} hasUnsavedChanges={transactionChanges.isDirty}><Suspense fallback={<p role="status">Chargement du formulaire…</p>}><FinanceTransactionForm key={formScope}
            selectedActivityCode={selectedActivityCode}
            recentSalePrice={recentSalePrice}
            nextSaleProductRef={nextSaleProductRef}
            handleSaveTransaction={handleSaveTransaction}
            transactionChanges={transactionChanges}
            isSavingTransaction={isSavingTransaction}
            transactionForm={transactionForm}
            setTransactionForm={setTransactionForm}
            accounts={accounts}
            storeOperationKind={storeOperationKind}
            dailyActivityCategories={dailyActivityCategories}
            dailyAgreementOperationKind={dailyAgreementOperationKind}
            hardwareOperationKind={hardwareOperationKind}
            foodOperationKind={foodOperationKind}
            agricultureOperationKind={agricultureOperationKind}
            btpOperationKind={btpOperationKind}
            rentalOperationKind={rentalOperationKind}
            hotelOperationKind={hotelOperationKind}
            beverageOperationKind={beverageOperationKind}
            isLegacyBeverageEdit={isLegacyBeverageEdit}
            isArchivedBeverageEdit={isArchivedBeverageEdit}
            waterOperationKind={waterOperationKind}
            agencyOperationKind={agencyOperationKind}
            fishFarmingOperationKind={fishFarmingOperationKind}
            livestockOperationKind={livestockOperationKind}
            generalExpenseKind={generalExpenseKind}
            allowedCurrencies={allowedCurrencies}
            selectedActivity={selectedActivity}
            transactionWorkspace={transactionWorkspace}
            renderTransactionProof={renderTransactionProof}
            hasRequiredFinanceDetails={hasRequiredFinanceDetails}
            sectorTransactionSuggestions={sectorTransactionSuggestions}
            applySectorTransactionSuggestion={applySectorTransactionSuggestion}
            generalExpenseSuggestions={generalExpenseSuggestions}
            applyGeneralExpenseSuggestion={applyGeneralExpenseSuggestion}
            generalExpenseOwner={generalExpenseOwner}
            selectedProfile={selectedProfile}
            generalExpenseDescriptionSuggestions={generalExpenseDescriptionSuggestions}
            sectorDescriptionSuggestions={sectorDescriptionSuggestions}
            setShowGeneralExpenseCalculator={setShowGeneralExpenseCalculator}
            showGeneralExpenseCalculator={showGeneralExpenseCalculator}
            visibleFinanceMetadataFields={visibleFinanceMetadataFields}
            beverageStock={beverageStock}
            selectedBeverageProduct={selectedBeverageProduct}
            tenants={tenants}
            referenceView={referenceView}
            shops={shops}
            projects={projects}
            hardwareRecipients={hardwareRecipients}
            articles={articles}
            hardwareCustomArticleMode={hardwareCustomArticleMode}
            setHardwareCustomArticleMode={setHardwareCustomArticleMode}
            editingTransactionId={editingTransactionId}
            serviceCategorySuggestions={serviceCategorySuggestions}
            isLoadingActivities={isLoadingActivities}
            transactionProofFile={transactionProofFile}
            handleCancelEditTransaction={handleCancelEditTransaction}
          /></Suspense></DeferredViewBoundary> : null}
        </details>
      </section>

      ) : null}

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      {!isListFirstSector ? renderTransactionsList() : null}

      {requestedTransactionId && !selectedTransaction && !isLoading ? (
        <p className="hint" role="status">Ouverture de la transaction...</p>
      ) : null}

      {selectedTransaction ? (
        <section id="transaction-detail" className="panel finance-transaction-detail-panel">
          {isSelectedTransactionArchived ? (
            <p className="hint">Historique du secteur désactivé : cette transaction est disponible en consultation.</p>
          ) : null}
          <div className="task-detail-header">
            <div>
              <h3>Detail de la transaction</h3>
              <p className="hint">
                {selectedTransaction.accountName} |{" "}
                {new Date(selectedTransaction.occurredAt).toLocaleString("fr-FR")}
              </p>
            </div>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCloseTransactionDetails}
            >
              Fermer
            </button>
          </div>

          <div className="finance-transaction-primary">
            <span>Montant</span>
            <strong>
              {formatAmountForDisplay(selectedTransaction.amount)} {selectedTransaction.currency}
            </strong>
            <span className={`finance-transaction-detail-status is-${selectedTransaction.status.toLowerCase()}`}>
              {financeStatusLabel(selectedTransaction.status)}
            </span>
          </div>

          <details className="finance-transaction-detail-more" open={!isCompactScreen}>
            <summary>Détails et justificatifs</summary>
          <div className="operations-task-meta">
            <p>
              <strong>Secteur:</strong>{" "}
              {selectedTransaction.activityCode
                ? getBusinessActivityLabel(selectedTransaction.activityCode)
                : "Charge transversale entreprise"}
            </p>
            <p>
              <strong>Type:</strong> {selectedTransaction.type === "CASH_IN" ? "Entrée" : "Sortie"}
            </p>
            <p>
              <strong>Preuves:</strong> {selectedTransaction.proofsCount}
              {selectedTransaction.requiresProof ? " (obligatoire)" : ""}
            </p>
            <p>
              <strong>Createur:</strong> {selectedTransaction.createdByEmail}
            </p>
            <p>
              <strong>Creee le:</strong>{" "}
              {new Date(selectedTransaction.createdAt).toLocaleString("fr-FR")}
            </p>
            <p>
              <strong>Derniere MAJ:</strong>{" "}
              {new Date(selectedTransaction.updatedAt).toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="finance-decision-shortcuts">
            <strong>Justificatifs</strong>
            <div className="actions-inline">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleToggleProofs(selectedTransaction.id)}
              >
                {openProofs[selectedTransaction.id] ? "Masquer les preuves" : "Voir les preuves"}
              </button>
            </div>
          </div>

          <div className="finance-transaction-detail-grid">
            <article className="finance-detail-block">
              <h4>Transaction</h4>
              {selectedTransaction.description?.trim() ? (
                <p className="hint">{selectedTransaction.description}</p>
              ) : (
                <p className="hint mobile-generic-placeholder">Aucune description fournie.</p>
              )}
            </article>

            <article className="finance-detail-block">
              <h4>Gouvernance</h4>
              {getTransactionGovernanceLines(selectedTransaction).map((line) => (
                <p key={`${selectedTransaction.id}-${line}`} className="hint">
                  {line}
                </p>
              ))}
            </article>

            <article className="finance-detail-block">
              <h4>Contexte métier</h4>
              <p className="hint">{formatMetadataSummary(selectedTransaction.metadata, selectedTransactionMetadataFields)}</p>
            </article>

            <article className="finance-detail-block">
              <h4>Preuves</h4>
              <p className="hint">
                {selectedTransaction.proofsCount} preuve{selectedTransaction.proofsCount > 1 ? "s" : ""}
                {selectedTransaction.requiresProof ? " (obligatoire)" : ""}
              </p>
            </article>
          </div>

          </details>

          <div className="finance-transaction-detail-actions">
            <div className="actions-inline">
              {canMutateSelectedTransaction ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleStartEditTransaction(selectedTransaction)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Modifier
                </button>
              ) : null}
              {canMutateSelectedTransaction ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void handleDeleteTransaction(selectedTransaction)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Supprimer
                </button>
              ) : null}
            </div>
            {canMutateSelectedTransaction ? <div className="proof-inline-form">
              <input
                type="file"
                aria-label={`Preuve pour la transaction ${selectedTransaction.accountName}`}
                accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                onChange={(event) =>
                  setProofFiles((prev) => ({
                    ...prev,
                    [selectedTransaction.id]: event.target.files?.[0] ?? null
                  }))
                }
                disabled={busyTransactionId === selectedTransaction.id}
              />
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleAddProof(selectedTransaction.id)}
                disabled={busyTransactionId === selectedTransaction.id}
              >
                Ajouter une preuve
              </button>
            </div> : null}
          </div>

          {openProofs[selectedTransaction.id] ? (
            <div className="proof-list">
              {loadingProofsByTransaction[selectedTransaction.id] ? <p>Chargement des preuves...</p> : null}
              {!loadingProofsByTransaction[selectedTransaction.id] &&
              (proofsByTransaction[selectedTransaction.id] ?? []).length === 0 ? (
                <p>Aucune preuve ajoutee.</p>
              ) : null}
              {!loadingProofsByTransaction[selectedTransaction.id] &&
              (proofsByTransaction[selectedTransaction.id] ?? []).length > 0 ? (
                <ul>
                  {(proofsByTransaction[selectedTransaction.id] ?? []).map((proof) => (
                    <li key={proof.id}>
                      {proof.publicUrl ? (
                        <a href={proof.publicUrl} target="_blank" rel="noreferrer">
                          {proof.fileName}
                        </a>
                      ) : (
                        <span>{proof.fileName} (lien indisponible)</span>
                      )}
                      <small>
                        {formatFileSize(proof.fileSize)} |{" "}
                        {new Date(proof.uploadedAt).toLocaleString("fr-FR")}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedActivityCode && (accounts.length > 0 || !hasLoadedAccounts || isAccountListExpanded) ? (
        <section className="panel">
          <details
            id="accounts-list"
            className="finance-section-toggle"
            open={isAccountListExpanded}
            onToggle={(event) => {
              const isExpanded = event.currentTarget.open;
              setIsAccountListExpanded(isExpanded);
              if (isExpanded && !isTransactionFormExpanded) void loadAccounts();
            }}
          >
            <summary className="finance-section-summary">
              <span>Consulter les comptes financiers</span>
              <small>
                {hasLoadedAccounts
                  ? `${accounts.length} compte(s) visible(s) dans le contexte actuel.`
                  : "Afficher les comptes du secteur actif."}
              </small>
            </summary>
            {isLoadingAccounts ? <p className="hint">Chargement des comptes financiers...</p> : null}
            {!isLoadingAccounts && !hasLoadedAccounts ? (
              <div className="actions-inline">
                <p className="hint">Les comptes n'ont pas pu être chargés.</p>
                <button type="button" className="secondary-btn" onClick={() => void loadAccounts()}>
                  Réessayer
                </button>
              </div>
            ) : null}
            {hasLoadedAccounts && accounts.length === 0 ? (
              <p className="hint">Aucun compte financier n'est disponible pour ce secteur.</p>
            ) : null}
            {hasLoadedAccounts && accounts.length > 0 ? (
              <div className="operations-member-grid">
                {accounts.map((account) => {
                const canEditAccount = canManageAccount(account);
                const isLockedAccount = account.transactionsCount > 0;
                const isBusy = busyAccountId === account.id;

                return (
                  <article key={account.id} className="operations-member-card">
                    <h4>{account.name}</h4>
                    {getAccountGovernanceLines(account).map((line) => (
                      <p key={`${account.id}-${line}`} className="hint">
                        {line}
                      </p>
                    ))}
                    <p className="hint">Solde: {formatAmountForDisplay(account.balance)}</p>
                    <p className="hint">
                      Transactions liees: {account.transactionsCount}
                    </p>
                    <p className="hint">
                      Compatible secteur actif:{" "}
                      {isAccountVisibleForSelectedActivity(account, selectedActivityCode) ? "Oui" : "Non"}
                    </p>
                    {isLockedAccount ? (
                      <p className="hint">
                        Ce compte est déjà utilisé. La modification et la suppression sont bloquées.
                      </p>
                    ) : null}
                    {canEditAccount ? (
                      <div className="actions-inline">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleStartEditAccount(account)}
                          disabled={isBusy}
                          title={
                            isLockedAccount
                              ? "Compte déjà utilisé par des transactions."
                              : undefined
                          }
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => void handleDeleteAccount(account)}
                          disabled={isBusy}
                          title={
                            isLockedAccount
                              ? "Compte déjà utilisé par des transactions."
                              : undefined
                          }
                        >
                          Supprimer
                        </button>
                      </div>
                    ) : null}
                  </article>
                  );
                })}
              </div>
            ) : null}
          </details>
        </section>
      ) : null}

      </>) : null}

      <ConfirmDialog
        open={accountPendingDelete !== null}
        title="Confirmer la suppression du compte"
        description="Cette action retire le compte financier de la liste des comptes disponibles."
        objectLabel="Compte concerné"
        objectName={accountPendingDelete?.name ?? ""}
        impactText="Les comptes financiers ne doivent être supprimés que lorsqu'ils ne sont plus utiles au suivi opérationnel."
        isConfirming={busyAccountId === accountPendingDelete?.id}
        onCancel={() => {
          if (busyAccountId) {
            return;
          }
          setAccountPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteAccount()}
      />

      <ConfirmDialog
        open={articlePendingDelete !== null}
        title="Confirmer la suppression de l'article"
        description="Cette action retire l'article de la liste de sélection du formulaire."
        objectLabel="Article concerné"
        objectName={articlePendingDelete?.name ?? ""}
        impactText="Les transactions déjà enregistrées avec cet article ne sont pas modifiées."
        isConfirming={busyArticleId === articlePendingDelete?.id}
        onCancel={() => {
          if (busyArticleId) {
            return;
          }
          setArticlePendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteArticle()}
      />

      <ConfirmDialog
        open={tenantPendingDelete !== null}
        title="Confirmer la suppression du locataire"
        description="Cette action retire le locataire de la liste de sélection du formulaire."
        objectLabel="Locataire concerné"
        objectName={tenantPendingDelete?.name ?? ""}
        impactText="Les paiements déjà enregistrés pour ce locataire ne sont pas modifiés."
        isConfirming={busyTenantId === tenantPendingDelete?.id}
        onCancel={() => {
          if (busyTenantId) {
            return;
          }
          setTenantPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteTenant()}
      />

      <ConfirmDialog
        open={shopPendingDelete !== null}
        title="Confirmer la suppression de la boutique"
        description="Cette action retire la boutique de la liste de sélection du formulaire."
        objectLabel="Boutique concernée"
        objectName={shopPendingDelete?.name ?? ""}
        impactText="Les opérations déjà enregistrées pour cette boutique ne sont pas modifiées."
        isConfirming={busyShopId === shopPendingDelete?.id}
        onCancel={() => {
          if (busyShopId) {
            return;
          }
          setShopPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteShop()}
      />

      <ConfirmDialog
        open={projectPendingDelete !== null}
        title="Confirmer la suppression du chantier"
        description="Cette action retire le chantier de la liste de sélection du formulaire."
        objectLabel="Chantier concerné"
        objectName={projectPendingDelete?.name ?? ""}
        impactText="Les opérations déjà enregistrées pour ce chantier ne sont pas modifiées."
        isConfirming={busyProjectId === projectPendingDelete?.id}
        onCancel={() => {
          if (busyProjectId) {
            return;
          }
          setProjectPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteProject()}
      />

      <ConfirmDialog
        open={transactionPendingDelete !== null}
        title="Confirmer la suppression de la transaction"
        description="Cette action supprimé la transaction sélectionnée de la vue financière."
        objectLabel="Transaction concernée"
        objectName={transactionPendingDelete?.description?.trim() || transactionPendingDelete?.id || ""}
        impactText="La transaction ne sera plus disponible dans le suivi courant."
        isConfirming={busyTransactionId === transactionPendingDelete?.id}
        onCancel={() => {
          if (busyTransactionId) {
            return;
          }
          setTransactionPendingDelete(null);
        }}
        onConfirm={() => void handleConfirmDeleteTransaction()}
      />
    </>
  );
}

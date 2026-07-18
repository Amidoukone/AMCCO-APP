import type { BusinessActivityCode } from "../config/businessActivities";
import type {
  ActivityReportHighlight,
  BusinessActivityProfile
} from "./activities";
import type { FinancialAccountScopeType } from "./finance";
import type { RoleCode } from "./role";

export type DashboardCompanySummary = {
  companyId: string;
  companyName: string;
  companyCode: string;
  activeUsersCount: number;
  totalMembershipsCount: number;
  financialAccountsCount: number;
  unreadAlertsCount: number;
  auditEventsLast7Days: number;
};

export type DashboardFinanceSummary = {
  totalTransactionsCount: number;
  draftCount: number;
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  accountsSummary: FinancialAccountsScopeSummary;
  totalsByCurrency: Array<{
    currency: string;
    approvedCashInTotal: string;
    approvedCashOutTotal: string;
    netApprovedTotal: string;
  }>;
};

export type DashboardOperationsSummary = {
  totalTasksCount: number;
  todoCount: number;
  inProgressCount: number;
  blockedCount: number;
  doneCount: number;
  overdueCount: number;
  dueSoonCount: number;
  unassignedCount: number;
  myOpenTasksCount: number;
};

export type DashboardRecentTransaction = {
  id: string;
  accountName: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  occurredAt: string;
};

export type DashboardRecentTask = {
  id: string;
  title: string;
  activityCode: BusinessActivityCode | null;
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  assignedToFullName: string | null;
  dueDate: string | null;
  updatedAt: string;
};

export type DashboardWorkloadItem = {
  userId: string;
  fullName: string;
  role: RoleCode;
  openTasksCount: number;
  inProgressTasksCount: number;
  blockedTasksCount: number;
  doneTasksCount: number;
};

export type DashboardActivitySummary = {
  activityCode: BusinessActivityCode;
  transactionsCount: number;
  submittedTransactionsCount: number;
  totalTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
};

export type ReportOperationalMetric = {
  scope: "ACTIVITY" | "SUBSECTION";
  activityCode: BusinessActivityCode;
  dimensionKey: string;
  dimensionLabel: string;
  itemKey: string;
  itemLabel: string;
  currency: "XOF";
  transactionsCount: number;
  approvedTransactionsCount: number;
  approvedCashIn: string;
  approvedCashOut: string;
  netProfit: string;
  marginRate: number;
  returnOnCostRate: number;
  totalTasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  overdueTasksCount: number;
  executionRate: number;
  blockageRate: number;
  followUpPressure: number;
};

export type HardwareMonthlyReportRow = {
  date: string;
  designation: string;
  quantity: number;
  salesAmount: string;
  paymentAmount: string;
  purchaseAmount: string;
  grossProfit: string;
  marginRate: number;
  transactionsCount: number;
  currency: "XOF";
};

export type HardwareMonthlyReport = {
  periodLabel: string;
  rows: HardwareMonthlyReportRow[];
  totals: {
    quantity: number;
    salesAmount: string;
    paymentAmount: string;
    purchaseAmount: string;
    grossProfit: string;
    marginRate: number;
    transactionsCount: number;
    currency: "XOF";
  };
};

export type AgricultureOperationsReportRow = {
  campaignRef: string;
  parcelRef: string;
  fieldType: string;
  cropType: string;
  surfaceArea: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  executionRate: number;
  currency: "XOF";
};

export type AgricultureOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type AgricultureOperationsReport = {
  periodLabel: string;
  rows: AgricultureOperationsReportRow[];
  operationRows: AgricultureOperationsReportOperationRow[];
  totals: {
    parcelsCount: number;
    surfaceArea: number;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    executionRate: number;
    currency: "XOF";
  };
};

export type GeneralStoreOperationsReportRow = {
  department: string;
  productFamily: string;
  itemName: string;
  skuRef: string;
  soldQuantity: number;
  purchaseQuantity: number;
  returnQuantity: number;
  adjustmentQuantity: number;
  transferQuantity: number;
  salesAmount: string;
  purchaseAmount: string;
  returnAmount: string;
  discountAmount: string;
  expenseAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  grossMargin: string;
  marginRate: number;
  executionRate: number;
  currency: "XOF";
};

export type GeneralStoreOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type GeneralStoreOperationsReport = {
  periodLabel: string;
  rows: GeneralStoreOperationsReportRow[];
  operationRows: GeneralStoreOperationsReportOperationRow[];
  totals: {
    departmentsCount: number;
    productFamiliesCount: number;
    itemsCount: number;
    soldQuantity: number;
    purchaseQuantity: number;
    returnQuantity: number;
    adjustmentQuantity: number;
    transferQuantity: number;
    salesAmount: string;
    purchaseAmount: string;
    returnAmount: string;
    discountAmount: string;
    expenseAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    grossMargin: string;
    marginRate: number;
    executionRate: number;
    currency: "XOF";
  };
};

export type FoodOperationsReportRow = {
  productFamily: string;
  productName: string;
  batchRef: string;
  storageArea: string;
  purchaseQuantity: number;
  soldQuantity: number;
  lossQuantity: number;
  purchaseAmount: string;
  salesAmount: string;
  lossAmount: string;
  expenseAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  grossMargin: string;
  marginRate: number;
  executionRate: number;
  currency: "XOF";
};

export type FoodOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type FoodOperationsReport = {
  periodLabel: string;
  rows: FoodOperationsReportRow[];
  operationRows: FoodOperationsReportOperationRow[];
  totals: {
    productFamiliesCount: number;
    productsCount: number;
    batchesCount: number;
    purchaseQuantity: number;
    soldQuantity: number;
    lossQuantity: number;
    purchaseAmount: string;
    salesAmount: string;
    lossAmount: string;
    expenseAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    grossMargin: string;
    marginRate: number;
    executionRate: number;
    currency: "XOF";
  };
};

export type RentalOperationsReportRow = {
  propertyRef: string;
  unitRef: string;
  tenantRef: string;
  leaseRef: string;
  propertyType: string;
  rentPaymentsCount: number;
  rentAmount: string;
  depositAmount: string;
  serviceChargeAmount: string;
  maintenanceAmount: string;
  propertyExpenseAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  executionRate: number;
  currency: "XOF";
};

export type RentalOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type RentalOperationsReport = {
  periodLabel: string;
  rows: RentalOperationsReportRow[];
  operationRows: RentalOperationsReportOperationRow[];
  totals: {
    propertiesCount: number;
    unitsCount: number;
    tenantsCount: number;
    rentPaymentsCount: number;
    rentAmount: string;
    depositAmount: string;
    serviceChargeAmount: string;
    maintenanceAmount: string;
    propertyExpenseAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    executionRate: number;
    currency: "XOF";
  };
};

export type HotelOperationsReportRow = {
  serviceLine: string;
  roomRef: string;
  roomType: string;
  bookingRef: string;
  guestRef: string;
  nightsCount: number;
  guestCount: number;
  roomRevenue: string;
  depositAmount: string;
  restaurantAmount: string;
  serviceAmount: string;
  maintenanceAmount: string;
  commissionAmount: string;
  taxAmount: string;
  refundAmount: string;
  expenseAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  averageRoomRate: number;
  executionRate: number;
  currency: "XOF";
};

export type HotelOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type HotelOperationsReport = {
  periodLabel: string;
  rows: HotelOperationsReportRow[];
  operationRows: HotelOperationsReportOperationRow[];
  totals: {
    bookingsCount: number;
    roomsCount: number;
    guestsCount: number;
    nightsCount: number;
    guestCount: number;
    roomRevenue: string;
    depositAmount: string;
    restaurantAmount: string;
    serviceAmount: string;
    maintenanceAmount: string;
    commissionAmount: string;
    taxAmount: string;
    refundAmount: string;
    expenseAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    averageRoomRate: number;
    executionRate: number;
    currency: "XOF";
  };
};

export type WaterOperationsReportRow = {
  facilityRef: string;
  networkZone: string;
  productionLine: string;
  producedVolumeM3: number;
  billedVolumeM3: number;
  waterRevenue: string;
  bulkSaleAmount: string;
  connectionAmount: string;
  subsidyAmount: string;
  treatmentCost: string;
  energyCost: string;
  maintenanceCost: string;
  qualityCost: string;
  repairCost: string;
  supplierPaymentAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  lossRate: number;
  executionRate: number;
  currency: "XOF";
};

export type WaterOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type WaterOperationsReport = {
  periodLabel: string;
  rows: WaterOperationsReportRow[];
  operationRows: WaterOperationsReportOperationRow[];
  totals: {
    facilitiesCount: number;
    zonesCount: number;
    producedVolumeM3: number;
    billedVolumeM3: number;
    waterRevenue: string;
    bulkSaleAmount: string;
    connectionAmount: string;
    subsidyAmount: string;
    treatmentCost: string;
    energyCost: string;
    maintenanceCost: string;
    qualityCost: string;
    repairCost: string;
    supplierPaymentAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    lossRate: number;
    executionRate: number;
    currency: "XOF";
  };
};

export type AgencyOperationsReportRow = {
  mandateRef: string;
  propertyRef: string;
  mandateType: string;
  propertyType: string;
  locationZone: string;
  clientRef: string;
  dealStage: string;
  dealAmount: string;
  saleCommissionAmount: string;
  rentalCommissionAmount: string;
  mandateFeeAmount: string;
  visitFeeAmount: string;
  fileFeeAmount: string;
  advertisingExpenseAmount: string;
  fieldVisitExpenseAmount: string;
  brokerPayoutAmount: string;
  documentExpenseAmount: string;
  officeExpenseAmount: string;
  refundAmount: string;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  commissionRate: number;
  executionRate: number;
  currency: "XOF";
};

export type AgencyOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type AgencyOperationsReport = {
  periodLabel: string;
  rows: AgencyOperationsReportRow[];
  operationRows: AgencyOperationsReportOperationRow[];
  totals: {
    mandatesCount: number;
    propertiesCount: number;
    clientsCount: number;
    dealAmount: string;
    saleCommissionAmount: string;
    rentalCommissionAmount: string;
    mandateFeeAmount: string;
    visitFeeAmount: string;
    fileFeeAmount: string;
    advertisingExpenseAmount: string;
    fieldVisitExpenseAmount: string;
    brokerPayoutAmount: string;
    documentExpenseAmount: string;
    officeExpenseAmount: string;
    refundAmount: string;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    commissionRate: number;
    executionRate: number;
    currency: "XOF";
  };
};

export type BtpOperationsReportRow = {
  projectRef: string;
  workPackage: string;
  siteLocation: string;
  clientRef: string;
  progressPercent: number;
  materialQuantity: number;
  laborDays: number;
  equipmentHours: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  executionRate: number;
  currency: "XOF";
};

export type BtpOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type BtpOperationsReport = {
  periodLabel: string;
  rows: BtpOperationsReportRow[];
  operationRows: BtpOperationsReportOperationRow[];
  totals: {
    projectsCount: number;
    workPackagesCount: number;
    progressPercent: number;
    materialQuantity: number;
    laborDays: number;
    equipmentHours: number;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    executionRate: number;
    currency: "XOF";
  };
};

export type FishFarmingOperationsReportRow = {
  pondRef: string;
  cycleRef: string;
  species: string;
  fingerlingsQuantity: number;
  feedQuantity: number;
  soldQuantity: number;
  mortalityCount: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  executionRate: number;
  currency: "XOF";
};

export type FishFarmingOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type FishFarmingOperationsReport = {
  periodLabel: string;
  rows: FishFarmingOperationsReportRow[];
  operationRows: FishFarmingOperationsReportOperationRow[];
  totals: {
    pondsCount: number;
    cyclesCount: number;
    fingerlingsQuantity: number;
    feedQuantity: number;
    soldQuantity: number;
    mortalityCount: number;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    executionRate: number;
    currency: "XOF";
  };
};

export type LivestockOperationsReportRow = {
  herdRef: string;
  batchRef: string;
  species: string;
  animalPurchaseCount: number;
  feedQuantity: number;
  soldAnimalCount: number;
  productQuantity: number;
  mortalityCount: number;
  transactionsCount: number;
  tasksCount: number;
  doneTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  executionRate: number;
  currency: "XOF";
};

export type LivestockOperationsReportOperationRow = {
  operationKind: string;
  operationLabel: string;
  transactionsCount: number;
  tasksCount: number;
  cashInAmount: string;
  cashOutAmount: string;
  netAmount: string;
  currency: "XOF";
};

export type LivestockOperationsReport = {
  periodLabel: string;
  rows: LivestockOperationsReportRow[];
  operationRows: LivestockOperationsReportOperationRow[];
  totals: {
    herdsCount: number;
    batchesCount: number;
    animalPurchaseCount: number;
    feedQuantity: number;
    soldAnimalCount: number;
    productQuantity: number;
    mortalityCount: number;
    transactionsCount: number;
    tasksCount: number;
    doneTasksCount: number;
    openTasksCount: number;
    blockedTasksCount: number;
    cashInAmount: string;
    cashOutAmount: string;
    netAmount: string;
    executionRate: number;
    currency: "XOF";
  };
};

export type DashboardSummary = {
  generatedAt: string;
  sectorRulesVersion: string;
  company: DashboardCompanySummary;
  finance: DashboardFinanceSummary;
  operations: DashboardOperationsSummary;
  activitySummary: DashboardActivitySummary[];
  activityProfiles: BusinessActivityProfile[];
  activityHighlightsByCode: Partial<Record<BusinessActivityCode, ActivityReportHighlight[]>>;
  operationalPerformance: ReportOperationalMetric[];
  recentTransactions: DashboardRecentTransaction[];
  recentTasks: DashboardRecentTask[];
  workload: DashboardWorkloadItem[];
};

export type DashboardSummaryResponse = {
  item: DashboardSummary;
};

export type ReportFinanceByStatus = {
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  currency: string;
  count: number;
  totalAmount: string;
};

export type ReportFinanceByType = {
  type: "CASH_IN" | "CASH_OUT";
  currency: string;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

export type ReportFinanceByActivity = {
  activityCode: BusinessActivityCode;
  count: number;
  totalAmount: string;
  approvedAmount: string;
};

export type ReportTaskByStatus = {
  status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  count: number;
};

export type ReportTaskByActivity = {
  activityCode: BusinessActivityCode;
  totalCount: number;
  openCount: number;
  blockedCount: number;
  doneCount: number;
};

export type ReportRoleDistribution = {
  role: RoleCode;
  count: number;
};

export type FinancialAccountsScopeSummary = {
  totalCount: number;
  globalCount: number;
  dedicatedCount: number;
  restrictedCount: number;
  compatibleCount: number;
  incompatibleCount: number;
  dedicatedToSelectedActivityCount: number;
  restrictedToSelectedActivityCount: number;
};

export type FinancialAccountGovernanceItem = {
  id: string;
  name: string;
  accountRef: string | null;
  balance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
  isCompatibleWithSelectedActivity: boolean;
};

export type ReportsOverview = {
  generatedAt: string;
  sectorRulesVersion: string;
  filters: {
    dateFrom: string | null;
    dateTo: string | null;
    activityCode: BusinessActivityCode | null;
  };
  activityProfile: BusinessActivityProfile | null;
  availableActivityProfiles: BusinessActivityProfile[];
  activityHighlights: ActivityReportHighlight[];
  financeByStatus: ReportFinanceByStatus[];
  financeByType: ReportFinanceByType[];
  financeByActivity: ReportFinanceByActivity[];
  financeAccountsSummary: FinancialAccountsScopeSummary;
  financeAccounts: FinancialAccountGovernanceItem[];
  taskByStatus: ReportTaskByStatus[];
  taskByActivity: ReportTaskByActivity[];
  operationalPerformance: ReportOperationalMetric[];
  hardwareMonthlyReport: HardwareMonthlyReport | null;
  agricultureOperationsReport: AgricultureOperationsReport | null;
  generalStoreOperationsReport: GeneralStoreOperationsReport | null;
  foodOperationsReport: FoodOperationsReport | null;
  rentalOperationsReport: RentalOperationsReport | null;
  btpOperationsReport: BtpOperationsReport | null;
  fishFarmingOperationsReport: FishFarmingOperationsReport | null;
  livestockOperationsReport: LivestockOperationsReport | null;
  hotelOperationsReport: HotelOperationsReport | null;
  waterOperationsReport: WaterOperationsReport | null;
  agencyOperationsReport: AgencyOperationsReport | null;
  roleDistribution: ReportRoleDistribution[];
  topAssignees: DashboardWorkloadItem[];
};

export type ReportsOverviewResponse = {
  item: ReportsOverview;
};

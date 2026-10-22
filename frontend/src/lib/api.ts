import type {
  ChangeOwnPasswordInput,
  LoginInput,
  LoginResponse,
  MeResponse,
  RefreshResponse
} from "../types/auth";
import type {
  AdminCompaniesListResponse,
  AdminCompanySingleResponse,
  CreateCompanyInput,
  UpdateCompanyInput
} from "../types/companies";
import type { AuditLogsQuery, AuditLogsResponse } from "../types/audit";
import type { AlertListResponse, AlertSeverity, AlertSummaryResponse } from "../types/alerts";
import type {
  AdminUsersListResponse,
  AdminUserSingleResponse,
  ChangeAdminUserRoleInput,
  CreateAdminUserInput,
  ResetAdminUserPasswordInput,
  UpdateAdminUserInput
} from "../types/admin-users";
import type {
  AdminCompanyActivitiesResponse,
  AdminCompanyActivitySingleResponse,
  CompanyActivitiesResponse,
  ReclassifyLegacyActivitiesInput,
  ReclassifyLegacyActivitiesResponse
} from "../types/activities";
import type {
  FinancialAccountScopeType,
  FinancialAccountListResponse,
  FinancialAccountSingleResponse,
  FinanceProofUploadAuthResponse,
  FinancialTransactionListResponse,
  FinancialTransactionSingleResponse,
  DumpTruckSummaryResponse,
  SalaryMemberListResponse,
  SalaryPaymentMethod,
  SalarySummaryResponse,
  SalaryTransactionListResponse,
  SalaryTransactionSingleResponse,
  TransactionProofListResponse
} from "../types/finance";
import type {
  ActivityArticleListResponse,
  ActivityArticleSingleResponse
} from "../types/articles";
import type {
  RentalTenantListResponse,
  RentalTenantSingleResponse
} from "../types/tenants";
import type {
  GeneralStoreShopListResponse,
  GeneralStoreShopSingleResponse,
  GeneralStoreShop
} from "../types/shops";
import type {
  BtpProjectListResponse,
  BtpProjectSingleResponse
} from "../types/projects";
import type {
  DailyActivityCategoryListResponse,
  DailyActivityCategorySingleResponse
} from "../types/daily-activity-categories";
import type { BusinessActivityCode } from "../config/businessActivities";
import type { BeverageProduct } from "../types/beverage-stock";
import type {
  DashboardSummaryResponse,
  GeneralStoreOperationsReportRow,
  ReportsOverviewResponse
} from "../types/reporting";
import type {
  OperationTaskListResponse,
  OperationTaskMembersResponse,
  OperationTaskSingleResponse,
  TaskAttachmentListResponse,
  TaskAttachmentUploadAuthResponse,
  TaskCommentListResponse,
  TaskCommentSingleResponse,
  OperationTaskTimelineResponse,
  TaskScope,
  TaskStatus
} from "../types/tasks";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.toString() ?? "http://localhost:4000/api/v1";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
  headers?: Record<string, string>;
  cacheTtlMs?: number;
};

const inFlightGetRequests = new Map<string, Promise<unknown>>();
const completedGetResponses = new Map<string, { value: unknown; expiresAt: number }>();
const MAX_COMPLETED_GET_RESPONSES = 60;
let inFlightGetEpoch = 0;

export function clearCachedGetResponses(): void {
  inFlightGetEpoch += 1;
  completedGetResponses.clear();
}

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return data.error?.message ?? data.message ?? "La requête a échoué.";
  } catch {
    return "La requête a échoué.";
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  if (method !== "GET") {
    clearCachedGetResponses();
  }
  const inFlightKey = method === "GET"
    ? `${inFlightGetEpoch}:${options.accessToken ?? ""}:${path}`
    : null;
  const cacheTtlMs = method === "GET" ? Math.max(0, options.cacheTtlMs ?? 0) : 0;

  if (inFlightKey && cacheTtlMs > 0) {
    const cached = completedGetResponses.get(inFlightKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) {
      completedGetResponses.delete(inFlightKey);
    }
  }

  if (inFlightKey) {
    const existingRequest = inFlightGetRequests.get(inFlightKey);
    if (existingRequest) {
      return existingRequest as Promise<T>;
    }
  }

  const requestPromise = (async (): Promise<T> => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorMessage(response));
    }

    const data = (await response.json()) as T;
    if (inFlightKey && cacheTtlMs > 0) {
      completedGetResponses.set(inFlightKey, { value: data, expiresAt: Date.now() + cacheTtlMs });
      while (completedGetResponses.size > MAX_COMPLETED_GET_RESPONSES) {
        const oldestKey = completedGetResponses.keys().next().value as string | undefined;
        if (!oldestKey) break;
        completedGetResponses.delete(oldestKey);
      }
    }
    return data;
  })();

  if (inFlightKey) {
    inFlightGetRequests.set(inFlightKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (inFlightKey && inFlightGetRequests.get(inFlightKey) === requestPromise) {
      inFlightGetRequests.delete(inFlightKey);
    }
    if (method !== "GET") {
      clearCachedGetResponses();
    }
  }
}

async function download(path: string, accessToken: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  return response.blob();
}

export function loginRequest(input: LoginInput): Promise<LoginResponse> {
  const { clientDiagnostics, ...body } = input;
  const clientDiagnosticsHeader = clientDiagnostics
    ? [
        "v=3",
        `source=${clientDiagnostics.submitSource}`,
        `emailNormalized=${clientDiagnostics.emailChangedByNormalization ? "1" : "0"}`,
        `passwordNormalized=${clientDiagnostics.passwordChangedByNormalization ? "1" : "0"}`,
        `passwordOuterWhitespace=${clientDiagnostics.passwordHadOuterWhitespace ? "1" : "0"}`,
        `passwordZeroWidth=${clientDiagnostics.passwordHadZeroWidthCharacters ? "1" : "0"}`,
        `passwordNonAscii=${clientDiagnostics.passwordHadNonAsciiCharacters ? "1" : "0"}`
      ].join(";")
    : undefined;

  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body,
    headers: clientDiagnosticsHeader
      ? {
          "X-AMCCO-Login-Diagnostics": clientDiagnosticsHeader
        }
      : undefined
  });
}

export function refreshRequest(refreshToken: string): Promise<RefreshResponse> {
  return request<RefreshResponse>("/auth/refresh", {
    method: "POST",
    body: { refreshToken }
  });
}

export function switchCompanyRequest(
  refreshToken: string,
  targetCompanyId: string
): Promise<RefreshResponse> {
  return request<RefreshResponse>("/auth/switch-company", {
    method: "POST",
    body: { refreshToken, targetCompanyId }
  });
}

export function logoutRequest(refreshToken: string): Promise<{ status: string }> {
  return request<{ status: string }>("/auth/logout", {
    method: "POST",
    body: { refreshToken }
  });
}

export function meRequest(accessToken: string): Promise<MeResponse> {
  return request<MeResponse>("/me", {
    method: "GET",
    accessToken
  });
}

export function changeOwnPasswordRequest(
  accessToken: string,
  input: ChangeOwnPasswordInput
): Promise<{ status: string }> {
  return request<{ status: string }>("/me/password", {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function listAlertsRequest(
  accessToken: string,
  query: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
    severity?: AlertSeverity;
    entityType?: string;
    entityId?: string;
  } = {}
): Promise<AlertListResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  if (typeof query.unreadOnly === "boolean") {
    params.set("unreadOnly", query.unreadOnly ? "true" : "false");
  }
  if (query.severity) {
    params.set("severity", query.severity);
  }
  if (query.entityType) {
    params.set("entityType", query.entityType);
  }
  if (query.entityId) {
    params.set("entityId", query.entityId);
  }
  const suffix = params.toString();
  const path = suffix ? `/alerts?${suffix}` : "/alerts";

  return request<AlertListResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function getAlertsSummaryRequest(accessToken: string): Promise<AlertSummaryResponse> {
  return request<AlertSummaryResponse>("/alerts/summary", {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function markAlertReadRequest(
  accessToken: string,
  alertId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/alerts/${alertId}/read`, {
    method: "PATCH",
    accessToken
  });
}

export function markAllAlertsReadRequest(accessToken: string): Promise<{ status: string }> {
  return request<{ status: string }>("/alerts/read-all", {
    method: "PATCH",
    accessToken
  });
}

export function deleteAlertRequest(
  accessToken: string,
  alertId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/alerts/${alertId}`, {
    method: "DELETE",
    accessToken
  });
}

export function deleteManyAlertsRequest(
  accessToken: string,
  alertIds: string[]
): Promise<{ status: string }> {
  return request<{ status: string }>("/alerts/delete-many", {
    method: "POST",
    body: { alertIds },
    accessToken
  });
}

export function getDashboardSummaryRequest(
  accessToken: string,
  query: {
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<DashboardSummaryResponse> {
  const params = new URLSearchParams();
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix ? `/dashboard/summary?${suffix}` : "/dashboard/summary";

  return request<DashboardSummaryResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function listCompanyActivitiesRequest(
  accessToken: string
): Promise<CompanyActivitiesResponse> {
  return request<CompanyActivitiesResponse>("/activities", {
    method: "GET",
    accessToken,
    cacheTtlMs: 30_000
  });
}

export function listAdminCompanyActivitiesRequest(
  accessToken: string
): Promise<AdminCompanyActivitiesResponse> {
  return request<AdminCompanyActivitiesResponse>("/admin/activities", {
    method: "GET",
    accessToken
  });
}

export function updateAdminCompanyActivityRequest(
  accessToken: string,
  activityCode: BusinessActivityCode,
  isEnabled: boolean
): Promise<AdminCompanyActivitySingleResponse> {
  return request<AdminCompanyActivitySingleResponse>(`/admin/activities/${activityCode}`, {
    method: "PATCH",
    body: { isEnabled },
    accessToken
  });
}

export function reclassifyLegacyActivitiesRequest(
  accessToken: string,
  input: ReclassifyLegacyActivitiesInput
): Promise<ReclassifyLegacyActivitiesResponse> {
  return request<ReclassifyLegacyActivitiesResponse>("/admin/activities/reclassify-legacy", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function getReportsOverviewRequest(
  accessToken: string,
  query: {
    dateFrom?: string;
    dateTo?: string;
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<ReportsOverviewResponse> {
  const params = new URLSearchParams();
  if (query.dateFrom) {
    params.set("dateFrom", query.dateFrom);
  }
  if (query.dateTo) {
    params.set("dateTo", query.dateTo);
  }
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix ? `/reports/overview?${suffix}` : "/reports/overview";

  return request<ReportsOverviewResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function getGeneralStoreLedgerRowsRequest(
  accessToken: string
): Promise<{ shops: GeneralStoreShop[]; rows: GeneralStoreOperationsReportRow[] }> {
  return request<{ shops: GeneralStoreShop[]; rows: GeneralStoreOperationsReportRow[] }>("/reports/general-store/ledger", {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function downloadReportExportRequest(
  accessToken: string,
  kind: "transactions" | "tasks" | "overview",
  format: "csv" | "xlsx" | "pdf",
  query: {
    dateFrom?: string;
    dateTo?: string;
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<Blob> {
  const params = new URLSearchParams();
  if (query.dateFrom) {
    params.set("dateFrom", query.dateFrom);
  }
  if (query.dateTo) {
    params.set("dateTo", query.dateTo);
  }
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix
    ? `/reports/exports/${kind}.${format}?${suffix}`
    : `/reports/exports/${kind}.${format}`;

  return download(path, accessToken);
}

export function listAdminUsersRequest(accessToken: string): Promise<AdminUsersListResponse> {
  return request<AdminUsersListResponse>("/admin/users", {
    method: "GET",
    accessToken
  });
}

export function listAdminCompaniesRequest(
  accessToken: string
): Promise<AdminCompaniesListResponse> {
  return request<AdminCompaniesListResponse>("/admin/companies", {
    method: "GET",
    accessToken
  });
}

export function createAdminCompanyRequest(
  accessToken: string,
  input: CreateCompanyInput
): Promise<AdminCompanySingleResponse> {
  return request<AdminCompanySingleResponse>("/admin/companies", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateAdminCompanyRequest(
  accessToken: string,
  companyId: string,
  input: UpdateCompanyInput
): Promise<AdminCompanySingleResponse> {
  return request<AdminCompanySingleResponse>(`/admin/companies/${companyId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteAdminCompanyRequest(
  accessToken: string,
  companyId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/admin/companies/${companyId}`, {
    method: "DELETE",
    accessToken
  });
}

export function createAdminUserRequest(
  accessToken: string,
  input: CreateAdminUserInput
): Promise<AdminUserSingleResponse> {
  return request<AdminUserSingleResponse>("/admin/users", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateAdminUserRequest(
  accessToken: string,
  userId: string,
  input: UpdateAdminUserInput
): Promise<AdminUserSingleResponse> {
  return request<AdminUserSingleResponse>(`/admin/users/${userId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function changeAdminUserRoleRequest(
  accessToken: string,
  userId: string,
  input: ChangeAdminUserRoleInput
): Promise<AdminUserSingleResponse> {
  return request<AdminUserSingleResponse>(`/admin/users/${userId}/role`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteAdminUserRequest(
  accessToken: string,
  userId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/admin/users/${userId}`, {
    method: "DELETE",
    accessToken
  });
}

export function resetAdminUserPasswordRequest(
  accessToken: string,
  userId: string,
  input: ResetAdminUserPasswordInput
): Promise<{ status: string }> {
  return request<{ status: string }>(`/admin/users/${userId}/password`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function listAuditLogsRequest(
  accessToken: string,
  query: AuditLogsQuery = {}
): Promise<AuditLogsResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  if (query.action) {
    params.set("action", query.action);
  }
  if (query.actorId) {
    params.set("actorId", query.actorId);
  }
  if (query.entityType) {
    params.set("entityType", query.entityType);
  }
  if (query.entityId) {
    params.set("entityId", query.entityId);
  }

  const suffix = params.toString();
  const path = suffix ? `/admin/audit-logs?${suffix}` : "/admin/audit-logs";

  return request<AuditLogsResponse>(path, {
    method: "GET",
    accessToken
  });
}

export function listActivityArticlesRequest(
  accessToken: string,
  activityCode: BusinessActivityCode
): Promise<ActivityArticleListResponse> {
  return request<ActivityArticleListResponse>(`/activities/${activityCode}/articles`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 15_000
  });
}

export function createActivityArticleRequest(
  accessToken: string,
  activityCode: BusinessActivityCode,
  input: {
    name: string;
    defaultMargin?: string;
    defaultPurchaseUnitPrice?: string;
  }
): Promise<ActivityArticleSingleResponse> {
  return request<ActivityArticleSingleResponse>(`/activities/${activityCode}/articles`, {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateActivityArticleRequest(
  accessToken: string,
  activityCode: BusinessActivityCode,
  articleId: string,
  input: {
    name: string;
    defaultMargin?: string;
    defaultPurchaseUnitPrice?: string;
  }
): Promise<ActivityArticleSingleResponse> {
  return request<ActivityArticleSingleResponse>(
    `/activities/${activityCode}/articles/${articleId}`,
    {
      method: "PATCH",
      body: input,
      accessToken
    }
  );
}

export function deleteActivityArticleRequest(
  accessToken: string,
  activityCode: BusinessActivityCode,
  articleId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/activities/${activityCode}/articles/${articleId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listRentalTenantsRequest(
  accessToken: string,
  query: { activeOnly?: boolean } = {}
): Promise<RentalTenantListResponse> {
  const params = new URLSearchParams();
  if (query.activeOnly) {
    params.set("activeOnly", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<RentalTenantListResponse>(`/rental/tenants${suffix}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function createRentalTenantRequest(
  accessToken: string,
  input: {
    name: string;
    unitLabel: string;
    monthlyRent: string;
    phone?: string;
    tenancyStart?: string;
  }
): Promise<RentalTenantSingleResponse> {
  return request<RentalTenantSingleResponse>("/rental/tenants", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateRentalTenantRequest(
  accessToken: string,
  tenantId: string,
  input: {
    name: string;
    unitLabel: string;
    monthlyRent: string;
    phone?: string;
    tenancyStart?: string;
    isActive?: boolean;
  }
): Promise<RentalTenantSingleResponse> {
  return request<RentalTenantSingleResponse>(`/rental/tenants/${tenantId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteRentalTenantRequest(
  accessToken: string,
  tenantId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/rental/tenants/${tenantId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listGeneralStoreShopsRequest(
  accessToken: string,
  query: { activeOnly?: boolean } = {}
): Promise<GeneralStoreShopListResponse> {
  const params = new URLSearchParams();
  if (query.activeOnly) {
    params.set("activeOnly", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<GeneralStoreShopListResponse>(`/general-store/shops${suffix}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function createGeneralStoreShopRequest(
  accessToken: string,
  input: {
    name: string;
    location?: string;
    phone?: string;
  }
): Promise<GeneralStoreShopSingleResponse> {
  return request<GeneralStoreShopSingleResponse>("/general-store/shops", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateGeneralStoreShopRequest(
  accessToken: string,
  shopId: string,
  input: {
    name: string;
    location?: string;
    phone?: string;
    isActive?: boolean;
  }
): Promise<GeneralStoreShopSingleResponse> {
  return request<GeneralStoreShopSingleResponse>(`/general-store/shops/${shopId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteGeneralStoreShopRequest(
  accessToken: string,
  shopId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/general-store/shops/${shopId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listBtpProjectsRequest(
  accessToken: string,
  query: { activeOnly?: boolean } = {}
): Promise<BtpProjectListResponse> {
  const params = new URLSearchParams();
  if (query.activeOnly) {
    params.set("activeOnly", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<BtpProjectListResponse>(`/btp/projects${suffix}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 10_000
  });
}

export function createBtpProjectRequest(
  accessToken: string,
  input: {
    name: string;
    clientRef?: string;
    contractRef?: string;
    location?: string;
  }
): Promise<BtpProjectSingleResponse> {
  return request<BtpProjectSingleResponse>("/btp/projects", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateBtpProjectRequest(
  accessToken: string,
  projectId: string,
  input: {
    name: string;
    clientRef?: string;
    contractRef?: string;
    location?: string;
    isActive?: boolean;
  }
): Promise<BtpProjectSingleResponse> {
  return request<BtpProjectSingleResponse>(`/btp/projects/${projectId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteBtpProjectRequest(
  accessToken: string,
  projectId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/btp/projects/${projectId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listDailyActivityCategoriesRequest(
  accessToken: string,
  query: { activeOnly?: boolean } = {}
): Promise<DailyActivityCategoryListResponse> {
  const params = new URLSearchParams();
  if (query.activeOnly) {
    params.set("activeOnly", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request<DailyActivityCategoryListResponse>(`/daily-activities/categories${suffix}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 15_000
  });
}

export function createDailyActivityCategoryRequest(
  accessToken: string,
  input: {
    name: string;
  }
): Promise<DailyActivityCategorySingleResponse> {
  return request<DailyActivityCategorySingleResponse>("/daily-activities/categories", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateDailyActivityCategoryRequest(
  accessToken: string,
  categoryId: string,
  input: {
    name: string;
    isActive?: boolean;
  }
): Promise<DailyActivityCategorySingleResponse> {
  return request<DailyActivityCategorySingleResponse>(`/daily-activities/categories/${categoryId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteDailyActivityCategoryRequest(
  accessToken: string,
  categoryId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/daily-activities/categories/${categoryId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listFinanceAccountsRequest(
  accessToken: string,
  query: {
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<FinancialAccountListResponse> {
  const params = new URLSearchParams();
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix ? `/finance/accounts?${suffix}` : "/finance/accounts";

  return request<FinancialAccountListResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function createFinanceAccountRequest(
  accessToken: string,
  input: {
    name: string;
    accountRef?: string;
    openingBalance?: string;
    scopeType?: "GLOBAL" | "DEDICATED" | "RESTRICTED";
    primaryActivityCode?: BusinessActivityCode;
    allowedActivityCodes?: BusinessActivityCode[];
  }
): Promise<FinancialAccountSingleResponse> {
  return request<FinancialAccountSingleResponse>("/finance/accounts", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateFinanceAccountRequest(
  accessToken: string,
  accountId: string,
  input: {
    name: string;
    accountRef?: string;
    openingBalance?: string;
    scopeType?: FinancialAccountScopeType;
    primaryActivityCode?: BusinessActivityCode;
    allowedActivityCodes?: BusinessActivityCode[];
  }
): Promise<FinancialAccountSingleResponse> {
  return request<FinancialAccountSingleResponse>(`/finance/accounts/${accountId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function listFinanceTransactionsRequest(
  accessToken: string,
  query: {
    search?: string;
    limit?: number;
    offset?: number;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    type?: "CASH_IN" | "CASH_OUT";
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<FinancialTransactionListResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.type) {
    params.set("type", query.type);
  }
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix ? `/finance/transactions?${suffix}` : "/finance/transactions";
  return request<FinancialTransactionListResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function getFinanceTransactionRequest(
  accessToken: string,
  transactionId: string
): Promise<FinancialTransactionSingleResponse> {
  return request<FinancialTransactionSingleResponse>(
    `/finance/transactions/${encodeURIComponent(transactionId)}`,
    { method: "GET", accessToken }
  );
}

export function getFinanceDumpTruckSummaryRequest(
  accessToken: string,
  period: string
): Promise<DumpTruckSummaryResponse> {
  const params = new URLSearchParams({ period });
  return request<DumpTruckSummaryResponse>(`/finance/dump-trucks/summary?${params.toString()}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function createFinanceTransactionRequest(
  accessToken: string,
  input: {
    accountId: string;
    type: "CASH_IN" | "CASH_OUT";
    amount: string;
    currency: string;
    activityCode: BusinessActivityCode;
    description?: string;
    metadata?: Record<string, string>;
    occurredAt?: string;
  }
): Promise<FinancialTransactionSingleResponse> {
  return request<FinancialTransactionSingleResponse>("/finance/transactions", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function getBeverageStockRequest(accessToken: string): Promise<{ items: BeverageProduct[] }> {
  return request("/finance/beverage-products", { accessToken });
}

export function countBeverageStockRequest(accessToken: string, productId: string, input: {
  expectedQuantity: string; countedQuantity: string; unitCost: string; reason: string;
}): Promise<{ status: string }> {
  return request(`/finance/beverage-products/${productId}/count`, { method: "POST", body: input, accessToken });
}

export function createBeverageProductRequest(accessToken: string, input: {
  name: string; unit: string; openingQuantity: string; openingUnitCost: string;
}): Promise<{ item: BeverageProduct }> {
  return request("/finance/beverage-products", { method: "POST", body: input, accessToken });
}

export function deleteFinanceAccountRequest(
  accessToken: string,
  accountId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/accounts/${accountId}`, {
    method: "DELETE",
    accessToken
  });
}

export function updateFinanceTransactionRequest(
  accessToken: string,
  transactionId: string,
  input: {
    accountId: string;
    type: "CASH_IN" | "CASH_OUT";
    amount: string;
    currency: string;
    activityCode: BusinessActivityCode;
    description?: string;
    metadata?: Record<string, string>;
    occurredAt?: string;
  }
): Promise<FinancialTransactionSingleResponse> {
  return request<FinancialTransactionSingleResponse>(`/finance/transactions/${transactionId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function listFinanceSalaryMembersRequest(
  accessToken: string
): Promise<SalaryMemberListResponse> {
  return request<SalaryMemberListResponse>("/finance/salary-members", {
    method: "GET",
    accessToken,
    cacheTtlMs: 15_000
  });
}

export function listFinanceSalariesRequest(
  accessToken: string,
  query: {
    limit?: number;
    offset?: number;
    status?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
    employeeUserId?: string;
    payPeriod?: string;
  } = {}
): Promise<SalaryTransactionListResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.employeeUserId) {
    params.set("employeeUserId", query.employeeUserId);
  }
  if (query.payPeriod) {
    params.set("payPeriod", query.payPeriod);
  }
  const suffix = params.toString();
  const path = suffix ? `/finance/salaries?${suffix}` : "/finance/salaries";

  return request<SalaryTransactionListResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function createFinanceSalaryRequest(
  accessToken: string,
  input: {
    accountId: string;
    employeeUserId: string;
    payPeriod: string;
    grossAmount: string;
    bonusAmount?: string;
    deductionAmount?: string;
    currency?: string;
    paymentMethod: SalaryPaymentMethod;
    note?: string;
    occurredAt: string;
  }
): Promise<SalaryTransactionSingleResponse> {
  return request<SalaryTransactionSingleResponse>("/finance/salaries", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateFinanceSalaryRequest(
  accessToken: string,
  transactionId: string,
  input: {
    accountId: string;
    employeeUserId: string;
    payPeriod: string;
    grossAmount: string;
    bonusAmount?: string;
    deductionAmount?: string;
    currency?: string;
    paymentMethod: SalaryPaymentMethod;
    note?: string;
    occurredAt: string;
  }
): Promise<SalaryTransactionSingleResponse> {
  return request<SalaryTransactionSingleResponse>(`/finance/salaries/${transactionId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteFinanceSalaryRequest(
  accessToken: string,
  transactionId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/salaries/${transactionId}`, {
    method: "DELETE",
    accessToken
  });
}

export function confirmFinanceSalaryReceiptRequest(
  accessToken: string,
  transactionId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/salaries/${transactionId}/confirm-receipt`, {
    method: "PATCH",
    accessToken
  });
}

export function getFinanceSalarySummaryRequest(
  accessToken: string,
  query: {
    payPeriod: string;
    employeeUserId?: string;
  }
): Promise<SalarySummaryResponse> {
  const params = new URLSearchParams();
  params.set("payPeriod", query.payPeriod);
  if (query.employeeUserId) {
    params.set("employeeUserId", query.employeeUserId);
  }
  return request<SalarySummaryResponse>(`/finance/salaries/summary?${params.toString()}`, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function downloadFinanceSalaryExportRequest(
  accessToken: string,
  format: "csv" | "xlsx",
  query: {
    payPeriod: string;
    employeeUserId?: string;
  }
): Promise<Blob> {
  const params = new URLSearchParams();
  params.set("payPeriod", query.payPeriod);
  if (query.employeeUserId) {
    params.set("employeeUserId", query.employeeUserId);
  }
  return download(
    `/finance/salaries/exports/monthly.${format}?${params.toString()}`,
    accessToken
  );
}

export function listFinanceTransactionProofsRequest(
  accessToken: string,
  transactionId: string
): Promise<TransactionProofListResponse> {
  return request<TransactionProofListResponse>(`/finance/transactions/${transactionId}/proofs`, {
    method: "GET",
    accessToken
  });
}

export function addFinanceTransactionProofRequest(
  accessToken: string,
  transactionId: string,
  input: {
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }
): Promise<TransactionProofListResponse> {
  return request<TransactionProofListResponse>(`/finance/transactions/${transactionId}/proofs`, {
    method: "POST",
    body: input,
    accessToken
  });
}

export function getFinanceProofUploadAuthRequest(
  accessToken: string,
  transactionId: string
): Promise<FinanceProofUploadAuthResponse> {
  return request<FinanceProofUploadAuthResponse>(
    `/finance/transactions/${transactionId}/proofs/upload-auth`,
    {
      method: "GET",
      accessToken
    }
  );
}

export function submitFinanceTransactionRequest(
  accessToken: string,
  transactionId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/transactions/${transactionId}/submit`, {
    method: "PATCH",
    accessToken
  });
}

export function reviewFinanceTransactionRequest(
  accessToken: string,
  transactionId: string,
  decision: "APPROVED" | "REJECTED"
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/transactions/${transactionId}/review`, {
    method: "PATCH",
    body: { decision },
    accessToken
  });
}

export function deleteFinanceTransactionRequest(
  accessToken: string,
  transactionId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/finance/transactions/${transactionId}`, {
    method: "DELETE",
    accessToken
  });
}

export function listOperationsTasksRequest(
  accessToken: string,
  query: {
    search?: string;
    limit?: number;
    offset?: number;
    status?: TaskStatus;
    activityCode?: BusinessActivityCode;
    scope?: TaskScope;
    unassignedOnly?: boolean;
  } = {}
): Promise<OperationTaskListResponse> {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  if (query.status) {
    params.set("status", query.status);
  }
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  if (query.scope) {
    params.set("scope", query.scope);
  }
  if (typeof query.unassignedOnly === "boolean") {
    params.set("unassignedOnly", query.unassignedOnly ? "true" : "false");
  }

  const suffix = params.toString();
  const path = suffix ? `/operations/tasks?${suffix}` : "/operations/tasks";
  return request<OperationTaskListResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 5_000
  });
}

export function createOperationsTaskRequest(
  accessToken: string,
  input: {
    title: string;
    description?: string;
    activityCode: BusinessActivityCode;
    assignedToId?: string;
    metadata?: Record<string, string>;
    dueDate?: string;
  }
): Promise<OperationTaskSingleResponse> {
  return request<OperationTaskSingleResponse>("/operations/tasks", {
    method: "POST",
    body: input,
    accessToken
  });
}

export function updateOperationsTaskRequest(
  accessToken: string,
  taskId: string,
  input: {
    title: string;
    description?: string;
    metadata?: Record<string, string>;
    dueDate?: string;
  }
): Promise<OperationTaskSingleResponse> {
  return request<OperationTaskSingleResponse>(`/operations/tasks/${taskId}`, {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function deleteOperationsTaskRequest(
  accessToken: string,
  taskId: string
): Promise<{ status: string }> {
  return request<{ status: string }>(`/operations/tasks/${taskId}`, {
    method: "DELETE",
    accessToken
  });
}

export function getOperationsTaskRequest(
  accessToken: string,
  taskId: string
): Promise<OperationTaskSingleResponse> {
  return request<OperationTaskSingleResponse>(`/operations/tasks/${taskId}`, {
    method: "GET",
    accessToken
  });
}

export function listOperationsMembersRequest(
  accessToken: string,
  query: {
    activityCode?: BusinessActivityCode;
  } = {}
): Promise<OperationTaskMembersResponse> {
  const params = new URLSearchParams();
  if (query.activityCode) {
    params.set("activityCode", query.activityCode);
  }
  const suffix = params.toString();
  const path = suffix ? `/operations/members?${suffix}` : "/operations/members";

  return request<OperationTaskMembersResponse>(path, {
    method: "GET",
    accessToken,
    cacheTtlMs: 15_000
  });
}

export function assignOperationsTaskRequest(
  accessToken: string,
  taskId: string,
  assignedToId: string | null,
  note?: string
): Promise<OperationTaskSingleResponse> {
  return request<OperationTaskSingleResponse>(`/operations/tasks/${taskId}/assign`, {
    method: "PATCH",
    body: { assignedToId, note },
    accessToken
  });
}

export function listOperationsTaskTimelineRequest(
  accessToken: string,
  taskId: string,
  query: { limit?: number; offset?: number } = {}
): Promise<OperationTaskTimelineResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  const suffix = params.toString();
  const path = suffix
    ? `/operations/tasks/${taskId}/timeline?${suffix}`
    : `/operations/tasks/${taskId}/timeline`;

  return request<OperationTaskTimelineResponse>(path, {
    method: "GET",
    accessToken
  });
}

export function listTaskCommentsRequest(
  accessToken: string,
  taskId: string,
  query: { limit?: number; offset?: number } = {}
): Promise<TaskCommentListResponse> {
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (typeof query.offset === "number") {
    params.set("offset", String(query.offset));
  }
  const suffix = params.toString();
  const path = suffix
    ? `/operations/tasks/${taskId}/comments?${suffix}`
    : `/operations/tasks/${taskId}/comments`;

  return request<TaskCommentListResponse>(path, {
    method: "GET",
    accessToken
  });
}

export function addTaskCommentRequest(
  accessToken: string,
  taskId: string,
  body: string
): Promise<TaskCommentSingleResponse> {
  return request<TaskCommentSingleResponse>(`/operations/tasks/${taskId}/comments`, {
    method: "POST",
    body: { body },
    accessToken
  });
}

export function listTaskAttachmentsRequest(
  accessToken: string,
  taskId: string
): Promise<TaskAttachmentListResponse> {
  return request<TaskAttachmentListResponse>(`/operations/tasks/${taskId}/attachments`, {
    method: "GET",
    accessToken
  });
}

export function addTaskAttachmentRequest(
  accessToken: string,
  taskId: string,
  input: {
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }
): Promise<TaskAttachmentListResponse> {
  return request<TaskAttachmentListResponse>(`/operations/tasks/${taskId}/attachments`, {
    method: "POST",
    body: input,
    accessToken
  });
}

export function getTaskAttachmentUploadAuthRequest(
  accessToken: string,
  taskId: string
): Promise<TaskAttachmentUploadAuthResponse> {
  return request<TaskAttachmentUploadAuthResponse>(
    `/operations/tasks/${taskId}/attachments/upload-auth`,
    {
      method: "GET",
      accessToken
    }
  );
}

export function assignOperationsTasksBulkRequest(
  accessToken: string,
  input: {
    taskIds: string[];
    assignedToId: string | null;
    note?: string;
  }
): Promise<OperationTaskListResponse> {
  return request<OperationTaskListResponse>("/operations/tasks/assign-bulk", {
    method: "PATCH",
    body: input,
    accessToken
  });
}

export function updateOperationsTaskStatusRequest(
  accessToken: string,
  taskId: string,
  status: TaskStatus
): Promise<OperationTaskSingleResponse> {
  return request<OperationTaskSingleResponse>(`/operations/tasks/${taskId}/status`, {
    method: "PATCH",
    body: { status },
    accessToken
  });
}

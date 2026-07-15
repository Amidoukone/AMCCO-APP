import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { EmptyState } from "../components/EmptyState";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import {
  buildPersistedViewStorageKey,
  usePersistedViewState
} from "../lib/usePersistedViewState";
import { matchesQuickSearch } from "../lib/quickSearch";
import {
  addFinanceTransactionProofRequest,
  ApiError,
  createFinanceAccountRequest,
  createFinanceTransactionRequest,
  deleteFinanceAccountRequest,
  deleteFinanceTransactionRequest,
  getFinanceProofUploadAuthRequest,
  listFinanceAccountsRequest,
  listFinanceTransactionProofsRequest,
  listFinanceTransactionsRequest,
  updateFinanceAccountRequest,
  updateFinanceTransactionRequest
} from "../lib/api";
import {
  BUSINESS_ACTIVITY_CODES,
  getBusinessActivityLabel,
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../config/businessActivities";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { ActivityFieldDefinition } from "../types/activities";
import type {
  FinancialAccount,
  FinancialAccountScopeType,
  FinancialTransaction,
  TransactionProof
} from "../types/finance";
import {
  formatAccountScopeLabel,
  getAccountGovernanceLines,
  getTransactionGovernanceLines
} from "../utils/governanceDisplay";

const EMPTY_METADATA_FIELDS: ActivityFieldDefinition[] = [];
const DEFAULT_ALLOWED_CURRENCIES = ["XOF"];
const TRANSACTIONS_PAGE_SIZE = 100;
const TRANSACTION_VISIBLE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_TRANSACTION_VISIBLE_PAGE_SIZE = 25;
const HARDWARE_OPERATION_KIND_KEY = "hardwareOperationKind";
type HardwareOperationKind = "GLOBAL" | "ITEM_ENTRY" | "ITEM_EXIT";
const HARDWARE_OPERATION_LABELS: Record<HardwareOperationKind, string> = {
  GLOBAL: "Transaction globale",
  ITEM_ENTRY: "Acquisition",
  ITEM_EXIT: "Vente"
};
const HARDWARE_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "dailyPayment",
  "paymentAmount"
]);
const HARDWARE_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "purchaseUnitPrice",
  "saleUnitPrice"
]);
const HARDWARE_COMMON_METADATA_FIELDS = new Set([
  "itemName",
  "quantity"
]);
const HARDWARE_CASH_IN_METADATA_FIELDS = new Set([
  ...HARDWARE_COMMON_METADATA_FIELDS,
  "saleUnitPrice",
  "dailyPayment"
]);
const HARDWARE_CASH_OUT_METADATA_FIELDS = new Set([
  ...HARDWARE_COMMON_METADATA_FIELDS,
  "purchaseUnitPrice",
  "supplierRef"
]);
const HARDWARE_METADATA_FIELDS = new Set([
  HARDWARE_OPERATION_KIND_KEY,
  "productFamily",
  "itemName",
  "quantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "dailyPayment",
  "paymentAmount",
  "supplierRef"
]);
const AGRICULTURE_OPERATION_KIND_KEY = "agricultureOperationKind";
type AgricultureOperationKind = "INPUT_PURCHASE" | "FIELD_EXPENSE" | "HARVEST_SALE" | "SUPPORT_INCOME";
const AGRICULTURE_OPERATION_LABELS: Record<AgricultureOperationKind, string> = {
  INPUT_PURCHASE: "Achat intrants",
  FIELD_EXPENSE: "Travaux champ",
  HARVEST_SALE: "Vente recolte",
  SUPPORT_INCOME: "Appui / subvention"
};
const AGRICULTURE_NUMERIC_METADATA_FIELDS = new Set([
  "surfaceArea",
  "quantity",
  "unitPrice"
]);
const AGRICULTURE_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "unitPrice"
]);
const AGRICULTURE_COMMON_METADATA_FIELDS = new Set([
  "campaignRef",
  "parcelRef",
  "fieldType",
  "cropType",
  "surfaceArea"
]);
const AGRICULTURE_INPUT_PURCHASE_METADATA_FIELDS = new Set([
  ...AGRICULTURE_COMMON_METADATA_FIELDS,
  "inputName",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef"
]);
const AGRICULTURE_FIELD_EXPENSE_METADATA_FIELDS = new Set([
  ...AGRICULTURE_COMMON_METADATA_FIELDS,
  "workType",
  "inputName",
  "quantity",
  "unit",
  "supplierRef"
]);
const AGRICULTURE_HARVEST_SALE_METADATA_FIELDS = new Set([
  ...AGRICULTURE_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "unitPrice",
  "buyerRef"
]);
const AGRICULTURE_SUPPORT_INCOME_METADATA_FIELDS = new Set([
  ...AGRICULTURE_COMMON_METADATA_FIELDS,
  "sourceRef"
]);
const AGRICULTURE_METADATA_FIELDS = new Set([
  AGRICULTURE_OPERATION_KIND_KEY,
  "campaignRef",
  "parcelRef",
  "fieldType",
  "cropType",
  "surfaceArea",
  "inputName",
  "workType",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef",
  "buyerRef",
  "sourceRef"
]);
const FISH_FARMING_OPERATION_KIND_KEY = "fishOperationKind";
type FishFarmingOperationKind =
  | "FINGERLING_PURCHASE"
  | "FEED_PURCHASE"
  | "POND_EXPENSE"
  | "FISH_SALE"
  | "SUPPORT_INCOME";
const FISH_FARMING_OPERATION_LABELS: Record<FishFarmingOperationKind, string> = {
  FINGERLING_PURCHASE: "Achat alevins",
  FEED_PURCHASE: "Achat aliment",
  POND_EXPENSE: "Charge bassin",
  FISH_SALE: "Vente poisson",
  SUPPORT_INCOME: "Appui / subvention"
};
const FISH_FARMING_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "unitPrice",
  "mortalityCount"
]);
const FISH_FARMING_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "unitPrice"
]);
const FISH_FARMING_COMMON_METADATA_FIELDS = new Set([
  "pondRef",
  "cycleRef",
  "species"
]);
const FISH_FARMING_FINGERLING_PURCHASE_METADATA_FIELDS = new Set([
  ...FISH_FARMING_COMMON_METADATA_FIELDS,
  "fingerlingBatchRef",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef"
]);
const FISH_FARMING_FEED_PURCHASE_METADATA_FIELDS = new Set([
  ...FISH_FARMING_COMMON_METADATA_FIELDS,
  "feedName",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef"
]);
const FISH_FARMING_POND_EXPENSE_METADATA_FIELDS = new Set([
  ...FISH_FARMING_COMMON_METADATA_FIELDS,
  "feedName",
  "quantity",
  "unit",
  "supplierRef",
  "mortalityCount",
  "waterQuality"
]);
const FISH_FARMING_FISH_SALE_METADATA_FIELDS = new Set([
  ...FISH_FARMING_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "unitPrice",
  "buyerRef"
]);
const FISH_FARMING_SUPPORT_INCOME_METADATA_FIELDS = new Set([
  ...FISH_FARMING_COMMON_METADATA_FIELDS,
  "sourceRef"
]);
const FISH_FARMING_METADATA_FIELDS = new Set([
  FISH_FARMING_OPERATION_KIND_KEY,
  "pondRef",
  "cycleRef",
  "species",
  "fingerlingBatchRef",
  "feedName",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef",
  "buyerRef",
  "sourceRef",
  "mortalityCount",
  "waterQuality"
]);
const LIVESTOCK_OPERATION_KIND_KEY = "livestockOperationKind";
type LivestockOperationKind =
  | "ANIMAL_PURCHASE"
  | "FEED_PURCHASE"
  | "VET_CARE"
  | "FARM_EXPENSE"
  | "ANIMAL_SALE"
  | "PRODUCT_SALE"
  | "SUPPORT_INCOME";
const LIVESTOCK_OPERATION_LABELS: Record<LivestockOperationKind, string> = {
  ANIMAL_PURCHASE: "Achat animaux",
  FEED_PURCHASE: "Achat aliment",
  VET_CARE: "Soins / vaccin",
  FARM_EXPENSE: "Charge elevage",
  ANIMAL_SALE: "Vente animaux",
  PRODUCT_SALE: "Vente produit",
  SUPPORT_INCOME: "Appui / subvention"
};
const LIVESTOCK_NUMERIC_METADATA_FIELDS = new Set([
  "animalCount",
  "feedQuantity",
  "productQuantity",
  "unitPrice",
  "mortalityCount"
]);
const LIVESTOCK_AMOUNT_METADATA_FIELDS = new Set([
  "animalCount",
  "feedQuantity",
  "productQuantity",
  "unitPrice"
]);
const LIVESTOCK_COMMON_METADATA_FIELDS = new Set([
  "herdRef",
  "batchRef",
  "species",
  "animalCategory"
]);
const LIVESTOCK_ANIMAL_PURCHASE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "animalCount",
  "unit",
  "unitPrice",
  "supplierRef"
]);
const LIVESTOCK_FEED_PURCHASE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "feedName",
  "feedQuantity",
  "unit",
  "unitPrice",
  "supplierRef"
]);
const LIVESTOCK_VET_CARE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "treatmentName",
  "animalCount",
  "unit",
  "supplierRef",
  "healthStatus"
]);
const LIVESTOCK_FARM_EXPENSE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "feedName",
  "feedQuantity",
  "unit",
  "supplierRef",
  "mortalityCount",
  "healthStatus"
]);
const LIVESTOCK_ANIMAL_SALE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "animalCount",
  "unit",
  "unitPrice",
  "buyerRef"
]);
const LIVESTOCK_PRODUCT_SALE_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "productName",
  "productQuantity",
  "unit",
  "unitPrice",
  "buyerRef"
]);
const LIVESTOCK_SUPPORT_INCOME_METADATA_FIELDS = new Set([
  ...LIVESTOCK_COMMON_METADATA_FIELDS,
  "sourceRef"
]);
const LIVESTOCK_METADATA_FIELDS = new Set([
  LIVESTOCK_OPERATION_KIND_KEY,
  "herdRef",
  "batchRef",
  "species",
  "animalCategory",
  "animalCount",
  "feedName",
  "feedQuantity",
  "productName",
  "productQuantity",
  "unit",
  "unitPrice",
  "treatmentName",
  "supplierRef",
  "buyerRef",
  "sourceRef",
  "mortalityCount",
  "healthStatus"
]);

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

function toAmountNumber(input: string): number {
  const normalized = Number.parseFloat(input.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeAmountForApi(input: string): string {
  return input.trim().replace(/\s/g, "").replace(",", ".");
}

function formatAmountForDisplay(input: string | number): string {
  const rawValue = typeof input === "number" ? String(input) : input.trim();
  if (!rawValue) {
    return "";
  }
  const normalized = rawValue.replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    return rawValue;
  }
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
    .format(amount)
    .replace(/[\u202f\u00a0]/g, " ");
}

function formatAmountForInput(input: string): string {
  return formatAmountForDisplay(input);
}

function isMoneyMetadataField(key: string): boolean {
  return (
    key === "purchaseUnitPrice" ||
    key === "saleUnitPrice" ||
    key === "dailyPayment" ||
    key === "paymentAmount" ||
    key === "unitPrice"
  );
}

function deriveHardwareAmount(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): string | null {
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = type === "CASH_IN"
    ? toAmountNumber(metadata.saleUnitPrice ?? "")
    : toAmountNumber(metadata.purchaseUnitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

function deriveAgricultureAmount(
  operationKind: AgricultureOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind !== "INPUT_PURCHASE" && operationKind !== "HARVEST_SALE") {
    return null;
  }
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

function deriveFishFarmingAmount(
  operationKind: FishFarmingOperationKind,
  metadata: Record<string, string>
): string | null {
  if (
    operationKind !== "FINGERLING_PURCHASE" &&
    operationKind !== "FEED_PURCHASE" &&
    operationKind !== "FISH_SALE"
  ) {
    return null;
  }
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

function deriveLivestockAmount(
  operationKind: LivestockOperationKind,
  metadata: Record<string, string>
): string | null {
  if (
    operationKind !== "ANIMAL_PURCHASE" &&
    operationKind !== "FEED_PURCHASE" &&
    operationKind !== "ANIMAL_SALE" &&
    operationKind !== "PRODUCT_SALE"
  ) {
    return null;
  }
  const quantity = operationKind === "FEED_PURCHASE"
    ? toAmountNumber(metadata.feedQuantity ?? "")
    : operationKind === "PRODUCT_SALE"
      ? toAmountNumber(metadata.productQuantity ?? "")
      : toAmountNumber(metadata.animalCount ?? "");
  const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

function getMetadataInputMode(fieldKey: string): "decimal" | "text" {
  return HARDWARE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    AGRICULTURE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    FISH_FARMING_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    LIVESTOCK_NUMERIC_METADATA_FIELDS.has(fieldKey)
    ? "decimal"
    : "text";
}

function shouldDeriveHardwareAmount(fieldKey: string): boolean {
  return HARDWARE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveAgricultureAmount(fieldKey: string): boolean {
  return AGRICULTURE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveFishFarmingAmount(fieldKey: string): boolean {
  return FISH_FARMING_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveLivestockAmount(fieldKey: string): boolean {
  return LIVESTOCK_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function getDefaultTransactionType(
  activityCode: BusinessActivityCode | null
): "CASH_IN" | "CASH_OUT" {
  return activityCode === "HARDWARE" ? "CASH_IN" : "CASH_OUT";
}

function isHardwareOperationKind(value: string | undefined): value is HardwareOperationKind {
  return value === "GLOBAL" || value === "ITEM_ENTRY" || value === "ITEM_EXIT";
}

function hasHardwareItemMetadata(metadata: Record<string, string>): boolean {
  return [
    "itemName",
    "quantity",
    "purchaseUnitPrice",
    "saleUnitPrice",
    "dailyPayment",
    "supplierRef"
  ].some((key) => metadata[key]?.trim());
}

function getHardwareOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): HardwareOperationKind {
  const configuredKind = metadata[HARDWARE_OPERATION_KIND_KEY]?.trim();
  if (isHardwareOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasHardwareItemMetadata(metadata)) {
    return "GLOBAL";
  }
  return type === "CASH_OUT" ? "ITEM_ENTRY" : "ITEM_EXIT";
}

function getHardwareOperationType(kind: HardwareOperationKind): "CASH_IN" | "CASH_OUT" | null {
  if (kind === "ITEM_ENTRY") {
    return "CASH_OUT";
  }
  if (kind === "ITEM_EXIT") {
    return "CASH_IN";
  }
  return null;
}

function isAgricultureOperationKind(value: string | undefined): value is AgricultureOperationKind {
  return (
    value === "INPUT_PURCHASE" ||
    value === "FIELD_EXPENSE" ||
    value === "HARVEST_SALE" ||
    value === "SUPPORT_INCOME"
  );
}

function hasAgricultureMetadata(metadata: Record<string, string>): boolean {
  return [
    "campaignRef",
    "parcelRef",
    "fieldType",
    "cropType",
    "surfaceArea",
    "inputName",
    "workType",
    "quantity",
    "unitPrice",
    "supplierRef",
    "buyerRef",
    "sourceRef"
  ].some((key) => metadata[key]?.trim());
}

function getAgricultureOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): AgricultureOperationKind {
  const configuredKind = metadata[AGRICULTURE_OPERATION_KIND_KEY]?.trim();
  if (isAgricultureOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasAgricultureMetadata(metadata)) {
    return "INPUT_PURCHASE";
  }
  return type === "CASH_IN" ? "HARVEST_SALE" : "FIELD_EXPENSE";
}

function getAgricultureOperationType(kind: AgricultureOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "HARVEST_SALE" || kind === "SUPPORT_INCOME" ? "CASH_IN" : "CASH_OUT";
}

function getAgricultureVisibleKeys(kind: AgricultureOperationKind): Set<string> {
  if (kind === "INPUT_PURCHASE") {
    return AGRICULTURE_INPUT_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "FIELD_EXPENSE") {
    return AGRICULTURE_FIELD_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "HARVEST_SALE") {
    return AGRICULTURE_HARVEST_SALE_METADATA_FIELDS;
  }
  return AGRICULTURE_SUPPORT_INCOME_METADATA_FIELDS;
}

function isFishFarmingOperationKind(value: string | undefined): value is FishFarmingOperationKind {
  return (
    value === "FINGERLING_PURCHASE" ||
    value === "FEED_PURCHASE" ||
    value === "POND_EXPENSE" ||
    value === "FISH_SALE" ||
    value === "SUPPORT_INCOME"
  );
}

function hasFishFarmingMetadata(metadata: Record<string, string>): boolean {
  return [
    "pondRef",
    "cycleRef",
    "species",
    "fingerlingBatchRef",
    "feedName",
    "quantity",
    "unitPrice",
    "supplierRef",
    "buyerRef",
    "sourceRef",
    "mortalityCount",
    "waterQuality"
  ].some((key) => metadata[key]?.trim());
}

function getFishFarmingOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): FishFarmingOperationKind {
  const configuredKind = metadata[FISH_FARMING_OPERATION_KIND_KEY]?.trim();
  if (isFishFarmingOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasFishFarmingMetadata(metadata)) {
    return "FINGERLING_PURCHASE";
  }
  return type === "CASH_IN" ? "FISH_SALE" : "POND_EXPENSE";
}

function getFishFarmingOperationType(kind: FishFarmingOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "FISH_SALE" || kind === "SUPPORT_INCOME" ? "CASH_IN" : "CASH_OUT";
}

function getFishFarmingVisibleKeys(kind: FishFarmingOperationKind): Set<string> {
  if (kind === "FINGERLING_PURCHASE") {
    return FISH_FARMING_FINGERLING_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "FEED_PURCHASE") {
    return FISH_FARMING_FEED_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "POND_EXPENSE") {
    return FISH_FARMING_POND_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "FISH_SALE") {
    return FISH_FARMING_FISH_SALE_METADATA_FIELDS;
  }
  return FISH_FARMING_SUPPORT_INCOME_METADATA_FIELDS;
}

function isLivestockOperationKind(value: string | undefined): value is LivestockOperationKind {
  return (
    value === "ANIMAL_PURCHASE" ||
    value === "FEED_PURCHASE" ||
    value === "VET_CARE" ||
    value === "FARM_EXPENSE" ||
    value === "ANIMAL_SALE" ||
    value === "PRODUCT_SALE" ||
    value === "SUPPORT_INCOME"
  );
}

function hasLivestockMetadata(metadata: Record<string, string>): boolean {
  return [
    "herdRef",
    "batchRef",
    "species",
    "animalCategory",
    "animalCount",
    "feedName",
    "feedQuantity",
    "productName",
    "productQuantity",
    "unitPrice",
    "treatmentName",
    "supplierRef",
    "buyerRef",
    "sourceRef",
    "mortalityCount",
    "healthStatus"
  ].some((key) => metadata[key]?.trim());
}

function getLivestockOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): LivestockOperationKind {
  const configuredKind = metadata[LIVESTOCK_OPERATION_KIND_KEY]?.trim();
  if (isLivestockOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasLivestockMetadata(metadata)) {
    return "ANIMAL_PURCHASE";
  }
  return type === "CASH_IN" ? "ANIMAL_SALE" : "FARM_EXPENSE";
}

function getLivestockOperationType(kind: LivestockOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "ANIMAL_SALE" || kind === "PRODUCT_SALE" || kind === "SUPPORT_INCOME"
    ? "CASH_IN"
    : "CASH_OUT";
}

function getLivestockVisibleKeys(kind: LivestockOperationKind): Set<string> {
  if (kind === "ANIMAL_PURCHASE") {
    return LIVESTOCK_ANIMAL_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "FEED_PURCHASE") {
    return LIVESTOCK_FEED_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "VET_CARE") {
    return LIVESTOCK_VET_CARE_METADATA_FIELDS;
  }
  if (kind === "FARM_EXPENSE") {
    return LIVESTOCK_FARM_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "ANIMAL_SALE") {
    return LIVESTOCK_ANIMAL_SALE_METADATA_FIELDS;
  }
  if (kind === "PRODUCT_SALE") {
    return LIVESTOCK_PRODUCT_SALE_METADATA_FIELDS;
  }
  return LIVESTOCK_SUPPORT_INCOME_METADATA_FIELDS;
}

function getVisibleFinanceMetadataFields(
  activityCode: BusinessActivityCode | null,
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): ActivityFieldDefinition[] {
  if (activityCode === "LIVESTOCK") {
    const operationKind = getLivestockOperationKind(type, metadata);
    const visibleKeys = getLivestockVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "FISH_FARMING") {
    const operationKind = getFishFarmingOperationKind(type, metadata);
    const visibleKeys = getFishFarmingVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "AGRICULTURE") {
    const operationKind = getAgricultureOperationKind(type, metadata);
    const visibleKeys = getAgricultureVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode !== "HARDWARE") {
    return fields;
  }

  const operationKind = getHardwareOperationKind(type, metadata);
  const visibleKeys =
    operationKind === "ITEM_EXIT"
      ? HARDWARE_CASH_IN_METADATA_FIELDS
      : operationKind === "ITEM_ENTRY"
        ? HARDWARE_CASH_OUT_METADATA_FIELDS
        : new Set<string>();
  return fields.filter((field) => visibleKeys.has(field.key));
}

function cleanSectorFinanceMetadata(
  activityCode: BusinessActivityCode | null,
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): Record<string, string> {
  if (activityCode === "LIVESTOCK") {
    const operationKind = getLivestockOperationKind(type, metadata);
    const visibleKeys = getLivestockVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [LIVESTOCK_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        LIVESTOCK_METADATA_FIELDS.has(key) &&
        key !== LIVESTOCK_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "FISH_FARMING") {
    const operationKind = getFishFarmingOperationKind(type, metadata);
    const visibleKeys = getFishFarmingVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [FISH_FARMING_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        FISH_FARMING_METADATA_FIELDS.has(key) &&
        key !== FISH_FARMING_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "AGRICULTURE") {
    const operationKind = getAgricultureOperationKind(type, metadata);
    const visibleKeys = getAgricultureVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [AGRICULTURE_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        AGRICULTURE_METADATA_FIELDS.has(key) &&
        key !== AGRICULTURE_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode !== "HARDWARE") {
    return metadata;
  }

  const operationKind = getHardwareOperationKind(type, metadata);
  const visibleKeys =
    operationKind === "ITEM_EXIT"
      ? HARDWARE_CASH_IN_METADATA_FIELDS
      : operationKind === "ITEM_ENTRY"
        ? HARDWARE_CASH_OUT_METADATA_FIELDS
        : new Set<string>();

  return Object.fromEntries(
    Object.entries({
      ...metadata,
      [HARDWARE_OPERATION_KIND_KEY]: operationKind
    }).map(([key, value]) => [
      key,
      HARDWARE_METADATA_FIELDS.has(key) &&
      key !== HARDWARE_OPERATION_KIND_KEY &&
      !visibleKeys.has(key)
        ? ""
        : value
    ])
  );
}

function deriveSectorAmount(
  activityCode: BusinessActivityCode | null,
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): string | null {
  if (activityCode === "HARDWARE") {
    return deriveHardwareAmount(type, metadata);
  }
  if (activityCode === "AGRICULTURE") {
    return deriveAgricultureAmount(getAgricultureOperationKind(type, metadata), metadata);
  }
  if (activityCode === "FISH_FARMING") {
    return deriveFishFarmingAmount(getFishFarmingOperationKind(type, metadata), metadata);
  }
  if (activityCode === "LIVESTOCK") {
    return deriveLivestockAmount(getLivestockOperationKind(type, metadata), metadata);
  }
  return null;
}

function getHardwareFormModeLabel(kind: HardwareOperationKind): string {
  return kind === "ITEM_EXIT"
    ? "Vente: renseignez la quantite, le prix de vente et le versement."
    : kind === "ITEM_ENTRY"
      ? "Acquisition: renseignez la quantite, le prix d'achat et le fournisseur."
      : "Transaction globale: renseignez seulement le montant et la description utile.";
}

function getAgricultureFormModeLabel(kind: AgricultureOperationKind): string {
  if (kind === "INPUT_PURCHASE") {
    return "Achat intrants: campagne, parcelle, type de champ, intrant, quantite et prix unitaire.";
  }
  if (kind === "FIELD_EXPENSE") {
    return "Travaux champ: campagne, parcelle, surface et nature des travaux agricoles.";
  }
  if (kind === "HARVEST_SALE") {
    return "Vente recolte: culture, quantite vendue, prix unitaire et acheteur.";
  }
  return "Appui / subvention: campagne, parcelle et source de financement.";
}

function getFishFarmingFormModeLabel(kind: FishFarmingOperationKind): string {
  if (kind === "FINGERLING_PURCHASE") {
    return "Achat alevins: bassin, cycle, lot, quantite et prix unitaire.";
  }
  if (kind === "FEED_PURCHASE") {
    return "Achat aliment: bassin, cycle, aliment, quantite, unite et fournisseur.";
  }
  if (kind === "POND_EXPENSE") {
    return "Charge bassin: intervention, intrant, mortalite ou qualite d'eau si applicable.";
  }
  if (kind === "FISH_SALE") {
    return "Vente poisson: bassin, cycle, quantite vendue, prix unitaire et acheteur.";
  }
  return "Appui / subvention: bassin, cycle et source de financement.";
}

function getLivestockFormModeLabel(kind: LivestockOperationKind): string {
  if (kind === "ANIMAL_PURCHASE") {
    return "Achat animaux: troupeau, lot, espece, nombre d'animaux et prix unitaire.";
  }
  if (kind === "FEED_PURCHASE") {
    return "Achat aliment: troupeau, lot, aliment, quantite, unite et fournisseur.";
  }
  if (kind === "VET_CARE") {
    return "Soins / vaccin: troupeau, lot, soin, animaux concernes et etat sanitaire.";
  }
  if (kind === "FARM_EXPENSE") {
    return "Charge elevage: alimentation, intrant, mortalite ou observation sanitaire si applicable.";
  }
  if (kind === "ANIMAL_SALE") {
    return "Vente animaux: troupeau, lot, nombre vendu, prix unitaire et acheteur.";
  }
  if (kind === "PRODUCT_SALE") {
    return "Vente produit: produit d'elevage, quantite vendue, prix unitaire et acheteur.";
  }
  return "Appui / subvention: troupeau, lot et source de financement.";
}

function toDateTimeLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, previous[field.key] ?? ""]));
}

function sameStringRecord(
  left: Record<string, string>,
  right: Record<string, string>
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right[key] === value);
}

function sameActivityCodeArray(
  left: BusinessActivityCode[],
  right: BusinessActivityCode[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameAccountForm(
  left: ReturnType<typeof buildDefaultAccountForm>,
  right: ReturnType<typeof buildDefaultAccountForm>
): boolean {
  return (
    left.name === right.name &&
    left.accountRef === right.accountRef &&
    left.openingBalance === right.openingBalance &&
    left.scopeType === right.scopeType &&
    left.primaryActivityCode === right.primaryActivityCode &&
    sameActivityCodeArray(left.allowedActivityCodes, right.allowedActivityCodes)
  );
}

function getLockedAccountMessage(account: FinancialAccount): string | null {
  if (account.transactionsCount > 0) {
    return "Ce compte financier est déjà utilisé par des transactions et ne peut pas être supprimé.";
  }

  return null;
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

function formatMetadataValue(key: string, value: string): string {
  if (key === HARDWARE_OPERATION_KIND_KEY && isHardwareOperationKind(value)) {
    return HARDWARE_OPERATION_LABELS[value];
  }
  if (key === AGRICULTURE_OPERATION_KIND_KEY && isAgricultureOperationKind(value)) {
    return AGRICULTURE_OPERATION_LABELS[value];
  }
  if (key === FISH_FARMING_OPERATION_KIND_KEY && isFishFarmingOperationKind(value)) {
    return FISH_FARMING_OPERATION_LABELS[value];
  }
  if (key === LIVESTOCK_OPERATION_KIND_KEY && isLivestockOperationKind(value)) {
    return LIVESTOCK_OPERATION_LABELS[value];
  }
  if (isMoneyMetadataField(key)) {
    return formatAmountForDisplay(value);
  }
  return value;
}

function buildDefaultAccountForm(
  selectedActivityCode: BusinessActivityCode | null,
  canManageGlobalAccounts: boolean
): {
  name: string;
  accountRef: string;
  openingBalance: string;
  scopeType: FinancialAccountScopeType;
  primaryActivityCode: BusinessActivityCode | "";
  allowedActivityCodes: BusinessActivityCode[];
} {
  const scopeType: FinancialAccountScopeType = canManageGlobalAccounts
    ? "GLOBAL"
    : selectedActivityCode
      ? "DEDICATED"
      : "RESTRICTED";

  return {
    name: "",
    accountRef: "",
    openingBalance: "0.00",
    scopeType,
    primaryActivityCode: selectedActivityCode ?? "",
    allowedActivityCodes: selectedActivityCode ? [selectedActivityCode] : []
  };
}

function normalizeAccountFormForActivities(
  previous: ReturnType<typeof buildDefaultAccountForm>,
  enabledActivityCodes: BusinessActivityCode[],
  selectedActivityCode: BusinessActivityCode | null
) {
  const nextPrimaryActivityCode =
    previous.primaryActivityCode && enabledActivityCodes.includes(previous.primaryActivityCode)
      ? previous.primaryActivityCode
      : (selectedActivityCode ?? enabledActivityCodes[0] ?? "");
  const nextAllowedActivityCodes = previous.allowedActivityCodes.filter((activityCode) =>
    enabledActivityCodes.includes(activityCode)
  );

  return {
    ...previous,
    primaryActivityCode: nextPrimaryActivityCode,
    allowedActivityCodes:
      nextAllowedActivityCodes.length > 0
        ? nextAllowedActivityCodes
        : selectedActivityCode
          ? [selectedActivityCode]
          : nextAllowedActivityCodes
  };
}

function isAccountVisibleForSelectedActivity(
  account: FinancialAccount,
  activityCode: BusinessActivityCode | null
): boolean {
  if (!activityCode) {
    return true;
  }

  return (
    account.scopeType === "GLOBAL" ||
    account.primaryActivityCode === activityCode ||
    account.allowedActivityCodes.includes(activityCode)
  );
}

export function FinanceTransactionsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeCompany, user } = useAuth();
  const withAuthorizedToken = useAuthorizedRequest();
  const {
    enabledActivities,
    isLoading: isLoadingActivities,
    selectedActivity,
    selectedActivityCode,
    selectedProfile,
    setSelectedActivityCode
  } = useBusinessActivity();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
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
    return user?.role === "SYS_ADMIN" || user?.role === "ACCOUNTANT";
  }, [user?.role]);

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
        status: "ALL" as "ALL" | FinancialTransaction["status"],
        type: "ALL" as "ALL" | FinancialTransaction["type"]
      }),
    []
  );
  const [filters, setFilters] = usePersistedViewState(transactionsViewStorageKey, initialFilters);
  const [searchQuery, setSearchQuery] = usePersistedViewState(transactionsSearchStorageKey, "");
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
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);

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
  const agricultureOperationKind = selectedActivityCode === "AGRICULTURE"
    ? getAgricultureOperationKind(transactionForm.type, transactionForm.metadata)
    : "INPUT_PURCHASE";
  const fishFarmingOperationKind = selectedActivityCode === "FISH_FARMING"
    ? getFishFarmingOperationKind(transactionForm.type, transactionForm.metadata)
    : "FINGERLING_PURCHASE";
  const livestockOperationKind = selectedActivityCode === "LIVESTOCK"
    ? getLivestockOperationKind(transactionForm.type, transactionForm.metadata)
    : "ANIMAL_PURCHASE";
  const hasRequiredFinanceDetails = Boolean(
    selectedProfile?.finance.requiresDescription ||
      visibleFinanceMetadataFields.some((field) => field.required) ||
      selectedActivityCode === "HARDWARE" ||
      selectedActivityCode === "AGRICULTURE" ||
      selectedActivityCode === "FISH_FARMING" ||
      selectedActivityCode === "LIVESTOCK"
  );
  const allowedCurrencies = selectedProfile?.finance.allowedCurrencies ?? DEFAULT_ALLOWED_CURRENCIES;
  const enabledActivityCodes = useMemo(
    () => enabledActivities.map((item) => item.code),
    [enabledActivities]
  );
  const requestedTransactionId = searchParams.get("transactionId");
  const requestedActivityCode = useMemo(() => {
    const activityCode = searchParams.get("activityCode");
    return activityCode && isBusinessActivityCode(activityCode) ? activityCode : null;
  }, [searchParams]);

  const selectedTransaction = useMemo(
    () => transactions.find((item) => item.id === selectedTransactionId) ?? null,
    [selectedTransactionId, transactions]
  );
  const displayTransactions = useMemo(() => {
    return transactions.filter((item) =>
      matchesQuickSearch(searchQuery, [
        item.accountName,
        item.accountRef,
        item.description,
        item.createdByEmail,
        item.validatedByEmail,
        item.amount,
        item.currency,
        item.type === "CASH_IN" ? "Entree" : "Sortie",
        item.activityCode ? getBusinessActivityLabel(item.activityCode) : "Charge transversale entreprise",
        ...Object.values(item.metadata)
      ])
    );
  }, [searchQuery, transactions]);
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
    setAccountForm(buildDefaultAccountForm(selectedActivityCode, canManageGlobalAccounts));
  }, [canManageGlobalAccounts, selectedActivityCode]);

  const resetTransactionForm = useCallback(() => {
    setEditingTransactionId(null);
    setTransactionProofFile(null);
    setTransactionForm({
      accountId: accounts[0]?.id ?? "",
      type: getDefaultTransactionType(selectedActivityCode),
      amount: "",
      currency: allowedCurrencies[0] ?? "XOF",
      description: "",
      metadata: syncMetadataState({}, financeMetadataFields),
      occurredAt: ""
    });
  }, [accounts, allowedCurrencies, financeMetadataFields, selectedActivityCode]);

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

  const handleOpenTransactionDetails = useCallback(
    (transactionId: string, activityCode: BusinessActivityCode | null) => {
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

  const handleCloseTransactionDetails = useCallback(() => {
    setSelectedTransactionId(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("transactionId");
      next.delete("activityCode");
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    if (requestedActivityCode) {
      setSelectedActivityCode(requestedActivityCode);
    }
  }, [requestedActivityCode, setSelectedActivityCode]);

  useEffect(() => {
    if (!requestedTransactionId) {
      setSelectedTransactionId(null);
      return;
    }

    setSelectedTransactionId(requestedTransactionId);
  }, [requestedTransactionId]);

  useEffect(() => {
    setVisibleTransactionsPage(1);
  }, [searchQuery, filters.status, filters.type, selectedActivityCode]);

  useEffect(() => {
    setVisibleTransactionsPage((previousPage) =>
      previousPage > totalVisibleTransactionPages ? totalVisibleTransactionPages : previousPage
    );
  }, [totalVisibleTransactionPages]);

  const loadData = useCallback(async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append === true;
    if (append) {
      setIsLoadingMoreTransactions(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const payload = await withAuthorizedToken(async (accessToken) => {
        if (!selectedActivityCode) {
          return {
            accounts: [] as FinancialAccount[],
            transactions: [] as FinancialTransaction[]
          };
        }

        return Promise.all([
          listFinanceAccountsRequest(accessToken, {
            activityCode: selectedActivityCode
          }),
          listFinanceTransactionsRequest(accessToken, {
            limit: TRANSACTIONS_PAGE_SIZE,
            offset,
            status: filters.status === "ALL" ? undefined : filters.status,
            type: filters.type === "ALL" ? undefined : filters.type,
            activityCode: selectedActivityCode
          })
        ]).then(([accountsResp, transactionsResp]) => ({
          accounts: accountsResp.items,
          transactions: transactionsResp.items
        }));
      });
      setHasMoreTransactions(payload.transactions.length === TRANSACTIONS_PAGE_SIZE);
      setAccounts(payload.accounts);
      setTransactions((prev) => {
        if (!append) {
          return payload.transactions;
        }
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...payload.transactions.filter((item) => !seen.has(item.id))];
      });
      if (!append) {
        setEditingAccountId((prev) => (prev && payload.accounts.some((item) => item.id === prev) ? prev : null));
        setEditingTransactionId((prev) =>
          prev && payload.transactions.some((item) => item.id === prev) ? prev : null
        );
        setSelectedTransactionId((prev) => {
          if (requestedTransactionId) {
            return payload.transactions.some((item) => item.id === requestedTransactionId)
              ? requestedTransactionId
              : null;
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
      setTransactionForm((prev) => ({
        ...prev,
        accountId:
          payload.accounts.some((account) => account.id === prev.accountId)
            ? prev.accountId
            : (payload.accounts[0]?.id ?? "")
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (append) {
        setIsLoadingMoreTransactions(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [filters.status, filters.type, requestedTransactionId, selectedActivityCode, withAuthorizedToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleLoadMoreTransactions(): Promise<void> {
    if (isLoading || isLoadingMoreTransactions || !hasMoreTransactions) {
      return;
    }
    await loadData({
      offset: transactions.length,
      append: true
    });
  }

  function renderVisibleTransactionsPagination(): JSX.Element | null {
    if (displayTransactions.length === 0) {
      return null;
    }

    return (
      <div className="list-pagination finance-transactions-pagination">
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
  }, [allowedCurrencies, financeMetadataFields]);

  useEffect(() => {
    setTransactionForm((prev) => {
      if (editingTransactionId) {
        return prev;
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
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const payload = {
          name: accountForm.name.trim(),
          accountRef: accountForm.accountRef.trim() || undefined,
          openingBalance: normalizeAmountForApi(accountForm.openingBalance)
        };

        return editingAccountId
          ? updateFinanceAccountRequest(accessToken, editingAccountId, payload)
          : createFinanceAccountRequest(accessToken, payload);
      });
      setSuccessMessage(
        editingAccountId ? "Compte financier modifié." : "Compte financier créé."
      );
      resetAccountForm();
      await loadData();
      setTransactionForm((prev) => ({
        ...prev,
        accountId: response.item.id
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  function handleStartEditAccount(account: FinancialAccount): void {
    const lockedMessage = getLockedAccountMessage(account);
    if (lockedMessage) {
      setErrorMessage(lockedMessage);
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingAccountId(account.id);
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
    if (!accountPendingDelete) {
      return;
    }

    const account = accountPendingDelete;
    setBusyAccountId(account.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) => deleteFinanceAccountRequest(accessToken, account.id));
      if (editingAccountId === account.id) {
        resetAccountForm();
      }
      setSuccessMessage("Compte financier supprimé.");
      setAccountPendingDelete(null);
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyAccountId(null);
    }
  }

  async function handleSaveTransaction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedActivityCode) {
      return;
    }
    const proofFileToUpload = transactionProofFile;
    const transactionSavedLabel = editingTransactionId
      ? "Transaction modifiée"
      : "Transaction enregistrée";
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSavingTransaction(true);

    try {
      const response = await withAuthorizedToken((accessToken) => {
        const metadata = cleanSectorFinanceMetadata(
          selectedActivityCode,
          transactionForm.type,
          transactionForm.metadata
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
      let proofUploadError: string | null = null;
      if (proofFileToUpload) {
        setBusyTransactionId(response.item.id);
        try {
          const proofItems = await uploadTransactionProof(response.item.id, proofFileToUpload);
          setProofsByTransaction((prev) => ({
            ...prev,
            [response.item.id]: proofItems
          }));
          setOpenProofs((prev) => ({
            ...prev,
            [response.item.id]: true
          }));
        } catch (error) {
          proofUploadError = toErrorMessage(error);
        } finally {
          setBusyTransactionId(null);
        }
      }
      handleOpenTransactionDetails(response.item.id, response.item.activityCode);
      setSuccessMessage(
        editingTransactionId ? "Transaction modifiée." : "Transaction enregistrée."
      );
      resetTransactionForm();
      await loadData();
      if (proofUploadError) {
        setErrorMessage(
          `${transactionSavedLabel}, mais la preuve n'a pas pu être ajoutée. ${proofUploadError}`
        );
        setSuccessMessage(`${transactionSavedLabel}. Vous pouvez réessayer depuis le détail.`);
        return;
      }
      if (proofFileToUpload) {
        setSuccessMessage(
          editingTransactionId
            ? "Transaction modifiée et preuve ajoutée."
            : "Transaction enregistrée avec preuve."
        );
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSavingTransaction(false);
    }
  }

  function handleStartEditTransaction(transaction: FinancialTransaction): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    setTransactionProofFile(null);
    setEditingTransactionId(transaction.id);
    setTransactionForm({
      accountId: transaction.accountId,
      type: transaction.type,
      amount: formatAmountForInput(transaction.amount),
      currency: transaction.currency,
      description: transaction.description ?? "",
      metadata: syncMetadataState(transaction.metadata, financeMetadataFields),
      occurredAt: toDateTimeLocalInput(transaction.occurredAt)
    });
    handleOpenTransactionDetails(transaction.id, transaction.activityCode);
  }

  function handleCancelEditTransaction(): void {
    setErrorMessage(null);
    setSuccessMessage(null);
    resetTransactionForm();
  }

  async function handleDeleteTransaction(transaction: FinancialTransaction): Promise<void> {
    const isApproved = transaction.status === "APPROVED";
    const confirmationMessage = isApproved
      ? "Cette transaction est déjà approuvée. Confirmer sa suppression définitive ?"
      : "Confirmer la suppression de cette transaction ?";

    setTransactionPendingDelete(transaction);
    return;

    setBusyTransactionId(transaction.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteFinanceTransactionRequest(accessToken, transaction.id)
      );
      if (selectedTransactionId === transaction.id) {
        handleCloseTransactionDetails();
      }
      if (editingTransactionId === transaction.id) {
        resetTransactionForm();
      }
      setSuccessMessage(
        isApproved
          ? "Transaction approuvée supprimée par l'admin système."
          : "Transaction supprimée."
      );
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleConfirmDeleteTransaction(): Promise<void> {
    if (!transactionPendingDelete) {
      return;
    }

    const transaction = transactionPendingDelete;
    const isApproved = transaction.status === "APPROVED";
    setBusyTransactionId(transaction.id);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await withAuthorizedToken((accessToken) =>
        deleteFinanceTransactionRequest(accessToken, transaction.id)
      );
      if (selectedTransactionId === transaction.id) {
        handleCloseTransactionDetails();
      }
      if (editingTransactionId === transaction.id) {
        resetTransactionForm();
      }
      setSuccessMessage(
        isApproved
          ? "Transaction approuvée supprimée par l'admin système."
          : "Transaction supprimée."
      );
      setTransactionPendingDelete(null);
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
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

      const uploaded = (await uploadResponse.json()) as {
        fileId?: string;
        filePath?: string;
        url?: string;
        name?: string;
        size?: number;
        fileType?: string;
      };

      return addFinanceTransactionProofRequest(accessToken, transactionId, {
        storageKey: uploaded.filePath ?? uploaded.url ?? uploaded.fileId ?? selectedFile.name,
        fileName: uploaded.name ?? selectedFile.name,
        mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
        fileSize: uploaded.size ?? selectedFile.size
      });
    });

    return proofResponse.items;
  }

  async function handleAddProof(transactionId: string): Promise<void> {
    const selectedFile = proofFiles[transactionId];
    if (!selectedFile) {
      setErrorMessage("Selectionne un fichier de preuve.");
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

        const uploaded = (await uploadResponse.json()) as {
          fileId?: string;
          filePath?: string;
          url?: string;
          name?: string;
          size?: number;
          fileType?: string;
        };

        return addFinanceTransactionProofRequest(accessToken, transactionId, {
          storageKey: uploaded.filePath ?? uploaded.url ?? uploaded.fileId ?? selectedFile.name,
          fileName: uploaded.name ?? selectedFile.name,
          mimeType: selectedFile.type || uploaded.fileType || "application/octet-stream",
          fileSize: uploaded.size ?? selectedFile.size
        });
      });

      setSuccessMessage("Preuve ajoutee.");
      setProofFiles((prev) => ({ ...prev, [transactionId]: null }));
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: proofResponse.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
      await loadData();
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyTransactionId(null);
    }
  }

  async function handleToggleProofs(transactionId: string): Promise<void> {
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
      setProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: response.items
      }));
      setOpenProofs((prev) => ({
        ...prev,
        [transactionId]: true
      }));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoadingProofsByTransaction((prev) => ({
        ...prev,
        [transactionId]: false
      }));
    }
  }

  return (
    <>
      <header className={isReadOnlyOwner ? "section-header owner-lite-header" : "section-header"}>
        <h2>Transactions financières</h2>
        <p>Suivi financier opérationnel.</p>
      </header>

      {!selectedActivityCode && !isLoadingActivities ? (
        <p className="error-box">
          Aucun secteur actif n'est disponible. Activez d'abord un secteur d'activité dans
          l'administration.
        </p>
      ) : null}

      <section className={isReadOnlyOwner ? "grid finance-summary-grid owner-lite-metrics" : "grid finance-summary-grid"}>
        {financePageCards.map((card) => (
          <article key={card.title} className="metric-card finance-overview-card">
            <h2>{card.title}</h2>
            <p className="metric-value">{card.value}</p>
            <p className="metric-note">{card.note}</p>
          </article>
        ))}
      </section>

      {canCreateAccount ? (
        <section className="panel finance-page-panel">
          <details className="finance-section-toggle">
            <summary className="finance-section-summary">
              <span>{editingAccountId ? "Modifier un compte financier" : "Créer un compte financier"}</span>
              <small>
                {editingAccountId
                  ? "Modification d'un compte."
                  : "Nouveau compte financier."}
              </small>
            </summary>
            <form className="finance-account-form" onSubmit={handleSaveAccount}>
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
                inputMode="decimal"
                placeholder="Ex: 100000.00"
                value={accountForm.openingBalance}
                onChange={(event) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    openingBalance: event.target.value
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
                  {enabledActivities.map((activity) => (
                    <option key={activity.code} value={activity.code}>
                      {activity.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {accountForm.scopeType === "RESTRICTED" ? (
              <div className="metadata-field-list">
                {enabledActivities.map((activity) => {
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
            <button type="submit">
              {editingAccountId ? "Enregistrer les modifications" : "Créer le compte"}
            </button>
            {editingAccountId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleCancelEditAccount}
              >
                Annuler la modification
              </button>
            ) : null}
            </form>
          </details>
        </section>
      ) : null}

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
          <label className="operations-inline-group">
            <span>Recherche rapide</span>
            <input
              type="search"
              className="quick-search-input"
              placeholder="Compte, référence, description..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <button type="submit">Actualiser</button>
        </form>
      </section>

      <section className="panel finance-page-panel">
        <details className="finance-section-toggle" open>
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
          <form className="finance-transaction-form" onSubmit={handleSaveTransaction}>
          <fieldset className="finance-transaction-form-section">
            <legend>Informations principales</legend>
          <div className="finance-transaction-form-quick">
            <label className="operations-inline-group">
              <span>Compte</span>
              <select
                value={transactionForm.accountId}
                onChange={(event) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    accountId: event.target.value
                  }))
                }
                required
              >
                <option value="" disabled>
                  Choisir un compte
                </option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatAmountForDisplay(account.balance)} {transactionForm.currency}) | {formatAccountScopeLabel(account)}
                  </option>
                ))}
              </select>
            </label>

            {selectedActivityCode === "HARDWARE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Nature quincaillerie</span>
                  <select
                    value={hardwareOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as HardwareOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getHardwareOperationType(nextKind) ?? prev.type;
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [HARDWARE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = nextKind === "GLOBAL"
                          ? null
                          : deriveSectorAmount(selectedActivityCode, nextType, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: nextKind === "GLOBAL" ? "" : formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="GLOBAL">{HARDWARE_OPERATION_LABELS.GLOBAL}</option>
                    <option value="ITEM_ENTRY">{HARDWARE_OPERATION_LABELS.ITEM_ENTRY}</option>
                    <option value="ITEM_EXIT">{HARDWARE_OPERATION_LABELS.ITEM_EXIT}</option>
                  </select>
                </label>

                {hardwareOperationKind === "GLOBAL" ? (
                  <label className="operations-inline-group">
                    <span>Flux financier</span>
                    <select
                      value={transactionForm.type}
                      onChange={(event) => {
                        const nextType = event.target.value as "CASH_IN" | "CASH_OUT";
                        setTransactionForm((prev) => ({
                          ...prev,
                          type: nextType,
                          metadata: cleanSectorFinanceMetadata(
                            selectedActivityCode,
                            nextType,
                            {
                              ...prev.metadata,
                              [HARDWARE_OPERATION_KIND_KEY]: "GLOBAL"
                            }
                          )
                        }));
                      }}
                    >
                      <option value="CASH_IN">Encaissement</option>
                      <option value="CASH_OUT">Decaissement</option>
                    </select>
                  </label>
                ) : (
                  <div className="operations-inline-group">
                    <span>Flux financier</span>
                    <strong>
                      {transactionForm.type === "CASH_IN"
                        ? "Vente"
                        : "Acquisition"}
                    </strong>
                  </div>
                )}
              </>
            ) : selectedActivityCode === "AGRICULTURE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Operation agricole</span>
                  <select
                    value={agricultureOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as AgricultureOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getAgricultureOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [AGRICULTURE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveAgricultureAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="INPUT_PURCHASE">{AGRICULTURE_OPERATION_LABELS.INPUT_PURCHASE}</option>
                    <option value="FIELD_EXPENSE">{AGRICULTURE_OPERATION_LABELS.FIELD_EXPENSE}</option>
                    <option value="HARVEST_SALE">{AGRICULTURE_OPERATION_LABELS.HARVEST_SALE}</option>
                    <option value="SUPPORT_INCOME">{AGRICULTURE_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette agricole" : "Depense agricole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "FISH_FARMING" ? (
              <>
                <label className="operations-inline-group">
                  <span>Operation piscicole</span>
                  <select
                    value={fishFarmingOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as FishFarmingOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getFishFarmingOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [FISH_FARMING_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveFishFarmingAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="FINGERLING_PURCHASE">{FISH_FARMING_OPERATION_LABELS.FINGERLING_PURCHASE}</option>
                    <option value="FEED_PURCHASE">{FISH_FARMING_OPERATION_LABELS.FEED_PURCHASE}</option>
                    <option value="POND_EXPENSE">{FISH_FARMING_OPERATION_LABELS.POND_EXPENSE}</option>
                    <option value="FISH_SALE">{FISH_FARMING_OPERATION_LABELS.FISH_SALE}</option>
                    <option value="SUPPORT_INCOME">{FISH_FARMING_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette piscicole" : "Depense piscicole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "LIVESTOCK" ? (
              <>
                <label className="operations-inline-group">
                  <span>Operation elevage</span>
                  <select
                    value={livestockOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as LivestockOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getLivestockOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [LIVESTOCK_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveLivestockAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="ANIMAL_PURCHASE">{LIVESTOCK_OPERATION_LABELS.ANIMAL_PURCHASE}</option>
                    <option value="FEED_PURCHASE">{LIVESTOCK_OPERATION_LABELS.FEED_PURCHASE}</option>
                    <option value="VET_CARE">{LIVESTOCK_OPERATION_LABELS.VET_CARE}</option>
                    <option value="FARM_EXPENSE">{LIVESTOCK_OPERATION_LABELS.FARM_EXPENSE}</option>
                    <option value="ANIMAL_SALE">{LIVESTOCK_OPERATION_LABELS.ANIMAL_SALE}</option>
                    <option value="PRODUCT_SALE">{LIVESTOCK_OPERATION_LABELS.PRODUCT_SALE}</option>
                    <option value="SUPPORT_INCOME">{LIVESTOCK_OPERATION_LABELS.SUPPORT_INCOME}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette elevage" : "Depense elevage"}
                  </strong>
                </div>
              </>
            ) : (
              <label className="operations-inline-group">
                <span>Type</span>
                <select
                  value={transactionForm.type}
                  onChange={(event) => {
                    const nextType = event.target.value as "CASH_IN" | "CASH_OUT";
                    setTransactionForm((prev) => ({
                      ...prev,
                      type: nextType
                    }));
                  }}
                >
                  <option value="CASH_IN">Entrée</option>
                  <option value="CASH_OUT">Sortie</option>
                </select>
              </label>
            )}

            <label className="operations-inline-group">
              <span>Montant</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Montant"
                value={transactionForm.amount}
                onChange={(event) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    amount: event.target.value
                  }))
                }
                onBlur={() =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    amount: formatAmountForInput(prev.amount)
                  }))
                }
                required
              />
            </label>

            <label className="operations-inline-group">
              <span>Devise</span>
              <select
                value={transactionForm.currency}
                onChange={(event) =>
                  setTransactionForm((prev) => ({
                    ...prev,
                    currency: event.target.value
                  }))
                }
              >
                {allowedCurrencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </label>
          </div>
          </fieldset>

          <div className="scope-field finance-transaction-form-context">
            <span className="scope-field-label">Contexte de saisie</span>
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            <span className="hint">
              Compte et devise sont présélectionnés selon le contexte actif.
            </span>
          </div>

          <fieldset className="finance-transaction-form-section finance-proof-callout">
            <legend>Justificatif</legend>
            <div className="finance-proof-callout-copy">
              <strong>Ajouter la preuve maintenant</strong>
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
            <div className="finance-proof-selected">
              {transactionProofFile ? (
                <>
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
                </>
              ) : (
                <span>Aucun fichier sélectionné.</span>
              )}
            </div>
          </fieldset>

          <details className="finance-transaction-form-options" open={hasRequiredFinanceDetails}>
            <summary>Informations complémentaires</summary>
            <div className="finance-transaction-form-options-body">
              {selectedActivityCode === "HARDWARE" ? (
                <p className="hint finance-form-mode-hint">
                  {getHardwareFormModeLabel(hardwareOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "AGRICULTURE" ? (
                <p className="hint finance-form-mode-hint">
                  {getAgricultureFormModeLabel(agricultureOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "FISH_FARMING" ? (
                <p className="hint finance-form-mode-hint">
                  {getFishFarmingFormModeLabel(fishFarmingOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "LIVESTOCK" ? (
                <p className="hint finance-form-mode-hint">
                  {getLivestockFormModeLabel(livestockOperationKind)}
                </p>
              ) : null}

              <label className="operations-inline-group">
                <span>Date et heure de l'opération</span>
                <input
                  type="datetime-local"
                  value={transactionForm.occurredAt}
                  onChange={(event) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      occurredAt: event.target.value
                    }))
                  }
                />
              </label>

              <label className="operations-inline-group">
                <span>Description</span>
                <input
                  type="text"
                  placeholder={
                    selectedProfile?.finance.requiresDescription ? "Requise" : "Optionnelle"
                  }
                  value={transactionForm.description}
                  onChange={(event) =>
                    setTransactionForm((prev) => ({
                      ...prev,
                      description: event.target.value
                    }))
                  }
                  required={selectedProfile?.finance.requiresDescription ?? false}
                />
              </label>

              {visibleFinanceMetadataFields.map((field) => (
                <label key={field.key} className="operations-inline-group">
                  <span>{field.label}</span>
                  <input
                    type="text"
                    inputMode={getMetadataInputMode(field.key)}
                    placeholder={field.helpText || field.label}
                    value={transactionForm.metadata[field.key] ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setTransactionForm((prev) => {
                        const nextMetadata = {
                          ...prev.metadata,
                          [field.key]: nextValue
                        };
                        const shouldDeriveAmount =
                          (selectedActivityCode === "HARDWARE" && shouldDeriveHardwareAmount(field.key)) ||
                          (selectedActivityCode === "AGRICULTURE" && shouldDeriveAgricultureAmount(field.key)) ||
                          (selectedActivityCode === "FISH_FARMING" && shouldDeriveFishFarmingAmount(field.key)) ||
                          (selectedActivityCode === "LIVESTOCK" && shouldDeriveLivestockAmount(field.key));
                        const derivedAmount = shouldDeriveAmount
                          ? deriveSectorAmount(selectedActivityCode, prev.type, nextMetadata)
                          : null;
                        return {
                          ...prev,
                          amount: derivedAmount ? formatAmountForInput(derivedAmount) : prev.amount,
                          metadata: nextMetadata
                        };
                      });
                    }}
                    onBlur={() => {
                      if (!isMoneyMetadataField(field.key)) {
                        return;
                      }
                      setTransactionForm((prev) => ({
                        ...prev,
                        metadata: {
                          ...prev.metadata,
                          [field.key]: formatAmountForInput(prev.metadata[field.key] ?? "")
                        }
                      }));
                    }}
                    title={field.helpText}
                    required={field.required}
                  />
                </label>
              ))}
            </div>
          </details>

          <button
            type="submit"
            disabled={
              accounts.length === 0 ||
              !selectedActivityCode ||
              isLoadingActivities ||
              isSavingTransaction
            }
          >
            {isSavingTransaction
              ? transactionProofFile
                ? "Enregistrement et envoi de la preuve..."
                : "Enregistrement..."
              : editingTransactionId
                ? "Enregistrer les modifications"
                : "Enregistrer la transaction"}
          </button>
          {editingTransactionId ? (
            <button
              type="button"
              className="secondary-btn"
              onClick={handleCancelEditTransaction}
              disabled={isSavingTransaction}
            >
              Annuler la modification
            </button>
          ) : null}
          </form>
        </details>
      </section>

      <FeedbackBanner
        errorMessage={errorMessage}
        successMessage={successMessage}
        isLoading={isLoading}
      />

      <section className="panel finance-page-panel">
        <h3>Transactions</h3>
        {!isLoading && transactions.length === 0 ? (
          <EmptyState
            title="Aucune transaction dans cette vue"
            description="Enregistrez une premiere entree ou sortie, ou changez les filtres pour retrouver les transactions existantes."
            actionLabel={canManageTransactions ? "Préparer une transaction" : undefined}
            onAction={canManageTransactions ? () => window.scrollTo({ top: 0, behavior: "smooth" }) : undefined}
          />
        ) : null}
        {!isLoading && transactions.length > 0 && displayTransactions.length === 0 ? (
          <EmptyState
            title="Aucun résultat"
            description="Aucune transaction ne correspond à la recherche ou aux filtres appliqués."
            actionLabel="Réinitialiser les filtres"
            onAction={() => {
              setSearchQuery("");
              setFilters({
                status: "ALL",
                type: "ALL"
              });
            }}
          />
        ) : null}
        {!isLoading && displayTransactions.length > 0 ? (
          <>
          {renderVisibleTransactionsPagination()}
          <div className="table-wrap finance-transactions-table-wrap">
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
                  const isProofsOpen = openProofs[tx.id] === true;
                  const proofs = proofsByTransaction[tx.id] ?? [];
                  const isProofsLoading = loadingProofsByTransaction[tx.id] === true;
                  const canEditTransaction = canManageTransactions;
                  const canDeleteTransaction = canManageTransactions;

                  return (
                    <tr key={tx.id}>
                      <td>{new Date(tx.occurredAt).toLocaleString("fr-FR")}</td>
                      <td>
                        <strong>{tx.accountName}</strong>
                        <div className="hint">
                          {tx.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {tx.activityCode
                            ? getBusinessActivityLabel(tx.activityCode)
                            : "Charge transversale entreprise"}
                        </div>
                      </td>
                      <td>
                        {formatAmountForDisplay(tx.amount)} {tx.currency}
                      </td>
                      <td>
                        <div>
                          {tx.proofsCount} preuve{tx.proofsCount > 1 ? "s" : ""}
                        </div>
                        <p className="hint">{tx.requiresProof ? "Justificatif requis" : "Justificatif libre"}</p>
                      </td>
                      <td>
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
                              className="secondary-btn"
                              onClick={() => handleStartEditTransaction(tx)}
                              disabled={isBusy}
                            >
                              Modifier
                            </button>
                          ) : null}
                          {canDeleteTransaction ? (
                            <button
                              type="button"
                              className="danger-btn"
                              onClick={() => void handleDeleteTransaction(tx)}
                              disabled={isBusy}
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </div>
                        <details className="table-inline-details">
                          <summary className="table-inline-summary">Voir plus</summary>
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

                            {canManageTransactions ? <div className="proof-inline-form">
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
          <div className="list-pagination">
            <p className="hint list-pagination-meta">
              {displayTransactions.length} transaction(s) filtrée(s)
              {displayTransactions.length !== transactions.length
                ? ` sur ${transactions.length} chargee(s)`
                : ""}
              {hasMoreTransactions ? " sur plusieurs pages." : "."}
            </p>
            {hasMoreTransactions ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleLoadMoreTransactions()}
                disabled={isLoadingMoreTransactions}
              >
                {isLoadingMoreTransactions ? "Chargement..." : "Charger plus"}
              </button>
            ) : null}
          </div>
          </>
        ) : null}
      </section>

      {selectedTransaction ? (
        <section className="panel finance-transaction-detail-panel">
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

          <div className="operations-task-meta">
            <p>
              <strong>Secteur:</strong>{" "}
              {selectedTransaction.activityCode
                ? getBusinessActivityLabel(selectedTransaction.activityCode)
                : "Charge transversale entreprise"}
            </p>
            <p>
              <strong>Compte:</strong> {selectedTransaction.accountName}
            </p>
            <p>
              <strong>Type:</strong> {selectedTransaction.type === "CASH_IN" ? "Entrée" : "Sortie"}
            </p>
            <p>
              <strong>Montant:</strong> {formatAmountForDisplay(selectedTransaction.amount)} {selectedTransaction.currency}
            </p>
            <p>
              <strong>Preuves:</strong> {selectedTransaction.proofsCount}
              {selectedTransaction.requiresProof ? " (obligatoire)" : ""}
            </p>
            <p>
              <strong>Createur:</strong> {selectedTransaction.createdByEmail}
            </p>
            <p>
              <strong>Validation:</strong> {selectedTransaction.validatedByEmail ?? "En attente"}
            </p>
            <p>
              <strong>Opération:</strong>{" "}
              {new Date(selectedTransaction.occurredAt).toLocaleString("fr-FR")}
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
                <p className="hint">Aucune description fournie.</p>
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
              <p className="hint">{formatMetadataSummary(selectedTransaction.metadata, financeMetadataFields)}</p>
            </article>

            <article className="finance-detail-block">
              <h4>Preuves</h4>
              <p className="hint">
                {selectedTransaction.proofsCount} preuve{selectedTransaction.proofsCount > 1 ? "s" : ""}
                {selectedTransaction.requiresProof ? " (obligatoire)" : ""}
              </p>
            </article>
          </div>

          <div className="finance-transaction-detail-actions">
            <div className="actions-inline">
              {canManageTransactions ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => handleStartEditTransaction(selectedTransaction)}
                  disabled={busyTransactionId === selectedTransaction.id}
                >
                  Modifier
                </button>
              ) : null}
              {canManageTransactions ? (
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
            {canManageTransactions ? <div className="proof-inline-form">
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

      {accounts.length > 0 ? (
        <section className="panel">
          <details className="finance-section-toggle">
            <summary className="finance-section-summary">
              <span>Consulter les comptes financiers</span>
              <small>{accounts.length} compte(s) visible(s) dans le contexte actuel.</small>
            </summary>
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
          </details>
        </section>
      ) : null}

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
        open={transactionPendingDelete !== null}
        title="Confirmer la suppression de la transaction"
        description="Cette action supprime la transaction sélectionnée de la vue financière."
        objectLabel="Transaction concernée"
        objectName={transactionPendingDelete?.description?.trim() || transactionPendingDelete?.id || ""}
        impactText={
          transactionPendingDelete?.status === "APPROVED"
            ? "Cette transaction est déjà approuvée. Sa suppression doit rester exceptionnelle et assumée."
            : "La transaction ne sera plus disponible pour la validation ni pour le suivi courant."
        }
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

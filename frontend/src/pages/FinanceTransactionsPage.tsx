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
const STORE_OPERATION_KIND_KEY = "storeOperationKind";
type StoreOperationKind =
  | "STORE_SALE"
  | "STOCK_PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "CUSTOMER_RETURN"
  | "DISCOUNT_ADJUSTMENT"
  | "INVENTORY_ADJUSTMENT"
  | "INTERNAL_TRANSFER"
  | "STORE_EXPENSE";
const STORE_OPERATION_LABELS: Record<StoreOperationKind, string> = {
  STORE_SALE: "Vente caisse",
  STOCK_PURCHASE: "Achat stock",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  CUSTOMER_RETURN: "Retour client",
  DISCOUNT_ADJUSTMENT: "Remise / écart",
  INVENTORY_ADJUSTMENT: "Ajustement inventaire",
  INTERNAL_TRANSFER: "Transfert interne",
  STORE_EXPENSE: "Charge magasin"
};
const STORE_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "returnQuantity",
  "adjustmentQuantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "discountAmount",
  "returnAmount",
  "invoiceAmount"
]);
const STORE_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "returnQuantity",
  "adjustmentQuantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "discountAmount",
  "returnAmount",
  "invoiceAmount"
]);
const STORE_COMMON_METADATA_FIELDS = new Set([
  "department",
  "productFamily",
  "itemName",
  "skuRef",
  "barcode",
  "shelfRef"
]);
const STORE_SALE_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "registerRef",
  "cashierRef",
  "quantity",
  "unit",
  "saleUnitPrice",
  "discountAmount",
  "customerRef",
  "receiptRef",
  "paymentRef"
]);
const STORE_PURCHASE_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "purchaseUnitPrice",
  "supplierRef",
  "invoiceRef"
]);
const STORE_SUPPLIER_PAYMENT_METADATA_FIELDS = new Set([
  "department",
  "productFamily",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const STORE_CUSTOMER_RETURN_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "registerRef",
  "cashierRef",
  "returnQuantity",
  "unit",
  "saleUnitPrice",
  "returnAmount",
  "customerRef",
  "receiptRef",
  "paymentRef"
]);
const STORE_DISCOUNT_ADJUSTMENT_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "registerRef",
  "cashierRef",
  "discountAmount",
  "customerRef",
  "receiptRef"
]);
const STORE_INVENTORY_ADJUSTMENT_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "adjustmentQuantity",
  "unit",
  "purchaseUnitPrice",
  "expenseLabel"
]);
const STORE_INTERNAL_TRANSFER_METADATA_FIELDS = new Set([
  ...STORE_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "transferRef",
  "sourceStoreRef",
  "destinationStoreRef"
]);
const STORE_EXPENSE_METADATA_FIELDS = new Set([
  "department",
  "expenseLabel",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const STORE_METADATA_FIELDS = new Set([
  STORE_OPERATION_KIND_KEY,
  "department",
  "productFamily",
  "itemName",
  "skuRef",
  "barcode",
  "shelfRef",
  "registerRef",
  "cashierRef",
  "quantity",
  "returnQuantity",
  "adjustmentQuantity",
  "unit",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "discountAmount",
  "returnAmount",
  "invoiceAmount",
  "supplierRef",
  "customerRef",
  "invoiceRef",
  "receiptRef",
  "transferRef",
  "sourceStoreRef",
  "destinationStoreRef",
  "expenseLabel",
  "paymentRef"
]);
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
const FOOD_OPERATION_KIND_KEY = "foodOperationKind";
type FoodOperationKind =
  | "PRODUCT_SALE"
  | "PRODUCT_PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "STOCK_LOSS"
  | "COLD_CHAIN_EXPENSE"
  | "PACKAGING_EXPENSE"
  | "CUSTOMER_REFUND";
const FOOD_OPERATION_LABELS: Record<FoodOperationKind, string> = {
  PRODUCT_SALE: "Vente produit",
  PRODUCT_PURCHASE: "Achat stock",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  STOCK_LOSS: "Perte / péremption",
  COLD_CHAIN_EXPENSE: "Chaîne du froid",
  PACKAGING_EXPENSE: "Emballage",
  CUSTOMER_REFUND: "Remboursement client"
};
const FOOD_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "lossQuantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "invoiceAmount"
]);
const FOOD_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "lossQuantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "invoiceAmount"
]);
const FOOD_COMMON_METADATA_FIELDS = new Set([
  "productFamily",
  "productName",
  "batchRef",
  "expiryDate",
  "storageArea"
]);
const FOOD_PRODUCT_SALE_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "saleUnitPrice",
  "buyerRef",
  "paymentRef"
]);
const FOOD_PRODUCT_PURCHASE_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "purchaseUnitPrice",
  "supplierRef",
  "invoiceRef"
]);
const FOOD_SUPPLIER_PAYMENT_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const FOOD_STOCK_LOSS_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "lossQuantity",
  "unit",
  "purchaseUnitPrice",
  "lossReason"
]);
const FOOD_COLD_CHAIN_EXPENSE_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "temperatureRange",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const FOOD_PACKAGING_EXPENSE_METADATA_FIELDS = new Set([
  "productFamily",
  "productName",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const FOOD_CUSTOMER_REFUND_METADATA_FIELDS = new Set([
  ...FOOD_COMMON_METADATA_FIELDS,
  "quantity",
  "unit",
  "saleUnitPrice",
  "buyerRef",
  "paymentRef"
]);
const FOOD_METADATA_FIELDS = new Set([
  FOOD_OPERATION_KIND_KEY,
  "productFamily",
  "productName",
  "batchRef",
  "expiryDate",
  "storageArea",
  "temperatureRange",
  "quantity",
  "lossQuantity",
  "unit",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "supplierRef",
  "buyerRef",
  "invoiceRef",
  "invoiceAmount",
  "lossReason",
  "paymentRef"
]);
const RENTAL_OPERATION_KIND_KEY = "rentalOperationKind";
type RentalOperationKind =
  | "RENT_PAYMENT"
  | "SECURITY_DEPOSIT"
  | "ADVANCE_PAYMENT"
  | "SERVICE_CHARGE_INCOME"
  | "MAINTENANCE_EXPENSE"
  | "PROPERTY_EXPENSE"
  | "OWNER_PAYOUT";
const RENTAL_OPERATION_LABELS: Record<RentalOperationKind, string> = {
  RENT_PAYMENT: "Paiement loyer",
  SECURITY_DEPOSIT: "Caution",
  ADVANCE_PAYMENT: "Avance loyer",
  SERVICE_CHARGE_INCOME: "Charges recuperees",
  MAINTENANCE_EXPENSE: "Maintenance",
  PROPERTY_EXPENSE: "Charge bien",
  OWNER_PAYOUT: "Reversement propriétaire"
};
const RENTAL_NUMERIC_METADATA_FIELDS = new Set([
  "monthsCount",
  "monthlyRent",
  "serviceCharge",
  "depositAmount",
  "invoiceAmount",
  "payoutAmount"
]);
const RENTAL_AMOUNT_METADATA_FIELDS = new Set([
  "monthsCount",
  "monthlyRent",
  "serviceCharge",
  "depositAmount",
  "invoiceAmount",
  "payoutAmount"
]);
const RENTAL_COMMON_METADATA_FIELDS = new Set([
  "propertyRef",
  "unitRef",
  "tenantRef",
  "leaseRef",
  "propertyType",
  "locationZone"
]);
const RENTAL_RENT_PAYMENT_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "periodRef",
  "monthsCount",
  "monthlyRent",
  "serviceCharge",
  "paymentRef"
]);
const RENTAL_SECURITY_DEPOSIT_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "depositAmount",
  "paymentRef"
]);
const RENTAL_ADVANCE_PAYMENT_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "periodRef",
  "monthsCount",
  "monthlyRent",
  "paymentRef"
]);
const RENTAL_SERVICE_CHARGE_INCOME_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "periodRef",
  "chargeLabel",
  "serviceCharge",
  "paymentRef"
]);
const RENTAL_MAINTENANCE_EXPENSE_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "maintenanceType",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const RENTAL_PROPERTY_EXPENSE_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "chargeLabel",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const RENTAL_OWNER_PAYOUT_METADATA_FIELDS = new Set([
  ...RENTAL_COMMON_METADATA_FIELDS,
  "ownerRef",
  "periodRef",
  "payoutAmount",
  "paymentRef"
]);
const RENTAL_METADATA_FIELDS = new Set([
  RENTAL_OPERATION_KIND_KEY,
  "propertyRef",
  "unitRef",
  "tenantRef",
  "leaseRef",
  "propertyType",
  "locationZone",
  "periodRef",
  "monthsCount",
  "monthlyRent",
  "serviceCharge",
  "depositAmount",
  "chargeLabel",
  "maintenanceType",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "ownerRef",
  "payoutAmount",
  "paymentRef"
]);
const HOTEL_OPERATION_KIND_KEY = "hotelOperationKind";
type HotelOperationKind =
  | "ROOM_PAYMENT"
  | "BOOKING_DEPOSIT"
  | "RESTAURANT_SALE"
  | "EVENT_SERVICE"
  | "LAUNDRY_SERVICE"
  | "ROOM_MAINTENANCE"
  | "SUPPLIER_PAYMENT"
  | "COMMISSION_FEE"
  | "TAX_PAYMENT"
  | "GUEST_REFUND";
const HOTEL_OPERATION_LABELS: Record<HotelOperationKind, string> = {
  ROOM_PAYMENT: "Paiement chambre",
  BOOKING_DEPOSIT: "Acompte réservation",
  RESTAURANT_SALE: "Restauration",
  EVENT_SERVICE: "Evenement / salle",
  LAUNDRY_SERVICE: "Blanchisserie",
  ROOM_MAINTENANCE: "Maintenance chambre",
  SUPPLIER_PAYMENT: "Paiement fournisseur",
  COMMISSION_FEE: "Commission",
  TAX_PAYMENT: "Taxe séjour",
  GUEST_REFUND: "Remboursement client"
};
const HOTEL_NUMERIC_METADATA_FIELDS = new Set([
  "nightsCount",
  "roomRate",
  "guestCount",
  "mealCount",
  "mealUnitPrice",
  "serviceQuantity",
  "serviceUnitPrice",
  "invoiceAmount",
  "commissionAmount",
  "taxAmount",
  "refundAmount"
]);
const HOTEL_AMOUNT_METADATA_FIELDS = new Set([
  "nightsCount",
  "roomRate",
  "mealCount",
  "mealUnitPrice",
  "serviceQuantity",
  "serviceUnitPrice",
  "invoiceAmount",
  "commissionAmount",
  "taxAmount",
  "refundAmount"
]);
const HOTEL_COMMON_METADATA_FIELDS = new Set([
  "bookingRef",
  "stayRef",
  "guestRef",
  "roomRef",
  "roomType",
  "serviceLine"
]);
const HOTEL_ROOM_PAYMENT_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "checkInDate",
  "checkOutDate",
  "nightsCount",
  "roomRate",
  "guestCount",
  "invoiceRef",
  "paymentRef"
]);
const HOTEL_BOOKING_DEPOSIT_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "checkInDate",
  "checkOutDate",
  "invoiceAmount",
  "paymentRef"
]);
const HOTEL_RESTAURANT_SALE_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "mealCount",
  "mealUnitPrice",
  "invoiceRef",
  "paymentRef"
]);
const HOTEL_EVENT_SERVICE_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "eventRef",
  "serviceQuantity",
  "serviceUnitPrice",
  "invoiceRef",
  "paymentRef"
]);
const HOTEL_LAUNDRY_SERVICE_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "serviceQuantity",
  "serviceUnitPrice",
  "invoiceRef",
  "paymentRef"
]);
const HOTEL_ROOM_MAINTENANCE_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const HOTEL_SUPPLIER_PAYMENT_METADATA_FIELDS = new Set([
  "bookingRef",
  "roomRef",
  "serviceLine",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const HOTEL_COMMISSION_FEE_METADATA_FIELDS = new Set([
  "bookingRef",
  "stayRef",
  "guestRef",
  "supplierRef",
  "commissionAmount",
  "paymentRef"
]);
const HOTEL_TAX_PAYMENT_METADATA_FIELDS = new Set([
  "bookingRef",
  "stayRef",
  "guestRef",
  "serviceLine",
  "taxAmount",
  "paymentRef"
]);
const HOTEL_GUEST_REFUND_METADATA_FIELDS = new Set([
  ...HOTEL_COMMON_METADATA_FIELDS,
  "refundAmount",
  "paymentRef"
]);
const HOTEL_METADATA_FIELDS = new Set([
  HOTEL_OPERATION_KIND_KEY,
  "bookingRef",
  "stayRef",
  "guestRef",
  "roomRef",
  "roomType",
  "serviceLine",
  "checkInDate",
  "checkOutDate",
  "nightsCount",
  "roomRate",
  "guestCount",
  "mealCount",
  "mealUnitPrice",
  "serviceQuantity",
  "serviceUnitPrice",
  "eventRef",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "commissionAmount",
  "taxAmount",
  "refundAmount",
  "paymentRef"
]);
const WATER_OPERATION_KIND_KEY = "waterOperationKind";
type WaterOperationKind =
  | "WATER_BILLING"
  | "BULK_WATER_SALE"
  | "CONNECTION_FEE"
  | "SUBSIDY_INCOME"
  | "CHEMICAL_PURCHASE"
  | "ENERGY_PAYMENT"
  | "MAINTENANCE_EXPENSE"
  | "QUALITY_TEST_EXPENSE"
  | "NETWORK_REPAIR"
  | "SUPPLIER_PAYMENT";
const WATER_OPERATION_LABELS: Record<WaterOperationKind, string> = {
  WATER_BILLING: "Facture eau",
  BULK_WATER_SALE: "Vente eau en gros",
  CONNECTION_FEE: "Frais branchement",
  SUBSIDY_INCOME: "Subvention / appui",
  CHEMICAL_PURCHASE: "Produit traitement",
  ENERGY_PAYMENT: "Énergie",
  MAINTENANCE_EXPENSE: "Maintenance",
  QUALITY_TEST_EXPENSE: "Analyse qualité",
  NETWORK_REPAIR: "Réparation réseau",
  SUPPLIER_PAYMENT: "Paiement fournisseur"
};
const WATER_NUMERIC_METADATA_FIELDS = new Set([
  "meterStart",
  "meterEnd",
  "producedVolumeM3",
  "volumeM3",
  "unitPrice",
  "connectionFee",
  "chemicalQuantity",
  "energyQuantity",
  "invoiceAmount"
]);
const WATER_AMOUNT_METADATA_FIELDS = new Set([
  "volumeM3",
  "unitPrice",
  "connectionFee",
  "chemicalQuantity",
  "energyQuantity",
  "invoiceAmount"
]);
const WATER_COMMON_METADATA_FIELDS = new Set([
  "facilityRef",
  "networkZone",
  "productionLine"
]);
const WATER_BILLING_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "meterRef",
  "customerRef",
  "billingPeriod",
  "meterStart",
  "meterEnd",
  "producedVolumeM3",
  "volumeM3",
  "unitPrice",
  "invoiceRef",
  "paymentRef"
]);
const WATER_BULK_SALE_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "customerRef",
  "producedVolumeM3",
  "volumeM3",
  "unitPrice",
  "invoiceRef",
  "paymentRef"
]);
const WATER_CONNECTION_FEE_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "customerRef",
  "connectionRef",
  "connectionFee",
  "paymentRef"
]);
const WATER_SUBSIDY_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "customerRef",
  "invoiceAmount",
  "paymentRef"
]);
const WATER_CHEMICAL_PURCHASE_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "treatmentProduct",
  "chemicalQuantity",
  "unitPrice",
  "supplierRef",
  "invoiceRef"
]);
const WATER_ENERGY_PAYMENT_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "energySource",
  "energyQuantity",
  "unitPrice",
  "supplierRef",
  "invoiceRef"
]);
const WATER_MAINTENANCE_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "equipmentRef",
  "maintenanceType",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const WATER_QUALITY_TEST_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "testRef",
  "waterQuality",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const WATER_NETWORK_REPAIR_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "equipmentRef",
  "issueRef",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount"
]);
const WATER_SUPPLIER_PAYMENT_METADATA_FIELDS = new Set([
  ...WATER_COMMON_METADATA_FIELDS,
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const WATER_METADATA_FIELDS = new Set([
  WATER_OPERATION_KIND_KEY,
  "facilityRef",
  "networkZone",
  "productionLine",
  "meterRef",
  "customerRef",
  "billingPeriod",
  "meterStart",
  "meterEnd",
  "producedVolumeM3",
  "volumeM3",
  "unitPrice",
  "connectionRef",
  "connectionFee",
  "treatmentProduct",
  "chemicalQuantity",
  "energySource",
  "energyQuantity",
  "equipmentRef",
  "maintenanceType",
  "testRef",
  "waterQuality",
  "issueRef",
  "supplierRef",
  "invoiceRef",
  "invoiceAmount",
  "paymentRef"
]);
const AGENCY_OPERATION_KIND_KEY = "agencyOperationKind";
type AgencyOperationKind =
  | "SALE_COMMISSION"
  | "RENTAL_COMMISSION"
  | "MANDATE_FEE"
  | "VISIT_FEE"
  | "FILE_FEE"
  | "ADVERTISING_EXPENSE"
  | "FIELD_VISIT_EXPENSE"
  | "BROKER_PAYOUT"
  | "DOCUMENT_EXPENSE"
  | "CUSTOMER_REFUND"
  | "OFFICE_EXPENSE";
const AGENCY_OPERATION_LABELS: Record<AgencyOperationKind, string> = {
  SALE_COMMISSION: "Commission vente",
  RENTAL_COMMISSION: "Commission location",
  MANDATE_FEE: "Frais mandat",
  VISIT_FEE: "Frais visite",
  FILE_FEE: "Frais dossier",
  ADVERTISING_EXPENSE: "Publicité",
  FIELD_VISIT_EXPENSE: "Déplacement visite",
  BROKER_PAYOUT: "Reversement courtier",
  DOCUMENT_EXPENSE: "Frais document",
  CUSTOMER_REFUND: "Remboursement client",
  OFFICE_EXPENSE: "Charge agence"
};
const AGENCY_NUMERIC_METADATA_FIELDS = new Set([
  "dealAmount",
  "commissionRate",
  "commissionAmount",
  "feeAmount",
  "visitCount",
  "unitPrice",
  "expenseAmount",
  "payoutAmount",
  "refundAmount"
]);
const AGENCY_AMOUNT_METADATA_FIELDS = new Set([
  "dealAmount",
  "commissionRate",
  "commissionAmount",
  "feeAmount",
  "visitCount",
  "unitPrice",
  "expenseAmount",
  "payoutAmount",
  "refundAmount"
]);
const AGENCY_COMMON_METADATA_FIELDS = new Set([
  "mandateRef",
  "propertyRef",
  "mandateType",
  "propertyType",
  "locationZone",
  "ownerRef",
  "clientRef",
  "prospectRef",
  "dealRef",
  "dealStage"
]);
const AGENCY_SALE_COMMISSION_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "dealAmount",
  "commissionRate",
  "commissionAmount",
  "invoiceRef",
  "paymentRef"
]);
const AGENCY_RENTAL_COMMISSION_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "dealAmount",
  "commissionRate",
  "commissionAmount",
  "invoiceRef",
  "paymentRef"
]);
const AGENCY_MANDATE_FEE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "feeAmount",
  "documentRef",
  "paymentRef"
]);
const AGENCY_VISIT_FEE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "visitCount",
  "unitPrice",
  "paymentRef"
]);
const AGENCY_FILE_FEE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "feeAmount",
  "documentRef",
  "paymentRef"
]);
const AGENCY_ADVERTISING_EXPENSE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "advertisingChannel",
  "supplierRef",
  "invoiceRef",
  "expenseAmount"
]);
const AGENCY_FIELD_VISIT_EXPENSE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "visitCount",
  "unitPrice",
  "supplierRef",
  "invoiceRef",
  "expenseAmount"
]);
const AGENCY_BROKER_PAYOUT_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "supplierRef",
  "payoutAmount",
  "paymentRef"
]);
const AGENCY_DOCUMENT_EXPENSE_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "documentRef",
  "supplierRef",
  "invoiceRef",
  "expenseAmount"
]);
const AGENCY_CUSTOMER_REFUND_METADATA_FIELDS = new Set([
  ...AGENCY_COMMON_METADATA_FIELDS,
  "refundAmount",
  "paymentRef"
]);
const AGENCY_OFFICE_EXPENSE_METADATA_FIELDS = new Set([
  "mandateRef",
  "propertyRef",
  "locationZone",
  "supplierRef",
  "invoiceRef",
  "expenseAmount",
  "paymentRef"
]);
const AGENCY_METADATA_FIELDS = new Set([
  AGENCY_OPERATION_KIND_KEY,
  "mandateRef",
  "propertyRef",
  "mandateType",
  "propertyType",
  "locationZone",
  "ownerRef",
  "clientRef",
  "prospectRef",
  "dealRef",
  "dealStage",
  "dealAmount",
  "commissionRate",
  "commissionAmount",
  "feeAmount",
  "visitCount",
  "unitPrice",
  "advertisingChannel",
  "documentRef",
  "supplierRef",
  "invoiceRef",
  "expenseAmount",
  "payoutAmount",
  "refundAmount",
  "paymentRef"
]);
const AGRICULTURE_OPERATION_KIND_KEY = "agricultureOperationKind";
type AgricultureOperationKind = "INPUT_PURCHASE" | "FIELD_EXPENSE" | "HARVEST_SALE" | "SUPPORT_INCOME";
const AGRICULTURE_OPERATION_LABELS: Record<AgricultureOperationKind, string> = {
  INPUT_PURCHASE: "Achat intrants",
  FIELD_EXPENSE: "Travaux champ",
  HARVEST_SALE: "Vente récolte",
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
const BTP_OPERATION_KIND_KEY = "btpOperationKind";
type BtpOperationKind =
  | "CLIENT_PAYMENT"
  | "MATERIAL_PURCHASE"
  | "LABOR_PAYMENT"
  | "EQUIPMENT_RENTAL"
  | "SUBCONTRACTING"
  | "SITE_EXPENSE";
const BTP_OPERATION_LABELS: Record<BtpOperationKind, string> = {
  CLIENT_PAYMENT: "Encaissement client",
  MATERIAL_PURCHASE: "Achat matériaux",
  LABOR_PAYMENT: "Main-d'oeuvre",
  EQUIPMENT_RENTAL: "Location engin",
  SUBCONTRACTING: "Sous-traitance",
  SITE_EXPENSE: "Charge chantier"
};
const BTP_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "unitPrice",
  "workerCount",
  "workDays",
  "dailyRate",
  "equipmentHours",
  "hourlyRate",
  "progressPercent",
  "retentionAmount"
]);
const BTP_AMOUNT_METADATA_FIELDS = new Set([
  "quantity",
  "unitPrice",
  "workerCount",
  "workDays",
  "dailyRate",
  "equipmentHours",
  "hourlyRate"
]);
const BTP_COMMON_METADATA_FIELDS = new Set([
  "projectRef",
  "contractRef",
  "clientRef",
  "workPackage",
  "siteLocation"
]);
const BTP_CLIENT_PAYMENT_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "invoiceRef",
  "progressPercent",
  "retentionAmount"
]);
const BTP_MATERIAL_PURCHASE_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "materialName",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef",
  "invoiceRef"
]);
const BTP_LABOR_PAYMENT_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "teamRef",
  "workerCount",
  "workDays",
  "dailyRate"
]);
const BTP_EQUIPMENT_RENTAL_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "equipmentRef",
  "equipmentHours",
  "hourlyRate",
  "supplierRef",
  "invoiceRef"
]);
const BTP_SUBCONTRACTING_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "subcontractorRef",
  "quantity",
  "unit",
  "unitPrice",
  "progressPercent",
  "invoiceRef",
  "retentionAmount"
]);
const BTP_SITE_EXPENSE_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "materialName",
  "teamRef",
  "equipmentRef",
  "supplierRef",
  "invoiceRef",
  "progressPercent",
  "retentionAmount"
]);
const BTP_METADATA_FIELDS = new Set([
  BTP_OPERATION_KIND_KEY,
  "projectRef",
  "contractRef",
  "clientRef",
  "workPackage",
  "siteLocation",
  "materialName",
  "quantity",
  "unit",
  "unitPrice",
  "supplierRef",
  "teamRef",
  "workerCount",
  "workDays",
  "dailyRate",
  "equipmentRef",
  "equipmentHours",
  "hourlyRate",
  "subcontractorRef",
  "invoiceRef",
  "progressPercent",
  "retentionAmount"
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
  FARM_EXPENSE: "Charge élevage",
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
    key === "unitPrice" ||
    key === "dailyRate" ||
    key === "hourlyRate" ||
    key === "retentionAmount" ||
    key === "monthlyRent" ||
    key === "serviceCharge" ||
    key === "depositAmount" ||
    key === "invoiceAmount" ||
    key === "payoutAmount" ||
    key === "discountAmount" ||
    key === "returnAmount" ||
    key === "roomRate" ||
    key === "mealUnitPrice" ||
    key === "serviceUnitPrice" ||
    key === "commissionAmount" ||
    key === "taxAmount" ||
    key === "refundAmount" ||
    key === "connectionFee" ||
    key === "dealAmount" ||
    key === "feeAmount" ||
    key === "expenseAmount" ||
    key === "payoutAmount"
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

function deriveStoreAmount(
  operationKind: StoreOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "STORE_SALE") {
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const saleUnitPrice = toAmountNumber(metadata.saleUnitPrice ?? "");
    const discountAmount = toAmountNumber(metadata.discountAmount ?? "");
    if (quantity <= 0 || saleUnitPrice <= 0) {
      return discountAmount > 0 ? discountAmount.toFixed(2) : null;
    }
    return Math.max(quantity * saleUnitPrice - discountAmount, 0).toFixed(2);
  }

  if (operationKind === "STOCK_PURCHASE") {
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const purchaseUnitPrice = toAmountNumber(metadata.purchaseUnitPrice ?? "");
    if (quantity <= 0 || purchaseUnitPrice <= 0) {
      return null;
    }
    return (quantity * purchaseUnitPrice).toFixed(2);
  }

  if (operationKind === "CUSTOMER_RETURN") {
    const returnAmount = toAmountNumber(metadata.returnAmount ?? "");
    if (returnAmount > 0) {
      return returnAmount.toFixed(2);
    }
    const returnQuantity = toAmountNumber(metadata.returnQuantity ?? "");
    const saleUnitPrice = toAmountNumber(metadata.saleUnitPrice ?? "");
    if (returnQuantity <= 0 || saleUnitPrice <= 0) {
      return null;
    }
    return (returnQuantity * saleUnitPrice).toFixed(2);
  }

  if (operationKind === "DISCOUNT_ADJUSTMENT") {
    const discountAmount = toAmountNumber(metadata.discountAmount ?? "");
    return discountAmount > 0 ? discountAmount.toFixed(2) : null;
  }

  if (operationKind === "INVENTORY_ADJUSTMENT") {
    const adjustmentQuantity = Math.abs(toAmountNumber(metadata.adjustmentQuantity ?? ""));
    const purchaseUnitPrice = toAmountNumber(metadata.purchaseUnitPrice ?? "");
    if (adjustmentQuantity <= 0 || purchaseUnitPrice <= 0) {
      return null;
    }
    return (adjustmentQuantity * purchaseUnitPrice).toFixed(2);
  }

  if (operationKind === "INTERNAL_TRANSFER") {
    return null;
  }

  const invoiceAmount = toAmountNumber(metadata.invoiceAmount ?? "");
  return invoiceAmount > 0 ? invoiceAmount.toFixed(2) : null;
}

function deriveFoodAmount(
  operationKind: FoodOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "PRODUCT_SALE" || operationKind === "CUSTOMER_REFUND") {
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const saleUnitPrice = toAmountNumber(metadata.saleUnitPrice ?? "");
    if (quantity <= 0 || saleUnitPrice <= 0) {
      return null;
    }
    return (quantity * saleUnitPrice).toFixed(2);
  }

  if (operationKind === "PRODUCT_PURCHASE") {
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const purchaseUnitPrice = toAmountNumber(metadata.purchaseUnitPrice ?? "");
    if (quantity <= 0 || purchaseUnitPrice <= 0) {
      return null;
    }
    return (quantity * purchaseUnitPrice).toFixed(2);
  }

  if (operationKind === "STOCK_LOSS") {
    const lossQuantity = toAmountNumber(metadata.lossQuantity ?? "");
    const purchaseUnitPrice = toAmountNumber(metadata.purchaseUnitPrice ?? "");
    if (lossQuantity <= 0 || purchaseUnitPrice <= 0) {
      return null;
    }
    return (lossQuantity * purchaseUnitPrice).toFixed(2);
  }

  const invoiceAmount = toAmountNumber(metadata.invoiceAmount ?? "");
  return invoiceAmount > 0 ? invoiceAmount.toFixed(2) : null;
}

function deriveBtpAmount(
  operationKind: BtpOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "MATERIAL_PURCHASE" || operationKind === "SUBCONTRACTING") {
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
    if (quantity <= 0 || unitPrice <= 0) {
      return null;
    }
    return (quantity * unitPrice).toFixed(2);
  }

  if (operationKind === "LABOR_PAYMENT") {
    const workerCount = toAmountNumber(metadata.workerCount ?? "");
    const workDays = toAmountNumber(metadata.workDays ?? "");
    const dailyRate = toAmountNumber(metadata.dailyRate ?? "");
    if (workerCount <= 0 || workDays <= 0 || dailyRate <= 0) {
      return null;
    }
    return (workerCount * workDays * dailyRate).toFixed(2);
  }

  if (operationKind === "EQUIPMENT_RENTAL") {
    const equipmentHours = toAmountNumber(metadata.equipmentHours ?? "");
    const hourlyRate = toAmountNumber(metadata.hourlyRate ?? "");
    if (equipmentHours <= 0 || hourlyRate <= 0) {
      return null;
    }
    return (equipmentHours * hourlyRate).toFixed(2);
  }

  return null;
}

function deriveRentalAmount(
  operationKind: RentalOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "RENT_PAYMENT") {
    const monthsCount = toAmountNumber(metadata.monthsCount ?? "");
    const monthlyRent = toAmountNumber(metadata.monthlyRent ?? "");
    const serviceCharge = toAmountNumber(metadata.serviceCharge ?? "");
    if (monthsCount <= 0 || monthlyRent <= 0) {
      return serviceCharge > 0 ? serviceCharge.toFixed(2) : null;
    }
    return (monthsCount * monthlyRent + serviceCharge).toFixed(2);
  }

  if (operationKind === "ADVANCE_PAYMENT") {
    const monthsCount = toAmountNumber(metadata.monthsCount ?? "");
    const monthlyRent = toAmountNumber(metadata.monthlyRent ?? "");
    if (monthsCount <= 0 || monthlyRent <= 0) {
      return null;
    }
    return (monthsCount * monthlyRent).toFixed(2);
  }

  if (operationKind === "SECURITY_DEPOSIT") {
    const depositAmount = toAmountNumber(metadata.depositAmount ?? "");
    return depositAmount > 0 ? depositAmount.toFixed(2) : null;
  }

  if (operationKind === "SERVICE_CHARGE_INCOME") {
    const serviceCharge = toAmountNumber(metadata.serviceCharge ?? "");
    return serviceCharge > 0 ? serviceCharge.toFixed(2) : null;
  }

  if (operationKind === "MAINTENANCE_EXPENSE" || operationKind === "PROPERTY_EXPENSE") {
    const invoiceAmount = toAmountNumber(metadata.invoiceAmount ?? "");
    return invoiceAmount > 0 ? invoiceAmount.toFixed(2) : null;
  }

  const payoutAmount = toAmountNumber(metadata.payoutAmount ?? "");
  return payoutAmount > 0 ? payoutAmount.toFixed(2) : null;
}

function deriveHotelAmount(
  operationKind: HotelOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "ROOM_PAYMENT") {
    const nightsCount = toAmountNumber(metadata.nightsCount ?? "");
    const roomRate = toAmountNumber(metadata.roomRate ?? "");
    if (nightsCount <= 0 || roomRate <= 0) {
      return null;
    }
    return (nightsCount * roomRate).toFixed(2);
  }

  if (operationKind === "RESTAURANT_SALE") {
    const mealCount = toAmountNumber(metadata.mealCount ?? "");
    const mealUnitPrice = toAmountNumber(metadata.mealUnitPrice ?? "");
    if (mealCount <= 0 || mealUnitPrice <= 0) {
      return null;
    }
    return (mealCount * mealUnitPrice).toFixed(2);
  }

  if (operationKind === "EVENT_SERVICE" || operationKind === "LAUNDRY_SERVICE") {
    const serviceQuantity = toAmountNumber(metadata.serviceQuantity ?? "");
    const serviceUnitPrice = toAmountNumber(metadata.serviceUnitPrice ?? "");
    if (serviceQuantity <= 0 || serviceUnitPrice <= 0) {
      return null;
    }
    return (serviceQuantity * serviceUnitPrice).toFixed(2);
  }

  if (operationKind === "COMMISSION_FEE") {
    const commissionAmount = toAmountNumber(metadata.commissionAmount ?? "");
    return commissionAmount > 0 ? commissionAmount.toFixed(2) : null;
  }

  if (operationKind === "TAX_PAYMENT") {
    const taxAmount = toAmountNumber(metadata.taxAmount ?? "");
    return taxAmount > 0 ? taxAmount.toFixed(2) : null;
  }

  if (operationKind === "GUEST_REFUND") {
    const refundAmount = toAmountNumber(metadata.refundAmount ?? "");
    return refundAmount > 0 ? refundAmount.toFixed(2) : null;
  }

  const invoiceAmount = toAmountNumber(metadata.invoiceAmount ?? "");
  return invoiceAmount > 0 ? invoiceAmount.toFixed(2) : null;
}

function deriveWaterAmount(
  operationKind: WaterOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "WATER_BILLING" || operationKind === "BULK_WATER_SALE") {
    const volumeM3 = toAmountNumber(metadata.volumeM3 ?? "");
    const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
    if (volumeM3 > 0 && unitPrice > 0) {
      return (volumeM3 * unitPrice).toFixed(2);
    }
  }

  if (operationKind === "CONNECTION_FEE") {
    const connectionFee = toAmountNumber(metadata.connectionFee ?? "");
    return connectionFee > 0 ? connectionFee.toFixed(2) : null;
  }

  if (operationKind === "CHEMICAL_PURCHASE") {
    const chemicalQuantity = toAmountNumber(metadata.chemicalQuantity ?? "");
    const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
    if (chemicalQuantity > 0 && unitPrice > 0) {
      return (chemicalQuantity * unitPrice).toFixed(2);
    }
  }

  if (operationKind === "ENERGY_PAYMENT") {
    const energyQuantity = toAmountNumber(metadata.energyQuantity ?? "");
    const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
    if (energyQuantity > 0 && unitPrice > 0) {
      return (energyQuantity * unitPrice).toFixed(2);
    }
  }

  const invoiceAmount = toAmountNumber(metadata.invoiceAmount ?? "");
  return invoiceAmount > 0 ? invoiceAmount.toFixed(2) : null;
}

function deriveAgencyAmount(
  operationKind: AgencyOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "SALE_COMMISSION" || operationKind === "RENTAL_COMMISSION") {
    const commissionAmount = toAmountNumber(metadata.commissionAmount ?? "");
    if (commissionAmount > 0) {
      return commissionAmount.toFixed(2);
    }
    const dealAmount = toAmountNumber(metadata.dealAmount ?? "");
    const commissionRate = toAmountNumber(metadata.commissionRate ?? "");
    if (dealAmount > 0 && commissionRate > 0) {
      return ((dealAmount * commissionRate) / 100).toFixed(2);
    }
    return null;
  }

  if (operationKind === "MANDATE_FEE" || operationKind === "FILE_FEE") {
    const feeAmount = toAmountNumber(metadata.feeAmount ?? "");
    return feeAmount > 0 ? feeAmount.toFixed(2) : null;
  }

  if (operationKind === "VISIT_FEE" || operationKind === "FIELD_VISIT_EXPENSE") {
    const visitCount = toAmountNumber(metadata.visitCount ?? "");
    const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
    if (visitCount > 0 && unitPrice > 0) {
      return (visitCount * unitPrice).toFixed(2);
    }
  }

  if (operationKind === "BROKER_PAYOUT") {
    const payoutAmount = toAmountNumber(metadata.payoutAmount ?? "");
    return payoutAmount > 0 ? payoutAmount.toFixed(2) : null;
  }

  if (operationKind === "CUSTOMER_REFUND") {
    const refundAmount = toAmountNumber(metadata.refundAmount ?? "");
    return refundAmount > 0 ? refundAmount.toFixed(2) : null;
  }

  const expenseAmount = toAmountNumber(metadata.expenseAmount ?? "");
  return expenseAmount > 0 ? expenseAmount.toFixed(2) : null;
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
  return STORE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    HARDWARE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    FOOD_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    RENTAL_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    HOTEL_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    WATER_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    AGENCY_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    AGRICULTURE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    BTP_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    FISH_FARMING_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    LIVESTOCK_NUMERIC_METADATA_FIELDS.has(fieldKey)
    ? "decimal"
    : "text";
}

function shouldDeriveHardwareAmount(fieldKey: string): boolean {
  return HARDWARE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveStoreAmount(fieldKey: string): boolean {
  return STORE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveFoodAmount(fieldKey: string): boolean {
  return FOOD_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveRentalAmount(fieldKey: string): boolean {
  return RENTAL_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveHotelAmount(fieldKey: string): boolean {
  return HOTEL_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveWaterAmount(fieldKey: string): boolean {
  return WATER_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveAgencyAmount(fieldKey: string): boolean {
  return AGENCY_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveAgricultureAmount(fieldKey: string): boolean {
  return AGRICULTURE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

function shouldDeriveBtpAmount(fieldKey: string): boolean {
  return BTP_AMOUNT_METADATA_FIELDS.has(fieldKey);
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
  return activityCode === "GENERAL_STORE" ||
    activityCode === "HARDWARE" ||
    activityCode === "FOOD" ||
    activityCode === "RENTAL" ||
    activityCode === "HOTEL_LODGING" ||
    activityCode === "WATER" ||
    activityCode === "REAL_ESTATE_AGENCY"
    ? "CASH_IN"
    : "CASH_OUT";
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

function isStoreOperationKind(value: string | undefined): value is StoreOperationKind {
  return (
    value === "STORE_SALE" ||
    value === "STOCK_PURCHASE" ||
    value === "SUPPLIER_PAYMENT" ||
    value === "CUSTOMER_RETURN" ||
    value === "DISCOUNT_ADJUSTMENT" ||
    value === "INVENTORY_ADJUSTMENT" ||
    value === "INTERNAL_TRANSFER" ||
    value === "STORE_EXPENSE"
  );
}

function hasStoreMetadata(metadata: Record<string, string>): boolean {
  return [
    "department",
    "productFamily",
    "itemName",
    "skuRef",
    "barcode",
    "shelfRef",
    "registerRef",
    "cashierRef",
    "quantity",
    "returnQuantity",
    "adjustmentQuantity",
    "purchaseUnitPrice",
    "saleUnitPrice",
    "discountAmount",
    "returnAmount",
    "invoiceAmount",
    "supplierRef",
    "customerRef",
    "invoiceRef",
    "receiptRef",
    "transferRef",
    "sourceStoreRef",
    "destinationStoreRef",
    "expenseLabel",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getStoreOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): StoreOperationKind {
  const configuredKind = metadata[STORE_OPERATION_KIND_KEY]?.trim();
  if (isStoreOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasStoreMetadata(metadata)) {
    return type === "CASH_IN" ? "STORE_SALE" : "STOCK_PURCHASE";
  }
  return type === "CASH_IN" ? "STORE_SALE" : "STORE_EXPENSE";
}

function getStoreOperationType(kind: StoreOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "STORE_SALE" ? "CASH_IN" : "CASH_OUT";
}

function getStoreVisibleKeys(kind: StoreOperationKind): Set<string> {
  if (kind === "STORE_SALE") {
    return STORE_SALE_METADATA_FIELDS;
  }
  if (kind === "STOCK_PURCHASE") {
    return STORE_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return STORE_SUPPLIER_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "CUSTOMER_RETURN") {
    return STORE_CUSTOMER_RETURN_METADATA_FIELDS;
  }
  if (kind === "DISCOUNT_ADJUSTMENT") {
    return STORE_DISCOUNT_ADJUSTMENT_METADATA_FIELDS;
  }
  if (kind === "INVENTORY_ADJUSTMENT") {
    return STORE_INVENTORY_ADJUSTMENT_METADATA_FIELDS;
  }
  if (kind === "INTERNAL_TRANSFER") {
    return STORE_INTERNAL_TRANSFER_METADATA_FIELDS;
  }
  return STORE_EXPENSE_METADATA_FIELDS;
}

function isFoodOperationKind(value: string | undefined): value is FoodOperationKind {
  return (
    value === "PRODUCT_SALE" ||
    value === "PRODUCT_PURCHASE" ||
    value === "SUPPLIER_PAYMENT" ||
    value === "STOCK_LOSS" ||
    value === "COLD_CHAIN_EXPENSE" ||
    value === "PACKAGING_EXPENSE" ||
    value === "CUSTOMER_REFUND"
  );
}

function hasFoodMetadata(metadata: Record<string, string>): boolean {
  return [
    "productFamily",
    "productName",
    "batchRef",
    "expiryDate",
    "storageArea",
    "temperatureRange",
    "quantity",
    "lossQuantity",
    "purchaseUnitPrice",
    "saleUnitPrice",
    "supplierRef",
    "buyerRef",
    "invoiceRef",
    "invoiceAmount",
    "lossReason",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getFoodOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): FoodOperationKind {
  const configuredKind = metadata[FOOD_OPERATION_KIND_KEY]?.trim();
  if (isFoodOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasFoodMetadata(metadata)) {
    return type === "CASH_IN" ? "PRODUCT_SALE" : "PRODUCT_PURCHASE";
  }
  return type === "CASH_IN" ? "PRODUCT_SALE" : "SUPPLIER_PAYMENT";
}

function getFoodOperationType(kind: FoodOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "PRODUCT_SALE" ? "CASH_IN" : "CASH_OUT";
}

function getFoodVisibleKeys(kind: FoodOperationKind): Set<string> {
  if (kind === "PRODUCT_SALE") {
    return FOOD_PRODUCT_SALE_METADATA_FIELDS;
  }
  if (kind === "PRODUCT_PURCHASE") {
    return FOOD_PRODUCT_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return FOOD_SUPPLIER_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "STOCK_LOSS") {
    return FOOD_STOCK_LOSS_METADATA_FIELDS;
  }
  if (kind === "COLD_CHAIN_EXPENSE") {
    return FOOD_COLD_CHAIN_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "PACKAGING_EXPENSE") {
    return FOOD_PACKAGING_EXPENSE_METADATA_FIELDS;
  }
  return FOOD_CUSTOMER_REFUND_METADATA_FIELDS;
}

function isRentalOperationKind(value: string | undefined): value is RentalOperationKind {
  return (
    value === "RENT_PAYMENT" ||
    value === "SECURITY_DEPOSIT" ||
    value === "ADVANCE_PAYMENT" ||
    value === "SERVICE_CHARGE_INCOME" ||
    value === "MAINTENANCE_EXPENSE" ||
    value === "PROPERTY_EXPENSE" ||
    value === "OWNER_PAYOUT"
  );
}

function hasRentalMetadata(metadata: Record<string, string>): boolean {
  return [
    "propertyRef",
    "unitRef",
    "tenantRef",
    "leaseRef",
    "propertyType",
    "locationZone",
    "periodRef",
    "monthsCount",
    "monthlyRent",
    "serviceCharge",
    "depositAmount",
    "chargeLabel",
    "maintenanceType",
    "supplierRef",
    "invoiceRef",
    "invoiceAmount",
    "ownerRef",
    "payoutAmount",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getRentalOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): RentalOperationKind {
  const configuredKind = metadata[RENTAL_OPERATION_KIND_KEY]?.trim();
  if (isRentalOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasRentalMetadata(metadata)) {
    return type === "CASH_IN" ? "RENT_PAYMENT" : "MAINTENANCE_EXPENSE";
  }
  return type === "CASH_IN" ? "RENT_PAYMENT" : "PROPERTY_EXPENSE";
}

function getRentalOperationType(kind: RentalOperationKind): "CASH_IN" | "CASH_OUT" {
  return (
    kind === "RENT_PAYMENT" ||
    kind === "SECURITY_DEPOSIT" ||
    kind === "ADVANCE_PAYMENT" ||
    kind === "SERVICE_CHARGE_INCOME"
  )
    ? "CASH_IN"
    : "CASH_OUT";
}

function getRentalVisibleKeys(kind: RentalOperationKind): Set<string> {
  if (kind === "RENT_PAYMENT") {
    return RENTAL_RENT_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "SECURITY_DEPOSIT") {
    return RENTAL_SECURITY_DEPOSIT_METADATA_FIELDS;
  }
  if (kind === "ADVANCE_PAYMENT") {
    return RENTAL_ADVANCE_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "SERVICE_CHARGE_INCOME") {
    return RENTAL_SERVICE_CHARGE_INCOME_METADATA_FIELDS;
  }
  if (kind === "MAINTENANCE_EXPENSE") {
    return RENTAL_MAINTENANCE_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "PROPERTY_EXPENSE") {
    return RENTAL_PROPERTY_EXPENSE_METADATA_FIELDS;
  }
  return RENTAL_OWNER_PAYOUT_METADATA_FIELDS;
}

function isHotelOperationKind(value: string | undefined): value is HotelOperationKind {
  return (
    value === "ROOM_PAYMENT" ||
    value === "BOOKING_DEPOSIT" ||
    value === "RESTAURANT_SALE" ||
    value === "EVENT_SERVICE" ||
    value === "LAUNDRY_SERVICE" ||
    value === "ROOM_MAINTENANCE" ||
    value === "SUPPLIER_PAYMENT" ||
    value === "COMMISSION_FEE" ||
    value === "TAX_PAYMENT" ||
    value === "GUEST_REFUND"
  );
}

function hasHotelMetadata(metadata: Record<string, string>): boolean {
  return [
    "bookingRef",
    "stayRef",
    "guestRef",
    "roomRef",
    "roomType",
    "serviceLine",
    "checkInDate",
    "checkOutDate",
    "nightsCount",
    "roomRate",
    "guestCount",
    "mealCount",
    "mealUnitPrice",
    "serviceQuantity",
    "serviceUnitPrice",
    "eventRef",
    "supplierRef",
    "invoiceRef",
    "invoiceAmount",
    "commissionAmount",
    "taxAmount",
    "refundAmount",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getHotelOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): HotelOperationKind {
  const configuredKind = metadata[HOTEL_OPERATION_KIND_KEY]?.trim();
  if (isHotelOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasHotelMetadata(metadata)) {
    return type === "CASH_IN" ? "ROOM_PAYMENT" : "ROOM_MAINTENANCE";
  }
  return type === "CASH_IN" ? "ROOM_PAYMENT" : "SUPPLIER_PAYMENT";
}

function getHotelOperationType(kind: HotelOperationKind): "CASH_IN" | "CASH_OUT" {
  return (
    kind === "ROOM_PAYMENT" ||
    kind === "BOOKING_DEPOSIT" ||
    kind === "RESTAURANT_SALE" ||
    kind === "EVENT_SERVICE" ||
    kind === "LAUNDRY_SERVICE"
  )
    ? "CASH_IN"
    : "CASH_OUT";
}

function getHotelVisibleKeys(kind: HotelOperationKind): Set<string> {
  if (kind === "ROOM_PAYMENT") {
    return HOTEL_ROOM_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "BOOKING_DEPOSIT") {
    return HOTEL_BOOKING_DEPOSIT_METADATA_FIELDS;
  }
  if (kind === "RESTAURANT_SALE") {
    return HOTEL_RESTAURANT_SALE_METADATA_FIELDS;
  }
  if (kind === "EVENT_SERVICE") {
    return HOTEL_EVENT_SERVICE_METADATA_FIELDS;
  }
  if (kind === "LAUNDRY_SERVICE") {
    return HOTEL_LAUNDRY_SERVICE_METADATA_FIELDS;
  }
  if (kind === "ROOM_MAINTENANCE") {
    return HOTEL_ROOM_MAINTENANCE_METADATA_FIELDS;
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return HOTEL_SUPPLIER_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "COMMISSION_FEE") {
    return HOTEL_COMMISSION_FEE_METADATA_FIELDS;
  }
  if (kind === "TAX_PAYMENT") {
    return HOTEL_TAX_PAYMENT_METADATA_FIELDS;
  }
  return HOTEL_GUEST_REFUND_METADATA_FIELDS;
}

function isWaterOperationKind(value: string | undefined): value is WaterOperationKind {
  return (
    value === "WATER_BILLING" ||
    value === "BULK_WATER_SALE" ||
    value === "CONNECTION_FEE" ||
    value === "SUBSIDY_INCOME" ||
    value === "CHEMICAL_PURCHASE" ||
    value === "ENERGY_PAYMENT" ||
    value === "MAINTENANCE_EXPENSE" ||
    value === "QUALITY_TEST_EXPENSE" ||
    value === "NETWORK_REPAIR" ||
    value === "SUPPLIER_PAYMENT"
  );
}

function hasWaterMetadata(metadata: Record<string, string>): boolean {
  return [
    "facilityRef",
    "networkZone",
    "productionLine",
    "meterRef",
    "customerRef",
    "billingPeriod",
    "meterStart",
    "meterEnd",
    "producedVolumeM3",
    "volumeM3",
    "unitPrice",
    "connectionRef",
    "connectionFee",
    "treatmentProduct",
    "chemicalQuantity",
    "energySource",
    "energyQuantity",
    "equipmentRef",
    "maintenanceType",
    "testRef",
    "waterQuality",
    "issueRef",
    "supplierRef",
    "invoiceRef",
    "invoiceAmount",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getWaterOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): WaterOperationKind {
  const configuredKind = metadata[WATER_OPERATION_KIND_KEY]?.trim();
  if (isWaterOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasWaterMetadata(metadata)) {
    return type === "CASH_IN" ? "WATER_BILLING" : "MAINTENANCE_EXPENSE";
  }
  return type === "CASH_IN" ? "WATER_BILLING" : "SUPPLIER_PAYMENT";
}

function getWaterOperationType(kind: WaterOperationKind): "CASH_IN" | "CASH_OUT" {
  return (
    kind === "WATER_BILLING" ||
    kind === "BULK_WATER_SALE" ||
    kind === "CONNECTION_FEE" ||
    kind === "SUBSIDY_INCOME"
  )
    ? "CASH_IN"
    : "CASH_OUT";
}

function getWaterVisibleKeys(kind: WaterOperationKind): Set<string> {
  if (kind === "WATER_BILLING") {
    return WATER_BILLING_METADATA_FIELDS;
  }
  if (kind === "BULK_WATER_SALE") {
    return WATER_BULK_SALE_METADATA_FIELDS;
  }
  if (kind === "CONNECTION_FEE") {
    return WATER_CONNECTION_FEE_METADATA_FIELDS;
  }
  if (kind === "SUBSIDY_INCOME") {
    return WATER_SUBSIDY_METADATA_FIELDS;
  }
  if (kind === "CHEMICAL_PURCHASE") {
    return WATER_CHEMICAL_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "ENERGY_PAYMENT") {
    return WATER_ENERGY_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "MAINTENANCE_EXPENSE") {
    return WATER_MAINTENANCE_METADATA_FIELDS;
  }
  if (kind === "QUALITY_TEST_EXPENSE") {
    return WATER_QUALITY_TEST_METADATA_FIELDS;
  }
  if (kind === "NETWORK_REPAIR") {
    return WATER_NETWORK_REPAIR_METADATA_FIELDS;
  }
  return WATER_SUPPLIER_PAYMENT_METADATA_FIELDS;
}

function isAgencyOperationKind(value: string | undefined): value is AgencyOperationKind {
  return (
    value === "SALE_COMMISSION" ||
    value === "RENTAL_COMMISSION" ||
    value === "MANDATE_FEE" ||
    value === "VISIT_FEE" ||
    value === "FILE_FEE" ||
    value === "ADVERTISING_EXPENSE" ||
    value === "FIELD_VISIT_EXPENSE" ||
    value === "BROKER_PAYOUT" ||
    value === "DOCUMENT_EXPENSE" ||
    value === "CUSTOMER_REFUND" ||
    value === "OFFICE_EXPENSE"
  );
}

function hasAgencyMetadata(metadata: Record<string, string>): boolean {
  return [
    "mandateRef",
    "propertyRef",
    "mandateType",
    "propertyType",
    "locationZone",
    "ownerRef",
    "clientRef",
    "prospectRef",
    "dealRef",
    "dealStage",
    "dealAmount",
    "commissionRate",
    "commissionAmount",
    "feeAmount",
    "visitCount",
    "unitPrice",
    "advertisingChannel",
    "documentRef",
    "supplierRef",
    "invoiceRef",
    "expenseAmount",
    "payoutAmount",
    "refundAmount",
    "paymentRef"
  ].some((key) => metadata[key]?.trim());
}

function getAgencyOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): AgencyOperationKind {
  const configuredKind = metadata[AGENCY_OPERATION_KIND_KEY]?.trim();
  if (isAgencyOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasAgencyMetadata(metadata)) {
    return type === "CASH_IN" ? "SALE_COMMISSION" : "ADVERTISING_EXPENSE";
  }
  return type === "CASH_IN" ? "SALE_COMMISSION" : "OFFICE_EXPENSE";
}

function getAgencyOperationType(kind: AgencyOperationKind): "CASH_IN" | "CASH_OUT" {
  return (
    kind === "SALE_COMMISSION" ||
    kind === "RENTAL_COMMISSION" ||
    kind === "MANDATE_FEE" ||
    kind === "VISIT_FEE" ||
    kind === "FILE_FEE"
  )
    ? "CASH_IN"
    : "CASH_OUT";
}

function getAgencyVisibleKeys(kind: AgencyOperationKind): Set<string> {
  if (kind === "SALE_COMMISSION") {
    return AGENCY_SALE_COMMISSION_METADATA_FIELDS;
  }
  if (kind === "RENTAL_COMMISSION") {
    return AGENCY_RENTAL_COMMISSION_METADATA_FIELDS;
  }
  if (kind === "MANDATE_FEE") {
    return AGENCY_MANDATE_FEE_METADATA_FIELDS;
  }
  if (kind === "VISIT_FEE") {
    return AGENCY_VISIT_FEE_METADATA_FIELDS;
  }
  if (kind === "FILE_FEE") {
    return AGENCY_FILE_FEE_METADATA_FIELDS;
  }
  if (kind === "ADVERTISING_EXPENSE") {
    return AGENCY_ADVERTISING_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "FIELD_VISIT_EXPENSE") {
    return AGENCY_FIELD_VISIT_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "BROKER_PAYOUT") {
    return AGENCY_BROKER_PAYOUT_METADATA_FIELDS;
  }
  if (kind === "DOCUMENT_EXPENSE") {
    return AGENCY_DOCUMENT_EXPENSE_METADATA_FIELDS;
  }
  if (kind === "CUSTOMER_REFUND") {
    return AGENCY_CUSTOMER_REFUND_METADATA_FIELDS;
  }
  return AGENCY_OFFICE_EXPENSE_METADATA_FIELDS;
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

function isBtpOperationKind(value: string | undefined): value is BtpOperationKind {
  return (
    value === "CLIENT_PAYMENT" ||
    value === "MATERIAL_PURCHASE" ||
    value === "LABOR_PAYMENT" ||
    value === "EQUIPMENT_RENTAL" ||
    value === "SUBCONTRACTING" ||
    value === "SITE_EXPENSE"
  );
}

function hasBtpMetadata(metadata: Record<string, string>): boolean {
  return [
    "projectRef",
    "contractRef",
    "clientRef",
    "workPackage",
    "siteLocation",
    "materialName",
    "quantity",
    "unitPrice",
    "supplierRef",
    "teamRef",
    "workerCount",
    "workDays",
    "dailyRate",
    "equipmentRef",
    "equipmentHours",
    "hourlyRate",
    "subcontractorRef",
    "invoiceRef",
    "progressPercent",
    "retentionAmount"
  ].some((key) => metadata[key]?.trim());
}

function getBtpOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): BtpOperationKind {
  const configuredKind = metadata[BTP_OPERATION_KIND_KEY]?.trim();
  if (isBtpOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (!hasBtpMetadata(metadata)) {
    return type === "CASH_IN" ? "CLIENT_PAYMENT" : "MATERIAL_PURCHASE";
  }
  return type === "CASH_IN" ? "CLIENT_PAYMENT" : "SITE_EXPENSE";
}

function getBtpOperationType(kind: BtpOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "CLIENT_PAYMENT" ? "CASH_IN" : "CASH_OUT";
}

function getBtpVisibleKeys(kind: BtpOperationKind): Set<string> {
  if (kind === "CLIENT_PAYMENT") {
    return BTP_CLIENT_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "MATERIAL_PURCHASE") {
    return BTP_MATERIAL_PURCHASE_METADATA_FIELDS;
  }
  if (kind === "LABOR_PAYMENT") {
    return BTP_LABOR_PAYMENT_METADATA_FIELDS;
  }
  if (kind === "EQUIPMENT_RENTAL") {
    return BTP_EQUIPMENT_RENTAL_METADATA_FIELDS;
  }
  if (kind === "SUBCONTRACTING") {
    return BTP_SUBCONTRACTING_METADATA_FIELDS;
  }
  return BTP_SITE_EXPENSE_METADATA_FIELDS;
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

  if (activityCode === "BTP") {
    const operationKind = getBtpOperationKind(type, metadata);
    const visibleKeys = getBtpVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "GENERAL_STORE") {
    const operationKind = getStoreOperationKind(type, metadata);
    const visibleKeys = getStoreVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "FOOD") {
    const operationKind = getFoodOperationKind(type, metadata);
    const visibleKeys = getFoodVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "RENTAL") {
    const operationKind = getRentalOperationKind(type, metadata);
    const visibleKeys = getRentalVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "HOTEL_LODGING") {
    const operationKind = getHotelOperationKind(type, metadata);
    const visibleKeys = getHotelVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "WATER") {
    const operationKind = getWaterOperationKind(type, metadata);
    const visibleKeys = getWaterVisibleKeys(operationKind);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode === "REAL_ESTATE_AGENCY") {
    const operationKind = getAgencyOperationKind(type, metadata);
    const visibleKeys = getAgencyVisibleKeys(operationKind);
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

  if (activityCode === "BTP") {
    const operationKind = getBtpOperationKind(type, metadata);
    const visibleKeys = getBtpVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [BTP_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        BTP_METADATA_FIELDS.has(key) &&
        key !== BTP_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "GENERAL_STORE") {
    const operationKind = getStoreOperationKind(type, metadata);
    const visibleKeys = getStoreVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [STORE_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        STORE_METADATA_FIELDS.has(key) &&
        key !== STORE_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "FOOD") {
    const operationKind = getFoodOperationKind(type, metadata);
    const visibleKeys = getFoodVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [FOOD_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        FOOD_METADATA_FIELDS.has(key) &&
        key !== FOOD_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "RENTAL") {
    const operationKind = getRentalOperationKind(type, metadata);
    const visibleKeys = getRentalVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [RENTAL_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        RENTAL_METADATA_FIELDS.has(key) &&
        key !== RENTAL_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "HOTEL_LODGING") {
    const operationKind = getHotelOperationKind(type, metadata);
    const visibleKeys = getHotelVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [HOTEL_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        HOTEL_METADATA_FIELDS.has(key) &&
        key !== HOTEL_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "WATER") {
    const operationKind = getWaterOperationKind(type, metadata);
    const visibleKeys = getWaterVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [WATER_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        WATER_METADATA_FIELDS.has(key) &&
        key !== WATER_OPERATION_KIND_KEY &&
        !visibleKeys.has(key)
          ? ""
          : value
      ])
    );
  }

  if (activityCode === "REAL_ESTATE_AGENCY") {
    const operationKind = getAgencyOperationKind(type, metadata);
    const visibleKeys = getAgencyVisibleKeys(operationKind);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [AGENCY_OPERATION_KIND_KEY]: operationKind
      }).map(([key, value]) => [
        key,
        AGENCY_METADATA_FIELDS.has(key) &&
        key !== AGENCY_OPERATION_KIND_KEY &&
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
  if (activityCode === "BTP") {
    return deriveBtpAmount(getBtpOperationKind(type, metadata), metadata);
  }
  if (activityCode === "GENERAL_STORE") {
    return deriveStoreAmount(getStoreOperationKind(type, metadata), metadata);
  }
  if (activityCode === "FOOD") {
    return deriveFoodAmount(getFoodOperationKind(type, metadata), metadata);
  }
  if (activityCode === "RENTAL") {
    return deriveRentalAmount(getRentalOperationKind(type, metadata), metadata);
  }
  if (activityCode === "HOTEL_LODGING") {
    return deriveHotelAmount(getHotelOperationKind(type, metadata), metadata);
  }
  if (activityCode === "WATER") {
    return deriveWaterAmount(getWaterOperationKind(type, metadata), metadata);
  }
  if (activityCode === "REAL_ESTATE_AGENCY") {
    return deriveAgencyAmount(getAgencyOperationKind(type, metadata), metadata);
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
    ? "Vente: renseignez la quantité, le prix de vente et le versement."
    : kind === "ITEM_ENTRY"
      ? "Acquisition: renseignez la quantité, le prix d'achat et le fournisseur."
      : "Transaction globale: renseignez seulement le montant et la description utile.";
}

function getStoreFormModeLabel(kind: StoreOperationKind): string {
  if (kind === "STORE_SALE") {
    return "Vente caisse: rayon, article, référence, caisse, caissier, quantité, prix de vente, remise et ticket.";
  }
  if (kind === "STOCK_PURCHASE") {
    return "Achat stock: rayon, article, quantité, prix d'achat, fournisseur et facture.";
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return "Paiement fournisseur: fournisseur, facture, montant et référence de paiement.";
  }
  if (kind === "CUSTOMER_RETURN") {
    return "Retour client: article, ticket, quantité retour, montant et client concerné.";
  }
  if (kind === "DISCOUNT_ADJUSTMENT") {
    return "Remise / écart: caisse, caissier, article ou ticket et montant de la remise.";
  }
  if (kind === "INVENTORY_ADJUSTMENT") {
    return "Ajustement inventaire: article, emplacement, écart de quantité, coût unitaire et motif.";
  }
  if (kind === "INTERNAL_TRANSFER") {
    return "Transfert interne: article, quantité, référence transfert, origine et destination.";
  }
  return "Charge magasin: nature de charge, fournisseur, facture, montant et référence de paiement.";
}

function getFoodFormModeLabel(kind: FoodOperationKind): string {
  if (kind === "PRODUCT_SALE") {
    return "Vente produit: famille, produit, lot, DLC, quantité, prix de vente, client et référence paiement.";
  }
  if (kind === "PRODUCT_PURCHASE") {
    return "Achat stock: famille, produit, lot, DLC, quantité, prix d'achat, fournisseur et facture.";
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return "Paiement fournisseur: fournisseur, facture, montant et référence de paiement.";
  }
  if (kind === "STOCK_LOSS") {
    return "Perte / péremption: lot, DLC, quantité perdue, coût unitaire et motif de retrait.";
  }
  if (kind === "COLD_CHAIN_EXPENSE") {
    return "Chaîne du froid: zone de stockage, température, prestataire, facture et montant.";
  }
  if (kind === "PACKAGING_EXPENSE") {
    return "Emballage: famille, produit, fournisseur, facture et montant.";
  }
  return "Remboursement client: produit, lot, quantité, prix de vente, client et référence paiement.";
}

function getAgricultureFormModeLabel(kind: AgricultureOperationKind): string {
  if (kind === "INPUT_PURCHASE") {
    return "Achat intrants: campagne, parcelle, type de champ, intrant, quantité et prix unitaire.";
  }
  if (kind === "FIELD_EXPENSE") {
    return "Travaux champ: campagne, parcelle, surface et nature des travaux agricoles.";
  }
  if (kind === "HARVEST_SALE") {
    return "Vente récolte: culture, quantité vendue, prix unitaire et acheteur.";
  }
  return "Appui / subvention: campagne, parcelle et source de financement.";
}

function getBtpFormModeLabel(kind: BtpOperationKind): string {
  if (kind === "CLIENT_PAYMENT") {
    return "Encaissement client: chantier, marché/devis, client, situation de travaux et avancement.";
  }
  if (kind === "MATERIAL_PURCHASE") {
    return "Achat matériaux: chantier, lot, matériau, quantité, prix unitaire et fournisseur.";
  }
  if (kind === "LABOR_PAYMENT") {
    return "Main-d'oeuvre: chantier, lot, équipe, nombre d'ouvriers, jours travailles et taux journalier.";
  }
  if (kind === "EQUIPMENT_RENTAL") {
    return "Location engin: chantier, engin, heures ou vacations, taux horaire et fournisseur.";
  }
  if (kind === "SUBCONTRACTING") {
    return "Sous-traitance: chantier, lot, sous-traitant, quantité ou avancement, facture et retenue.";
  }
  return "Charge chantier: dépense générale, réserve, approvisionnement ou autre charge rattachée au chantier.";
}

function getRentalFormModeLabel(kind: RentalOperationKind): string {
  if (kind === "RENT_PAYMENT") {
    return "Paiement loyer: bien, lot, locataire, bail, période, nombre de mois, loyer mensuel et charges.";
  }
  if (kind === "SECURITY_DEPOSIT") {
    return "Caution: bien, lot, locataire, bail, montant caution et référence du paiement.";
  }
  if (kind === "ADVANCE_PAYMENT") {
    return "Avance loyer: période couverte, nombre de mois, loyer mensuel et référence du paiement.";
  }
  if (kind === "SERVICE_CHARGE_INCOME") {
    return "Charges recuperees: période, nature de charge, montant des charges et référence du paiement.";
  }
  if (kind === "MAINTENANCE_EXPENSE") {
    return "Maintenance: type d'intervention, prestataire, facture et montant de la dépense.";
  }
  if (kind === "PROPERTY_EXPENSE") {
    return "Charge bien: nature de charge, prestataire, facture et montant rattaché au bien.";
  }
  return "Reversement propriétaire: propriétaire, période, montant reverse et référence du paiement.";
}

function getHotelFormModeLabel(kind: HotelOperationKind): string {
  if (kind === "ROOM_PAYMENT") {
    return "Paiement chambre: réservation, séjour, client, chambre, dates, nuitées et tarif par nuit.";
  }
  if (kind === "BOOKING_DEPOSIT") {
    return "Acompte réservation: réservation, client, chambre, dates et montant de l'acompte.";
  }
  if (kind === "RESTAURANT_SALE") {
    return "Restauration: réservation ou client, nombre de repas, prix unitaire et référence de paiement.";
  }
  if (kind === "EVENT_SERVICE") {
    return "Evenement / salle: evenement, quantité de service, prix unitaire et facture.";
  }
  if (kind === "LAUNDRY_SERVICE") {
    return "Blanchisserie: quantité de service, prix unitaire, chambre ou séjour rattaché.";
  }
  if (kind === "ROOM_MAINTENANCE") {
    return "Maintenance chambre: chambre, service, fournisseur, facture et montant de charge.";
  }
  if (kind === "SUPPLIER_PAYMENT") {
    return "Paiement fournisseur: service, fournisseur, facture, montant et référence de paiement.";
  }
  if (kind === "COMMISSION_FEE") {
    return "Commission: réservation, agence ou plateforme, montant commission et paiement.";
  }
  if (kind === "TAX_PAYMENT") {
    return "Taxe séjour: réservation, client, service, montant taxe et référence de paiement.";
  }
  return "Remboursement client: réservation, séjour, client, chambre, montant et référence de paiement.";
}

function getWaterFormModeLabel(kind: WaterOperationKind): string {
  if (kind === "WATER_BILLING") {
    return "Facture eau: site, zone, compteur, abonne, période, index, volume m3, prix du m3 et paiement.";
  }
  if (kind === "BULK_WATER_SALE") {
    return "Vente en gros: site, zone, client, volume m3, prix unitaire, facture et paiement.";
  }
  if (kind === "CONNECTION_FEE") {
    return "Branchement: site, zone, abonne, dossier de raccordement, frais et référence paiement.";
  }
  if (kind === "SUBSIDY_INCOME") {
    return "Subvention / appui: site, zone, source, montant et référence de paiement.";
  }
  if (kind === "CHEMICAL_PURCHASE") {
    return "Produit de traitement: site, produit, quantité, prix unitaire, fournisseur et facture.";
  }
  if (kind === "ENERGY_PAYMENT") {
    return "Énergie: site, source énergie, quantité, prix unitaire, fournisseur et facture.";
  }
  if (kind === "MAINTENANCE_EXPENSE") {
    return "Maintenance: site, équipement, type de maintenance, prestataire, facture et montant.";
  }
  if (kind === "QUALITY_TEST_EXPENSE") {
    return "Analyse qualité: site, référence analyse, résultat qualité, laboratoire et montant.";
  }
  if (kind === "NETWORK_REPAIR") {
    return "Réparation réseau: zone, équipement ou conduite, incident, prestataire, facture et montant.";
  }
  return "Paiement fournisseur: site, zone, fournisseur, facture, montant et référence paiement.";
}

function getAgencyFormModeLabel(kind: AgencyOperationKind): string {
  if (kind === "SALE_COMMISSION") {
    return "Commission vente: mandat, bien, vendeur, acquéreur, prix de vente, taux et référence paiement.";
  }
  if (kind === "RENTAL_COMMISSION") {
    return "Commission location: mandat, bien, bailleur, locataire, valeur du bail ou loyer, taux et paiement.";
  }
  if (kind === "MANDATE_FEE") {
    return "Frais mandat: mandat, bien, propriétaire, document rattaché, montant frais et paiement.";
  }
  if (kind === "VISIT_FEE") {
    return "Frais visite: mandat, bien, prospect, nombre de visites, prix unitaire et référence paiement.";
  }
  if (kind === "FILE_FEE") {
    return "Frais dossier: mandat, client, document ou affaire, montant et paiement.";
  }
  if (kind === "ADVERTISING_EXPENSE") {
    return "Publicité: mandat, bien, canal publicitaire, prestataire, facture et montant de dépense.";
  }
  if (kind === "FIELD_VISIT_EXPENSE") {
    return "Déplacement visite: mandat, bien, nombre de sorties, coût unitaire, prestataire et facture.";
  }
  if (kind === "BROKER_PAYOUT") {
    return "Reversement courtier: mandat, affaire, courtier ou apporteur, montant reverse et paiement.";
  }
  if (kind === "DOCUMENT_EXPENSE") {
    return "Frais document: mandat, bien, document administratif, prestataire, facture et montant.";
  }
  if (kind === "CUSTOMER_REFUND") {
    return "Remboursement client: mandat, client, affaire, montant rembourse et référence paiement.";
  }
  return "Charge agence: mandat ou bien rattaché, fournisseur, facture, montant et paiement.";
}

function getFishFarmingFormModeLabel(kind: FishFarmingOperationKind): string {
  if (kind === "FINGERLING_PURCHASE") {
    return "Achat alevins: bassin, cycle, lot, quantité et prix unitaire.";
  }
  if (kind === "FEED_PURCHASE") {
    return "Achat aliment: bassin, cycle, aliment, quantité, unité et fournisseur.";
  }
  if (kind === "POND_EXPENSE") {
    return "Charge bassin: intervention, intrant, mortalité ou qualité d'eau si applicable.";
  }
  if (kind === "FISH_SALE") {
    return "Vente poisson: bassin, cycle, quantité vendue, prix unitaire et acheteur.";
  }
  return "Appui / subvention: bassin, cycle et source de financement.";
}

function getLivestockFormModeLabel(kind: LivestockOperationKind): string {
  if (kind === "ANIMAL_PURCHASE") {
    return "Achat animaux: troupeau, lot, espèce, nombre d'animaux et prix unitaire.";
  }
  if (kind === "FEED_PURCHASE") {
    return "Achat aliment: troupeau, lot, aliment, quantité, unité et fournisseur.";
  }
  if (kind === "VET_CARE") {
    return "Soins / vaccin: troupeau, lot, soin, animaux concernés et état sanitaire.";
  }
  if (kind === "FARM_EXPENSE") {
    return "Charge élevage: alimentation, intrant, mortalité ou observation sanitaire si applicable.";
  }
  if (kind === "ANIMAL_SALE") {
    return "Vente animaux: troupeau, lot, nombre vendu, prix unitaire et acheteur.";
  }
  if (kind === "PRODUCT_SALE") {
    return "Vente produit: produit d'élevage, quantité vendue, prix unitaire et acheteur.";
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
  if (key === STORE_OPERATION_KIND_KEY && isStoreOperationKind(value)) {
    return STORE_OPERATION_LABELS[value];
  }
  if (key === FOOD_OPERATION_KIND_KEY && isFoodOperationKind(value)) {
    return FOOD_OPERATION_LABELS[value];
  }
  if (key === AGRICULTURE_OPERATION_KIND_KEY && isAgricultureOperationKind(value)) {
    return AGRICULTURE_OPERATION_LABELS[value];
  }
  if (key === BTP_OPERATION_KIND_KEY && isBtpOperationKind(value)) {
    return BTP_OPERATION_LABELS[value];
  }
  if (key === RENTAL_OPERATION_KIND_KEY && isRentalOperationKind(value)) {
    return RENTAL_OPERATION_LABELS[value];
  }
  if (key === HOTEL_OPERATION_KIND_KEY && isHotelOperationKind(value)) {
    return HOTEL_OPERATION_LABELS[value];
  }
  if (key === WATER_OPERATION_KIND_KEY && isWaterOperationKind(value)) {
    return WATER_OPERATION_LABELS[value];
  }
  if (key === AGENCY_OPERATION_KIND_KEY && isAgencyOperationKind(value)) {
    return AGENCY_OPERATION_LABELS[value];
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
  const storeOperationKind = selectedActivityCode === "GENERAL_STORE"
    ? getStoreOperationKind(transactionForm.type, transactionForm.metadata)
    : "STORE_SALE";
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
    : "RENT_PAYMENT";
  const hotelOperationKind = selectedActivityCode === "HOTEL_LODGING"
    ? getHotelOperationKind(transactionForm.type, transactionForm.metadata)
    : "ROOM_PAYMENT";
  const waterOperationKind = selectedActivityCode === "WATER"
    ? getWaterOperationKind(transactionForm.type, transactionForm.metadata)
    : "WATER_BILLING";
  const agencyOperationKind = selectedActivityCode === "REAL_ESTATE_AGENCY"
    ? getAgencyOperationKind(transactionForm.type, transactionForm.metadata)
    : "SALE_COMMISSION";
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
      selectedActivityCode === "GENERAL_STORE" ||
      selectedActivityCode === "FOOD" ||
      selectedActivityCode === "AGRICULTURE" ||
      selectedActivityCode === "BTP" ||
      selectedActivityCode === "RENTAL" ||
      selectedActivityCode === "HOTEL_LODGING" ||
      selectedActivityCode === "WATER" ||
      selectedActivityCode === "REAL_ESTATE_AGENCY" ||
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
            <div className="mobile-sticky-form-actions">
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
            </div>
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

            {selectedActivityCode === "GENERAL_STORE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération magasin</span>
                  <select
                    value={storeOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as StoreOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getStoreOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [STORE_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveStoreAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="STORE_SALE">{STORE_OPERATION_LABELS.STORE_SALE}</option>
                    <option value="STOCK_PURCHASE">{STORE_OPERATION_LABELS.STOCK_PURCHASE}</option>
                    <option value="SUPPLIER_PAYMENT">{STORE_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                    <option value="CUSTOMER_RETURN">{STORE_OPERATION_LABELS.CUSTOMER_RETURN}</option>
                    <option value="DISCOUNT_ADJUSTMENT">{STORE_OPERATION_LABELS.DISCOUNT_ADJUSTMENT}</option>
                    <option value="INVENTORY_ADJUSTMENT">{STORE_OPERATION_LABELS.INVENTORY_ADJUSTMENT}</option>
                    <option value="INTERNAL_TRANSFER">{STORE_OPERATION_LABELS.INTERNAL_TRANSFER}</option>
                    <option value="STORE_EXPENSE">{STORE_OPERATION_LABELS.STORE_EXPENSE}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette magasin" : "Dépense magasin"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "HARDWARE" ? (
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
            ) : selectedActivityCode === "FOOD" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération alimentaire</span>
                  <select
                    value={foodOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as FoodOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getFoodOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [FOOD_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveFoodAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="PRODUCT_SALE">{FOOD_OPERATION_LABELS.PRODUCT_SALE}</option>
                    <option value="PRODUCT_PURCHASE">{FOOD_OPERATION_LABELS.PRODUCT_PURCHASE}</option>
                    <option value="SUPPLIER_PAYMENT">{FOOD_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                    <option value="STOCK_LOSS">{FOOD_OPERATION_LABELS.STOCK_LOSS}</option>
                    <option value="COLD_CHAIN_EXPENSE">{FOOD_OPERATION_LABELS.COLD_CHAIN_EXPENSE}</option>
                    <option value="PACKAGING_EXPENSE">{FOOD_OPERATION_LABELS.PACKAGING_EXPENSE}</option>
                    <option value="CUSTOMER_REFUND">{FOOD_OPERATION_LABELS.CUSTOMER_REFUND}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette alimentaire" : "Dépense alimentaire"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "AGRICULTURE" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération agricole</span>
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
                    {transactionForm.type === "CASH_IN" ? "Recette agricole" : "Dépense agricole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "BTP" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération BTP</span>
                  <select
                    value={btpOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as BtpOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getBtpOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [BTP_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveBtpAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="CLIENT_PAYMENT">{BTP_OPERATION_LABELS.CLIENT_PAYMENT}</option>
                    <option value="MATERIAL_PURCHASE">{BTP_OPERATION_LABELS.MATERIAL_PURCHASE}</option>
                    <option value="LABOR_PAYMENT">{BTP_OPERATION_LABELS.LABOR_PAYMENT}</option>
                    <option value="EQUIPMENT_RENTAL">{BTP_OPERATION_LABELS.EQUIPMENT_RENTAL}</option>
                    <option value="SUBCONTRACTING">{BTP_OPERATION_LABELS.SUBCONTRACTING}</option>
                    <option value="SITE_EXPENSE">{BTP_OPERATION_LABELS.SITE_EXPENSE}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette chantier" : "Dépense chantier"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "RENTAL" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération locative</span>
                  <select
                    value={rentalOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as RentalOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getRentalOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [RENTAL_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveRentalAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="RENT_PAYMENT">{RENTAL_OPERATION_LABELS.RENT_PAYMENT}</option>
                    <option value="SECURITY_DEPOSIT">{RENTAL_OPERATION_LABELS.SECURITY_DEPOSIT}</option>
                    <option value="ADVANCE_PAYMENT">{RENTAL_OPERATION_LABELS.ADVANCE_PAYMENT}</option>
                    <option value="SERVICE_CHARGE_INCOME">{RENTAL_OPERATION_LABELS.SERVICE_CHARGE_INCOME}</option>
                    <option value="MAINTENANCE_EXPENSE">{RENTAL_OPERATION_LABELS.MAINTENANCE_EXPENSE}</option>
                    <option value="PROPERTY_EXPENSE">{RENTAL_OPERATION_LABELS.PROPERTY_EXPENSE}</option>
                    <option value="OWNER_PAYOUT">{RENTAL_OPERATION_LABELS.OWNER_PAYOUT}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette locative" : "Dépense locative"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "HOTEL_LODGING" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération hôtelière</span>
                  <select
                    value={hotelOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as HotelOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getHotelOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [HOTEL_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveHotelAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="ROOM_PAYMENT">{HOTEL_OPERATION_LABELS.ROOM_PAYMENT}</option>
                    <option value="BOOKING_DEPOSIT">{HOTEL_OPERATION_LABELS.BOOKING_DEPOSIT}</option>
                    <option value="RESTAURANT_SALE">{HOTEL_OPERATION_LABELS.RESTAURANT_SALE}</option>
                    <option value="EVENT_SERVICE">{HOTEL_OPERATION_LABELS.EVENT_SERVICE}</option>
                    <option value="LAUNDRY_SERVICE">{HOTEL_OPERATION_LABELS.LAUNDRY_SERVICE}</option>
                    <option value="ROOM_MAINTENANCE">{HOTEL_OPERATION_LABELS.ROOM_MAINTENANCE}</option>
                    <option value="SUPPLIER_PAYMENT">{HOTEL_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                    <option value="COMMISSION_FEE">{HOTEL_OPERATION_LABELS.COMMISSION_FEE}</option>
                    <option value="TAX_PAYMENT">{HOTEL_OPERATION_LABELS.TAX_PAYMENT}</option>
                    <option value="GUEST_REFUND">{HOTEL_OPERATION_LABELS.GUEST_REFUND}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette hôtelière" : "Dépense hôtelière"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "WATER" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération eau potable</span>
                  <select
                    value={waterOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as WaterOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getWaterOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [WATER_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveWaterAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="WATER_BILLING">{WATER_OPERATION_LABELS.WATER_BILLING}</option>
                    <option value="BULK_WATER_SALE">{WATER_OPERATION_LABELS.BULK_WATER_SALE}</option>
                    <option value="CONNECTION_FEE">{WATER_OPERATION_LABELS.CONNECTION_FEE}</option>
                    <option value="SUBSIDY_INCOME">{WATER_OPERATION_LABELS.SUBSIDY_INCOME}</option>
                    <option value="CHEMICAL_PURCHASE">{WATER_OPERATION_LABELS.CHEMICAL_PURCHASE}</option>
                    <option value="ENERGY_PAYMENT">{WATER_OPERATION_LABELS.ENERGY_PAYMENT}</option>
                    <option value="MAINTENANCE_EXPENSE">{WATER_OPERATION_LABELS.MAINTENANCE_EXPENSE}</option>
                    <option value="QUALITY_TEST_EXPENSE">{WATER_OPERATION_LABELS.QUALITY_TEST_EXPENSE}</option>
                    <option value="NETWORK_REPAIR">{WATER_OPERATION_LABELS.NETWORK_REPAIR}</option>
                    <option value="SUPPLIER_PAYMENT">{WATER_OPERATION_LABELS.SUPPLIER_PAYMENT}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette eau" : "Dépense exploitation eau"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "REAL_ESTATE_AGENCY" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération agence immobilière</span>
                  <select
                    value={agencyOperationKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as AgencyOperationKind;
                      setTransactionForm((prev) => {
                        const nextType = getAgencyOperationType(nextKind);
                        const nextMetadata = cleanSectorFinanceMetadata(
                          selectedActivityCode,
                          nextType,
                          {
                            ...prev.metadata,
                            [AGENCY_OPERATION_KIND_KEY]: nextKind
                          }
                        );
                        const derivedAmount = deriveAgencyAmount(nextKind, nextMetadata);
                        return {
                          ...prev,
                          type: nextType,
                          amount: formatAmountForInput(derivedAmount ?? ""),
                          metadata: nextMetadata
                        };
                      });
                    }}
                  >
                    <option value="SALE_COMMISSION">{AGENCY_OPERATION_LABELS.SALE_COMMISSION}</option>
                    <option value="RENTAL_COMMISSION">{AGENCY_OPERATION_LABELS.RENTAL_COMMISSION}</option>
                    <option value="MANDATE_FEE">{AGENCY_OPERATION_LABELS.MANDATE_FEE}</option>
                    <option value="VISIT_FEE">{AGENCY_OPERATION_LABELS.VISIT_FEE}</option>
                    <option value="FILE_FEE">{AGENCY_OPERATION_LABELS.FILE_FEE}</option>
                    <option value="ADVERTISING_EXPENSE">{AGENCY_OPERATION_LABELS.ADVERTISING_EXPENSE}</option>
                    <option value="FIELD_VISIT_EXPENSE">{AGENCY_OPERATION_LABELS.FIELD_VISIT_EXPENSE}</option>
                    <option value="BROKER_PAYOUT">{AGENCY_OPERATION_LABELS.BROKER_PAYOUT}</option>
                    <option value="DOCUMENT_EXPENSE">{AGENCY_OPERATION_LABELS.DOCUMENT_EXPENSE}</option>
                    <option value="CUSTOMER_REFUND">{AGENCY_OPERATION_LABELS.CUSTOMER_REFUND}</option>
                    <option value="OFFICE_EXPENSE">{AGENCY_OPERATION_LABELS.OFFICE_EXPENSE}</option>
                  </select>
                </label>

                <div className="operations-inline-group">
                  <span>Flux financier</span>
                  <strong>
                    {transactionForm.type === "CASH_IN" ? "Recette agence" : "Dépense agence"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "FISH_FARMING" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération piscicole</span>
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
                    {transactionForm.type === "CASH_IN" ? "Recette piscicole" : "Dépense piscicole"}
                  </strong>
                </div>
              </>
            ) : selectedActivityCode === "LIVESTOCK" ? (
              <>
                <label className="operations-inline-group">
                  <span>Opération élevage</span>
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
                    {transactionForm.type === "CASH_IN" ? "Recette élevage" : "Dépense élevage"}
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
              {selectedActivityCode === "GENERAL_STORE" ? (
                <p className="hint finance-form-mode-hint">
                  {getStoreFormModeLabel(storeOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "FOOD" ? (
                <p className="hint finance-form-mode-hint">
                  {getFoodFormModeLabel(foodOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "AGRICULTURE" ? (
                <p className="hint finance-form-mode-hint">
                  {getAgricultureFormModeLabel(agricultureOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "BTP" ? (
                <p className="hint finance-form-mode-hint">
                  {getBtpFormModeLabel(btpOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "RENTAL" ? (
                <p className="hint finance-form-mode-hint">
                  {getRentalFormModeLabel(rentalOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "HOTEL_LODGING" ? (
                <p className="hint finance-form-mode-hint">
                  {getHotelFormModeLabel(hotelOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "WATER" ? (
                <p className="hint finance-form-mode-hint">
                  {getWaterFormModeLabel(waterOperationKind)}
                </p>
              ) : null}
              {selectedActivityCode === "REAL_ESTATE_AGENCY" ? (
                <p className="hint finance-form-mode-hint">
                  {getAgencyFormModeLabel(agencyOperationKind)}
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
                          (selectedActivityCode === "GENERAL_STORE" && shouldDeriveStoreAmount(field.key)) ||
                          (selectedActivityCode === "FOOD" && shouldDeriveFoodAmount(field.key)) ||
                          (selectedActivityCode === "AGRICULTURE" && shouldDeriveAgricultureAmount(field.key)) ||
                          (selectedActivityCode === "BTP" && shouldDeriveBtpAmount(field.key)) ||
                          (selectedActivityCode === "RENTAL" && shouldDeriveRentalAmount(field.key)) ||
                          (selectedActivityCode === "HOTEL_LODGING" && shouldDeriveHotelAmount(field.key)) ||
                          (selectedActivityCode === "WATER" && shouldDeriveWaterAmount(field.key)) ||
                          (selectedActivityCode === "REAL_ESTATE_AGENCY" && shouldDeriveAgencyAmount(field.key)) ||
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

          <div className="mobile-sticky-form-actions">
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
          </div>
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
          <div className="table-wrap finance-transactions-table-wrap mobile-card-table">
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
                    <tr
                      key={tx.id}
                      className={`finance-transaction-row ${
                        tx.type === "CASH_IN" ? "is-cash-in" : "is-cash-out"
                      }`}
                    >
                      <td data-label="Date">{new Date(tx.occurredAt).toLocaleString("fr-FR")}</td>
                      <td data-label="Compte">
                        <strong>{tx.accountName}</strong>
                        <div className="hint">
                          {tx.type === "CASH_IN" ? "Entrée" : "Sortie"} |{" "}
                          {tx.activityCode
                            ? getBusinessActivityLabel(tx.activityCode)
                            : "Charge transversale entreprise"}
                        </div>
                      </td>
                      <td data-label="Montant" className="finance-transaction-amount-cell">
                        {formatAmountForDisplay(tx.amount)} {tx.currency}
                      </td>
                      <td data-label="Justificatifs" className="finance-transaction-proof-cell">
                        <div>
                          {tx.proofsCount} preuve{tx.proofsCount > 1 ? "s" : ""}
                        </div>
                        <p className="hint">{tx.requiresProof ? "Justificatif requis" : "Justificatif libre"}</p>
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
        description="Cette action supprimé la transaction sélectionnée de la vue financière."
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

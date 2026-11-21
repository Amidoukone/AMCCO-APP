import {
  formatAmountForDisplay as formatLocalizedAmountForDisplay,
  formatAmountForInput as formatLocalizedAmountForInput,
  formatEditableAmountForInput as formatLocalizedEditableAmountForInput,
  normalizeAmountForApi as normalizeLocalizedAmountForApi,
  toAmountNumber as toLocalizedAmountNumber
} from "../lib/amountFormatting";
import { ApiError } from "../lib/api";
import { type BusinessActivityCode } from "../config/businessActivities";
import type { ActivityFieldDefinition } from "../types/activities";
import type { ActivityArticle } from "../types/articles";
import type { FinancialAccount, FinancialAccountScopeType, FinancialTransaction } from "../types/finance";

export const EMPTY_METADATA_FIELDS: ActivityFieldDefinition[] = [];

export const DEFAULT_ALLOWED_CURRENCIES = ["XOF"];

const TRANSACTIONS_PAGE_SIZE = 50;

export const TRANSACTION_SUGGESTION_HISTORY_SIZE = 100;

export const TRANSACTIONS_MOBILE_PAGE_SIZE = 30;

export const TRANSACTION_VISIBLE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export const DEFAULT_TRANSACTION_VISIBLE_PAGE_SIZE = 10;

export function getTransactionsFetchPageSize(): number {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches
    ? TRANSACTIONS_MOBILE_PAGE_SIZE
    : TRANSACTIONS_PAGE_SIZE;
}

export const STORE_OPERATION_KIND_KEY = "storeOperationKind";

export type StoreOperationKind = "ACHAT" | "RECOUVREMENT";

export const STORE_OPERATION_LABELS: Record<StoreOperationKind, string> = {
  ACHAT: "Achat boutique",
  RECOUVREMENT: "Recouvrement"
};

const STORE_ACHAT_METADATA_FIELDS = new Set(["shopRef"]);

const STORE_RECOUVREMENT_METADATA_FIELDS = new Set(["shopRef"]);

const STORE_METADATA_FIELDS = new Set([STORE_OPERATION_KIND_KEY, "shopRef"]);

export const HARDWARE_OPERATION_KIND_KEY = "hardwareOperationKind";

export type HardwareOperationKind = "GLOBAL" | "ITEM_ENTRY" | "ITEM_EXIT" | "RECOUVREMENT";

export const HARDWARE_OPERATION_LABELS: Record<HardwareOperationKind, string> = {
  GLOBAL: "Transaction globale",
  ITEM_ENTRY: "Achat",
  ITEM_EXIT: "Vente d'article",
  RECOUVREMENT: "Vente / recouvrement"
};

const HARDWARE_NUMERIC_METADATA_FIELDS = new Set([
  "quantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "marginAmount",
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
  "recipientRef"
]);

const HARDWARE_COLLECTION_METADATA_FIELDS = new Set(["recipientRef"]);

const HARDWARE_CASH_OUT_METADATA_FIELDS = new Set([
  ...HARDWARE_COMMON_METADATA_FIELDS,
  "purchaseUnitPrice",
  "marginAmount",
  "supplierRef",
  "recipientRef"
]);

const HARDWARE_METADATA_FIELDS = new Set([
  HARDWARE_OPERATION_KIND_KEY,
  "itemName",
  "quantity",
  "purchaseUnitPrice",
  "saleUnitPrice",
  "marginAmount",
  "paymentAmount",
  "supplierRef",
  "recipientRef"
]);

export const FOOD_OPERATION_KIND_KEY = "foodOperationKind";

export type FoodOperationKind =
  | "PRODUCT_SALE"
  | "PRODUCT_PURCHASE"
  | "SUPPLIER_PAYMENT"
  | "STOCK_LOSS"
  | "COLD_CHAIN_EXPENSE"
  | "PACKAGING_EXPENSE"
  | "CUSTOMER_REFUND";

export const FOOD_OPERATION_LABELS: Record<FoodOperationKind, string> = {
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

export const RENTAL_OPERATION_KIND_KEY = "rentalOperationKind";

export type RentalOperationKind = "LOYER" | "CAUTION" | "AUTRE";

export const RENTAL_OPERATION_LABELS: Record<RentalOperationKind, string> = {
  LOYER: "Paiement loyer",
  CAUTION: "Caution",
  AUTRE: "Autre encaissement / dépense"
};

const RENTAL_NUMERIC_METADATA_FIELDS = new Set(["monthlyRent"]);

const RENTAL_AMOUNT_METADATA_FIELDS = new Set(["monthlyRent"]);

const RENTAL_LOYER_METADATA_FIELDS = new Set(["tenantRef", "unitLabel", "monthlyRent"]);

const RENTAL_CAUTION_METADATA_FIELDS = new Set(["tenantRef", "unitLabel"]);

const RENTAL_AUTRE_METADATA_FIELDS = new Set<string>([]);

const RENTAL_METADATA_FIELDS = new Set([
  RENTAL_OPERATION_KIND_KEY,
  "tenantRef",
  "unitLabel",
  "monthlyRent"
]);

export const HOTEL_OPERATION_KIND_KEY = "hotelOperationKind";

export type HotelOperationKind =
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

export const HOTEL_OPERATION_LABELS: Record<HotelOperationKind, string> = {
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

export const WATER_OPERATION_KIND_KEY = "waterOperationKind";

export type WaterOperationKind =
  | "WATER_SALE"
  | "WATER_OTHER_INCOME"
  | "WATER_EXPENSE_MEALS"
  | "WATER_EXPENSE_FUEL"
  | "WATER_EXPENSE_VEHICLE_UPKEEP"
  | "WATER_EXPENSE_PACKAGING_LOSS"
  | "WATER_EXPENSE_SUPPLIES"
  | "WATER_EXPENSE_ENERGY"
  | "WATER_EXPENSE_CLEANING"
  | "WATER_EXPENSE_MAINTENANCE"
  | "WATER_EXPENSE_SUPPLIER"
  | "WATER_EXPENSE_OTHER";

export const WATER_OPERATION_LABELS: Record<WaterOperationKind, string> = {
  WATER_SALE: "Vente de paquets d'eau",
  WATER_OTHER_INCOME: "Autre recette",
  WATER_EXPENSE_MEALS: "Repas",
  WATER_EXPENSE_FUEL: "Carburant (essence / gazoil)",
  WATER_EXPENSE_VEHICLE_UPKEEP: "Entretien moto / véhicule",
  WATER_EXPENSE_PACKAGING_LOSS: "Emballage / paquet perdu",
  WATER_EXPENSE_SUPPLIES: "Fournitures (lait, sucre, etc.)",
  WATER_EXPENSE_ENERGY: "Énergie / combustible",
  WATER_EXPENSE_CLEANING: "Nettoyage / balayage",
  WATER_EXPENSE_MAINTENANCE: "Entretien équipement / réparation",
  WATER_EXPENSE_SUPPLIER: "Paiement fournisseur",
  WATER_EXPENSE_OTHER: "Autre dépense"
};

export const WATER_INCOME_KINDS: WaterOperationKind[] = ["WATER_SALE", "WATER_OTHER_INCOME"];

export const WATER_EXPENSE_KINDS: WaterOperationKind[] = [
  "WATER_EXPENSE_MEALS",
  "WATER_EXPENSE_FUEL",
  "WATER_EXPENSE_VEHICLE_UPKEEP",
  "WATER_EXPENSE_PACKAGING_LOSS",
  "WATER_EXPENSE_SUPPLIES",
  "WATER_EXPENSE_ENERGY",
  "WATER_EXPENSE_CLEANING",
  "WATER_EXPENSE_MAINTENANCE",
  "WATER_EXPENSE_SUPPLIER",
  "WATER_EXPENSE_OTHER"
];

const WATER_NUMERIC_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const WATER_AMOUNT_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const WATER_SALE_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const WATER_NO_EXTRA_METADATA_FIELDS = new Set<string>();

const WATER_METADATA_FIELDS = new Set([WATER_OPERATION_KIND_KEY, "quantity", "unitPrice"]);

export const BEVERAGE_OPERATION_KIND_KEY = "beverageOperationKind";

export type BeverageOperationKind = "VENTE" | "ACHAT_STOCK" | "DEPENSE" | "AUTRE_RECETTE";

export const BEVERAGE_OPERATION_LABELS: Record<BeverageOperationKind, string> = {
  VENTE: "Vente de boissons",
  ACHAT_STOCK: "Achat de stock",
  DEPENSE: "Dépense d'exploitation",
  AUTRE_RECETTE: "Autre recette"
};

const BEVERAGE_NUMERIC_METADATA_FIELDS = new Set(["quantity", "purchaseUnitPrice", "saleUnitPrice"]);

const BEVERAGE_AMOUNT_METADATA_FIELDS = new Set(["quantity", "purchaseUnitPrice", "saleUnitPrice"]);

const BEVERAGE_METADATA_FIELDS = new Set([
  BEVERAGE_OPERATION_KIND_KEY, "productName", "quantity", "purchaseUnitPrice",
  "saleUnitPrice", "supplierRef", "invoiceRef", "expenseCategory", "beverageProductId", "beverageUnit", "beverageStockManaged", "beverageStockCost"
]);

export const DAILY_AGREEMENT_OPERATION_KEY = "financialOperationKind";

export type DailyAgreementOperationKind = "PARTNER_PAYMENT" | "AGREEMENT_PROFIT" | "CAPITAL_RETURN" | "AGREEMENT_EXPENSE";

export const DAILY_AGREEMENT_OPERATION_LABELS: Record<DailyAgreementOperationKind, string> = {
  PARTNER_PAYMENT: "Versement du partenaire",
  AGREEMENT_PROFIT: "Bénéfice reçu",
  CAPITAL_RETURN: "Retour de capital",
  AGREEMENT_EXPENSE: "Dépense liée à l'accord"
};

export const DAILY_PROTOCOL_CATEGORY = "Protocole d'accord";

export function isDailyProtocolCategory(value: string | undefined): boolean {
  return (value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr") ===
    "protocole d'accord";
}

export function getDailyAgreementOperationType(kind: DailyAgreementOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "PARTNER_PAYMENT" || kind === "AGREEMENT_PROFIT" ? "CASH_IN" : "CASH_OUT";
}

export const AGENCY_OPERATION_KIND_KEY = "agencyOperationKind";

export type AgencyOperationKind =
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

export const AGENCY_OPERATION_LABELS: Record<AgencyOperationKind, string> = {
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

export const AGRICULTURE_OPERATION_KIND_KEY = "agricultureOperationKind";

export type AgricultureOperationKind = "INPUT_PURCHASE" | "FIELD_EXPENSE" | "HARVEST_SALE" | "SUPPORT_INCOME";

export const AGRICULTURE_OPERATION_LABELS: Record<AgricultureOperationKind, string> = {
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

export const BTP_OPERATION_KIND_KEY = "btpOperationKind";

export type BtpOperationKind =
  | "CLIENT_PAYMENT"
  | "MATERIAL_PURCHASE"
  | "LABOR_PAYMENT"
  | "EQUIPMENT_RENTAL"
  | "SUBCONTRACTING"
  | "SITE_EXPENSE";

export const BTP_OPERATION_LABELS: Record<BtpOperationKind, string> = {
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
  "progressPercent"
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
  "progressPercent"
]);

const BTP_CLIENT_PAYMENT_METADATA_FIELDS = new Set([...BTP_COMMON_METADATA_FIELDS]);

const BTP_MATERIAL_PURCHASE_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "materialName",
  "quantity",
  "unitPrice"
]);

const BTP_LABOR_PAYMENT_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "workerCount",
  "workDays",
  "dailyRate"
]);

const BTP_EQUIPMENT_RENTAL_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "equipmentRef",
  "equipmentHours",
  "hourlyRate"
]);

const BTP_SUBCONTRACTING_METADATA_FIELDS = new Set([
  ...BTP_COMMON_METADATA_FIELDS,
  "subcontractorRef"
]);

const BTP_SITE_EXPENSE_METADATA_FIELDS = new Set([...BTP_COMMON_METADATA_FIELDS]);

const BTP_METADATA_FIELDS = new Set([
  BTP_OPERATION_KIND_KEY,
  "projectRef",
  "progressPercent",
  "materialName",
  "quantity",
  "unitPrice",
  "workerCount",
  "workDays",
  "dailyRate",
  "equipmentRef",
  "equipmentHours",
  "hourlyRate",
  "subcontractorRef"
]);

export const FISH_FARMING_OPERATION_KIND_KEY = "fishOperationKind";

export type FishFarmingOperationKind =
  | "FINGERLING_PURCHASE"
  | "FEED_PURCHASE"
  | "POND_EXPENSE"
  | "FISH_SALE"
  | "SUPPORT_INCOME";

export const FISH_FARMING_OPERATION_LABELS: Record<FishFarmingOperationKind, string> = {
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

export const LIVESTOCK_OPERATION_KIND_KEY = "livestockOperationKind";

export type LivestockOperationKind =
  | "ANIMAL_PURCHASE"
  | "FEED_PURCHASE"
  | "VET_CARE"
  | "FARM_EXPENSE"
  | "ANIMAL_SALE"
  | "PRODUCT_SALE"
  | "SUPPORT_INCOME";

export const LIVESTOCK_OPERATION_LABELS: Record<LivestockOperationKind, string> = {
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

export const GENERAL_EXPENSE_KIND_KEY = "generalExpenseKind";

export type GeneralExpenseOwner = "PDG" | "EMPLOYE";

export type GeneralExpenseKind =
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

export const GENERAL_EXPENSE_KIND_LABELS: Record<GeneralExpenseKind, string> = {
  PDG_SUPPLIES: "Achat matériel / fournitures",
  PDG_TRANSPORT: "Carburant / transport",
  PDG_SUPPLIER_PAYMENT: "Paiement fournisseur / prestataire",
  PDG_TRANSFER_ADVANCE: "Virement / avance / transfert",
  PDG_INVESTMENT: "Investissement",
  PDG_LOAN: "Prêt",
  PDG_OVERHEAD: "Frais généraux / divers",
  EMPLOYEE_MEALS: "Repas",
  EMPLOYEE_FUEL: "Carburant",
  EMPLOYEE_VEHICLE_UPKEEP: "Entretien véhicule",
  EMPLOYEE_SUPPLIES: "Fournitures / consommables",
  EMPLOYEE_OTHER: "Autre dépense"
};

export const GENERAL_EXPENSE_PDG_KINDS: GeneralExpenseKind[] = [
  "PDG_SUPPLIES",
  "PDG_TRANSPORT",
  "PDG_SUPPLIER_PAYMENT",
  "PDG_TRANSFER_ADVANCE",
  "PDG_INVESTMENT",
  "PDG_LOAN",
  "PDG_OVERHEAD"
];

export const GENERAL_EXPENSE_EMPLOYEE_KINDS: GeneralExpenseKind[] = [
  "EMPLOYEE_MEALS",
  "EMPLOYEE_FUEL",
  "EMPLOYEE_VEHICLE_UPKEEP",
  "EMPLOYEE_SUPPLIES",
  "EMPLOYEE_OTHER"
];

const GENERAL_EXPENSES_NUMERIC_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const GENERAL_EXPENSES_AMOUNT_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const GENERAL_EXPENSES_VISIBLE_METADATA_FIELDS = new Set(["quantity", "unitPrice"]);

const GENERAL_EXPENSES_METADATA_FIELDS = new Set([
  GENERAL_EXPENSE_KIND_KEY,
  "quantity",
  "unitPrice"
]);

export const DUMP_TRUCK_OPERATION_KEY = "dumpTruckOperationKind";

export const DUMP_TRUCK_OPERATION_LABELS: Record<string, string> = {
  TRAVAUX: "Travaux",
  LOCATION: "Location",
  VERSEMENT_AMCCO: "Versement AMCCO",
  DEPENSE: "Dépense",
  ENTRETIEN: "Entretien",
  CARBURANT: "Carburant",
  AUTRE: "Autre"
};

const TRANSPORT_NUMERIC_METADATA_FIELDS = new Set(["quantity"]);

const TRANSPORT_AMOUNT_METADATA_FIELDS = new Set(["quantity", "purchaseUnitPrice"]);

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Opération impossible. Vérifiez la connexion backend.";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} o`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function toAmountNumber(input: string): number {
  return toLocalizedAmountNumber(input);
}

export function normalizeAmountForApi(input: string): string {
  return normalizeLocalizedAmountForApi(input);
}

export function formatAmountForDisplay(input: string | number): string {
  return formatLocalizedAmountForDisplay(input);
}

export function formatAmountForInput(input: string): string {
  return formatLocalizedAmountForInput(input);
}

export function formatEditableAmountForInput(input: string): string {
  return formatLocalizedEditableAmountForInput(input);
}

export function isMoneyMetadataField(key: string): boolean {
  return (
    key === "purchaseUnitPrice" ||
    key === "saleUnitPrice" ||
    key === "dailyPayment" ||
    key === "marginAmount" ||
    key === "paymentAmount" ||
    key === "unitPrice" ||
    key === "dailyRate" ||
    key === "hourlyRate" ||
    key === "monthlyRent" ||
    key === "serviceCharge" ||
    key === "depositAmount" ||
    key === "invoiceAmount" ||
    key === "payoutAmount" ||
    key === "amccoAmount" ||
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

export function deriveHardwareArticleUnitPricePatch(
  operationKind: HardwareOperationKind,
  article: ActivityArticle | undefined
): Partial<Record<"purchaseUnitPrice" | "saleUnitPrice", string>> {
  if (!article) {
    return {};
  }
  const purchasePrice = article.defaultPurchaseUnitPrice
    ? toAmountNumber(article.defaultPurchaseUnitPrice)
    : 0;
  if (operationKind === "ITEM_ENTRY") {
    return purchasePrice > 0 ? { purchaseUnitPrice: purchasePrice.toFixed(2) } : {};
  }
  if (operationKind === "ITEM_EXIT") {
    const margin = article.defaultMargin ? toAmountNumber(article.defaultMargin) : 0;
    const salePrice = purchasePrice + margin;
    return salePrice > 0 ? { saleUnitPrice: salePrice.toFixed(2) } : {};
  }
  return {};
}

export function deriveHardwareMarginAmount(
  operationKind: HardwareOperationKind,
  metadata: Record<string, string>,
  articles: ActivityArticle[]
): string | null {
  if (operationKind !== "ITEM_ENTRY") {
    return null;
  }
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const article = articles.find((item) => item.name === (metadata.itemName ?? ""));
  const defaultMargin = article?.defaultMargin ? toAmountNumber(article.defaultMargin) : 0;
  if (quantity <= 0 || defaultMargin <= 0) {
    return null;
  }
  return (quantity * defaultMargin).toFixed(2);
}

export function deriveAgricultureAmount(
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

export function deriveFoodAmount(
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

export function deriveBtpAmount(
  operationKind: BtpOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind === "MATERIAL_PURCHASE") {
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

export function deriveRentalAmount(
  operationKind: RentalOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind !== "LOYER") {
    return null;
  }
  const monthlyRent = toAmountNumber(metadata.monthlyRent ?? "");
  return monthlyRent > 0 ? monthlyRent.toFixed(2) : null;
}

export function deriveHotelAmount(
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

export function deriveWaterAmount(
  operationKind: WaterOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind !== "WATER_SALE") {
    return null;
  }
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

export function getBeverageOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): BeverageOperationKind {
  const value = metadata[BEVERAGE_OPERATION_KIND_KEY];
  if (value === "VENTE" || value === "ACHAT_STOCK" || value === "DEPENSE" || value === "AUTRE_RECETTE") {
    return value;
  }
  return type === "CASH_IN" ? "VENTE" : "ACHAT_STOCK";
}

export function deriveBeverageAmount(
  operationKind: BeverageOperationKind,
  metadata: Record<string, string>
): string | null {
  if (operationKind !== "VENTE" && operationKind !== "ACHAT_STOCK") return null;
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = toAmountNumber(
    operationKind === "VENTE" ? metadata.saleUnitPrice ?? "" : metadata.purchaseUnitPrice ?? ""
  );
  return quantity > 0 && unitPrice > 0 ? (quantity * unitPrice).toFixed(2) : null;
}

export function deriveAgencyAmount(
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

export function deriveFishFarmingAmount(
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

export function deriveLivestockAmount(
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

function isGeneralExpenseKind(value: string | undefined): value is GeneralExpenseKind {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(GENERAL_EXPENSE_KIND_LABELS, value as string);
}

export function getGeneralExpenseOwner(kind: GeneralExpenseKind): GeneralExpenseOwner {
  return kind.startsWith("PDG_") ? "PDG" : "EMPLOYE";
}

// Maps categories used before salaries moved to the dedicated Salaires
// module, so editing an older expense shows a sensible category (and keeps
// the right owner) instead of silently falling back to "Autre dépense".
const GENERAL_EXPENSE_LEGACY_KIND_MAP: Partial<Record<string, GeneralExpenseKind>> = {
  PDG_PAYROLL: "PDG_OVERHEAD",
  EMPLOYEE_PAYROLL: "EMPLOYEE_OTHER"
};

export function getGeneralExpenseKind(metadata: Record<string, string>): GeneralExpenseKind {
  const configuredKind = metadata[GENERAL_EXPENSE_KIND_KEY]?.trim();
  if (isGeneralExpenseKind(configuredKind)) {
    return configuredKind;
  }
  const legacyKind = configuredKind ? GENERAL_EXPENSE_LEGACY_KIND_MAP[configuredKind] : undefined;
  if (legacyKind) {
    return legacyKind;
  }
  return "EMPLOYEE_OTHER";
}

export function deriveGeneralExpensesAmount(metadata: Record<string, string>): string | null {
  const quantity = toAmountNumber(metadata.quantity ?? "");
  const unitPrice = toAmountNumber(metadata.unitPrice ?? "");
  if (quantity <= 0 || unitPrice <= 0) {
    return null;
  }
  return (quantity * unitPrice).toFixed(2);
}

export function getGeneralExpensesFormModeLabel(owner: GeneralExpenseOwner): string {
  return owner === "PDG"
    ? "Dépense du PDG: choisissez la catégorie, puis le montant ou la quantité et le prix unitaire."
    : "Dépense employé: choisissez la catégorie, puis le montant ou la quantité et le prix unitaire.";
}

export function getMetadataInputMode(fieldKey: string): "decimal" | "text" {
  return HARDWARE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    FOOD_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    RENTAL_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    HOTEL_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    WATER_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    BEVERAGE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    AGENCY_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    AGRICULTURE_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    BTP_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    FISH_FARMING_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    LIVESTOCK_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    GENERAL_EXPENSES_NUMERIC_METADATA_FIELDS.has(fieldKey) ||
    TRANSPORT_NUMERIC_METADATA_FIELDS.has(fieldKey)
    ? "decimal"
    : "text";
}

export function shouldDeriveHardwareAmount(fieldKey: string): boolean {
  return HARDWARE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveFoodAmount(fieldKey: string): boolean {
  return FOOD_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveRentalAmount(fieldKey: string): boolean {
  return RENTAL_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveHotelAmount(fieldKey: string): boolean {
  return HOTEL_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveWaterAmount(fieldKey: string): boolean {
  return WATER_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveBeverageAmount(fieldKey: string): boolean {
  return BEVERAGE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveAgencyAmount(fieldKey: string): boolean {
  return AGENCY_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveAgricultureAmount(fieldKey: string): boolean {
  return AGRICULTURE_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveBtpAmount(fieldKey: string): boolean {
  return BTP_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveFishFarmingAmount(fieldKey: string): boolean {
  return FISH_FARMING_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveLivestockAmount(fieldKey: string): boolean {
  return LIVESTOCK_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveGeneralExpensesAmount(fieldKey: string): boolean {
  return GENERAL_EXPENSES_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function shouldDeriveTransportAmount(fieldKey: string): boolean {
  return TRANSPORT_AMOUNT_METADATA_FIELDS.has(fieldKey);
}

export function getDefaultTransactionType(
  activityCode: BusinessActivityCode | null
): "CASH_IN" | "CASH_OUT" {
  return activityCode === "FOOD" ||
    activityCode === "RENTAL" ||
    activityCode === "HOTEL_LODGING" ||
    activityCode === "WATER" ||
    activityCode === "BEVERAGE_DEPOT" ||
    activityCode === "REAL_ESTATE_AGENCY" ||
    activityCode === "DAILY_ACTIVITIES"
    ? "CASH_IN"
    : "CASH_OUT";
}

function isHardwareOperationKind(value: string | undefined): value is HardwareOperationKind {
  return value === "GLOBAL" || value === "ITEM_ENTRY" || value === "ITEM_EXIT" || value === "RECOUVREMENT";
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

export function getHardwareOperationKind(
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

export function getHardwareOperationType(kind: HardwareOperationKind): "CASH_IN" | "CASH_OUT" | null {
  if (kind === "ITEM_ENTRY") {
    return "CASH_OUT";
  }
  if (kind === "ITEM_EXIT" || kind === "RECOUVREMENT") {
    return "CASH_IN";
  }
  return null;
}

function isStoreOperationKind(value: string | undefined): value is StoreOperationKind {
  return value === "ACHAT" || value === "RECOUVREMENT";
}

export function getStoreOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): StoreOperationKind {
  const configuredKind = metadata[STORE_OPERATION_KIND_KEY]?.trim();
  if (isStoreOperationKind(configuredKind)) {
    return configuredKind;
  }
  return type === "CASH_IN" ? "RECOUVREMENT" : "ACHAT";
}

export function getStoreOperationType(kind: StoreOperationKind): "CASH_IN" | "CASH_OUT" {
  return kind === "RECOUVREMENT" ? "CASH_IN" : "CASH_OUT";
}

function getStoreVisibleKeys(kind: StoreOperationKind): Set<string> {
  return kind === "RECOUVREMENT" ? STORE_RECOUVREMENT_METADATA_FIELDS : STORE_ACHAT_METADATA_FIELDS;
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

export function getFoodOperationKind(
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

export function getFoodOperationType(kind: FoodOperationKind): "CASH_IN" | "CASH_OUT" {
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
  return value === "LOYER" || value === "CAUTION" || value === "AUTRE";
}

function hasRentalMetadata(metadata: Record<string, string>): boolean {
  return ["tenantRef", "unitLabel", "monthlyRent"].some((key) => metadata[key]?.trim());
}

export function getRentalOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): RentalOperationKind {
  const configuredKind = metadata[RENTAL_OPERATION_KIND_KEY]?.trim();
  if (isRentalOperationKind(configuredKind)) {
    return configuredKind;
  }
  if (type === "CASH_IN" || hasRentalMetadata(metadata)) {
    return "LOYER";
  }
  return "AUTRE";
}

export function getRentalOperationType(kind: RentalOperationKind): "CASH_IN" | "CASH_OUT" | null {
  return kind === "LOYER" || kind === "CAUTION" ? "CASH_IN" : null;
}

function getRentalVisibleKeys(kind: RentalOperationKind): Set<string> {
  if (kind === "LOYER") {
    return RENTAL_LOYER_METADATA_FIELDS;
  }
  if (kind === "CAUTION") {
    return RENTAL_CAUTION_METADATA_FIELDS;
  }
  return RENTAL_AUTRE_METADATA_FIELDS;
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

export function getHotelOperationKind(
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

export function getHotelOperationType(kind: HotelOperationKind): "CASH_IN" | "CASH_OUT" {
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
  return Boolean(value) && Object.prototype.hasOwnProperty.call(WATER_OPERATION_LABELS, value as string);
}

// Maps categories used before the sector was simplified to their closest
// modern equivalent, so editing an older transaction shows the right
// category instead of silently falling back to "Autre".
const WATER_LEGACY_KIND_MAP: Partial<Record<string, WaterOperationKind>> = {
  WATER_BILLING: "WATER_SALE",
  BULK_WATER_SALE: "WATER_SALE",
  CONNECTION_FEE: "WATER_OTHER_INCOME",
  SUBSIDY_INCOME: "WATER_OTHER_INCOME",
  CHEMICAL_PURCHASE: "WATER_EXPENSE_MAINTENANCE",
  ENERGY_PAYMENT: "WATER_EXPENSE_ENERGY",
  MAINTENANCE_EXPENSE: "WATER_EXPENSE_MAINTENANCE",
  QUALITY_TEST_EXPENSE: "WATER_EXPENSE_MAINTENANCE",
  NETWORK_REPAIR: "WATER_EXPENSE_MAINTENANCE",
  SUPPLIER_PAYMENT: "WATER_EXPENSE_SUPPLIER"
};

export function getWaterOperationKind(
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): WaterOperationKind {
  const configuredKind = metadata[WATER_OPERATION_KIND_KEY]?.trim();
  if (isWaterOperationKind(configuredKind)) {
    return configuredKind;
  }
  const legacyKind = configuredKind ? WATER_LEGACY_KIND_MAP[configuredKind] : undefined;
  if (legacyKind) {
    return legacyKind;
  }
  return type === "CASH_IN" ? "WATER_SALE" : "WATER_EXPENSE_OTHER";
}

export function getWaterOperationType(kind: WaterOperationKind): "CASH_IN" | "CASH_OUT" {
  return WATER_INCOME_KINDS.includes(kind) ? "CASH_IN" : "CASH_OUT";
}

function getWaterVisibleKeys(kind: WaterOperationKind): Set<string> {
  return kind === "WATER_SALE" ? WATER_SALE_METADATA_FIELDS : WATER_NO_EXTRA_METADATA_FIELDS;
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

export function getAgencyOperationKind(
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

export function getAgencyOperationType(kind: AgencyOperationKind): "CASH_IN" | "CASH_OUT" {
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

export function getAgricultureOperationKind(
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

export function getAgricultureOperationType(kind: AgricultureOperationKind): "CASH_IN" | "CASH_OUT" {
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
    "materialName",
    "quantity",
    "unitPrice",
    "workerCount",
    "workDays",
    "dailyRate",
    "equipmentRef",
    "equipmentHours",
    "hourlyRate",
    "subcontractorRef",
    "progressPercent"
  ].some((key) => metadata[key]?.trim());
}

export function getBtpOperationKind(
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

export function getBtpOperationType(kind: BtpOperationKind): "CASH_IN" | "CASH_OUT" {
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

export function getFishFarmingOperationKind(
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

export function getFishFarmingOperationType(kind: FishFarmingOperationKind): "CASH_IN" | "CASH_OUT" {
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

export function getLivestockOperationKind(
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

export function getLivestockOperationType(kind: LivestockOperationKind): "CASH_IN" | "CASH_OUT" {
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

export function getVisibleFinanceMetadataFields(
  activityCode: BusinessActivityCode | null,
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): ActivityFieldDefinition[] {
  if (activityCode === "HYDROCARBON") {
    const category = metadata.hydrocarbonCategory;
    const visibleKeys = new Set([
      "hydrocarbonCategory",
      ...(category === "Citerne"
        ? ["hydrocarbonAssetRef"]
        : category
          ? ["quantity", "unit", "counterpartyRef"]
          : [])
    ]);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

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

  if (activityCode === "BEVERAGE_DEPOT") {
    const kind = getBeverageOperationKind(type, metadata);
    const visibleKeys = new Set<string>([
      "invoiceRef",
      ...(kind === "VENTE" ? ["productName", "quantity", "purchaseUnitPrice", "saleUnitPrice", "beverageProductId", "beverageUnit"] : []),
      ...(kind === "ACHAT_STOCK" ? ["productName", "quantity", "purchaseUnitPrice", "supplierRef", "beverageProductId", "beverageUnit"] : []),
      ...(kind === "DEPENSE" ? ["expenseCategory", "supplierRef"] : [])
    ]);
    return fields.filter((field) => field.key !== BEVERAGE_OPERATION_KIND_KEY && field.key !== "beverageUnit" && visibleKeys.has(field.key));
  }

  if (activityCode === "DAILY_ACTIVITIES") {
    return fields.filter((field) =>
      !["dailyActivityKind", DAILY_AGREEMENT_OPERATION_KEY].includes(field.key) &&
      ["agreementRef", "partnerName", "paymentReference"].includes(field.key)
    );
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

  if (activityCode === "GENERAL_EXPENSES") {
    return fields.filter((field) => GENERAL_EXPENSES_VISIBLE_METADATA_FIELDS.has(field.key));
  }

  if (activityCode === "TRANSPORT") {
    if (metadata.transportCategory !== "Camion benne") {
      const visibleKeys = new Set([
        "transportCategory",
        "vehicleRef",
        "routeRef",
        "counterpartyRef",
        ...(type === "CASH_OUT" ? ["expenseCategory"] : [])
      ]);
      return fields.filter((field) => visibleKeys.has(field.key));
    }
    const operationKind = metadata[DUMP_TRUCK_OPERATION_KEY] ?? "TRAVAUX";
    const visibleKeys = new Set([
      "transportCategory",
      "vehicleRef",
      "routeRef",
      DUMP_TRUCK_OPERATION_KEY,
      "counterpartyRef",
      ...(operationKind === "TRAVAUX" || operationKind === "LOCATION"
        ? ["quantity", "purchaseUnitPrice", "amccoAmount"]
        : []),
      ...(operationKind === "DEPENSE" || operationKind === "ENTRETIEN" || operationKind === "CARBURANT"
        ? ["expenseCategory"]
        : [])
    ]);
    return fields.filter((field) => visibleKeys.has(field.key));
  }

  if (activityCode !== "HARDWARE") {
    return fields;
  }

  const operationKind = getHardwareOperationKind(type, metadata);
  const visibleKeys =
    operationKind === "RECOUVREMENT"
      ? HARDWARE_COLLECTION_METADATA_FIELDS
      : operationKind === "ITEM_EXIT"
      ? HARDWARE_CASH_IN_METADATA_FIELDS
      : operationKind === "ITEM_ENTRY"
        ? HARDWARE_CASH_OUT_METADATA_FIELDS
        : new Set<string>();
  return fields.filter((field) => visibleKeys.has(field.key));
}

export function cleanSectorFinanceMetadata(
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

  if (activityCode === "BEVERAGE_DEPOT") {
    const kind = getBeverageOperationKind(type, metadata);
    const visibleKeys = new Set<string>([
      "invoiceRef",
      ...(kind === "VENTE" ? ["productName", "quantity", "purchaseUnitPrice", "saleUnitPrice", "beverageProductId", "beverageUnit"] : []),
      ...(kind === "ACHAT_STOCK" ? ["productName", "quantity", "purchaseUnitPrice", "supplierRef", "beverageProductId", "beverageUnit"] : []),
      ...(kind === "DEPENSE" ? ["expenseCategory", "supplierRef"] : [])
    ]);
    // Persist the same operation shown by the select, including a fresh form after saving.
    return Object.fromEntries(Object.entries({ ...metadata, [BEVERAGE_OPERATION_KIND_KEY]: kind }).map(([key, value]) => [
      key,
      BEVERAGE_METADATA_FIELDS.has(key) && key !== BEVERAGE_OPERATION_KIND_KEY && !visibleKeys.has(key) ? "" : value
    ]));
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

  if (activityCode === "GENERAL_EXPENSES") {
    const kind = getGeneralExpenseKind(metadata);
    return Object.fromEntries(
      Object.entries({
        ...metadata,
        [GENERAL_EXPENSE_KIND_KEY]: kind
      }).map(([key, value]) => [
        key,
        GENERAL_EXPENSES_METADATA_FIELDS.has(key) &&
        key !== GENERAL_EXPENSE_KIND_KEY &&
        !GENERAL_EXPENSES_VISIBLE_METADATA_FIELDS.has(key)
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
    operationKind === "RECOUVREMENT"
      ? HARDWARE_COLLECTION_METADATA_FIELDS
      : operationKind === "ITEM_EXIT"
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

export function deriveSectorAmount(
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
  if (activityCode === "BEVERAGE_DEPOT") {
    return deriveBeverageAmount(getBeverageOperationKind(type, metadata), metadata);
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
  if (activityCode === "GENERAL_EXPENSES") {
    return deriveGeneralExpensesAmount(metadata);
  }
  if (activityCode === "TRANSPORT") {
    const operationKind = metadata[DUMP_TRUCK_OPERATION_KEY];
    if (operationKind !== "TRAVAUX" && operationKind !== "LOCATION") {
      return null;
    }
    const quantity = toAmountNumber(metadata.quantity ?? "");
    const unitPrice = toAmountNumber(metadata.purchaseUnitPrice ?? "");
    return quantity > 0 && unitPrice > 0 ? (quantity * unitPrice).toFixed(2) : null;
  }
  return null;
}

// Secteurs pour lesquels la saisie propose un remplissage rapide (suggestions
// cliquables + autocomplétion de la description) à partir des opérations déjà
// enregistrées pour la même catégorie.
const QUICK_FILL_SECTOR_ACTIVITIES = new Set<BusinessActivityCode>([
  "HARDWARE",
  "GENERAL_STORE",
  "BTP",
  "RENTAL",
  "WATER"
]);

export function isQuickFillSectorActivity(
  activityCode: BusinessActivityCode | null
): activityCode is "HARDWARE" | "GENERAL_STORE" | "BTP" | "RENTAL" | "WATER" {
  return Boolean(activityCode) && QUICK_FILL_SECTOR_ACTIVITIES.has(activityCode as BusinessActivityCode);
}

export function needsTransactionSuggestionHistory(activityCode: BusinessActivityCode | null): boolean {
  return isQuickFillSectorActivity(activityCode) || activityCode === "GENERAL_EXPENSES" || activityCode === "SERVICES";
}

export function getSectorOperationKindValue(
  activityCode: BusinessActivityCode | null,
  type: "CASH_IN" | "CASH_OUT",
  metadata: Record<string, string>
): string {
  if (activityCode === "HARDWARE") {
    return getHardwareOperationKind(type, metadata);
  }
  if (activityCode === "GENERAL_STORE") {
    return getStoreOperationKind(type, metadata);
  }
  if (activityCode === "BTP") {
    return getBtpOperationKind(type, metadata);
  }
  if (activityCode === "RENTAL") {
    return getRentalOperationKind(type, metadata);
  }
  if (activityCode === "WATER") {
    return getWaterOperationKind(type, metadata);
  }
  return "";
}

export function getSectorOperationLabel(
  activityCode: BusinessActivityCode | null,
  kind: string
): string {
  if (activityCode === "HARDWARE") {
    return HARDWARE_OPERATION_LABELS[kind as HardwareOperationKind] ?? "";
  }
  if (activityCode === "GENERAL_STORE") {
    return STORE_OPERATION_LABELS[kind as StoreOperationKind] ?? "";
  }
  if (activityCode === "BTP") {
    return BTP_OPERATION_LABELS[kind as BtpOperationKind] ?? "";
  }
  if (activityCode === "RENTAL") {
    return RENTAL_OPERATION_LABELS[kind as RentalOperationKind] ?? "";
  }
  if (activityCode === "WATER") {
    return WATER_OPERATION_LABELS[kind as WaterOperationKind] ?? "";
  }
  return "";
}

export function getSectorSuggestionDetail(
  activityCode: BusinessActivityCode | null,
  kind: string,
  metadata: Record<string, string>,
  currency: string
): string | null {
  if (activityCode === "HARDWARE" && (kind === "ITEM_ENTRY" || kind === "ITEM_EXIT")) {
    const quantity = metadata.quantity;
    const unitPrice = kind === "ITEM_EXIT" ? metadata.saleUnitPrice : metadata.purchaseUnitPrice;
    return quantity && unitPrice
      ? `${quantity} × ${formatAmountForDisplay(unitPrice)} ${currency}`
      : null;
  }
  if (activityCode === "WATER" && kind === "WATER_SALE" && metadata.quantity && metadata.unitPrice) {
    return `${metadata.quantity} paquets × ${formatAmountForDisplay(metadata.unitPrice)} ${currency}`;
  }
  if (activityCode === "BTP") {
    if (kind === "MATERIAL_PURCHASE" && metadata.quantity && metadata.unitPrice) {
      return `${metadata.quantity} × ${formatAmountForDisplay(metadata.unitPrice)} ${currency}`;
    }
    if (kind === "LABOR_PAYMENT" && metadata.workerCount && metadata.workDays && metadata.dailyRate) {
      return `${metadata.workerCount} ouvrier(s) × ${metadata.workDays} j × ${formatAmountForDisplay(metadata.dailyRate)} ${currency}`;
    }
    if (kind === "EQUIPMENT_RENTAL" && metadata.equipmentHours && metadata.hourlyRate) {
      return `${metadata.equipmentHours} h × ${formatAmountForDisplay(metadata.hourlyRate)} ${currency}`;
    }
  }
  return null;
}

export function getHardwareFormModeLabel(kind: HardwareOperationKind): string {
  if (kind === "RECOUVREMENT") {
    return "Vente / recouvrement: indiquez la quincaillerie ou la personne qui a reçu les articles, puis le montant encaissé. Le recouvrement peut être partiel.";
  }
  return kind === "ITEM_EXIT"
    ? "Vente: renseignez la quantité, le prix de vente et le versement."
    : kind === "ITEM_ENTRY"
      ? "Achat: choisissez l'article, la quantité, le prix d'achat et à qui il est remis."
      : "Transaction globale: renseignez seulement le montant et la description utile.";
}

export function getStoreFormModeLabel(kind: StoreOperationKind): string {
  return kind === "RECOUVREMENT"
    ? "Recouvrement: choisissez la boutique et indiquez le montant encaissé."
    : "Achat: choisissez la boutique, indiquez le montant de la facture et joignez la photo du reçu si possible.";
}

export function getFoodFormModeLabel(kind: FoodOperationKind): string {
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

export function getAgricultureFormModeLabel(kind: AgricultureOperationKind): string {
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

export function getBtpFormModeLabel(kind: BtpOperationKind): string {
  if (kind === "CLIENT_PAYMENT") {
    return "Encaissement client: choisissez le chantier et indiquez le montant reçu.";
  }
  if (kind === "MATERIAL_PURCHASE") {
    return "Achat matériaux: chantier, matériau, quantité et prix unitaire.";
  }
  if (kind === "LABOR_PAYMENT") {
    return "Main-d'oeuvre: chantier, nombre d'ouvriers, jours travailles et taux journalier.";
  }
  if (kind === "EQUIPMENT_RENTAL") {
    return "Location engin: chantier, engin, heures et taux horaire.";
  }
  if (kind === "SUBCONTRACTING") {
    return "Sous-traitance: chantier, sous-traitant et montant payé.";
  }
  return "Charge chantier: choisissez le chantier et indiquez le montant dépensé.";
}

export function getRentalFormModeLabel(kind: RentalOperationKind): string {
  if (kind === "LOYER") {
    return "Paiement loyer: choisissez le locataire et le montant versé (plusieurs mois d'avance possibles).";
  }
  if (kind === "CAUTION") {
    return "Caution: choisissez le locataire et le montant de la caution versée.";
  }
  return "Autre opération: encaissement ou dépense locative ne correspondant pas à un loyer.";
}

export function getHotelFormModeLabel(kind: HotelOperationKind): string {
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

export function getWaterFormModeLabel(kind: WaterOperationKind): string {
  if (kind === "WATER_SALE") {
    return "Vente d'eau: indiquez le nombre de paquets vendus et le prix unitaire, ou saisissez le montant directement.";
  }
  if (kind === "WATER_OTHER_INCOME") {
    return "Autre recette: précisez l'origine dans la description et saisissez le montant.";
  }
  return "Dépense courante: choisissez la catégorie, précisez si besoin, puis saisissez le montant.";
}

export function getAgencyFormModeLabel(kind: AgencyOperationKind): string {
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

export function getFishFarmingFormModeLabel(kind: FishFarmingOperationKind): string {
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

export function getLivestockFormModeLabel(kind: LivestockOperationKind): string {
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

export function toDateTimeLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 16);
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function syncMetadataState(
  previous: Record<string, string>,
  fields: ActivityFieldDefinition[]
): Record<string, string> {
  return { ...previous, ...Object.fromEntries(fields.map((field) => {
    const value = previous[field.key] ?? "";
    return [field.key, isMoneyMetadataField(field.key) ? formatAmountForInput(value) : value];
  })) };
}

export function sameStringRecord(
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

export function sameAccountForm(
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

export function getLockedAccountMessage(account: FinancialAccount): string | null {
  if (account.transactionsCount > 0) {
    return "Ce compte financier est déjà utilisé par des transactions et ne peut pas être supprimé.";
  }

  return null;
}

export function getSectorTransactionLabel(transaction: FinancialTransaction): string | null {
  if (transaction.activityCode === "AGRICULTURE") return AGRICULTURE_OPERATION_LABELS[getAgricultureOperationKind(transaction.type, transaction.metadata)];
  if (transaction.activityCode === "FISH_FARMING") return FISH_FARMING_OPERATION_LABELS[getFishFarmingOperationKind(transaction.type, transaction.metadata)];
  if (transaction.activityCode === "DAILY_ACTIVITIES") return DAILY_AGREEMENT_OPERATION_LABELS[transaction.metadata.financialOperationKind as DailyAgreementOperationKind] ?? null;
  if (transaction.activityCode === "WATER") return WATER_OPERATION_LABELS[getWaterOperationKind(transaction.type, transaction.metadata)];
  if (transaction.activityCode === "BEVERAGE_DEPOT") return BEVERAGE_OPERATION_LABELS[getBeverageOperationKind(transaction.type, transaction.metadata)];
  if (transaction.activityCode === "GENERAL_EXPENSES") {
    const kind = getGeneralExpenseKind(transaction.metadata);
    return `${getGeneralExpenseOwner(kind) === "PDG" ? "PDG" : "Employé"} : ${GENERAL_EXPENSE_KIND_LABELS[kind]}`;
  }
  if (transaction.activityCode === "HYDROCARBON") return transaction.metadata.hydrocarbonCategory || null;
  if (transaction.activityCode === "SERVICES") return transaction.metadata.serviceCategory || transaction.metadata.serviceType || null;
  return null;
}

export function formatMetadataSummary(
  metadata: Record<string, string>,
  fields: ActivityFieldDefinition[]
): string {
  const items = fields
    .map((field) => {
      const value = metadata[field.key]?.trim();
      const label = field.key === "beverageStockCost" && metadata.beverageOperationKind === "ACHAT_STOCK"
        ? "Coût du stock acheté"
        : field.label;
      return value ? `${label}: ${formatMetadataValue(field.key, value)}` : null;
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
  if (key === "beverageStockCost") {
    return `${formatAmountForDisplay(value)} XOF`;
  }
  if (key === DUMP_TRUCK_OPERATION_KEY) {
    return DUMP_TRUCK_OPERATION_LABELS[value] ?? value;
  }
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

export function buildDefaultAccountForm(
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

export function buildDefaultArticleForm(): {
  name: string;
  defaultMargin: string;
  defaultPurchaseUnitPrice: string;
} {
  return {
    name: "",
    defaultMargin: "",
    defaultPurchaseUnitPrice: ""
  };
}

export function currentMonthInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function buildDefaultTenantForm(): {
  name: string;
  unitLabel: string;
  monthlyRent: string;
  phone: string;
  tenancyStart: string;
} {
  return {
    name: "",
    unitLabel: "",
    monthlyRent: "",
    phone: "",
    tenancyStart: currentMonthInputValue()
  };
}

export function buildDefaultShopForm(): {
  name: string;
  location: string;
  phone: string;
} {
  return {
    name: "",
    location: "",
    phone: ""
  };
}

export function buildDefaultProjectForm(): {
  name: string;
  clientRef: string;
  contractRef: string;
  location: string;
} {
  return {
    name: "",
    clientRef: "",
    contractRef: "",
    location: ""
  };
}

export function normalizeAccountFormForActivities(
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

export function isAccountVisibleForSelectedActivity(
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

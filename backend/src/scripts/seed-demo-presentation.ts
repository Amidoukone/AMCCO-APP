import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";
import { getDbPool, closeDbPool } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { hashPassword } from "../lib/password.js";
import {
  BUSINESS_ACTIVITY_CODES,
  type BusinessActivityCode
} from "../types/business-activity.js";
import type { RoleCode } from "../types/role.js";

const DEMO_NAMESPACE = "amcco-demo-presentation-mali-v1";
const DEMO_COMPANY_CODE = (readArgValue("company-code") ?? process.env.DEMO_TARGET_COMPANY_CODE ?? process.env.DEMO_COMPANY_CODE ?? "AMCCO-DEMO-MALI").toUpperCase();
const DEMO_COMPANY_NAME = process.env.DEMO_COMPANY_NAME ?? "AMCCO Demo Mali";
const DEMO_EMAIL_DOMAIN = process.env.DEMO_EMAIL_DOMAIN ?? "amcco.demo";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "DemoMali2026!";
const DEMO_SEED_MARKER = "MALI_PRESENTATION";
const KEEP_EXISTING_COMPANY_PROFILE =
  process.argv.includes("--keep-company-profile") || process.env.DEMO_KEEP_COMPANY_PROFILE === "1";

type IdRow = RowDataPacket & { id: string };
type CountRow = RowDataPacket & { total: number };

type DemoUser = {
  key: string;
  fullName: string;
  email: string;
  role: RoleCode;
};

type DemoAccount = {
  key: string;
  name: string;
  accountRef: string;
  balance: string;
  scopeType: "GLOBAL" | "DEDICATED" | "RESTRICTED";
  primaryActivityCode: BusinessActivityCode | null;
  allowedActivityCodes: BusinessActivityCode[];
};

type DemoTransactionStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type DemoTransaction = {
  key: string;
  accountKey: string;
  type: "CASH_IN" | "CASH_OUT";
  amount: string;
  currency: string;
  activityCode: BusinessActivityCode | null;
  description: string;
  metadata: Record<string, string>;
  status: DemoTransactionStatus;
  requiresProof: boolean;
  createdByKey: string;
  validatedByKey?: string;
  salaryConfirmationStatus?: "NOT_REQUIRED" | "PENDING" | "CONFIRMED";
  salaryConfirmedByKey?: string;
  occurredAt: Date;
  createdAt: Date;
};

type DemoTaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";

type DemoTask = {
  key: string;
  title: string;
  description: string;
  activityCode: BusinessActivityCode;
  metadata: Record<string, string>;
  status: DemoTaskStatus;
  createdByKey: string;
  assignedToKey: string;
  dueDate: Date;
  createdAt: Date;
};

type DemoProof = {
  key: string;
  transactionKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
};

type DemoTaskAttachment = {
  key: string;
  taskKey: string;
  uploadedByKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
};

type DemoTaskComment = {
  key: string;
  taskKey: string;
  authorKey: string;
  body: string;
  createdAt: Date;
};

type DemoAlert = {
  key: string;
  targetUserKey: string;
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  entityType: string;
  entityKey: string;
  readAt: Date | null;
  createdAt: Date;
};

function readArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((item) => item.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
}

const demoUsers: DemoUser[] = [
  {
    key: "owner",
    fullName: "Awa Traore",
    email: `awa.traore@${DEMO_EMAIL_DOMAIN}`,
    role: "OWNER"
  },
  {
    key: "sysAdmin",
    fullName: "Moussa Dembele",
    email: `moussa.dembele@${DEMO_EMAIL_DOMAIN}`,
    role: "SYS_ADMIN"
  },
  {
    key: "accountant",
    fullName: "Fatoumata Coulibaly",
    email: `fatoumata.coulibaly@${DEMO_EMAIL_DOMAIN}`,
    role: "ACCOUNTANT"
  },
  {
    key: "supervisor",
    fullName: "Oumar Diakite",
    email: `oumar.diakite@${DEMO_EMAIL_DOMAIN}`,
    role: "SUPERVISOR"
  },
  {
    key: "agricultureLead",
    fullName: "Aminata Kone",
    email: `aminata.kone@${DEMO_EMAIL_DOMAIN}`,
    role: "EMPLOYEE"
  },
  {
    key: "storeLead",
    fullName: "Mamadou Sissoko",
    email: `mamadou.sissoko@${DEMO_EMAIL_DOMAIN}`,
    role: "EMPLOYEE"
  },
  {
    key: "waterLead",
    fullName: "Kadiatou Keita",
    email: `kadiatou.keita@${DEMO_EMAIL_DOMAIN}`,
    role: "EMPLOYEE"
  },
  {
    key: "fieldLead",
    fullName: "Ibrahim Sidibe",
    email: `ibrahima.sidibe@${DEMO_EMAIL_DOMAIN}`,
    role: "EMPLOYEE"
  },
  {
    key: "hotelLead",
    fullName: "Mariam Toure",
    email: `mariam.toure@${DEMO_EMAIL_DOMAIN}`,
    role: "EMPLOYEE"
  }
];

const demoAccounts: DemoAccount[] = [
  {
    key: "cashMain",
    name: "Caisse principale Bamako",
    accountRef: "CAISSE-BKO-001",
    balance: "12500000.00",
    scopeType: "GLOBAL",
    primaryActivityCode: null,
    allowedActivityCodes: []
  },
  {
    key: "bankMain",
    name: "Banque BDM Siege",
    accountRef: "BDM-AMCCO-001",
    balance: "28000000.00",
    scopeType: "GLOBAL",
    primaryActivityCode: null,
    allowedActivityCodes: []
  },
  {
    key: "mobileMoney",
    name: "Orange Money Exploitation",
    accountRef: "OM-AMCCO-2026",
    balance: "2350000.00",
    scopeType: "RESTRICTED",
    primaryActivityCode: null,
    allowedActivityCodes: ["MONEY_TRANSFER", "SERVICES", "WATER"]
  },
  {
    key: "agricultureCash",
    name: "Caisse agriculture Niono",
    accountRef: "AGR-NIONO-01",
    balance: "4800000.00",
    scopeType: "DEDICATED",
    primaryActivityCode: "AGRICULTURE",
    allowedActivityCodes: ["AGRICULTURE"]
  },
  {
    key: "storeCash",
    name: "Caisse magasin Dibida",
    accountRef: "MAG-DIBIDA-01",
    balance: "3250000.00",
    scopeType: "DEDICATED",
    primaryActivityCode: "GENERAL_STORE",
    allowedActivityCodes: ["GENERAL_STORE"]
  },
  {
    key: "btpCash",
    name: "Caisse chantier Bamako",
    accountRef: "BTP-BKO-A45",
    balance: "6100000.00",
    scopeType: "DEDICATED",
    primaryActivityCode: "BTP",
    allowedActivityCodes: ["BTP"]
  }
];

function stableUuid(label: string): string {
  const bytes = createHash("sha1").update(`${DEMO_NAMESPACE}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    bytes.toString("hex", 0, 4),
    bytes.toString("hex", 4, 6),
    bytes.toString("hex", 6, 8),
    bytes.toString("hex", 8, 10),
    bytes.toString("hex", 10, 16)
  ].join("-");
}

function daysFromNow(offsetDays: number, hour = 10, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function currentPayPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function withSeedMarker(metadata: Record<string, string>): Record<string, string> {
  return {
    ...metadata,
    demoSeed: DEMO_SEED_MARKER
  };
}

function requiredMapValue(map: Map<string, string>, key: string, label: string): string {
  const value = map.get(key);
  if (!value) {
    throw new Error(`${label} introuvable: ${key}`);
  }
  return value;
}

function buildSalaryMetadata(input: {
  employeeUserId: string;
  employeeFullName: string;
  employeeEmail: string;
  employeeRole: RoleCode;
  payPeriod: string;
  grossAmount: string;
  bonusAmount: string;
  deductionAmount: string;
  netAmount: string;
  paymentMethod: "BANK_TRANSFER" | "CASH" | "MOBILE_MONEY" | "CHEQUE";
  note: string;
}): Record<string, string> {
  return withSeedMarker({
    entryCategory: "SALARY",
    employeeUserId: input.employeeUserId,
    employeeFullName: input.employeeFullName,
    employeeEmail: input.employeeEmail,
    employeeRole: input.employeeRole,
    payPeriod: input.payPeriod,
    grossAmount: input.grossAmount,
    bonusAmount: input.bonusAmount,
    deductionAmount: input.deductionAmount,
    netAmount: input.netAmount,
    paymentMethod: input.paymentMethod,
    note: input.note
  });
}

function buildDemoTransactions(userIds: Map<string, string>): DemoTransaction[] {
  const payPeriod = currentPayPeriod();
  const storeLead = demoUsers.find((item) => item.key === "storeLead");
  const agricultureLead = demoUsers.find((item) => item.key === "agricultureLead");
  const storeLeadId = requiredMapValue(userIds, "storeLead", "Utilisateur");
  const agricultureLeadId = requiredMapValue(userIds, "agricultureLead", "Utilisateur");

  if (!storeLead || !agricultureLead) {
    throw new Error("Configuration utilisateurs demo invalide.");
  }

  return [
    {
      key: "hardware-sale-ciment",
      accountKey: "cashMain",
      type: "CASH_IN",
      amount: "375000.00",
      currency: "XOF",
      activityCode: "HARDWARE",
      description: "Vente sacs ciment CEM II - depot Bamako",
      metadata: withSeedMarker({
        hardwareOperationKind: "ITEM_EXIT",
        productFamily: "Ciment",
        itemName: "Ciment CEM II 50kg",
        quantity: "50",
        purchaseUnitPrice: "6500",
        saleUnitPrice: "7500",
        dailyPayment: "375000",
        supplierRef: "Depot Koulikoro"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      occurredAt: daysFromNow(-11, 9),
      createdAt: daysFromNow(-11, 9, 15)
    },
    {
      key: "hardware-purchase-fer",
      accountKey: "cashMain",
      type: "CASH_OUT",
      amount: "780000.00",
      currency: "XOF",
      activityCode: "HARDWARE",
      description: "Achat fer a beton 10 pour reapprovisionnement",
      metadata: withSeedMarker({
        hardwareOperationKind: "ITEM_ENTRY",
        productFamily: "Fer",
        itemName: "Fer a beton 10",
        quantity: "120",
        purchaseUnitPrice: "6500",
        supplierRef: "Sotrama Metal"
      }),
      status: "SUBMITTED",
      requiresProof: true,
      createdByKey: "accountant",
      occurredAt: daysFromNow(-9, 15),
      createdAt: daysFromNow(-9, 15, 20)
    },
    {
      key: "store-sale-rice",
      accountKey: "storeCash",
      type: "CASH_IN",
      amount: "185000.00",
      currency: "XOF",
      activityCode: "GENERAL_STORE",
      description: "Vente caisse riz Gambiaka 50kg",
      metadata: withSeedMarker({
        storeOperationKind: "STORE_SALE",
        department: "Epicerie",
        productFamily: "Riz",
        itemName: "Riz Gambiaka 50kg",
        skuRef: "RIZ-GAM-50",
        registerRef: "Caisse 1",
        cashierRef: "Mamadou Sissoko",
        quantity: "10",
        purchaseUnitPrice: "16000",
        saleUnitPrice: "18500",
        receiptRef: "TK-2026-071"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "storeLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-8, 18),
      createdAt: daysFromNow(-8, 18, 10)
    },
    {
      key: "store-purchase-stock",
      accountKey: "storeCash",
      type: "CASH_OUT",
      amount: "820000.00",
      currency: "XOF",
      activityCode: "GENERAL_STORE",
      description: "Achat stock epicerie aupres grossiste Dibida",
      metadata: withSeedMarker({
        storeOperationKind: "STOCK_PURCHASE",
        department: "Epicerie",
        productFamily: "Huile",
        itemName: "Huile 20L",
        skuRef: "HUILE-20L",
        shelfRef: "Reserve A",
        quantity: "40",
        purchaseUnitPrice: "20500",
        supplierRef: "Grossiste Dibida",
        invoiceRef: "FAC-DIB-441"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      occurredAt: daysFromNow(-7, 11),
      createdAt: daysFromNow(-7, 11, 30)
    },
    {
      key: "food-sale-chicken",
      accountKey: "cashMain",
      type: "CASH_IN",
      amount: "240000.00",
      currency: "XOF",
      activityCode: "FOOD",
      description: "Vente poulets locaux du lot PL-0726",
      metadata: withSeedMarker({
        foodOperationKind: "PRODUCT_SALE",
        productFamily: "Produits frais",
        productName: "Poulet local",
        batchRef: "LOT-PL-0726",
        expiryDate: "2026-08-05",
        storageArea: "Chambre froide 1",
        temperatureRange: "2-4 C",
        quantity: "80",
        unit: "piece",
        purchaseUnitPrice: "2400",
        saleUnitPrice: "3000",
        buyerRef: "Restaurant Faso"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "storeLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-6, 13),
      createdAt: daysFromNow(-6, 13, 20)
    },
    {
      key: "food-loss-cold",
      accountKey: "cashMain",
      type: "CASH_OUT",
      amount: "35000.00",
      currency: "XOF",
      activityCode: "FOOD",
      description: "Perte controlee apres rupture froid",
      metadata: withSeedMarker({
        foodOperationKind: "STOCK_LOSS",
        productFamily: "Produits frais",
        productName: "Yaourt local",
        batchRef: "LOT-YAO-118",
        storageArea: "Vitrine froide",
        lossQuantity: "25",
        unit: "piece",
        lossReason: "Rupture froid",
        invoiceAmount: "35000"
      }),
      status: "SUBMITTED",
      requiresProof: true,
      createdByKey: "storeLead",
      occurredAt: daysFromNow(-5, 16),
      createdAt: daysFromNow(-5, 16, 5)
    },
    {
      key: "rental-payment-hamdallaye",
      accountKey: "bankMain",
      type: "CASH_IN",
      amount: "450000.00",
      currency: "XOF",
      activityCode: "RENTAL",
      description: "Paiement loyer appartement Hamdallaye APP-2B",
      metadata: withSeedMarker({
        rentalOperationKind: "RENT_PAYMENT",
        propertyRef: "IMMEUBLE-HAMDALLAYE",
        unitRef: "APP-2B",
        tenantRef: "Famille Keita",
        leaseRef: "BAIL-2026-018",
        propertyType: "Appartement",
        serviceCharge: "25000",
        paymentRef: "VIR-BDM-071"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      occurredAt: daysFromNow(-4, 10),
      createdAt: daysFromNow(-4, 10, 10)
    },
    {
      key: "rental-maintenance-hamdallaye",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "85000.00",
      currency: "XOF",
      activityCode: "RENTAL",
      description: "Maintenance plomberie appartement APP-2B",
      metadata: withSeedMarker({
        rentalOperationKind: "MAINTENANCE_EXPENSE",
        propertyRef: "IMMEUBLE-HAMDALLAYE",
        unitRef: "APP-2B",
        tenantRef: "Famille Keita",
        leaseRef: "BAIL-2026-018",
        propertyType: "Appartement",
        supplierRef: "Plomberie Sogolon",
        invoiceRef: "PLB-2206"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      occurredAt: daysFromNow(-3, 14),
      createdAt: daysFromNow(-3, 14, 10)
    },
    {
      key: "agri-input-rice",
      accountKey: "agricultureCash",
      type: "CASH_OUT",
      amount: "675000.00",
      currency: "XOF",
      activityCode: "AGRICULTURE",
      description: "Achat semences et engrais pour campagne riz",
      metadata: withSeedMarker({
        agricultureOperationKind: "INPUT_PURCHASE",
        campaignRef: "Campagne riz 2026",
        parcelRef: "Parcelle Niono P4",
        fieldType: "Riz irrigue",
        cropType: "Riz",
        surfaceArea: "6.5",
        supplierRef: "Cooperative Niono",
        quantity: "45"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "agricultureLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-15, 8),
      createdAt: daysFromNow(-15, 8, 30)
    },
    {
      key: "agri-harvest-sale",
      accountKey: "agricultureCash",
      type: "CASH_IN",
      amount: "2450000.00",
      currency: "XOF",
      activityCode: "AGRICULTURE",
      description: "Vente partielle recolte riz Niono",
      metadata: withSeedMarker({
        agricultureOperationKind: "HARVEST_SALE",
        campaignRef: "Campagne riz 2026",
        parcelRef: "Parcelle Niono P4",
        fieldType: "Riz irrigue",
        cropType: "Riz",
        surfaceArea: "6.5",
        quantity: "140",
        buyerRef: "Collecteur Segou"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "agricultureLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-2, 17),
      createdAt: daysFromNow(-2, 17, 15)
    },
    {
      key: "btp-client-payment",
      accountKey: "btpCash",
      type: "CASH_IN",
      amount: "8500000.00",
      currency: "XOF",
      activityCode: "BTP",
      description: "Encaissement client chantier villa A45",
      metadata: withSeedMarker({
        btpOperationKind: "CLIENT_PAYMENT",
        projectRef: "CHANTIER-BAMAKO-A45",
        workPackage: "Gros oeuvre",
        siteLocation: "ACI 2000",
        clientRef: "Famille Sangare",
        progressPercent: "45",
        paymentRef: "VIR-CLIENT-A45"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      occurredAt: daysFromNow(-12, 10),
      createdAt: daysFromNow(-12, 10, 20)
    },
    {
      key: "btp-materials",
      accountKey: "btpCash",
      type: "CASH_OUT",
      amount: "2400000.00",
      currency: "XOF",
      activityCode: "BTP",
      description: "Achat ciment et fer pour gros oeuvre A45",
      metadata: withSeedMarker({
        btpOperationKind: "MATERIAL_PURCHASE",
        projectRef: "CHANTIER-BAMAKO-A45",
        workPackage: "Gros oeuvre",
        siteLocation: "ACI 2000",
        clientRef: "Famille Sangare",
        progressPercent: "48",
        quantity: "300",
        materialRef: "Ciment et fer",
        supplierRef: "Depot Koulikoro"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-10, 12),
      createdAt: daysFromNow(-10, 12, 15)
    },
    {
      key: "btp-labor",
      accountKey: "btpCash",
      type: "CASH_OUT",
      amount: "950000.00",
      currency: "XOF",
      activityCode: "BTP",
      description: "Paiement main-d'oeuvre chantier A45",
      metadata: withSeedMarker({
        btpOperationKind: "LABOR_PAYMENT",
        projectRef: "CHANTIER-BAMAKO-A45",
        workPackage: "Gros oeuvre",
        siteLocation: "ACI 2000",
        clientRef: "Famille Sangare",
        progressPercent: "52",
        workerCount: "12",
        workDays: "5",
        paymentRef: "PAIE-CHANTIER-A45"
      }),
      status: "SUBMITTED",
      requiresProof: false,
      createdByKey: "fieldLead",
      occurredAt: daysFromNow(-1, 18),
      createdAt: daysFromNow(-1, 18, 5)
    },
    {
      key: "fish-fingerlings",
      accountKey: "cashMain",
      type: "CASH_OUT",
      amount: "480000.00",
      currency: "XOF",
      activityCode: "FISH_FARMING",
      description: "Achat alevins tilapia bassin B1",
      metadata: withSeedMarker({
        fishOperationKind: "FINGERLING_PURCHASE",
        pondRef: "Bassin B1",
        cycleRef: "Cycle Tilapia 2026",
        species: "Tilapia",
        quantity: "6000",
        supplierRef: "Piscicole Koulikoro"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-18, 9),
      createdAt: daysFromNow(-18, 9, 20)
    },
    {
      key: "fish-sale",
      accountKey: "cashMain",
      type: "CASH_IN",
      amount: "1600000.00",
      currency: "XOF",
      activityCode: "FISH_FARMING",
      description: "Vente tilapia marche de Medine",
      metadata: withSeedMarker({
        fishOperationKind: "FISH_SALE",
        pondRef: "Bassin B1",
        cycleRef: "Cycle Tilapia 2026",
        species: "Tilapia",
        quantity: "800",
        buyerRef: "Marche Medine"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-2, 12),
      createdAt: daysFromNow(-2, 12, 15)
    },
    {
      key: "fish-feed",
      accountKey: "cashMain",
      type: "CASH_OUT",
      amount: "690000.00",
      currency: "XOF",
      activityCode: "FISH_FARMING",
      description: "Achat aliment poisson",
      metadata: withSeedMarker({
        fishOperationKind: "FEED_PURCHASE",
        pondRef: "Bassin B1",
        cycleRef: "Cycle Tilapia 2026",
        species: "Tilapia",
        quantity: "1250",
        supplierRef: "Aliment Betail Mali"
      }),
      status: "SUBMITTED",
      requiresProof: true,
      createdByKey: "fieldLead",
      occurredAt: daysFromNow(-4, 11),
      createdAt: daysFromNow(-4, 11, 15)
    },
    {
      key: "livestock-purchase",
      accountKey: "cashMain",
      type: "CASH_OUT",
      amount: "1800000.00",
      currency: "XOF",
      activityCode: "LIVESTOCK",
      description: "Achat moutons pour lot Tabaski",
      metadata: withSeedMarker({
        livestockOperationKind: "ANIMAL_PURCHASE",
        herdRef: "Ferme Kati",
        batchRef: "Lot moutons Tabaski",
        species: "Mouton",
        animalCount: "20",
        supplierRef: "Eleveur Nara"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-16, 7),
      createdAt: daysFromNow(-16, 7, 20)
    },
    {
      key: "livestock-sale",
      accountKey: "cashMain",
      type: "CASH_IN",
      amount: "2750000.00",
      currency: "XOF",
      activityCode: "LIVESTOCK",
      description: "Vente moutons lot Tabaski",
      metadata: withSeedMarker({
        livestockOperationKind: "ANIMAL_SALE",
        herdRef: "Ferme Kati",
        batchRef: "Lot moutons Tabaski",
        species: "Mouton",
        animalCount: "15",
        buyerRef: "Clients Bamako"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-3, 16),
      createdAt: daysFromNow(-3, 16, 10)
    },
    {
      key: "hotel-room-payment",
      accountKey: "bankMain",
      type: "CASH_IN",
      amount: "560000.00",
      currency: "XOF",
      activityCode: "HOTEL_LODGING",
      description: "Paiement sejour chambre CH-204",
      metadata: withSeedMarker({
        hotelOperationKind: "ROOM_PAYMENT",
        serviceLine: "Hebergement",
        roomRef: "CH-204",
        roomType: "Double",
        bookingRef: "RES-MALI-071",
        guestRef: "Ousmane Toure",
        nightsCount: "4",
        guestCount: "2",
        paymentRef: "CB-RES-071"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "hotelLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-6, 19),
      createdAt: daysFromNow(-6, 19, 5)
    },
    {
      key: "hotel-maintenance",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "95000.00",
      currency: "XOF",
      activityCode: "HOTEL_LODGING",
      description: "Maintenance climatisation chambre CH-204",
      metadata: withSeedMarker({
        hotelOperationKind: "ROOM_MAINTENANCE",
        serviceLine: "Hebergement",
        roomRef: "CH-204",
        roomType: "Double",
        bookingRef: "RES-MALI-071",
        guestRef: "Ousmane Toure",
        supplierRef: "Froid Service Bamako"
      }),
      status: "SUBMITTED",
      requiresProof: true,
      createdByKey: "hotelLead",
      occurredAt: daysFromNow(-1, 10),
      createdAt: daysFromNow(-1, 10, 20)
    },
    {
      key: "water-billing",
      accountKey: "mobileMoney",
      type: "CASH_IN",
      amount: "1250000.00",
      currency: "XOF",
      activityCode: "WATER",
      description: "Encaissement factures eau zone sud",
      metadata: withSeedMarker({
        waterOperationKind: "WATER_BILLING",
        facilityRef: "Forage Kati",
        networkZone: "Zone Sud",
        productionLine: "Distribution",
        producedVolumeM3: "1800",
        volumeM3: "1320",
        meterRef: "CTR-ZS-01",
        paymentRef: "OM-EAU-072"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "waterLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-5, 9),
      createdAt: daysFromNow(-5, 9, 30)
    },
    {
      key: "water-network-repair",
      accountKey: "mobileMoney",
      type: "CASH_OUT",
      amount: "210000.00",
      currency: "XOF",
      activityCode: "WATER",
      description: "Reparation fuite reseau zone sud",
      metadata: withSeedMarker({
        waterOperationKind: "NETWORK_REPAIR",
        facilityRef: "Forage Kati",
        networkZone: "Zone Sud",
        productionLine: "Maintenance",
        equipmentRef: "Conduite DN90",
        issueRef: "FUITE-ZS-044",
        supplierRef: "Equipe hydraulique Kati"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "waterLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-2, 14),
      createdAt: daysFromNow(-2, 14, 10)
    },
    {
      key: "agency-sale-commission",
      accountKey: "bankMain",
      type: "CASH_IN",
      amount: "2100000.00",
      currency: "XOF",
      activityCode: "REAL_ESTATE_AGENCY",
      description: "Commission vente villa Badalabougou",
      metadata: withSeedMarker({
        agencyOperationKind: "SALE_COMMISSION",
        mandateRef: "MAND-BKO-030",
        propertyRef: "Villa Badalabougou",
        mandateType: "Vente",
        propertyType: "Villa",
        locationZone: "Badalabougou",
        ownerRef: "Famille Cisse",
        clientRef: "Adama Goita",
        dealRef: "DEAL-030",
        dealStage: "Compromis",
        dealAmount: "70000000",
        commissionRate: "3",
        commissionAmount: "2100000",
        paymentRef: "VIR-NOTAIRE-030"
      }),
      status: "APPROVED",
      requiresProof: true,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-3, 11),
      createdAt: daysFromNow(-3, 11, 20)
    },
    {
      key: "agency-advertising",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "125000.00",
      currency: "XOF",
      activityCode: "REAL_ESTATE_AGENCY",
      description: "Publicite villa Badalabougou",
      metadata: withSeedMarker({
        agencyOperationKind: "ADVERTISING_EXPENSE",
        mandateRef: "MAND-BKO-030",
        propertyRef: "Villa Badalabougou",
        mandateType: "Vente",
        propertyType: "Villa",
        locationZone: "Badalabougou",
        ownerRef: "Famille Cisse",
        clientRef: "Adama Goita",
        dealRef: "DEAL-030",
        dealStage: "Publication",
        advertisingChannel: "Facebook et panneau",
        expenseAmount: "125000"
      }),
      status: "SUBMITTED",
      requiresProof: true,
      createdByKey: "fieldLead",
      occurredAt: daysFromNow(-8, 10),
      createdAt: daysFromNow(-8, 10, 20)
    },
    {
      key: "transport-rental",
      accountKey: "cashMain",
      type: "CASH_IN",
      amount: "650000.00",
      currency: "XOF",
      activityCode: "TRANSPORT",
      description: "Location camion benne pour transport laterite",
      metadata: withSeedMarker({
        vehicleRef: "CAM-BENNE-02",
        routeRef: "Kati - Bamako",
        rotationsCount: "8",
        clientRef: "Chantier ACI"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "fieldLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-5, 8),
      createdAt: daysFromNow(-5, 8, 15)
    },
    {
      key: "money-transfer-commission",
      accountKey: "mobileMoney",
      type: "CASH_IN",
      amount: "320000.00",
      currency: "XOF",
      activityCode: "MONEY_TRANSFER",
      description: "Commissions Orange Money et Wave",
      metadata: withSeedMarker({
        serviceProvider: "Orange Money / Wave",
        counterRef: "Guichet Magnambougou",
        operationsCount: "145"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "storeLead",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-4, 20),
      createdAt: daysFromNow(-4, 20, 5)
    },
    {
      key: "services-consulting",
      accountKey: "bankMain",
      type: "CASH_IN",
      amount: "580000.00",
      currency: "XOF",
      activityCode: "SERVICES",
      description: "Prestation conseil orientation dossier investissement",
      metadata: withSeedMarker({
        serviceRef: "CONS-INV-026",
        clientRef: "Entreprise Faso Invest",
        deliverableRef: "Note orientation"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "supervisor",
      validatedByKey: "accountant",
      occurredAt: daysFromNow(-2, 15),
      createdAt: daysFromNow(-2, 15, 10)
    },
    {
      key: "mining-equipment-draft",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "2250000.00",
      currency: "XOF",
      activityCode: "MINING",
      description: "Devis equipement prospection miniere - brouillon",
      metadata: withSeedMarker({
        siteRef: "Site Kangaba",
        equipmentRef: "Motopompe et tuyaux",
        supplierRef: "Materiel Minier Mali"
      }),
      status: "DRAFT",
      requiresProof: true,
      createdByKey: "accountant",
      occurredAt: daysFromNow(-1, 9),
      createdAt: daysFromNow(-1, 9, 10)
    },
    {
      key: "salary-store-lead",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "325000.00",
      currency: "XOF",
      activityCode: null,
      description: `Salaire ${payPeriod} - ${storeLead.fullName}`,
      metadata: buildSalaryMetadata({
        employeeUserId: storeLeadId,
        employeeFullName: storeLead.fullName,
        employeeEmail: storeLead.email,
        employeeRole: storeLead.role,
        payPeriod,
        grossAmount: "350000.00",
        bonusAmount: "25000.00",
        deductionAmount: "50000.00",
        netAmount: "325000.00",
        paymentMethod: "BANK_TRANSFER",
        note: "Salaire demo presentation - responsable magasin"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      salaryConfirmationStatus: "NOT_REQUIRED",
      occurredAt: daysFromNow(-1, 8),
      createdAt: daysFromNow(-1, 8, 5)
    },
    {
      key: "salary-agriculture-lead",
      accountKey: "bankMain",
      type: "CASH_OUT",
      amount: "295000.00",
      currency: "XOF",
      activityCode: null,
      description: `Salaire ${payPeriod} - ${agricultureLead.fullName}`,
      metadata: buildSalaryMetadata({
        employeeUserId: agricultureLeadId,
        employeeFullName: agricultureLead.fullName,
        employeeEmail: agricultureLead.email,
        employeeRole: agricultureLead.role,
        payPeriod,
        grossAmount: "300000.00",
        bonusAmount: "15000.00",
        deductionAmount: "20000.00",
        netAmount: "295000.00",
        paymentMethod: "MOBILE_MONEY",
        note: "Salaire demo presentation - suivi agricole"
      }),
      status: "APPROVED",
      requiresProof: false,
      createdByKey: "accountant",
      validatedByKey: "sysAdmin",
      salaryConfirmationStatus: "NOT_REQUIRED",
      occurredAt: daysFromNow(-1, 8, 30),
      createdAt: daysFromNow(-1, 8, 35)
    }
  ];
}

const demoTasks: DemoTask[] = [
  {
    key: "task-hardware-stock",
    title: "Controler le stock ciment depot Bamako",
    description: "Verifier quantite physique, tickets de sortie et seuil de reapprovisionnement.",
    activityCode: "HARDWARE",
    metadata: withSeedMarker({
      productFamily: "Ciment",
      itemName: "Ciment CEM II 50kg",
      quantity: "120",
      supplierRef: "Depot Koulikoro"
    }),
    status: "TODO",
    createdByKey: "supervisor",
    assignedToKey: "storeLead",
    dueDate: daysFromNow(2, 17),
    createdAt: daysFromNow(0, 8, 30)
  },
  {
    key: "task-store-closing",
    title: "Cloturer la caisse epicerie",
    description: "Comparer les ventes tickets avec le versement caisse 1.",
    activityCode: "GENERAL_STORE",
    metadata: withSeedMarker({
      storeTaskKind: "CLOSING_CASH",
      department: "Epicerie",
      registerRef: "Caisse 1",
      issueRef: "Controle journalier"
    }),
    status: "DONE",
    createdByKey: "supervisor",
    assignedToKey: "storeLead",
    dueDate: daysFromNow(-1, 18),
    createdAt: daysFromNow(-2, 9)
  },
  {
    key: "task-store-inventory-blocked",
    title: "Verifier ecart inventaire huile 20L",
    description: "Ecart entre stock systeme et stock reserve A, besoin arbitrage superviseur.",
    activityCode: "GENERAL_STORE",
    metadata: withSeedMarker({
      storeTaskKind: "INVENTORY",
      department: "Epicerie",
      productFamily: "Huile",
      itemName: "Huile 20L",
      skuRef: "HUILE-20L",
      shelfRef: "Reserve A",
      issueRef: "Ecart inventaire"
    }),
    status: "BLOCKED",
    createdByKey: "supervisor",
    assignedToKey: "storeLead",
    dueDate: daysFromNow(-1, 16),
    createdAt: daysFromNow(-1, 8)
  },
  {
    key: "task-food-dlc",
    title: "Controler DLC lot poulet local",
    description: "Verifier temperature, DLC et rotation du lot PL-0726 avant vente.",
    activityCode: "FOOD",
    metadata: withSeedMarker({
      foodTaskKind: "EXPIRY_CHECK",
      productFamily: "Produits frais",
      productName: "Poulet local",
      batchRef: "LOT-PL-0726",
      expiryDate: "2026-08-05",
      storageArea: "Chambre froide 1",
      temperatureRange: "2-4 C"
    }),
    status: "IN_PROGRESS",
    createdByKey: "supervisor",
    assignedToKey: "storeLead",
    dueDate: daysFromNow(0, 18),
    createdAt: daysFromNow(0, 8)
  },
  {
    key: "task-rental-followup",
    title: "Relancer quittance loyer APP-2B",
    description: "Envoyer quittance et confirmer reception du paiement du mois.",
    activityCode: "RENTAL",
    metadata: withSeedMarker({
      rentalTaskKind: "RENT_COLLECTION",
      propertyRef: "IMMEUBLE-HAMDALLAYE",
      unitRef: "APP-2B",
      tenantRef: "Famille Keita",
      leaseRef: "BAIL-2026-018",
      propertyType: "Appartement"
    }),
    status: "TODO",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(3, 12),
    createdAt: daysFromNow(-1, 13)
  },
  {
    key: "task-agri-sowing",
    title: "Suivre entretien parcelle Niono P4",
    description: "Verifier herbicide, irrigation et main-d'oeuvre sur la parcelle P4.",
    activityCode: "AGRICULTURE",
    metadata: withSeedMarker({
      agricultureTaskKind: "MAINTENANCE",
      campaignRef: "Campagne riz 2026",
      parcelRef: "Parcelle Niono P4",
      fieldType: "Riz irrigue",
      cropType: "Riz",
      surfaceArea: "6.5"
    }),
    status: "DONE",
    createdByKey: "supervisor",
    assignedToKey: "agricultureLead",
    dueDate: daysFromNow(-4, 17),
    createdAt: daysFromNow(-8, 9)
  },
  {
    key: "task-agri-storage-blocked",
    title: "Arbitrer stockage recolte riz",
    description: "Espace magasin insuffisant pour le solde de recolte.",
    activityCode: "AGRICULTURE",
    metadata: withSeedMarker({
      agricultureTaskKind: "STORAGE",
      campaignRef: "Campagne riz 2026",
      parcelRef: "Parcelle Niono P4",
      fieldType: "Riz irrigue",
      cropType: "Riz",
      surfaceArea: "6.5"
    }),
    status: "BLOCKED",
    createdByKey: "supervisor",
    assignedToKey: "agricultureLead",
    dueDate: daysFromNow(-1, 15),
    createdAt: daysFromNow(-1, 7, 45)
  },
  {
    key: "task-btp-delivery",
    title: "Verifier livraison fer chantier A45",
    description: "Controler quantite livree et signer bon de reception chantier.",
    activityCode: "BTP",
    metadata: withSeedMarker({
      btpTaskKind: "PROCUREMENT",
      projectRef: "CHANTIER-BAMAKO-A45",
      workPackage: "Gros oeuvre",
      siteLocation: "ACI 2000",
      clientRef: "Famille Sangare",
      progressPercent: "52",
      issueRef: "Bon livraison en attente"
    }),
    status: "BLOCKED",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(1, 16),
    createdAt: daysFromNow(0, 7, 30)
  },
  {
    key: "task-fish-water-control",
    title: "Controler oxygene bassin B1",
    description: "Verifier oxygene, turbidite et mortalite avant nourrissage.",
    activityCode: "FISH_FARMING",
    metadata: withSeedMarker({
      fishTaskKind: "WATER_CONTROL",
      pondRef: "Bassin B1",
      cycleRef: "Cycle Tilapia 2026",
      species: "Tilapia",
      mortalityCount: "3"
    }),
    status: "IN_PROGRESS",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(0, 14),
    createdAt: daysFromNow(0, 7)
  },
  {
    key: "task-livestock-vaccine",
    title: "Planifier vaccination lot moutons Tabaski",
    description: "Coordonner passage veterinaire et stock vaccins.",
    activityCode: "LIVESTOCK",
    metadata: withSeedMarker({
      livestockTaskKind: "VACCINATION",
      herdRef: "Ferme Kati",
      batchRef: "Lot moutons Tabaski",
      species: "Mouton",
      animalCount: "20"
    }),
    status: "TODO",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(2, 10),
    createdAt: daysFromNow(-1, 11)
  },
  {
    key: "task-hotel-room",
    title: "Preparer chambre CH-204",
    description: "Check-in client Ousmane Toure, controle linge et climatisation.",
    activityCode: "HOTEL_LODGING",
    metadata: withSeedMarker({
      hotelTaskKind: "ROOM_PREPARATION",
      serviceLine: "Hebergement",
      roomRef: "CH-204",
      roomType: "Double",
      bookingRef: "RES-MALI-071",
      guestRef: "Ousmane Toure"
    }),
    status: "DONE",
    createdByKey: "supervisor",
    assignedToKey: "hotelLead",
    dueDate: daysFromNow(-1, 12),
    createdAt: daysFromNow(-2, 10)
  },
  {
    key: "task-hotel-ac",
    title: "Reparer climatisation CH-204",
    description: "Intervention prestataire froid avant prochaine reservation.",
    activityCode: "HOTEL_LODGING",
    metadata: withSeedMarker({
      hotelTaskKind: "MAINTENANCE",
      serviceLine: "Hebergement",
      roomRef: "CH-204",
      roomType: "Double",
      bookingRef: "RES-MALI-071",
      guestRef: "Ousmane Toure",
      issueRef: "Climatisation faible"
    }),
    status: "BLOCKED",
    createdByKey: "supervisor",
    assignedToKey: "hotelLead",
    dueDate: daysFromNow(1, 11),
    createdAt: daysFromNow(0, 6, 30)
  },
  {
    key: "task-water-leak",
    title: "Reparer fuite reseau Zone Sud",
    description: "Localiser fuite DN90 et remettre la pression avant 18h.",
    activityCode: "WATER",
    metadata: withSeedMarker({
      waterTaskKind: "LEAK_REPAIR",
      facilityRef: "Forage Kati",
      networkZone: "Zone Sud",
      productionLine: "Maintenance",
      equipmentRef: "Conduite DN90",
      issueRef: "FUITE-ZS-044",
      supplierRef: "Equipe hydraulique Kati"
    }),
    status: "BLOCKED",
    createdByKey: "supervisor",
    assignedToKey: "waterLead",
    dueDate: daysFromNow(0, 18),
    createdAt: daysFromNow(0, 6)
  },
  {
    key: "task-water-reading",
    title: "Releve production forage Kati",
    description: "Saisir index compteur production et volume distribue.",
    activityCode: "WATER",
    metadata: withSeedMarker({
      waterTaskKind: "PRODUCTION_READING",
      facilityRef: "Forage Kati",
      networkZone: "Zone Sud",
      productionLine: "Production",
      meterRef: "CTR-PROD-01"
    }),
    status: "DONE",
    createdByKey: "supervisor",
    assignedToKey: "waterLead",
    dueDate: daysFromNow(-1, 9),
    createdAt: daysFromNow(-1, 7)
  },
  {
    key: "task-agency-visit",
    title: "Programmer visite Villa Badalabougou",
    description: "Confirmer disponibilite proprietaire et client Adama Goita.",
    activityCode: "REAL_ESTATE_AGENCY",
    metadata: withSeedMarker({
      agencyTaskKind: "VISIT_SCHEDULE",
      mandateRef: "MAND-BKO-030",
      propertyRef: "Villa Badalabougou",
      mandateType: "Vente",
      propertyType: "Villa",
      locationZone: "Badalabougou",
      ownerRef: "Famille Cisse",
      clientRef: "Adama Goita",
      dealRef: "DEAL-030",
      dealStage: "Visite"
    }),
    status: "IN_PROGRESS",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(1, 9),
    createdAt: daysFromNow(0, 9)
  },
  {
    key: "task-transport-rotation",
    title: "Planifier rotations camion benne 02",
    description: "Preparer planning chauffeur, carburant et bon de livraison laterite.",
    activityCode: "TRANSPORT",
    metadata: withSeedMarker({
      vehicleRef: "CAM-BENNE-02",
      routeRef: "Kati - Bamako",
      driverRef: "Seydou Konate"
    }),
    status: "TODO",
    createdByKey: "supervisor",
    assignedToKey: "fieldLead",
    dueDate: daysFromNow(2, 8),
    createdAt: daysFromNow(-1, 10)
  },
  {
    key: "task-money-transfer-liquidity",
    title: "Reequilibrer liquidite guichet Magnambougou",
    description: "Verifier solde Orange Money et Wave avant ouverture.",
    activityCode: "MONEY_TRANSFER",
    metadata: withSeedMarker({
      serviceProvider: "Orange Money / Wave",
      counterRef: "Guichet Magnambougou",
      issueRef: "Besoin liquidite matin"
    }),
    status: "TODO",
    createdByKey: "supervisor",
    assignedToKey: "storeLead",
    dueDate: daysFromNow(1, 8),
    createdAt: daysFromNow(0, 7, 15)
  }
];

const demoProofs: DemoProof[] = [
  {
    key: "proof-hardware-purchase-fer",
    transactionKey: "hardware-purchase-fer",
    fileName: "facture-fer-beton-10.pdf",
    mimeType: "application/pdf",
    fileSize: 184320,
    uploadedAt: daysFromNow(-9, 16)
  },
  {
    key: "proof-store-purchase-stock",
    transactionKey: "store-purchase-stock",
    fileName: "facture-grossiste-dibida.pdf",
    mimeType: "application/pdf",
    fileSize: 221184,
    uploadedAt: daysFromNow(-7, 12)
  },
  {
    key: "proof-rental-payment",
    transactionKey: "rental-payment-hamdallaye",
    fileName: "quittance-app-2b.pdf",
    mimeType: "application/pdf",
    fileSize: 128512,
    uploadedAt: daysFromNow(-4, 11)
  },
  {
    key: "proof-btp-client-payment",
    transactionKey: "btp-client-payment",
    fileName: "ordre-virement-chantier-a45.pdf",
    mimeType: "application/pdf",
    fileSize: 198656,
    uploadedAt: daysFromNow(-12, 11)
  },
  {
    key: "proof-water-repair",
    transactionKey: "water-network-repair",
    fileName: "bon-intervention-fuite-zone-sud.pdf",
    mimeType: "application/pdf",
    fileSize: 176128,
    uploadedAt: daysFromNow(-2, 15)
  }
];

const demoTaskAttachments: DemoTaskAttachment[] = [
  {
    key: "attachment-store-inventory",
    taskKey: "task-store-inventory-blocked",
    uploadedByKey: "storeLead",
    fileName: "photo-ecart-huile-20l.jpg",
    mimeType: "image/jpeg",
    fileSize: 312000,
    uploadedAt: daysFromNow(-1, 9)
  },
  {
    key: "attachment-btp-delivery",
    taskKey: "task-btp-delivery",
    uploadedByKey: "fieldLead",
    fileName: "bon-livraison-fer-a45.pdf",
    mimeType: "application/pdf",
    fileSize: 201000,
    uploadedAt: daysFromNow(0, 8)
  },
  {
    key: "attachment-water-leak",
    taskKey: "task-water-leak",
    uploadedByKey: "waterLead",
    fileName: "photo-fuite-zone-sud.jpg",
    mimeType: "image/jpeg",
    fileSize: 428000,
    uploadedAt: daysFromNow(0, 7)
  },
  {
    key: "attachment-fish-control",
    taskKey: "task-fish-water-control",
    uploadedByKey: "fieldLead",
    fileName: "pv-controle-bassin-b1.pdf",
    mimeType: "application/pdf",
    fileSize: 156000,
    uploadedAt: daysFromNow(0, 8, 45)
  }
];

const demoTaskComments: DemoTaskComment[] = [
  {
    key: "comment-store-inventory-1",
    taskKey: "task-store-inventory-blocked",
    authorKey: "storeLead",
    body: "Stock physique: 38 bidons. Stock systeme: 42. Ecart a valider avant ajustement.",
    createdAt: daysFromNow(-1, 9, 30)
  },
  {
    key: "comment-store-inventory-2",
    taskKey: "task-store-inventory-blocked",
    authorKey: "supervisor",
    body: "Verifier les sorties fournisseur Dibida avant correction du stock.",
    createdAt: daysFromNow(-1, 10)
  },
  {
    key: "comment-water-leak-1",
    taskKey: "task-water-leak",
    authorKey: "waterLead",
    body: "Fuite confirmee sur conduite DN90. Besoin raccord et colle PVC grand diametre.",
    createdAt: daysFromNow(0, 8)
  },
  {
    key: "comment-btp-delivery-1",
    taskKey: "task-btp-delivery",
    authorKey: "fieldLead",
    body: "Livraison partielle recue. Le fournisseur doit completer 25 barres de fer.",
    createdAt: daysFromNow(0, 8, 30)
  },
  {
    key: "comment-agency-visit-1",
    taskKey: "task-agency-visit",
    authorKey: "fieldLead",
    body: "Client disponible demain matin. Proprietaire a confirmer par appel.",
    createdAt: daysFromNow(0, 10)
  }
];

const demoAlerts: DemoAlert[] = [
  {
    key: "alert-water-critical",
    targetUserKey: "supervisor",
    code: "DEMO_WATER_BLOCKED",
    message: "Blocage critique: fuite reseau Zone Sud a arbitrer avant la fin de journee.",
    severity: "CRITICAL",
    entityType: "TASK",
    entityKey: "task-water-leak",
    readAt: null,
    createdAt: daysFromNow(0, 8, 15)
  },
  {
    key: "alert-store-warning",
    targetUserKey: "accountant",
    code: "DEMO_STORE_INVENTORY",
    message: "Ecart inventaire huile 20L en attente de validation comptable.",
    severity: "WARNING",
    entityType: "TASK",
    entityKey: "task-store-inventory-blocked",
    readAt: null,
    createdAt: daysFromNow(-1, 10, 15)
  },
  {
    key: "alert-btp-proof",
    targetUserKey: "sysAdmin",
    code: "DEMO_BTP_PROOF",
    message: "Piece justificative chantier A45 disponible pour controle.",
    severity: "INFO",
    entityType: "TRANSACTION",
    entityKey: "btp-client-payment",
    readAt: daysFromNow(-10, 9),
    createdAt: daysFromNow(-12, 11, 15)
  },
  {
    key: "alert-salary-ready",
    targetUserKey: "storeLead",
    code: "DEMO_SALARY_READY",
    message: "Votre salaire de demonstration est finalise dans le suivi de paie.",
    severity: "INFO",
    entityType: "SALARY",
    entityKey: "salary-store-lead",
    readAt: null,
    createdAt: daysFromNow(-1, 9)
  }
];

function assertSeedExecutionAllowed(): void {
  if (!process.argv.includes("--apply")) {
    console.log("Seed de presentation Mali pret.");
    console.log(`Entreprise: ${DEMO_COMPANY_NAME} (${DEMO_COMPANY_CODE})`);
    console.log(`${demoUsers.length} utilisateurs, ${demoAccounts.length} comptes, donnees finance/taches/alertes.`);
    console.log("Relancer avec --apply pour ecrire dans la base.");
    return;
  }

  if (env.NODE_ENV === "production" && process.env.DEMO_ALLOW_PRODUCTION !== "1") {
    throw new Error(
      "Refus d'executer le seed en production. Definir DEMO_ALLOW_PRODUCTION=1 uniquement si c'est volontaire."
    );
  }

  const dbUrl = new URL(env.DATABASE_URL);
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname);
  if (!isLocalHost && process.env.DEMO_ALLOW_REMOTE_DB !== "1") {
    throw new Error(
      `Refus d'ecrire sur une base distante (${dbUrl.hostname}). Definir DEMO_ALLOW_REMOTE_DB=1 si c'est volontaire.`
    );
  }
}

async function ensureCompany(connection: PoolConnection): Promise<string> {
  const [rows] = await connection.query<IdRow[]>(
    "SELECT id FROM companies WHERE code = ? LIMIT 1",
    [DEMO_COMPANY_CODE]
  );

  if (rows[0]?.id && KEEP_EXISTING_COMPANY_PROFILE) {
    return rows[0].id;
  }

  const companyId = rows[0]?.id ?? stableUuid(`company:${DEMO_COMPANY_CODE}`);

  await connection.execute(
    `
      INSERT INTO companies (
        id, name, code, legal_name, registration_number, tax_id, email, phone,
        website, address_line_1, address_line_2, city, state_region, postal_code,
        country, business_sector, contact_full_name, contact_job_title, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        legal_name = VALUES(legal_name),
        registration_number = VALUES(registration_number),
        tax_id = VALUES(tax_id),
        email = VALUES(email),
        phone = VALUES(phone),
        website = VALUES(website),
        address_line_1 = VALUES(address_line_1),
        address_line_2 = VALUES(address_line_2),
        city = VALUES(city),
        state_region = VALUES(state_region),
        postal_code = VALUES(postal_code),
        country = VALUES(country),
        business_sector = VALUES(business_sector),
        contact_full_name = VALUES(contact_full_name),
        contact_job_title = VALUES(contact_job_title),
        is_active = 1
    `,
    [
      companyId,
      DEMO_COMPANY_NAME,
      DEMO_COMPANY_CODE,
      "Agence Mandingue de Courtage de Conseil et d'Orientation",
      "RCCM-ML-BKO-2026-DEMO",
      "NIF-DEMO-084126139L",
      "contact@amcco.demo",
      "+223 79 07 24 40",
      "https://amcco.demo",
      "Hamdallaye ACI 2000",
      "Rue 12, porte demo",
      "Bamako",
      "District de Bamako",
      "BP 2026",
      "Mali",
      "Multi-activites: commerce, immobilier, agriculture, BTP et services",
      "Awa Traore",
      "Directrice generale"
    ]
  );

  return companyId;
}

async function ensureCompanyActivities(connection: PoolConnection, companyId: string): Promise<void> {
  for (const activityCode of BUSINESS_ACTIVITY_CODES) {
    await connection.execute(
      `
        INSERT INTO company_activities (company_id, activity_code, is_enabled)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE is_enabled = 1
      `,
      [companyId, activityCode]
    );
  }
}

async function ensureUsers(connection: PoolConnection, companyId: string): Promise<Map<string, string>> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds = new Map<string, string>();

  for (const user of demoUsers) {
    const [existingRows] = await connection.query<IdRow[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [user.email]
    );
    const userId = existingRows[0]?.id ?? stableUuid(`user:${user.email}`);
    userIds.set(user.key, userId);

    await connection.execute(
      `
        INSERT INTO users (id, email, password_hash, full_name, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          password_hash = VALUES(password_hash),
          full_name = VALUES(full_name),
          is_active = 1
      `,
      [userId, user.email, passwordHash, user.fullName]
    );

    await connection.execute(
      `
        INSERT INTO memberships (id, user_id, company_id, role)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE role = VALUES(role)
      `,
      [stableUuid(`membership:${companyId}:${userId}`), userId, companyId, user.role]
    );
  }

  return userIds;
}

async function ensureAccounts(connection: PoolConnection, companyId: string): Promise<Map<string, string>> {
  const accountIds = new Map<string, string>();

  for (const account of demoAccounts) {
    const accountId = stableUuid(`account:${companyId}:${account.key}`);
    accountIds.set(account.key, accountId);

    await connection.execute(
      `
        INSERT INTO financial_accounts (
          id, company_id, name, account_ref, balance, scope_type, primary_activity_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          account_ref = VALUES(account_ref),
          balance = VALUES(balance),
          scope_type = VALUES(scope_type),
          primary_activity_code = VALUES(primary_activity_code)
      `,
      [
        accountId,
        companyId,
        account.name,
        account.accountRef,
        account.balance,
        account.scopeType,
        account.primaryActivityCode
      ]
    );

    await connection.execute(
      "DELETE FROM financial_account_activities WHERE account_id = ?",
      [accountId]
    );

    for (const activityCode of account.allowedActivityCodes) {
      await connection.execute(
        `
          INSERT INTO financial_account_activities (account_id, activity_code)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE activity_code = VALUES(activity_code)
        `,
        [accountId, activityCode]
      );
    }
  }

  return accountIds;
}

async function ensureTransactions(
  connection: PoolConnection,
  companyId: string,
  userIds: Map<string, string>,
  accountIds: Map<string, string>
): Promise<Map<string, string>> {
  const transactionIds = new Map<string, string>();
  const transactions = buildDemoTransactions(userIds);

  for (const transaction of transactions) {
    const transactionId = stableUuid(`transaction:${companyId}:${transaction.key}`);
    transactionIds.set(transaction.key, transactionId);
    const createdById = requiredMapValue(userIds, transaction.createdByKey, "Utilisateur");
    const validatedById = transaction.validatedByKey
      ? requiredMapValue(userIds, transaction.validatedByKey, "Validateur")
      : null;
    const salaryConfirmedById = transaction.salaryConfirmedByKey
      ? requiredMapValue(userIds, transaction.salaryConfirmedByKey, "Confirmateur salaire")
      : null;

    await connection.execute(
      `
        INSERT INTO transactions (
          id, company_id, account_id, type, amount, currency, activity_code,
          description, metadata_json, status, requires_proof,
          salary_confirmation_status, salary_confirmed_by_id, salary_confirmed_at,
          created_by_id, validated_by_id, occurred_at, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          account_id = VALUES(account_id),
          type = VALUES(type),
          amount = VALUES(amount),
          currency = VALUES(currency),
          activity_code = VALUES(activity_code),
          description = VALUES(description),
          metadata_json = VALUES(metadata_json),
          status = VALUES(status),
          requires_proof = VALUES(requires_proof),
          salary_confirmation_status = VALUES(salary_confirmation_status),
          salary_confirmed_by_id = VALUES(salary_confirmed_by_id),
          salary_confirmed_at = VALUES(salary_confirmed_at),
          created_by_id = VALUES(created_by_id),
          validated_by_id = VALUES(validated_by_id),
          occurred_at = VALUES(occurred_at),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)
      `,
      [
        transactionId,
        companyId,
        requiredMapValue(accountIds, transaction.accountKey, "Compte"),
        transaction.type,
        transaction.amount,
        transaction.currency,
        transaction.activityCode,
        transaction.description,
        JSON.stringify(transaction.metadata),
        transaction.status,
        transaction.requiresProof ? 1 : 0,
        transaction.salaryConfirmationStatus ?? "NOT_REQUIRED",
        salaryConfirmedById,
        salaryConfirmedById ? transaction.createdAt : null,
        createdById,
        validatedById,
        transaction.occurredAt,
        transaction.createdAt,
        transaction.createdAt
      ]
    );
  }

  return transactionIds;
}

async function ensureTransactionProofs(
  connection: PoolConnection,
  companyId: string,
  transactionIds: Map<string, string>
): Promise<void> {
  for (const proof of demoProofs) {
    const proofId = stableUuid(`transaction-proof:${companyId}:${proof.key}`);
    const transactionId = requiredMapValue(transactionIds, proof.transactionKey, "Transaction");
    const storageKey = `https://example.com/amcco-demo/${proof.fileName}`;
    await connection.execute(
      `
        DELETE FROM transaction_proofs
        WHERE transaction_id = ?
          AND file_name = ?
          AND id <> ?
      `,
      [transactionId, proof.fileName, proofId]
    );
    await connection.execute(
      `
        INSERT INTO transaction_proofs (
          id, transaction_id, storage_key, file_name, mime_type, file_size, uploaded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          storage_key = VALUES(storage_key),
          file_name = VALUES(file_name),
          mime_type = VALUES(mime_type),
          file_size = VALUES(file_size),
          uploaded_at = VALUES(uploaded_at)
      `,
      [
        proofId,
        transactionId,
        storageKey,
        proof.fileName,
        proof.mimeType,
        proof.fileSize,
        proof.uploadedAt
      ]
    );
  }
}

async function ensureTasks(
  connection: PoolConnection,
  companyId: string,
  userIds: Map<string, string>
): Promise<Map<string, string>> {
  const taskIds = new Map<string, string>();

  for (const task of demoTasks) {
    const taskId = stableUuid(`task:${companyId}:${task.key}`);
    taskIds.set(task.key, taskId);
    await connection.execute(
      `
        INSERT INTO tasks (
          id, company_id, title, description, activity_code, metadata_json, status,
          created_by_id, assigned_to_id, due_date, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          description = VALUES(description),
          activity_code = VALUES(activity_code),
          metadata_json = VALUES(metadata_json),
          status = VALUES(status),
          created_by_id = VALUES(created_by_id),
          assigned_to_id = VALUES(assigned_to_id),
          due_date = VALUES(due_date),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)
      `,
      [
        taskId,
        companyId,
        task.title,
        task.description,
        task.activityCode,
        JSON.stringify(task.metadata),
        task.status,
        requiredMapValue(userIds, task.createdByKey, "Createur tache"),
        requiredMapValue(userIds, task.assignedToKey, "Assigne tache"),
        task.dueDate,
        task.createdAt,
        task.createdAt
      ]
    );
  }

  return taskIds;
}

async function ensureTaskAttachments(
  connection: PoolConnection,
  companyId: string,
  taskIds: Map<string, string>,
  userIds: Map<string, string>
): Promise<void> {
  for (const attachment of demoTaskAttachments) {
    const attachmentId = stableUuid(`task-attachment:${companyId}:${attachment.key}`);
    const taskId = requiredMapValue(taskIds, attachment.taskKey, "Tache");
    const storageKey = `https://example.com/amcco-demo/${attachment.fileName}`;
    await connection.execute(
      `
        DELETE FROM task_attachments
        WHERE task_id = ?
          AND file_name = ?
          AND id <> ?
      `,
      [taskId, attachment.fileName, attachmentId]
    );
    await connection.execute(
      `
        INSERT INTO task_attachments (
          id, task_id, storage_key, file_name, mime_type, file_size, uploaded_by_id, uploaded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          storage_key = VALUES(storage_key),
          file_name = VALUES(file_name),
          mime_type = VALUES(mime_type),
          file_size = VALUES(file_size),
          uploaded_by_id = VALUES(uploaded_by_id),
          uploaded_at = VALUES(uploaded_at)
      `,
      [
        attachmentId,
        taskId,
        storageKey,
        attachment.fileName,
        attachment.mimeType,
        attachment.fileSize,
        requiredMapValue(userIds, attachment.uploadedByKey, "Utilisateur piece jointe"),
        attachment.uploadedAt
      ]
    );
  }
}

async function ensureTaskComments(
  connection: PoolConnection,
  companyId: string,
  taskIds: Map<string, string>,
  userIds: Map<string, string>
): Promise<void> {
  for (const comment of demoTaskComments) {
    const commentId = stableUuid(`task-comment:${companyId}:${comment.key}`);
    const taskId = requiredMapValue(taskIds, comment.taskKey, "Tache commentaire");
    await connection.execute(
      `
        DELETE FROM task_comments
        WHERE company_id = ?
          AND task_id = ?
          AND body = ?
          AND id <> ?
      `,
      [companyId, taskId, comment.body, commentId]
    );
    await connection.execute(
      `
        INSERT INTO task_comments (id, company_id, task_id, author_id, body, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          body = VALUES(body),
          created_at = VALUES(created_at)
      `,
      [
        commentId,
        companyId,
        taskId,
        requiredMapValue(userIds, comment.authorKey, "Auteur commentaire"),
        comment.body,
        comment.createdAt
      ]
    );
  }
}

async function ensureAlerts(
  connection: PoolConnection,
  companyId: string,
  taskIds: Map<string, string>,
  transactionIds: Map<string, string>,
  userIds: Map<string, string>
): Promise<void> {
  for (const alert of demoAlerts) {
    const entityId =
      alert.entityType === "TRANSACTION" || alert.entityType === "SALARY"
        ? requiredMapValue(transactionIds, alert.entityKey, "Transaction alerte")
        : requiredMapValue(taskIds, alert.entityKey, "Tache alerte");

    await connection.execute(
      `
        INSERT INTO alerts (
          id, company_id, target_user_id, code, message, severity,
          entity_type, entity_id, metadata, read_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          target_user_id = VALUES(target_user_id),
          code = VALUES(code),
          message = VALUES(message),
          severity = VALUES(severity),
          entity_type = VALUES(entity_type),
          entity_id = VALUES(entity_id),
          metadata = VALUES(metadata),
          read_at = VALUES(read_at),
          created_at = VALUES(created_at)
      `,
      [
        stableUuid(`alert:${companyId}:${alert.key}`),
        companyId,
        requiredMapValue(userIds, alert.targetUserKey, "Destinataire alerte"),
        alert.code,
        alert.message,
        alert.severity,
        alert.entityType,
        entityId,
        JSON.stringify({
          demoSeed: DEMO_SEED_MARKER,
          entityKey: alert.entityKey
        }),
        alert.readAt,
        alert.createdAt
      ]
    );
  }
}

async function ensureAuditLog(
  connection: PoolConnection,
  companyId: string,
  userIds: Map<string, string>
): Promise<void> {
  const sysAdminId = requiredMapValue(userIds, "sysAdmin", "Admin systeme");
  await connection.execute(
    `
      INSERT INTO audit_logs (
        id, company_id, actor_id, action, entity_type, entity_id, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        metadata = VALUES(metadata),
        created_at = VALUES(created_at)
    `,
    [
      stableUuid(`audit:${companyId}:seed-applied`),
      companyId,
      sysAdminId,
      "DEMO_PRESENTATION_SEED_APPLIED",
      "COMPANY",
      companyId,
      JSON.stringify({
        demoSeed: DEMO_SEED_MARKER,
        companyCode: DEMO_COMPANY_CODE,
        users: demoUsers.map((user) => ({ email: user.email, role: user.role }))
      }),
      new Date()
    ]
  );
}

async function readCompanyCounts(connection: PoolConnection, companyId: string): Promise<{
  users: number;
  accounts: number;
  transactions: number;
  tasks: number;
  transactionProofs: number;
  taskAttachments: number;
  alerts: number;
}> {
  const [userRows] = await connection.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM memberships
      WHERE company_id = ?
    `,
    [companyId]
  );
  const [accountRows] = await connection.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM financial_accounts WHERE company_id = ?",
    [companyId]
  );
  const [transactionRows] = await connection.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM transactions WHERE company_id = ?",
    [companyId]
  );
  const [taskRows] = await connection.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM tasks WHERE company_id = ?",
    [companyId]
  );
  const [proofRows] = await connection.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM transaction_proofs tp
      INNER JOIN transactions t ON t.id = tp.transaction_id
      WHERE t.company_id = ?
    `,
    [companyId]
  );
  const [attachmentRows] = await connection.query<CountRow[]>(
    `
      SELECT COUNT(*) AS total
      FROM task_attachments ta
      INNER JOIN tasks t ON t.id = ta.task_id
      WHERE t.company_id = ?
    `,
    [companyId]
  );
  const [alertRows] = await connection.query<CountRow[]>(
    "SELECT COUNT(*) AS total FROM alerts WHERE company_id = ?",
    [companyId]
  );

  return {
    users: userRows[0]?.total ?? 0,
    accounts: accountRows[0]?.total ?? 0,
    transactions: transactionRows[0]?.total ?? 0,
    tasks: taskRows[0]?.total ?? 0,
    transactionProofs: proofRows[0]?.total ?? 0,
    taskAttachments: attachmentRows[0]?.total ?? 0,
    alerts: alertRows[0]?.total ?? 0
  };
}

async function seedDemoPresentationData(): Promise<void> {
  assertSeedExecutionAllowed();
  if (!process.argv.includes("--apply")) {
    return;
  }

  const pool = getDbPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const companyId = await ensureCompany(connection);
    await ensureCompanyActivities(connection, companyId);
    const userIds = await ensureUsers(connection, companyId);
    const accountIds = await ensureAccounts(connection, companyId);
    const transactionIds = await ensureTransactions(connection, companyId, userIds, accountIds);
    await ensureTransactionProofs(connection, companyId, transactionIds);
    const taskIds = await ensureTasks(connection, companyId, userIds);
    await ensureTaskAttachments(connection, companyId, taskIds, userIds);
    await ensureTaskComments(connection, companyId, taskIds, userIds);
    await ensureAlerts(connection, companyId, taskIds, transactionIds, userIds);
    await ensureAuditLog(connection, companyId, userIds);

    await connection.commit();

    const counts = await readCompanyCounts(connection, companyId);
    logger.info(
      {
        companyCode: DEMO_COMPANY_CODE,
        companyId,
        counts
      },
      "Demo presentation data ready"
    );

    console.log(`Donnees de presentation pretes pour ${DEMO_COMPANY_NAME} (${DEMO_COMPANY_CODE}).`);
    console.log(`Mot de passe demo pour tous les comptes: ${DEMO_PASSWORD}`);
    for (const user of demoUsers) {
      console.log(`- ${user.fullName} | ${user.role} | ${user.email}`);
    }
    console.log(
      `Synthese: ${counts.users} utilisateur(s), ${counts.accounts} compte(s), ${counts.transactions} transaction(s), ${counts.tasks} tache(s), ${counts.alerts} alerte(s).`
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await closeDbPool();
  }
}

seedDemoPresentationData().catch((error: unknown) => {
  logger.error({ error }, "Demo presentation seed failed");
  process.exit(1);
});

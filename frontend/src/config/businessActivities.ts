export const BUSINESS_ACTIVITY_CODES = [
  "HARDWARE",
  "GENERAL_STORE",
  "FOOD",
  "RENTAL",
  "AGRICULTURE",
  "SERVICES",
  "MINING",
  "WATER",
  "REAL_ESTATE_AGENCY"
] as const;

export type BusinessActivityCode = (typeof BUSINESS_ACTIVITY_CODES)[number];

export type BusinessActivityDefinition = {
  code: BusinessActivityCode;
  label: string;
  description: string;
};

export const BUSINESS_ACTIVITIES: BusinessActivityDefinition[] = [
  {
    code: "HARDWARE",
    label: "Quincaillerie",
    description: "Materiaux, quincaillerie et fournitures."
  },
  {
    code: "GENERAL_STORE",
    label: "Magasins (commerce general)",
    description: "Commerce general et ventes multi-produits."
  },
  {
    code: "FOOD",
    label: "Alimentation",
    description: "Produits alimentaires et distribution."
  },
  {
    code: "RENTAL",
    label: "Location immobiliere",
    description: "Gestion des locations et encaissements."
  },
  {
    code: "AGRICULTURE",
    label: "Activites agricoles",
    description: "Production agricole et suivi terrain."
  },
  {
    code: "SERVICES",
    label: "Services divers",
    description: "Prestations diverses et interventions."
  },
  {
    code: "MINING",
    label: "Exploitation miniere",
    description: "Operations et charges minieres."
  },
  {
    code: "WATER",
    label: "Production d'eau potable",
    description: "Production et distribution d'eau."
  },
  {
    code: "REAL_ESTATE_AGENCY",
    label: "Agence immobiliere",
    description: "Mandats, ventes et intermediation."
  }
];

export const BUSINESS_ACTIVITY_LABELS: Record<BusinessActivityCode, string> = Object.fromEntries(
  BUSINESS_ACTIVITIES.map((item) => [item.code, item.label])
) as Record<BusinessActivityCode, string>;

export function isBusinessActivityCode(value: string): value is BusinessActivityCode {
  return BUSINESS_ACTIVITY_CODES.includes(value as BusinessActivityCode);
}

export function getBusinessActivityLabel(activityCode: BusinessActivityCode | null): string {
  if (!activityCode) {
    return "Non renseignee";
  }
  return BUSINESS_ACTIVITY_LABELS[activityCode];
}

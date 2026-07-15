export const BUSINESS_ACTIVITY_CODES = [
  "HARDWARE",
  "GENERAL_STORE",
  "FOOD",
  "RENTAL",
  "AGRICULTURE",
  "BTP",
  "FISH_FARMING",
  "LIVESTOCK",
  "TRANSPORT",
  "MONEY_TRANSFER",
  "HOTEL_LODGING",
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
    description: "Vente de materiaux, outils et fournitures de quincaillerie."
  },
  {
    code: "GENERAL_STORE",
    label: "Magasins (commerce general)",
    description: "Activites de magasin multi-produits et commerce general."
  },
  {
    code: "FOOD",
    label: "Alimentation",
    description: "Distribution et vente de produits alimentaires."
  },
  {
    code: "RENTAL",
    label: "Location immobiliere",
    description: "Gestion des biens mis en location et encaissements associes."
  },
  {
    code: "AGRICULTURE",
    label: "Activites agricoles",
    description: "Production agricole, types de champs, intrants, exploitation et suivi terrain."
  },
  {
    code: "BTP",
    label: "BTP",
    description: "Chantiers, achats, main-d'oeuvre, avancement et suivi des travaux."
  },
  {
    code: "FISH_FARMING",
    label: "Pisciculture",
    description: "Bassins, cycles d'elevage, alimentation, ventes et suivi sanitaire."
  },
  {
    code: "LIVESTOCK",
    label: "Elevage",
    description: "Boeufs, moutons, poulets et autres especes avec suivi des lots, alimentation, soins et ventes."
  },
  {
    code: "TRANSPORT",
    label: "Transport",
    description: "Location et gestion de camions bennes, tracteurs, citernes et rotations."
  },
  {
    code: "MONEY_TRANSFER",
    label: "Transaction",
    description: "Orange Money, Moov Money, Wave, Western Union, MoneyGram et Ria."
  },
  {
    code: "HOTEL_LODGING",
    label: "Hotellerie / Auberge",
    description: "Chambres, reservations, sejours, charges et exploitation d'auberge."
  },
  {
    code: "SERVICES",
    label: "Services divers",
    description: "Prestations diverses ne relevant pas d'un autre secteur catalogue."
  },
  {
    code: "MINING",
    label: "Exploitation miniere",
    description: "Operations et flux financiers lies a l'exploitation miniere."
  },
  {
    code: "WATER",
    label: "Production d'eau potable",
    description: "Production, distribution et exploitation du service d'eau potable."
  },
  {
    code: "REAL_ESTATE_AGENCY",
    label: "Agence immobiliere",
    description: "Commercialisation, intermediation et suivi de mandats immobiliers."
  }
];

export const BUSINESS_ACTIVITY_LABELS: Record<BusinessActivityCode, string> = Object.fromEntries(
  BUSINESS_ACTIVITIES.map((item) => [item.code, item.label])
) as Record<BusinessActivityCode, string>;

export function isBusinessActivityCode(value: string): value is BusinessActivityCode {
  return BUSINESS_ACTIVITY_CODES.includes(value as BusinessActivityCode);
}

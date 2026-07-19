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
    description: "Vente de matériaux, outils et fournitures de quincaillerie."
  },
  {
    code: "GENERAL_STORE",
    label: "Magasins (commerce général)",
    description: "Activités de magasin multi-produits et commerce général."
  },
  {
    code: "FOOD",
    label: "Alimentation",
    description: "Distribution et vente de produits alimentaires."
  },
  {
    code: "RENTAL",
    label: "Location immobilière",
    description: "Gestion des biens mis en location et encaissements associés."
  },
  {
    code: "AGRICULTURE",
    label: "Activités agricoles",
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
    description: "Bassins, cycles d'élevage, alimentation, ventes et suivi sanitaire."
  },
  {
    code: "LIVESTOCK",
    label: "Élevage",
    description: "Boeufs, moutons, poulets et autres espèces avec suivi des lots, alimentation, soins et ventes."
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
    label: "Hôtellerie / Auberge",
    description: "Chambres, réservations, séjours, charges et exploitation d'auberge."
  },
  {
    code: "SERVICES",
    label: "Services divers",
    description: "Prestations diverses ne relevant pas d'un autre secteur catalogue."
  },
  {
    code: "MINING",
    label: "Exploitation minière",
    description: "Opérations et flux financiers liés à l'exploitation minière."
  },
  {
    code: "WATER",
    label: "Production d'eau potable",
    description: "Production, distribution et exploitation du service d'eau potable."
  },
  {
    code: "REAL_ESTATE_AGENCY",
    label: "Agence immobilière",
    description: "Commercialisation, intermédiation et suivi de mandats immobiliers."
  }
];

export const BUSINESS_ACTIVITY_LABELS: Record<BusinessActivityCode, string> = Object.fromEntries(
  BUSINESS_ACTIVITIES.map((item) => [item.code, item.label])
) as Record<BusinessActivityCode, string>;

export function isBusinessActivityCode(value: string): value is BusinessActivityCode {
  return BUSINESS_ACTIVITY_CODES.includes(value as BusinessActivityCode);
}

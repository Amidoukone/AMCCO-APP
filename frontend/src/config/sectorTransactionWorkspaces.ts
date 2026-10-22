import type { BusinessActivityCode } from "./businessActivities";

export type SectorTransactionPreset = {
  id: string;
  label: string;
  type: "CASH_IN" | "CASH_OUT";
  metadata: Record<string, string>;
};

export type SectorTransactionWorkspace = {
  listTitle: string;
  helpText: string;
  presets: SectorTransactionPreset[];
};

const WORKSPACES: Partial<Record<BusinessActivityCode, SectorTransactionWorkspace>> = {
  AGRICULTURE: {
    listTitle: "Opérations par campagne et parcelle",
    helpText: "Choisissez l’opération, puis la campagne et la parcelle. La quantité et le prix unitaire permettent de calculer le montant lorsqu’ils sont renseignés.",
    presets: [
      { id: "agriculture-input", label: "Acheter des intrants", type: "CASH_OUT", metadata: { agricultureOperationKind: "INPUT_PURCHASE" } },
      { id: "agriculture-work", label: "Payer des travaux", type: "CASH_OUT", metadata: { agricultureOperationKind: "FIELD_EXPENSE" } },
      { id: "agriculture-sale", label: "Vendre une récolte", type: "CASH_IN", metadata: { agricultureOperationKind: "HARVEST_SALE" } },
      { id: "agriculture-support", label: "Recevoir un appui", type: "CASH_IN", metadata: { agricultureOperationKind: "SUPPORT_INCOME" } }
    ]
  },
  FISH_FARMING: {
    listTitle: "Opérations par bassin et cycle",
    helpText: "Rattachez chaque opération à son bassin et à son cycle. Les quantités, unités et observations sanitaires restent distinctes du montant financier.",
    presets: [
      { id: "fish-fingerling", label: "Acheter des alevins", type: "CASH_OUT", metadata: { fishOperationKind: "FINGERLING_PURCHASE" } },
      { id: "fish-feed", label: "Acheter de l’aliment", type: "CASH_OUT", metadata: { fishOperationKind: "FEED_PURCHASE" } },
      { id: "fish-expense", label: "Enregistrer une charge", type: "CASH_OUT", metadata: { fishOperationKind: "POND_EXPENSE" } },
      { id: "fish-sale", label: "Vendre du poisson", type: "CASH_IN", metadata: { fishOperationKind: "FISH_SALE" } },
      { id: "fish-support", label: "Recevoir un appui", type: "CASH_IN", metadata: { fishOperationKind: "SUPPORT_INCOME" } }
    ]
  },
  TRANSPORT: {
    listTitle: "Opérations des véhicules",
    helpText: "Choisissez une recette ou une dépense, puis le type de véhicule. Les champs et calculs s’adaptent à la catégorie ; la synthèse des camions bennes reste accessible plus bas.",
    presets: [
      { id: "transport-income", label: "Enregistrer une recette", type: "CASH_IN", metadata: {} },
      { id: "transport-expense", label: "Enregistrer une dépense", type: "CASH_OUT", metadata: {} }
    ]
  },
  MINING: {
    listTitle: "Recettes et dépenses des sites miniers",
    helpText: "Indiquez le site pour chaque flux et l’équipement lorsqu’il est concerné. Les interventions, responsables et blocages sont suivis dans les tâches.",
    presets: [
      { id: "mining-income", label: "Enregistrer une recette", type: "CASH_IN", metadata: {} },
      { id: "mining-expense", label: "Enregistrer une dépense", type: "CASH_OUT", metadata: {} }
    ]
  },
  DAILY_ACTIVITIES: {
    listTitle: "Versements et dépenses des accords",
    helpText: "Créez la fiche d’accord dans les activités, puis enregistrez chaque mouvement réel avec la même référence et le même partenaire. Le capital prévu ne constitue pas un encaissement.",
    presets: [
      { id: "agreement-payment", label: "Versement du partenaire", type: "CASH_IN", metadata: { dailyActivityKind: "Protocole d'accord", financialOperationKind: "PARTNER_PAYMENT" } },
      { id: "agreement-profit", label: "Bénéfice reçu", type: "CASH_IN", metadata: { dailyActivityKind: "Protocole d'accord", financialOperationKind: "AGREEMENT_PROFIT" } },
      { id: "agreement-capital", label: "Retour de capital", type: "CASH_OUT", metadata: { dailyActivityKind: "Protocole d'accord", financialOperationKind: "CAPITAL_RETURN" } },
      { id: "agreement-expense", label: "Dépense liée à l’accord", type: "CASH_OUT", metadata: { dailyActivityKind: "Protocole d'accord", financialOperationKind: "AGREEMENT_EXPENSE" } }
    ]
  },
  WATER: {
    listTitle: "Ventes et dépenses d’eau",
    helpText: "Choisissez une vente ou une dépense. Le montant d’une vente peut être calculé avec la quantité et le prix unitaire, ou saisi directement.",
    presets: [
      { id: "water-sale", label: "Vendre des paquets d’eau", type: "CASH_IN", metadata: { waterOperationKind: "WATER_SALE" } },
      { id: "water-expense", label: "Enregistrer une dépense", type: "CASH_OUT", metadata: { waterOperationKind: "WATER_EXPENSE_OTHER" } },
      { id: "water-income", label: "Autre recette", type: "CASH_IN", metadata: { waterOperationKind: "WATER_OTHER_INCOME" } }
    ]
  },
  BEVERAGE_DEPOT: {
    listTitle: "Ventes, achats et dépenses de boissons",
    helpText: "Les achats augmentent le stock du produit choisi. Les ventes diminuent ce stock et calculent le coût d'achat automatiquement. Le total est calculé avec la quantité et le prix unitaire.",
    presets: [
      { id: "beverage-sale", label: "Enregistrer une vente", type: "CASH_IN", metadata: { beverageOperationKind: "VENTE" } },
      { id: "beverage-purchase", label: "Acheter du stock", type: "CASH_OUT", metadata: { beverageOperationKind: "ACHAT_STOCK" } },
      { id: "beverage-expense", label: "Enregistrer une dépense", type: "CASH_OUT", metadata: { beverageOperationKind: "DEPENSE" } },
      { id: "beverage-income", label: "Autre recette", type: "CASH_IN", metadata: { beverageOperationKind: "AUTRE_RECETTE" } }
    ]
  },
  HYDROCARBON: {
    listTitle: "Mouvements hydrocarbures",
    helpText: "Choisissez le sens du flux, puis le produit ou l’équipement. Les détails demandés s’adaptent à la catégorie choisie.",
    presets: [
      { id: "hydrocarbon-income", label: "Enregistrer une entrée", type: "CASH_IN", metadata: {} },
      { id: "hydrocarbon-expense", label: "Enregistrer une sortie", type: "CASH_OUT", metadata: {} }
    ]
  },
  SERVICES: {
    listTitle: "Encaissements et dépenses de services",
    helpText: "Précisez le client et la prestation lorsque ces informations sont utiles. Les champs facultatifs restent facultatifs.",
    presets: [
      { id: "service-income", label: "Encaisser une prestation", type: "CASH_IN", metadata: {} },
      { id: "service-expense", label: "Enregistrer une dépense", type: "CASH_OUT", metadata: {} }
    ]
  },
  GENERAL_EXPENSES: {
    listTitle: "Dépenses du PDG et des employés",
    helpText: "Choisissez à qui se rattache la dépense, puis sa catégorie. Le montant peut être saisi directement ou calculé à l’aide de la quantité et du prix unitaire.",
    presets: [
      { id: "expense-pdg", label: "Dépense PDG", type: "CASH_OUT", metadata: { generalExpenseKind: "PDG_OVERHEAD" } },
      { id: "expense-employee", label: "Dépense employé", type: "CASH_OUT", metadata: { generalExpenseKind: "EMPLOYEE_OTHER" } }
    ]
  }
};

export function getSectorTransactionWorkspace(activityCode: BusinessActivityCode | null): SectorTransactionWorkspace | null {
  return activityCode ? WORKSPACES[activityCode] ?? null : null;
}

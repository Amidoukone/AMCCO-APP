import type { BusinessActivityCode } from "../config/businessActivities";

export type SectorRecordContext = { label: string; value: string };

type ContextField = { key: string; label: string };

const CONTEXT_FIELDS: Partial<Record<BusinessActivityCode, ContextField[]>> = {
  HARDWARE: [{ key: "recipientRef", label: "Quincaillerie" }, { key: "itemName", label: "Article" }],
  GENERAL_STORE: [{ key: "shopRef", label: "Boutique" }],
  RENTAL: [{ key: "tenantRef", label: "Locataire" }, { key: "unitLabel", label: "Logement" }],
  AGRICULTURE: [{ key: "campaignRef", label: "Campagne" }, { key: "parcelRef", label: "Parcelle" }],
  BTP: [{ key: "projectRef", label: "Chantier" }],
  FISH_FARMING: [{ key: "pondRef", label: "Bassin" }, { key: "cycleRef", label: "Cycle" }],
  TRANSPORT: [{ key: "vehicleRef", label: "Véhicule" }, { key: "routeRef", label: "Trajet" }],
  SERVICES: [{ key: "clientRef", label: "Client" }, { key: "serviceType", label: "Prestation" }],
  MINING: [{ key: "siteRef", label: "Site" }, { key: "equipmentRef", label: "Équipement" }],
  BEVERAGE_DEPOT: [{ key: "productName", label: "Produit" }, { key: "periodDate", label: "Journée" }],
  HYDROCARBON: [{ key: "hydrocarbonAssetRef", label: "Citerne / équipement" }, { key: "locationRef", label: "Lieu" }],
  DAILY_ACTIVITIES: [{ key: "agreementRef", label: "Accord" }, { key: "partnerName", label: "Partenaire" }]
};

const SEARCH_HINTS: Partial<Record<BusinessActivityCode, string>> = {
  HARDWARE: "article, quincaillerie ou fournisseur",
  GENERAL_STORE: "boutique ou recouvrement",
  RENTAL: "locataire, logement ou mois",
  AGRICULTURE: "campagne, parcelle ou culture",
  BTP: "chantier, client ou matériau",
  FISH_FARMING: "bassin, cycle ou espèce",
  TRANSPORT: "véhicule, trajet ou client",
  SERVICES: "client ou prestation",
  MINING: "site ou équipement",
  WATER: "vente ou dépense",
  BEVERAGE_DEPOT: "produit, fournisseur ou journée",
  HYDROCARBON: "citerne, équipement ou lieu",
  GENERAL_EXPENSES: "bénéficiaire ou dépense",
  DAILY_ACTIVITIES: "accord, partenaire ou activité"
};

export function getSectorSearchHint(activityCode: BusinessActivityCode | null): string {
  return activityCode ? SEARCH_HINTS[activityCode] ?? "description ou référence" : "description ou référence";
}

export function getSectorRecordContext(
  activityCode: BusinessActivityCode | null,
  metadata: Record<string, string>
): SectorRecordContext[] {
  if (!activityCode) return [];
  return (CONTEXT_FIELDS[activityCode] ?? [])
    .map(({ key, label }) => ({ label, value: metadata[key]?.trim() ?? "" }))
    .filter(({ value }) => value.length > 0);
}

import type { BusinessActivityCode } from "./businessActivities";

const FIELD_WORKSPACES: Partial<Record<BusinessActivityCode, { title: string; helpText: string }>> = {
  AGRICULTURE: { title: "Interventions par campagne et parcelle", helpText: "Retrouvez les interventions par campagne ou parcelle avec la recherche. Les dates et les références terrain restent obligatoires." },
  FISH_FARMING: { title: "Interventions par bassin et cycle", helpText: "Recherchez un bassin ou un cycle pour retrouver ses interventions. Les responsables, dates et observations sanitaires restent disponibles." },
  TRANSPORT: { title: "Missions et interventions des véhicules", helpText: "Recherchez un véhicule ou un trajet pour retrouver ses missions et interventions. Chaque action conserve son responsable et son échéance." },
  MINING: { title: "Interventions des sites miniers", helpText: "Recherchez un site ou un équipement. Le filtre Bloquée permet de retrouver les interventions nécessitant un arbitrage ; les blocages miniers restent critiques." },
  DAILY_ACTIVITIES: { title: "Activités et fiches d’accord", helpText: "Les fiches décrivent l’activité ou les conditions de l’accord. Le capital et le bénéfice convenus sont prévisionnels ; les mouvements réels se saisissent dans Versements." }
};

export function getSectorFieldWorkspace(activityCode: BusinessActivityCode | null) {
  return activityCode ? FIELD_WORKSPACES[activityCode] ?? null : null;
}

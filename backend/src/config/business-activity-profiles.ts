import {
  BUSINESS_ACTIVITY_LABELS,
  type BusinessActivityCode
} from "../types/business-activity.js";

type TransactionType = "CASH_IN" | "CASH_OUT";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";
type HighlightMetricCode =
  | "transactionsCount"
  | "submittedTransactionsCount"
  | "totalTasksCount"
  | "openTasksCount"
  | "blockedTasksCount";

export type ActivityFieldDefinition = {
  key: string;
  label: string;
  required: boolean;
  helpText: string;
};

export type ActivityMetadataMap = Record<string, string>;

export type ActivityWorkflowStep = {
  code: string;
  label: string;
  description: string;
};

export type ActivityReportHighlight = {
  code: string;
  label: string;
  description: string;
  value: number;
  emphasis: AlertSeverity;
};

type ActivityReportHighlightDefinition = {
  code: string;
  label: string;
  description: string;
  metric: HighlightMetricCode;
  thresholds?: {
    warningAt?: number;
    criticalAt?: number;
  };
};

type ActivityMetricSnapshot = {
  transactionsCount: number;
  submittedTransactionsCount: number;
  totalTasksCount: number;
  openTasksCount: number;
  blockedTasksCount: number;
};

export type BusinessActivityProfile = {
  activityCode: BusinessActivityCode;
  label: string;
  operationsModel: string;
  finance: {
    allowedTransactionTypes: TransactionType[];
    allowedCurrencies: string[];
    requiresDescription: boolean;
    requiresProof: boolean;
    fields: ActivityFieldDefinition[];
    metadataFields?: ActivityFieldDefinition[];
    workflow: ActivityWorkflowStep[];
  };
  tasks: {
    requiresDescription: boolean;
    requiresDueDate: boolean;
    requiresAssignee: boolean;
    completionRequiresAssignee: boolean;
    blockedRequiresAssignee: boolean;
    blockedAlertSeverity: AlertSeverity;
    fields: ActivityFieldDefinition[];
    metadataFields?: ActivityFieldDefinition[];
    workflow: ActivityWorkflowStep[];
  };
  reporting: {
    focusArea: string;
    exportSections: string[];
    highlights: ActivityReportHighlightDefinition[];
  };
};

function field(
  key: string,
  label: string,
  required: boolean,
  helpText: string
): ActivityFieldDefinition {
  return { key, label, required, helpText };
}

function workflow(
  code: string,
  label: string,
  description: string
): ActivityWorkflowStep {
  return { code, label, description };
}

function makeProfile(
  activityCode: BusinessActivityCode,
  input: Omit<BusinessActivityProfile, "activityCode" | "label">
): BusinessActivityProfile {
  return {
    activityCode,
    label: BUSINESS_ACTIVITY_LABELS[activityCode],
    ...input
  };
}

const BUSINESS_ACTIVITY_PROFILES: Record<BusinessActivityCode, BusinessActivityProfile> = {
  HARDWARE: makeProfile("HARDWARE", {
    operationsModel: "Pilotage de points de vente, achats fournisseurs et approvisionnement terrain.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: false,
      requiresProof: false,
      fields: [
        field("accountId", "Compte de caisse", true, "Caisse ou compte de vente utilise."),
        field("amount", "Montant", true, "Montant encaisse ou depense."),
        field("description", "Objet", false, "Reference achat, depot fournisseur ou vente speciale.")
      ],
      workflow: [
        workflow("CREATE", "Saisie terrain", "Le point de vente saisit le flux financier."),
        workflow("PROOF_OPTIONAL", "Justificatif", "Une preuve peut etre jointe quand elle est disponible."),
        workflow("OVERVIEW", "Suivi global", "Le flux remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: false,
      requiresDueDate: false,
      requiresAssignee: false,
      completionRequiresAssignee: false,
      blockedRequiresAssignee: false,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Action magasin", true, "Exemple: inventaire rayon ou reception palette."),
        field("description", "Details", false, "Reference rayon, fournisseur ou emplacement."),
        field("dueDate", "Echeance", false, "Date utile pour les inventaires ou receptions.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Le superviseur planifie les actions magasin."),
        workflow("EXECUTE", "Execution", "L'equipe execute inventaire, mise en rayon ou reception."),
        workflow("CLOSE", "Cloture", "La tache est cloturee une fois le controle realise.")
      ]
    },
    reporting: {
      focusArea: "Rotation commerciale et execution magasin",
      exportSections: ["transactions", "taches", "inventaire commercial"],
      highlights: [
        {
          code: "sales-volume",
          label: "Flux de vente traces",
          description: "Nombre de flux financiers rattaches au secteur quincaillerie.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "open-operations",
          label: "Actions magasin ouvertes",
          description: "Inventaires, receptions ou ajustements encore en cours.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "blocked-operations",
          label: "Blocages de rayon",
          description: "Anomalies d'approvisionnement ou de preparation non resolues.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  GENERAL_STORE: makeProfile("GENERAL_STORE", {
    operationsModel: "Pilotage multi-rayons avec suivi transverse ventes, depenses et execution magasin.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: false,
      requiresProof: false,
      fields: [
        field("accountId", "Compte d'exploitation", true, "Caisse ou compte utilise."),
        field("amount", "Montant", true, "Montant de l'operation."),
        field("description", "Contexte", false, "Rayon, famille produit ou fournisseur.")
      ],
      workflow: [
        workflow("CREATE", "Saisie", "Le personnel saisit les encaissements ou depenses."),
        workflow("PROOF_OPTIONAL", "Preuve", "Le justificatif peut etre rattache sans bloquer le flux."),
        workflow("OVERVIEW", "Suivi global", "Le flux reste visible directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: false,
      requiresDueDate: false,
      requiresAssignee: false,
      completionRequiresAssignee: false,
      blockedRequiresAssignee: false,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Action commerce", true, "Exemple: implantation, controle ou relance."),
        field("description", "Perimetre", false, "Rayon, fournisseur ou operation concernee."),
        field("assignedToId", "Responsable", false, "Responsable de rayon ou employe.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Le superviseur affecte les actions du magasin."),
        workflow("TRACK", "Suivi", "L'avancement est mis a jour au fil de la journee."),
        workflow("CLOSE", "Cloture", "La tache est fermee apres verification.")
      ]
    },
    reporting: {
      focusArea: "Performance multi-rayons",
      exportSections: ["transactions", "taches", "suivi rayon"],
      highlights: [
        {
          code: "store-volume",
          label: "Flux consolides",
          description: "Nombre d'operations financieres consolidees sur le commerce general.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "pending-finance",
          label: "Flux suivis",
          description: "Operations remontees dans le suivi financier du commerce general.",
          metric: "submittedTransactionsCount",
          thresholds: { warningAt: 2, criticalAt: 6 }
        },
        {
          code: "open-store-actions",
          label: "Actions terrain ouvertes",
          description: "Operations magasin encore en cours ou a faire.",
          metric: "openTasksCount",
          thresholds: { warningAt: 6, criticalAt: 12 }
        }
      ]
    }
  }),
  FOOD: makeProfile("FOOD", {
    operationsModel: "Suivi de produits alimentaires avec accent sur les achats, ruptures et execution rapide.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte d'encaissement", true, "Caisse ou compte utilise."),
        field("amount", "Montant", true, "Montant encaisse ou depense."),
        field("description", "Lot ou produit", true, "Produit, lot, fournisseur ou nature de depense.")
      ],
      metadataFields: [
        field("productFamily", "Famille produit", true, "Categorie ou famille de produit concerne."),
        field("batchRef", "Lot ou reference", false, "Numero de lot, DLC ou reference article.")
      ],
      workflow: [
        workflow("CREATE", "Saisie rapide", "Le point de vente saisit ventes et achats."),
        workflow("TRACE", "Traçabilite", "Le libelle identifie le produit ou le lot concerne."),
        workflow("OVERVIEW", "Suivi global", "Le flux consolide remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: false,
      completionRequiresAssignee: false,
      blockedRequiresAssignee: false,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Action alimentaire", true, "Exemple: verifier stock froid."),
        field("description", "Produit ou lot", true, "Produit, lot, DLC ou fournisseur."),
        field("dueDate", "Echeance", true, "Les actions alimentaires doivent etre datees.")
      ],
      metadataFields: [
        field("productFamily", "Famille produit", true, "Produit ou famille impactee."),
        field("batchRef", "Lot ou DLC", false, "Numero de lot, DLC ou reference de lot.")
      ],
      workflow: [
        workflow("PLAN", "Planification courte", "Les actions sont planifiees sur un delai court."),
        workflow("EXECUTE", "Execution", "Controle stock, reception ou rotation."),
        workflow("CLOSE", "Verification", "Cloture apres verification de conformite.")
      ]
    },
    reporting: {
      focusArea: "Traçabilite des flux alimentaires",
      exportSections: ["transactions", "taches", "suivi lots"],
      highlights: [
        {
          code: "food-volume",
          label: "Flux alimentaires traces",
          description: "Operations rattachees a un produit, lot ou fournisseur.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "food-actions-open",
          label: "Actions stock ouvertes",
          description: "Controles et traitements encore ouverts.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "food-blocked",
          label: "Anomalies produit bloquees",
          description: "Taches bloquees sur des produits ou lots.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  RENTAL: makeProfile("RENTAL", {
    operationsModel: "Gestion locative avec suivi rigoureux des encaissements, echeances et interventions.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte locatif", true, "Compte ou caisse affecte au portefeuille locatif."),
        field("amount", "Montant du flux", true, "Montant du loyer, depot ou depense."),
        field("description", "Bien ou locataire", true, "Reference du bien, du locataire ou de la charge.")
      ],
      metadataFields: [
        field("propertyRef", "Reference bien", true, "Reference interne du bien ou lot."),
        field("tenantRef", "Reference locataire", false, "Identifiant du locataire ou dossier.")
      ],
      workflow: [
        workflow("CREATE", "Enregistrement", "Le flux est saisi en mentionnant bien ou locataire."),
        workflow("PROOF_OPTIONAL", "Justificatif", "Le recu, l'avis ou la piece peuvent etre rattaches."),
        workflow("OVERVIEW", "Suivi global", "Le flux locatif remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: false,
      completionRequiresAssignee: true,
      blockedRequiresAssignee: true,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Action locative", true, "Exemple: visite, relance loyer ou intervention."),
        field("description", "Bien ou dossier", true, "Reference bien, locataire ou dossier."),
        field("dueDate", "Echeance", true, "Les engagements locatifs doivent etre dates.")
      ],
      metadataFields: [
        field("propertyRef", "Reference bien", true, "Bien ou lot concerne."),
        field("tenantRef", "Reference locataire", false, "Locataire, client ou dossier rattache.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Chaque action locative est planifiee avec echeance."),
        workflow("EXECUTE", "Traitement", "Relance, visite ou intervention."),
        workflow("CLOSE", "Cloture", "Cloture avec suivi du dossier locatif.")
      ]
    },
    reporting: {
      focusArea: "Suivi du portefeuille locatif",
      exportSections: ["encaissements", "interventions", "relances"],
      highlights: [
        {
          code: "rental-cashflow",
          label: "Flux locatifs enregistres",
          description: "Nombre de flux financiers rattaches au portefeuille locatif.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "rental-open-cases",
          label: "Dossiers locatifs ouverts",
          description: "Interventions et relances encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 3, criticalAt: 7 }
        },
        {
          code: "rental-blockers",
          label: "Blocages de portefeuille",
          description: "Dossiers locatifs bloques et a arbitrer.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  AGRICULTURE: makeProfile("AGRICULTURE", {
    operationsModel: "Exploitation terrain avec suivi de campagnes, intrants et execution datee.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte campagne", true, "Compte ou caisse de l'exploitation."),
        field("amount", "Montant", true, "Montant de l'operation."),
        field("description", "Parcelle ou intrant", true, "Parcelle, campagne, culture ou intrant concerne.")
      ],
      metadataFields: [
        field("campaignRef", "Reference campagne", true, "Campagne ou saison concernee."),
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone d'exploitation.")
      ],
      workflow: [
        workflow("CREATE", "Saisie terrain", "Les depenses et recettes sont saisies par campagne."),
        workflow("TRACE", "Traçabilite", "Chaque flux mentionne parcelle, culture ou intrant."),
        workflow("OVERVIEW", "Suivi global", "Le flux remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: false,
      completionRequiresAssignee: true,
      blockedRequiresAssignee: true,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Intervention terrain", true, "Exemple: semis, controle parcelle ou recolte."),
        field("description", "Parcelle ou campagne", true, "Parcelle, culture, intrant ou equipement concerne."),
        field("dueDate", "Date terrain", true, "Les operations agricoles doivent etre planifiees.")
      ],
      metadataFields: [
        field("campaignRef", "Reference campagne", true, "Campagne ou saison concernee."),
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone terrain concernee.")
      ],
      workflow: [
        workflow("PLAN", "Plan de campagne", "Chaque intervention est planifiee avec date."),
        workflow("EXECUTE", "Execution terrain", "Les equipes realisent l'intervention."),
        workflow("CLOSE", "Retour terrain", "Cloture apres retour terrain et verification.")
      ]
    },
    reporting: {
      focusArea: "Execution de campagne et traçabilite terrain",
      exportSections: ["flux campagne", "interventions terrain", "blocages parcelles"],
      highlights: [
        {
          code: "agri-flows",
          label: "Flux de campagne traces",
          description: "Flux financiers relies a des parcelles ou intrants.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "agri-open-field",
          label: "Interventions terrain ouvertes",
          description: "Actions de campagne encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "agri-blocked",
          label: "Blocages de campagne",
          description: "Interventions bloquees qui menacent la campagne.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  SERVICES: makeProfile("SERVICES", {
    operationsModel: "Gestion souple de prestations et interventions multi-clients.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: false,
      requiresProof: false,
      fields: [
        field("accountId", "Compte service", true, "Compte de facturation ou de depense."),
        field("amount", "Montant", true, "Montant du flux."),
        field("description", "Mission", false, "Mission, client ou intervention.")
      ],
      workflow: [
        workflow("CREATE", "Saisie", "Le flux est saisi a la creation ou facturation."),
        workflow("PROOF_OPTIONAL", "Justificatif", "Facture ou piece jointe si disponible."),
        workflow("OVERVIEW", "Suivi global", "Le flux reste visible directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: false,
      requiresDueDate: false,
      requiresAssignee: false,
      completionRequiresAssignee: false,
      blockedRequiresAssignee: false,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Intervention service", true, "Nom court de la prestation."),
        field("description", "Contexte", false, "Client, site ou portee de l'intervention."),
        field("assignedToId", "Intervenant", false, "Collaborateur ou superviseur responsable.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Les interventions sont planifiees selon disponibilite."),
        workflow("EXECUTE", "Realisation", "Execution de la prestation."),
        workflow("CLOSE", "Cloture", "Cloture une fois la prestation livree.")
      ]
    },
    reporting: {
      focusArea: "Pilotage des prestations",
      exportSections: ["facturation", "interventions", "charge equipe"],
      highlights: [
        {
          code: "service-volume",
          label: "Flux de prestation",
          description: "Operations financieres consolidees sur les services.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "service-open",
          label: "Prestations ouvertes",
          description: "Interventions encore a livrer ou suivre.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "service-blocked",
          label: "Prestations bloquees",
          description: "Interventions a arbitrer rapidement.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  MINING: makeProfile("MINING", {
    operationsModel: "Exploitation miniere avec exigences elevees de traçabilite, affectation et traitement des blocages.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte de site", true, "Compte ou caisse rattache au site minier."),
        field("amount", "Montant", true, "Montant de la recette ou de la charge."),
        field("description", "Site, lot ou equipement", true, "Site, lot, fournisseur ou equipement concerne.")
      ],
      metadataFields: [
        field("siteRef", "Reference site", true, "Site ou zone miniere concernee."),
        field("equipmentRef", "Reference equipement", false, "Engin, equipement ou lot associe.")
      ],
      workflow: [
        workflow("CREATE", "Declaration terrain", "Le flux est declare avec reference site ou lot."),
        workflow("TRACE", "Traçabilite forte", "Le contexte d'exploitation conserve la tracabilite du flux."),
        workflow("OVERVIEW", "Suivi global", "Le flux reste visible directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: true,
      completionRequiresAssignee: true,
      blockedRequiresAssignee: true,
      blockedAlertSeverity: "CRITICAL",
      fields: [
        field("title", "Operation miniere", true, "Exemple: controle site, maintenance ou sortie lot."),
        field("description", "Site ou equipement", true, "Site, zone, equipement ou lot concerne."),
        field("assignedToId", "Responsable terrain", true, "Toute operation miniere doit etre affectee."),
        field("dueDate", "Echeance", true, "Les operations minieres doivent etre datees.")
      ],
      metadataFields: [
        field("siteRef", "Reference site", true, "Site ou zone miniere concernee."),
        field("equipmentRef", "Reference equipement", false, "Engin, equipement ou lot associe.")
      ],
      workflow: [
        workflow("PLAN", "Ordonnancement", "L'operation est planifiee et affectee a un responsable."),
        workflow("EXECUTE", "Execution terrain", "Le responsable pilote l'execution."),
        workflow("ESCALATE", "Escalade blocage", "Tout blocage remonte immediatement au management."),
        workflow("CLOSE", "Cloture", "Cloture apres verification terrain.")
      ]
    },
    reporting: {
      focusArea: "Traçabilite et risque d'exploitation",
      exportSections: ["flux site", "operations critiques", "blocages miniers"],
      highlights: [
        {
          code: "mining-pending-review",
          label: "Flux miniers suivis",
          description: "Operations financieres minieres visibles dans le suivi global.",
          metric: "submittedTransactionsCount",
          thresholds: { warningAt: 1, criticalAt: 4 }
        },
        {
          code: "mining-open-operations",
          label: "Operations minières ouvertes",
          description: "Operations terrain encore en cours.",
          metric: "openTasksCount",
          thresholds: { warningAt: 3, criticalAt: 6 }
        },
        {
          code: "mining-critical-blockers",
          label: "Blocages critiques",
          description: "Blocages miniers qui demandent un arbitrage immediat.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  WATER: makeProfile("WATER", {
    operationsModel: "Production d'eau potable avec contraintes de continuité de service et forte discipline d'execution.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte exploitation eau", true, "Compte ou caisse du service d'eau."),
        field("amount", "Montant", true, "Montant de l'operation."),
        field("description", "Site, reseau ou equipement", true, "Station, reseau, intervention ou equipement.")
      ],
      metadataFields: [
        field("facilityRef", "Reference site", true, "Station, forage ou reseau concerne."),
        field("networkZone", "Zone reseau", false, "Secteur ou zone de distribution.")
      ],
      workflow: [
        workflow("CREATE", "Declaration exploitation", "Le flux est declare avec le site ou reseau concerne."),
        workflow("TRACE", "Justification", "Le contexte technique documente le flux quand c'est necessaire."),
        workflow("OVERVIEW", "Suivi global", "Le flux d'exploitation remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: true,
      completionRequiresAssignee: true,
      blockedRequiresAssignee: true,
      blockedAlertSeverity: "CRITICAL",
      fields: [
        field("title", "Intervention eau", true, "Exemple: maintenance pompe ou inspection reseau."),
        field("description", "Site ou reseau", true, "Station, reseau, secteur ou equipement."),
        field("assignedToId", "Responsable intervention", true, "Toute intervention eau doit etre affectee."),
        field("dueDate", "Echeance", true, "Les interventions d'exploitation doivent etre datees.")
      ],
      metadataFields: [
        field("facilityRef", "Reference site", true, "Station, reseau ou forage concerne."),
        field("networkZone", "Zone reseau", false, "Secteur ou zone de distribution.")
      ],
      workflow: [
        workflow("PLAN", "Planification exploitation", "Intervention planifiee et affectee."),
        workflow("EXECUTE", "Intervention", "Execution sur site ou reseau."),
        workflow("ESCALATE", "Escalade continuité", "Blocage remonte en priorite pour continuité de service."),
        workflow("CLOSE", "Remise en service", "Cloture apres verification de remise en service.")
      ]
    },
    reporting: {
      focusArea: "Continuité de service et discipline d'exploitation",
      exportSections: ["flux exploitation", "interventions reseau", "blocages critiques"],
      highlights: [
        {
          code: "water-pending-review",
          label: "Flux exploitation suivis",
          description: "Flux financiers eau visibles dans le suivi global.",
          metric: "submittedTransactionsCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        },
        {
          code: "water-open-interventions",
          label: "Interventions ouvertes",
          description: "Interventions reseau ou station encore en cours.",
          metric: "openTasksCount",
          thresholds: { warningAt: 2, criticalAt: 5 }
        },
        {
          code: "water-critical-blockers",
          label: "Blocages de continuité",
          description: "Blocages techniques menaçant la continuité du service.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  REAL_ESTATE_AGENCY: makeProfile("REAL_ESTATE_AGENCY", {
    operationsModel: "Agence immobiliere avec suivi d'affaires, mandats, visites et encaissements documentes.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte agence", true, "Compte ou caisse de l'agence."),
        field("amount", "Montant", true, "Montant de la commission, avance ou depense."),
        field("description", "Mandat ou bien", true, "Reference du mandat, bien ou dossier commercial.")
      ],
      metadataFields: [
        field("mandateRef", "Reference mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Reference bien", true, "Bien ou lot concerne.")
      ],
      workflow: [
        workflow("CREATE", "Enregistrement dossier", "Le flux est rattache a un mandat ou un bien."),
        workflow("TRACE", "Traçabilite commerciale", "La reference dossier garde la tracabilite commerciale du flux."),
        workflow("OVERVIEW", "Suivi global", "Le flux commercial remonte directement dans le suivi financier.")
      ]
    },
    tasks: {
      requiresDescription: true,
      requiresDueDate: true,
      requiresAssignee: true,
      completionRequiresAssignee: true,
      blockedRequiresAssignee: true,
      blockedAlertSeverity: "WARNING",
      fields: [
        field("title", "Action commerciale", true, "Exemple: visite, relance client ou suivi mandat."),
        field("description", "Bien ou dossier", true, "Bien, client, mandat ou etape commerciale."),
        field("assignedToId", "Charge d'affaire", true, "Chaque dossier doit avoir un responsable."),
        field("dueDate", "Echeance", true, "Les actions commerciales doivent etre planifiees.")
      ],
      metadataFields: [
        field("mandateRef", "Reference mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Reference bien", true, "Bien ou lot concerne.")
      ],
      workflow: [
        workflow("PLAN", "Planification commerciale", "Le dossier est affecte et date."),
        workflow("EXECUTE", "Execution", "Visite, relance ou traitement du mandat."),
        workflow("FOLLOW_UP", "Suivi dossier", "Le charge d'affaire alimente le suivi."),
        workflow("CLOSE", "Cloture", "Cloture une fois l'etape commerciale finalisee.")
      ]
    },
    reporting: {
      focusArea: "Pilotage de portefeuille commercial",
      exportSections: ["encaissements", "actions commerciales", "blocages dossier"],
      highlights: [
        {
          code: "agency-commercial-flow",
          label: "Flux commerciaux traces",
          description: "Flux financiers rattaches a des mandats ou biens.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "agency-open-cases",
          label: "Dossiers ouverts",
          description: "Actions commerciales encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "agency-blocked-cases",
          label: "Dossiers bloques",
          description: "Dossiers commerciaux qui necessitent arbitrage.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  })
};

function toMetricSeverity(
  value: number,
  thresholds?: { warningAt?: number; criticalAt?: number }
): AlertSeverity {
  if (thresholds?.criticalAt !== undefined && value >= thresholds.criticalAt) {
    return "CRITICAL";
  }
  if (thresholds?.warningAt !== undefined && value >= thresholds.warningAt) {
    return "WARNING";
  }
  return "INFO";
}

export function getBusinessActivityProfile(
  activityCode: BusinessActivityCode
): BusinessActivityProfile {
  return BUSINESS_ACTIVITY_PROFILES[activityCode];
}

export function listBusinessActivityProfiles(): BusinessActivityProfile[] {
  return Object.values(BUSINESS_ACTIVITY_PROFILES);
}

export function assertTransactionInputMatchesActivityProfile(
  activityCode: BusinessActivityCode,
  input: {
    type: TransactionType;
    currency: string;
    description?: string;
    metadata?: ActivityMetadataMap;
  }
): void {
  const profile = getBusinessActivityProfile(activityCode);
  const currency = input.currency.trim().toUpperCase();
  if (!profile.finance.allowedTransactionTypes.includes(input.type)) {
    throw new Error(
      `Le secteur ${profile.label} n'autorise pas les transactions de type ${input.type}.`
    );
  }
  if (!profile.finance.allowedCurrencies.includes(currency)) {
    throw new Error(
      `Le secteur ${profile.label} n'autorise pas la devise ${currency}.`
    );
  }
  if (profile.finance.requiresDescription && !input.description?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige une description metier pour chaque transaction.`
    );
  }
  for (const item of profile.finance.metadataFields ?? []) {
    if (item.required && !input.metadata?.[item.key]?.trim()) {
      throw new Error(
        `Le secteur ${profile.label} exige le champ ${item.label.toLowerCase()} pour chaque transaction.`
      );
    }
  }
}

export function assertTaskInputMatchesActivityProfile(
  activityCode: BusinessActivityCode,
  input: {
    description?: string;
    assignedToId?: string;
    dueDate?: string;
    metadata?: ActivityMetadataMap;
  }
): void {
  const profile = getBusinessActivityProfile(activityCode);
  if (profile.tasks.requiresDescription && !input.description?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige une description metier pour chaque tache.`
    );
  }
  if (profile.tasks.requiresAssignee && !input.assignedToId?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige qu'une tache soit assignee des sa creation.`
    );
  }
  if (profile.tasks.requiresDueDate && !input.dueDate) {
    throw new Error(
      `Le secteur ${profile.label} exige une echeance pour chaque tache.`
    );
  }
  for (const item of profile.tasks.metadataFields ?? []) {
    if (item.required && !input.metadata?.[item.key]?.trim()) {
      throw new Error(
        `Le secteur ${profile.label} exige le champ ${item.label.toLowerCase()} pour chaque tache.`
      );
    }
  }
}

export function assertTaskStatusMatchesActivityProfile(
  activityCode: BusinessActivityCode | null,
  task: {
    assignedToId: string | null;
    status: TaskStatus;
  },
  nextStatus: TaskStatus
): void {
  if (!activityCode) {
    return;
  }
  const profile = getBusinessActivityProfile(activityCode);
  if (nextStatus === "DONE" && profile.tasks.completionRequiresAssignee && !task.assignedToId) {
    throw new Error(
      `Le secteur ${profile.label} interdit de terminer une tache non assignee.`
    );
  }
  if (nextStatus === "BLOCKED" && profile.tasks.blockedRequiresAssignee && !task.assignedToId) {
    throw new Error(
      `Le secteur ${profile.label} interdit de bloquer une tache sans responsable assigne.`
    );
  }
}

export function getTaskBlockedAlertSeverity(activityCode: BusinessActivityCode | null): AlertSeverity {
  if (!activityCode) {
    return "CRITICAL";
  }
  return getBusinessActivityProfile(activityCode).tasks.blockedAlertSeverity;
}

export function buildActivityReportHighlights(
  activityCode: BusinessActivityCode,
  snapshot: ActivityMetricSnapshot
): ActivityReportHighlight[] {
  const profile = getBusinessActivityProfile(activityCode);
  return profile.reporting.highlights.map((item) => ({
    code: item.code,
    label: item.label,
    description: item.description,
    value: snapshot[item.metric],
    emphasis: toMetricSeverity(snapshot[item.metric], item.thresholds)
  }));
}

export function normalizeActivityMetadata(input?: Record<string, string | null | undefined>): ActivityMetadataMap {
  if (!input) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key.trim(), value?.trim() ?? ""])
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}

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
    operationsModel: "Exploitation terrain avec suivi de campagnes, types de champs, intrants et execution datee.",
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
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone d'exploitation."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures.")
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
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone terrain concernee."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures.")
      ],
      workflow: [
        workflow("PLAN", "Plan de campagne", "Chaque intervention est planifiee avec date."),
        workflow("EXECUTE", "Execution terrain", "Les equipes realisent l'intervention."),
        workflow("CLOSE", "Retour terrain", "Cloture apres retour terrain et verification.")
      ]
    },
    reporting: {
      focusArea: "Execution de campagne, types de champs et tracabilite terrain",
      exportSections: ["flux campagne", "types de champs", "interventions terrain", "blocages parcelles"],
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
  BTP: makeProfile("BTP", {
    operationsModel: "Gestion de chantiers BTP avec suivi des devis, achats, main-d'oeuvre, avancement et reserves.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte chantier", true, "Compte ou caisse du chantier."),
        field("amount", "Montant", true, "Montant de l'encaissement ou de la charge."),
        field("description", "Chantier ou lot", true, "Chantier, devis, fournisseur, lot technique ou client concerne.")
      ],
      metadataFields: [
        field("projectRef", "Reference chantier", true, "Nom, code ou reference du chantier."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier.")
      ],
      workflow: [
        workflow("CREATE", "Saisie chantier", "Le flux est saisi avec reference chantier et lot de travaux."),
        workflow("TRACE", "Suivi couts", "Les depenses et recettes restent reliees au chantier."),
        workflow("OVERVIEW", "Suivi global", "Les flux alimentent le tableau de bord et les rapports BTP.")
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
        field("title", "Action chantier", true, "Exemple: coulage dalle, achat ciment ou controle qualite."),
        field("description", "Details chantier", true, "Chantier, lot, fournisseur ou equipe concernee."),
        field("assignedToId", "Responsable chantier", true, "Conducteur de travaux ou responsable terrain."),
        field("dueDate", "Echeance", true, "Les actions chantier doivent etre planifiees.")
      ],
      metadataFields: [
        field("projectRef", "Reference chantier", true, "Nom, code ou reference du chantier."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier.")
      ],
      workflow: [
        workflow("PLAN", "Planification chantier", "L'action est affectee, datee et rattachee a un lot."),
        workflow("EXECUTE", "Execution terrain", "L'equipe execute et met a jour l'avancement."),
        workflow("ESCALATE", "Alerte blocage", "Tout blocage chantier remonte pour arbitrage."),
        workflow("CLOSE", "Reception interne", "Cloture apres verification de l'action.")
      ]
    },
    reporting: {
      focusArea: "Couts, avancement et blocages par chantier",
      exportSections: ["flux chantier", "lots de travaux", "actions chantier", "blocages"],
      highlights: [
        {
          code: "btp-flows",
          label: "Flux chantier traces",
          description: "Operations financieres reliees aux chantiers et lots.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "btp-open-actions",
          label: "Actions chantier ouvertes",
          description: "Taches de chantier encore a traiter.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "btp-blockers",
          label: "Blocages chantier",
          description: "Points bloquants qui freinent l'avancement.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  FISH_FARMING: makeProfile("FISH_FARMING", {
    operationsModel: "Pisciculture avec suivi des bassins, cycles d'elevage, aliments, ventes et alertes sanitaires.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte piscicole", true, "Compte ou caisse de l'activite piscicole."),
        field("amount", "Montant", true, "Montant de vente, achat aliment, alevins ou charge."),
        field("description", "Bassin ou cycle", true, "Bassin, cycle, lot d'alevins, aliment ou vente concernee.")
      ],
      metadataFields: [
        field("pondRef", "Reference bassin", true, "Bassin, etang ou unite de production."),
        field("cycleRef", "Reference cycle", true, "Cycle d'elevage ou lot suivi."),
        field("species", "Espece", false, "Tilapia, silure, carpe ou autre espece.")
      ],
      workflow: [
        workflow("CREATE", "Saisie bassin", "Les flux sont rattaches au bassin et au cycle."),
        workflow("TRACE", "Suivi cycle", "Les achats, charges et ventes gardent le contexte de production."),
        workflow("OVERVIEW", "Suivi global", "Le rapport consolide les flux piscicoles.")
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
        field("title", "Action piscicole", true, "Exemple: nourrissage, controle eau, tri ou recolte."),
        field("description", "Bassin ou cycle", true, "Bassin, cycle, lot ou intervention sanitaire."),
        field("assignedToId", "Responsable bassin", true, "Agent ou responsable du bassin."),
        field("dueDate", "Date d'intervention", true, "Les actions piscicoles doivent etre datees.")
      ],
      metadataFields: [
        field("pondRef", "Reference bassin", true, "Bassin, etang ou unite de production."),
        field("cycleRef", "Reference cycle", true, "Cycle d'elevage ou lot suivi."),
        field("species", "Espece", false, "Tilapia, silure, carpe ou autre espece.")
      ],
      workflow: [
        workflow("PLAN", "Plan d'elevage", "L'action est planifiee par bassin et cycle."),
        workflow("EXECUTE", "Intervention bassin", "Nourrissage, controle, tri ou traitement."),
        workflow("ESCALATE", "Alerte sanitaire", "Blocage ou anomalie sanitaire remonte rapidement."),
        workflow("CLOSE", "Retour production", "Cloture apres controle du bassin.")
      ]
    },
    reporting: {
      focusArea: "Cycles piscicoles, bassins et alertes de production",
      exportSections: ["flux bassin", "cycles d'elevage", "interventions", "alertes sanitaires"],
      highlights: [
        {
          code: "fish-flows",
          label: "Flux piscicoles traces",
          description: "Flux relies aux bassins, cycles ou ventes.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "fish-open-actions",
          label: "Actions bassin ouvertes",
          description: "Interventions piscicoles encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "fish-blockers",
          label: "Alertes piscicoles",
          description: "Blocages ou anomalies de production.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  TRANSPORT: makeProfile("TRANSPORT", {
    operationsModel: "Transport avec location et gestion de camions bennes, tracteurs, citernes, rotations et charges vehicules.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte transport", true, "Compte ou caisse transport."),
        field("amount", "Montant", true, "Recette de location, carburant, maintenance ou charge."),
        field("description", "Vehicule ou mission", true, "Mission, client, vehicule ou charge concernee.")
      ],
      metadataFields: [
        field("transportService", "Sous-section transport", true, "Location, gestion camion benne, tracteur ou citerne."),
        field("assetType", "Type d'engin", true, "Camion benne, tracteur, citerne ou autre engin."),
        field("vehicleRef", "Reference vehicule", false, "Immatriculation ou code interne."),
        field("routeRef", "Trajet ou mission", false, "Trajet, client ou ordre de mission.")
      ],
      workflow: [
        workflow("CREATE", "Saisie mission", "Le flux est rattache au service, engin et vehicule si connu."),
        workflow("TRACE", "Suivi vehicule", "Les recettes et charges restent exploitables par engin."),
        workflow("OVERVIEW", "Suivi global", "Les flux alimentent les rapports transport.")
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
        field("title", "Action transport", true, "Exemple: location, entretien, rotation ou controle citerne."),
        field("description", "Vehicule ou mission", true, "Mission, client, vehicule ou probleme a traiter."),
        field("assignedToId", "Responsable transport", true, "Chauffeur, gestionnaire ou responsable parc."),
        field("dueDate", "Echeance", true, "Les missions et entretiens doivent etre dates.")
      ],
      metadataFields: [
        field("transportService", "Sous-section transport", true, "Location, gestion camion benne, tracteur ou citerne."),
        field("assetType", "Type d'engin", true, "Camion benne, tracteur, citerne ou autre engin."),
        field("vehicleRef", "Reference vehicule", false, "Immatriculation ou code interne."),
        field("routeRef", "Trajet ou mission", false, "Trajet, client ou ordre de mission.")
      ],
      workflow: [
        workflow("PLAN", "Planification mission", "La mission ou action parc est affectee et datee."),
        workflow("EXECUTE", "Execution transport", "Le responsable suit la rotation, location ou maintenance."),
        workflow("ESCALATE", "Blocage parc", "Tout blocage vehicule remonte pour arbitrage."),
        workflow("CLOSE", "Cloture mission", "Cloture apres retour ou verification.")
      ]
    },
    reporting: {
      focusArea: "Rentabilite et disponibilite du parc transport",
      exportSections: ["locations", "camions bennes", "tracteurs", "citernes", "maintenance", "blocages"],
      highlights: [
        {
          code: "transport-flows",
          label: "Flux transport traces",
          description: "Flux financiers lies aux missions, locations ou vehicules.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "transport-open-actions",
          label: "Actions parc ouvertes",
          description: "Locations, rotations ou maintenances encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "transport-blockers",
          label: "Blocages vehicules",
          description: "Vehicules ou missions bloques.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  MONEY_TRANSFER: makeProfile("MONEY_TRANSFER", {
    operationsModel: "Gestion des transactions Orange Money, Moov Money, Wave, Western Union, MoneyGram et Ria avec suivi caisse et rapprochement.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte transaction", true, "Caisse ou compte du point transaction."),
        field("amount", "Montant", true, "Montant de depot, retrait, commission ou charge."),
        field("description", "Operation client", true, "Client, reference, reseau ou motif de l'operation.")
      ],
      metadataFields: [
        field("provider", "Reseau de transaction", true, "Orange Money, Moov Money, Wave, Western Union, MoneyGram ou Ria."),
        field("operationKind", "Type d'operation", true, "Depot, retrait, transfert, commission, approvisionnement ou charge."),
        field("agentPointRef", "Point ou caisse", false, "Guichet, agent, caisse ou telephone de service."),
        field("externalRef", "Reference externe", false, "Reference operateur ou bordereau client.")
      ],
      workflow: [
        workflow("CREATE", "Saisie guichet", "Le flux est saisi avec reseau et type d'operation."),
        workflow("RECONCILE", "Rapprochement caisse", "Les ecarts peuvent etre suivis par reseau et guichet."),
        workflow("OVERVIEW", "Suivi global", "Les transactions alimentent les rapports financiers.")
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
        field("title", "Action transaction", true, "Exemple: rapprochement Orange Money ou controle Wave."),
        field("description", "Reseau ou caisse", true, "Reseau, guichet, ecart caisse ou reference a traiter."),
        field("assignedToId", "Responsable guichet", true, "Agent, comptable ou superviseur responsable."),
        field("dueDate", "Echeance", true, "Les rapprochements et ecarts doivent etre dates.")
      ],
      metadataFields: [
        field("provider", "Reseau de transaction", true, "Orange Money, Moov Money, Wave, Western Union, MoneyGram ou Ria."),
        field("operationKind", "Type d'operation", true, "Depot, retrait, transfert, commission, approvisionnement ou charge."),
        field("agentPointRef", "Point ou caisse", false, "Guichet, agent, caisse ou telephone de service."),
        field("externalRef", "Reference externe", false, "Reference operateur ou bordereau client.")
      ],
      workflow: [
        workflow("PLAN", "Planification controle", "Le controle ou rapprochement est affecte."),
        workflow("EXECUTE", "Traitement guichet", "L'agent traite l'operation ou l'ecart."),
        workflow("ESCALATE", "Alerte ecart", "Un ecart bloque remonte en criticite elevee."),
        workflow("CLOSE", "Validation caisse", "Cloture apres verification ou rapprochement.")
      ]
    },
    reporting: {
      focusArea: "Volumes par reseau, ecarts caisse et rapprochements",
      exportSections: ["Orange Money", "Moov Money", "Wave", "Western Union", "MoneyGram", "Ria", "ecarts"],
      highlights: [
        {
          code: "money-transfer-flows",
          label: "Flux transaction traces",
          description: "Operations financieres par reseau transactionnel.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "money-transfer-followup",
          label: "Rapprochements ouverts",
          description: "Controles, ecarts ou traitements encore ouverts.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "money-transfer-blockers",
          label: "Ecarts critiques",
          description: "Blocages de caisse ou reseau a arbitrer rapidement.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  HOTEL_LODGING: makeProfile("HOTEL_LODGING", {
    operationsModel: "Hotellerie et auberge avec suivi des reservations, chambres, encaissements, charges et maintenance.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte hotel", true, "Caisse, banque ou compte de l'etablissement."),
        field("amount", "Montant", true, "Nuitee, acompte, restauration, achat ou charge."),
        field("description", "Reservation ou service", true, "Client, chambre, reservation ou charge concernee.")
      ],
      metadataFields: [
        field("bookingRef", "Reference reservation", true, "Reservation, client ou facture."),
        field("roomRef", "Chambre ou unite", false, "Numero de chambre, dortoir ou unite louee."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge.")
      ],
      workflow: [
        workflow("CREATE", "Saisie reception", "Le flux est rattache a la reservation ou au service."),
        workflow("TRACE", "Suivi sejour", "Les encaissements et charges gardent le contexte client."),
        workflow("OVERVIEW", "Suivi global", "Le rapport consolide exploitation, recettes et charges.")
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
        field("title", "Action hotel", true, "Exemple: preparation chambre, maintenance ou check-in."),
        field("description", "Chambre ou reservation", true, "Client, chambre, reservation ou intervention."),
        field("assignedToId", "Responsable", false, "Reception, menage, maintenance ou superviseur."),
        field("dueDate", "Echeance", true, "Les actions hotelieres doivent etre datees.")
      ],
      metadataFields: [
        field("bookingRef", "Reference reservation", true, "Reservation, client ou facture."),
        field("roomRef", "Chambre ou unite", false, "Numero de chambre, dortoir ou unite louee."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge.")
      ],
      workflow: [
        workflow("PLAN", "Planification sejour", "L'action est rattachee a une reservation ou chambre."),
        workflow("EXECUTE", "Execution service", "Reception, menage, maintenance ou service client."),
        workflow("ESCALATE", "Alerte exploitation", "Blocage chambre ou service remonte au management."),
        workflow("CLOSE", "Cloture sejour", "Cloture apres verification du service rendu.")
      ]
    },
    reporting: {
      focusArea: "Occupation, recettes, charges et qualite de service",
      exportSections: ["reservations", "chambres", "hebergement", "restauration", "maintenance", "blocages"],
      highlights: [
        {
          code: "hotel-flows",
          label: "Flux hotel traces",
          description: "Encaissements et charges rattaches aux reservations ou services.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "hotel-open-actions",
          label: "Actions exploitation ouvertes",
          description: "Reservations, chambres ou interventions encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "hotel-blockers",
          label: "Blocages hotel",
          description: "Blocages de chambre, reservation ou service.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
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

function assertRequiredMetadataFields(
  profileLabel: string,
  scopeLabel: string,
  fields: ActivityFieldDefinition[] | undefined,
  metadata: ActivityMetadataMap | undefined
): void {
  for (const field of fields ?? []) {
    if (field.required && !metadata?.[field.key]?.trim()) {
      throw new Error(
        `Le secteur ${profileLabel} exige le champ ${field.label.toLowerCase()} pour chaque ${scopeLabel}.`
      );
    }
  }
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
  assertRequiredMetadataFields(
    profile.label,
    "transaction",
    profile.finance.metadataFields,
    input.metadata
  );
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
  if (profile.tasks.requiresDueDate && !input.dueDate?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige une echeance pour chaque tache.`
    );
  }
  assertRequiredMetadataFields(
    profile.label,
    "tache",
    profile.tasks.metadataFields,
    input.metadata
  );
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

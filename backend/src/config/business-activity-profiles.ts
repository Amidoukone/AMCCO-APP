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

export type ActivityOperationalDimension = {
  key: string;
  label: string;
  description: string;
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
    operationalDimensions?: ActivityOperationalDimension[];
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

function dimension(
  key: string,
  label: string,
  description: string
): ActivityOperationalDimension {
  return { key, label, description };
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
    operationsModel: "Pilotage de points de vente, achats fournisseurs, ventes articlees et approvisionnement terrain.",
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
      metadataFields: [
        field("hardwareOperationKind", "Nature quincaillerie", false, "GLOBAL, ITEM_ENTRY ou ITEM_EXIT selon la nature de l'operation."),
        field("productFamily", "Famille produit", false, "Ciment, fer, outillage, plomberie ou autre famille."),
        field("itemName", "Designation", false, "Article vendu ou achete: ciment, fer, outillage ou reference precise."),
        field("quantity", "Quantite", false, "Nombre d'articles, sacs, barres, lots ou unites."),
        field("purchaseUnitPrice", "Prix d'achat unitaire", false, "Cout d'achat unitaire en XOF pour calculer le benefice."),
        field("saleUnitPrice", "Prix de vente unitaire", false, "Prix de vente unitaire en XOF pour calculer la vente du jour."),
        field("dailyPayment", "Versement du jour", false, "Montant effectivement verse ou depose pour cette vente."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou source d'approvisionnement.")
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
      metadataFields: [
        field("productFamily", "Famille produit", false, "Ciment, fer, outillage, plomberie ou autre famille."),
        field("itemName", "Designation", false, "Article, rayon ou reference concernee."),
        field("quantity", "Quantite", false, "Quantite a controler, receptionner ou ajuster."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou source d'approvisionnement.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Le superviseur planifie les actions magasin."),
        workflow("EXECUTE", "Execution", "L'equipe execute inventaire, mise en rayon ou reception."),
        workflow("CLOSE", "Cloture", "La tache est cloturee une fois le controle realise.")
      ]
    },
    reporting: {
      focusArea: "Rotation commerciale, marge article et execution magasin",
      exportSections: ["transactions", "taches", "inventaire commercial", "rapport mensuel ventes"],
      operationalDimensions: [
        dimension("productFamily", "Famille produit", "Mesure la rentabilite et l'execution par famille de produits."),
        dimension("itemName", "Designation", "Suit les ventes, couts et benefices par article ou designation."),
        dimension("supplierRef", "Fournisseur", "Suit les flux et blocages par fournisseur.")
      ],
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
    operationsModel: "Pilotage multi-rayons avec ventes caisse, achats stock, retours clients, remises, inventaires, transferts internes, fournisseurs et charges magasin.",
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
      metadataFields: [
        field("storeOperationKind", "Type d'operation magasin", false, "Vente, achat stock, paiement fournisseur, retour client, remise, inventaire, transfert ou charge."),
        field("department", "Rayon", false, "Rayon ou departement commercial."),
        field("productFamily", "Famille produit", false, "Famille de produits ou categorie vendue."),
        field("itemName", "Article", false, "Designation de l'article ou produit."),
        field("skuRef", "Reference article", false, "SKU, code article ou reference interne."),
        field("barcode", "Code-barres", false, "Code-barres ou reference de caisse."),
        field("shelfRef", "Rayon / emplacement", false, "Rayon physique, etagere, gondole ou reserve."),
        field("registerRef", "Caisse", false, "Caisse ou point d'encaissement."),
        field("cashierRef", "Caissier", false, "Caissier, vendeur ou agent de vente."),
        field("quantity", "Quantite", false, "Quantite vendue, achetee ou transferee."),
        field("returnQuantity", "Quantite retour", false, "Quantite retournee par le client."),
        field("adjustmentQuantity", "Ecart inventaire", false, "Quantite ajustee apres inventaire."),
        field("unit", "Unite", false, "Piece, carton, paquet, metre, litre ou autre unite."),
        field("purchaseUnitPrice", "Prix achat unitaire", false, "Cout unitaire d'achat de l'article."),
        field("saleUnitPrice", "Prix vente unitaire", false, "Prix unitaire de vente."),
        field("discountAmount", "Montant remise", false, "Remise, geste commercial ou ecart de caisse."),
        field("returnAmount", "Montant retour", false, "Montant rembourse ou deduit au client."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge magasin."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou grossiste."),
        field("customerRef", "Client", false, "Client, commande ou dossier retour."),
        field("invoiceRef", "Reference facture", false, "Facture, bon de livraison ou recu fournisseur."),
        field("receiptRef", "Reference ticket", false, "Ticket de caisse, recu ou reference vente."),
        field("transferRef", "Reference transfert", false, "Reference de transfert interne ou mouvement stock."),
        field("sourceStoreRef", "Magasin source", false, "Magasin, depot ou rayon d'origine."),
        field("destinationStoreRef", "Magasin destination", false, "Magasin, depot ou rayon destination."),
        field("expenseLabel", "Nature charge", false, "Loyer, nettoyage, transport, manutention, emballage ou autre charge."),
        field("paymentRef", "Reference paiement", false, "Reference caisse, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie magasin", "Chaque flux precise le rayon, l'article, la reference et le type d'operation."),
        workflow("TRACE", "Tracabilite caisse et stock", "Tickets, factures, fournisseurs, clients, caisses et emplacements restent rattaches au flux."),
        workflow("CONTROL", "Controle stock", "Les retours, remises, ecarts inventaire et transferts sont isoles pour le suivi."),
        workflow("REPORTING", "Rapport magasin", "Les ventes, achats, marges, charges et taches consolident le rapport par rayon et article.")
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
      metadataFields: [
        field("storeTaskKind", "Type d'action magasin", true, "Ouverture caisse, cloture caisse, inventaire, reassort, prix, fournisseur ou securite."),
        field("department", "Rayon", false, "Rayon ou departement commercial."),
        field("productFamily", "Famille produit", false, "Famille de produits ou categorie vendue."),
        field("itemName", "Article", false, "Article ou produit concerne."),
        field("skuRef", "Reference article", false, "SKU, code article ou reference interne."),
        field("shelfRef", "Rayon / emplacement", false, "Rayon physique, etagere, gondole ou reserve."),
        field("registerRef", "Caisse", false, "Caisse ou point d'encaissement."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou grossiste concerne."),
        field("issueRef", "Incident / anomalie", false, "Rupture, ecart caisse, retour, casse, securite ou inventaire.")
      ],
      workflow: [
        workflow("PLAN", "Planification rayon", "Le superviseur affecte les actions par rayon, caisse ou article."),
        workflow("EXECUTE", "Execution magasin", "Reassort, inventaire, controle prix, caisse, fournisseur ou securite."),
        workflow("BLOCK", "Blocage", "Un blocage signale rupture, ecart caisse, anomalie stock ou validation en attente."),
        workflow("CLOSE", "Cloture", "La tache est fermee apres verification du rayon, de la caisse ou du stock.")
      ]
    },
    reporting: {
      focusArea: "Performance multi-rayons, marge article, caisse et rotation stock",
      exportSections: ["ventes caisse", "achats stock", "retours", "remises", "inventaire", "transferts", "fournisseurs", "charges magasin"],
      operationalDimensions: [
        dimension("department", "Rayon", "Compare rentabilite, suivi et execution par rayon."),
        dimension("productFamily", "Famille produit", "Analyse les volumes et blocages par famille de produits."),
        dimension("itemName", "Article", "Suit ventes, achats, retours et marges par article."),
        dimension("skuRef", "Reference article", "Controle les mouvements stock par reference.")
      ],
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
    operationsModel: "Gestion alimentaire detaillee par famille, produit, lot, DLC, achats, ventes, pertes, chaine du froid, fournisseurs et controles rapides.",
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
        field("foodOperationKind", "Type d'operation alimentaire", false, "Vente, achat, paiement fournisseur, perte, chaine du froid, emballage ou remboursement."),
        field("productFamily", "Famille produit", true, "Categorie ou famille de produit concerne."),
        field("productName", "Produit", false, "Designation du produit alimentaire."),
        field("batchRef", "Lot ou reference", false, "Numero de lot, DLC ou reference article."),
        field("expiryDate", "DLC / DLUO", false, "Date limite de consommation ou d'utilisation optimale."),
        field("storageArea", "Zone de stockage", false, "Rayon, chambre froide, congelateur, reserve ou vitrine."),
        field("temperatureRange", "Temperature", false, "Plage ou temperature observee pour les produits sensibles."),
        field("quantity", "Quantite", false, "Quantite achetee ou vendue."),
        field("lossQuantity", "Quantite perdue", false, "Quantite retiree, perimee ou cassee."),
        field("unit", "Unite", false, "Kg, carton, piece, paquet, litre ou autre unite."),
        field("purchaseUnitPrice", "Prix achat unitaire", false, "Cout unitaire d'achat ou de valorisation du stock."),
        field("saleUnitPrice", "Prix vente unitaire", false, "Prix unitaire de vente."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, grossiste ou livreur."),
        field("buyerRef", "Client", false, "Client, commande ou point de vente."),
        field("invoiceRef", "Reference facture", false, "Facture, bon de livraison ou recu."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge alimentaire."),
        field("lossReason", "Motif perte", false, "Peremption, casse, rupture froid, retour, avarie ou ecart inventaire."),
        field("paymentRef", "Reference paiement", false, "Reference caisse, quittance, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie alimentaire", "Chaque flux precise famille, produit, lot, quantite et operation."),
        workflow("TRACE", "Tracabilite lot", "Le produit, le lot, la DLC, le fournisseur ou le client sont rattaches au flux."),
        workflow("CONTROL", "Controle stock", "Les pertes, DLC, chaine du froid et charges sont isolees pour le suivi."),
        workflow("REPORTING", "Rapport alimentaire", "Les ventes, achats, pertes et taches consolident le rapport par famille, produit et lot.")
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
        field("foodTaskKind", "Type d'action alimentaire", true, "Reception, controle stock, DLC, froid, rotation, retrait, inventaire ou nettoyage."),
        field("productFamily", "Famille produit", true, "Produit ou famille impactee."),
        field("productName", "Produit", false, "Designation du produit alimentaire."),
        field("batchRef", "Lot ou DLC", false, "Numero de lot, DLC ou reference de lot."),
        field("expiryDate", "DLC / DLUO", false, "Date limite a controler."),
        field("storageArea", "Zone de stockage", false, "Rayon, chambre froide, congelateur, reserve ou vitrine."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, grossiste ou livreur rattache."),
        field("issueRef", "Incident / anomalie", false, "Rupture, avarie, temperature, peremption ou ecart inventaire.")
      ],
      workflow: [
        workflow("PLAN", "Planification courte", "Les actions alimentaires sont planifiees avec echeance courte."),
        workflow("EXECUTE", "Execution terrain", "Reception, controle DLC, rotation, retrait, inventaire ou froid."),
        workflow("BLOCK", "Anomalie", "Un blocage signale avarie, rupture froid, peremption, ecart ou fournisseur en attente."),
        workflow("CLOSE", "Verification", "Cloture apres verification de conformite, stock et tracabilite.")
      ]
    },
    reporting: {
      focusArea: "Tracabilite, rotation et marge des produits alimentaires",
      exportSections: ["ventes", "achats", "lots", "DLC", "pertes", "chaine du froid", "fournisseurs", "controles"],
      operationalDimensions: [
        dimension("productFamily", "Famille produit", "Mesure marge, rotations et controles par famille alimentaire."),
        dimension("productName", "Produit", "Suit ventes, achats, pertes et controles par produit."),
        dimension("batchRef", "Lot ou reference", "Suit les anomalies et flux par lot ou reference."),
        dimension("storageArea", "Zone de stockage", "Controle stock, froid et rotation par zone.")
      ],
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
    operationsModel: "Gestion locative detaillee par bien, lot, locataire, bail, loyer, caution, charges, interventions et relances.",
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
        field("rentalOperationKind", "Type d'operation locative", false, "Loyer, caution, avance, charge, maintenance ou reversement."),
        field("propertyRef", "Reference bien", true, "Reference interne du bien ou lot."),
        field("unitRef", "Lot / appartement", false, "Numero du lot, appartement, bureau ou magasin."),
        field("tenantRef", "Reference locataire", false, "Identifiant du locataire ou dossier."),
        field("leaseRef", "Reference bail", false, "Contrat de bail rattache a l'operation."),
        field("propertyType", "Type de bien", false, "Villa, appartement, bureau, magasin ou terrain."),
        field("locationZone", "Zone / adresse", false, "Quartier, commune ou adresse du bien."),
        field("periodRef", "Periode locative", false, "Mois ou periode concernee par le flux."),
        field("monthsCount", "Nombre de mois", false, "Nombre de mois couverts par le loyer ou l'avance."),
        field("monthlyRent", "Loyer mensuel", false, "Montant du loyer mensuel hors charges."),
        field("serviceCharge", "Charges locatives", false, "Charges recuperees ou facturees au locataire."),
        field("depositAmount", "Montant caution", false, "Montant du depot de garantie encaisse."),
        field("chargeLabel", "Nature charge", false, "Syndic, eau, electricite, taxe, gardiennage ou autre charge."),
        field("maintenanceType", "Type maintenance", false, "Plomberie, electricite, peinture, serrure, climatisation ou autre intervention."),
        field("supplierRef", "Prestataire", false, "Entreprise, artisan ou fournisseur intervenant."),
        field("invoiceRef", "Reference facture", false, "Facture, recu ou bon rattache a la charge."),
        field("invoiceAmount", "Montant facture", false, "Montant de la facture ou depense locative."),
        field("ownerRef", "Proprietaire", false, "Proprietaire concerne par le reversement."),
        field("payoutAmount", "Montant reverse", false, "Montant reverse au proprietaire."),
        field("paymentRef", "Reference paiement", false, "Reference recu, quittance, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie locative", "Chaque flux precise le bien, le lot, le locataire et le type d'operation."),
        workflow("PROOF_OPTIONAL", "Quittance ou preuve", "Le recu, la quittance, la facture ou l'avis peuvent etre rattaches."),
        workflow("PORTFOLIO", "Suivi portefeuille", "Les loyers, cautions, charges, interventions et reversements alimentent le suivi par bien."),
        workflow("REPORTING", "Rapport locatif", "Les donnees consolident les recettes, depenses, soldes et blocages par bien et locataire.")
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
        field("rentalTaskKind", "Type d'action locative", true, "Relance, visite, bail, entree, sortie, maintenance, inspection ou reporting."),
        field("propertyRef", "Reference bien", true, "Bien ou lot concerne."),
        field("unitRef", "Lot / appartement", false, "Numero du lot, appartement, bureau ou magasin."),
        field("tenantRef", "Reference locataire", false, "Locataire, client ou dossier rattache."),
        field("leaseRef", "Reference bail", false, "Contrat de bail ou dossier administratif."),
        field("propertyType", "Type de bien", false, "Villa, appartement, bureau, magasin ou terrain."),
        field("locationZone", "Zone / adresse", false, "Quartier, commune ou adresse du bien."),
        field("periodRef", "Periode concernee", false, "Mois, echeance ou periode rattachee a l'action."),
        field("issueRef", "Incident / dossier", false, "Reference relance, incident, litige ou intervention.")
      ],
      workflow: [
        workflow("PLAN", "Planification locative", "Chaque action est planifiee avec bien, locataire et echeance."),
        workflow("EXECUTE", "Traitement", "Relance, visite, bail, intervention ou inspection du bien."),
        workflow("BLOCK", "Blocage", "Un dossier bloque signale impaye, litige, travaux ou validation en attente."),
        workflow("CLOSE", "Cloture", "Cloture avec trace du dossier locatif et impact sur le rapport.")
      ]
    },
    reporting: {
      focusArea: "Suivi du portefeuille locatif",
      exportSections: ["loyers", "cautions", "charges", "maintenance", "relances", "baux", "interventions"],
      operationalDimensions: [
        dimension("propertyRef", "Bien", "Mesure rentabilite et suivi par bien ou lot."),
        dimension("unitRef", "Lot", "Isole le suivi par appartement, bureau, magasin ou lot."),
        dimension("tenantRef", "Locataire", "Suit les flux, relances et interventions par dossier locataire."),
        dimension("leaseRef", "Bail", "Controle les operations rattachees a chaque contrat.")
      ],
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
        field("agricultureOperationKind", "Operation agricole", false, "INPUT_PURCHASE, FIELD_EXPENSE, HARVEST_SALE ou SUPPORT_INCOME selon l'operation."),
        field("campaignRef", "Reference campagne", true, "Campagne ou saison concernee."),
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone d'exploitation."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures."),
        field("surfaceArea", "Surface exploitee", false, "Surface de la parcelle ou zone concernee, en hectare si disponible."),
        field("inputName", "Intrant ou materiel", false, "Semence, engrais, pesticide, carburant, location ou materiel concerne."),
        field("workType", "Travaux agricoles", false, "Labour, semis, entretien, traitement, recolte, transport ou stockage."),
        field("quantity", "Quantite", false, "Quantite d'intrant, de recolte ou d'unites concernees."),
        field("unit", "Unite", false, "kg, tonne, sac, litre, hectare ou unite terrain."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilise pour calculer le montant quand il est renseigne."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'intrants, prestataire ou source d'approvisionnement."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la recolte."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou source de financement.")
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
        field("agricultureTaskKind", "Type d'intervention", false, "PREPARATION, SOWING, MAINTENANCE, TREATMENT, HARVEST, STORAGE ou FOLLOW_UP."),
        field("campaignRef", "Reference campagne", true, "Campagne ou saison concernee."),
        field("parcelRef", "Reference parcelle", true, "Parcelle ou zone terrain concernee."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures."),
        field("surfaceArea", "Surface concernee", false, "Surface d'intervention en hectare si disponible."),
        field("inputName", "Intrant ou materiel", false, "Intrant, equipement ou materiel utile pour l'intervention."),
        field("workType", "Travaux agricoles", false, "Travail terrain ou action d'execution attendue."),
        field("quantity", "Quantite prevue", false, "Quantite a appliquer, recolter, transporter ou controler."),
        field("unit", "Unite", false, "kg, tonne, sac, litre, hectare ou unite terrain.")
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
      operationalDimensions: [
        dimension("fieldType", "Type de champ", "Compare rentabilite et execution par type de champ."),
        dimension("cropType", "Culture", "Suit les flux et interventions par culture."),
        dimension("parcelRef", "Parcelle", "Mesure le suivi et les blocages par parcelle.")
      ],
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
    operationsModel: "Gestion de chantiers BTP avec suivi par chantier, contrat, client, lot de travaux, achats, main-d'oeuvre, engins, sous-traitance, avancement et reserves.",
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
        field("btpOperationKind", "Operation BTP", false, "CLIENT_PAYMENT, MATERIAL_PURCHASE, LABOR_PAYMENT, EQUIPMENT_RENTAL, SUBCONTRACTING ou SITE_EXPENSE."),
        field("projectRef", "Reference chantier", true, "Nom, code ou reference du chantier."),
        field("contractRef", "Reference marche/devis", false, "Numero de devis, marche, bon de commande ou contrat."),
        field("clientRef", "Client / maitre d'ouvrage", false, "Client, promoteur, maitre d'ouvrage ou beneficiaire."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier."),
        field("materialName", "Materiau / fourniture", false, "Ciment, fer, sable, gravier, plomberie, electricite ou autre fourniture."),
        field("quantity", "Quantite", false, "Quantite achetee, posee ou facturee."),
        field("unit", "Unite", false, "Sac, tonne, m3, m2, jour, heure, lot ou autre unite."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire pour calculer automatiquement le montant."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, depot ou prestataire d'approvisionnement."),
        field("teamRef", "Equipe / corps de metier", false, "Equipe interne, macons, ferrailleurs, electriciens ou autre corps de metier."),
        field("workerCount", "Nombre d'ouvriers", false, "Effectif concerne par le paiement de main-d'oeuvre."),
        field("workDays", "Jours travailles", false, "Nombre de jours ou vacations payes."),
        field("dailyRate", "Taux journalier", false, "Cout journalier par ouvrier."),
        field("equipmentRef", "Engin / materiel", false, "Betonniere, camion, pelle, grue, compacteur ou autre equipement."),
        field("equipmentHours", "Heures engin", false, "Nombre d'heures ou vacations d'utilisation."),
        field("hourlyRate", "Taux horaire", false, "Cout horaire ou vacation de l'engin."),
        field("subcontractorRef", "Sous-traitant", false, "Entreprise ou artisan sous-traitant."),
        field("invoiceRef", "Facture / situation", false, "Numero de facture, situation de travaux, bon ou piece associee."),
        field("progressPercent", "Avancement (%)", false, "Pourcentage d'avancement constate sur le chantier ou le lot."),
        field("retentionAmount", "Retenue / garantie", false, "Retenue de garantie, reserve ou montant conserve.")
      ],
      workflow: [
        workflow("CREATE", "Saisie chantier", "Le flux est saisi avec reference chantier et lot de travaux."),
        workflow("TRACE", "Suivi couts", "Les recettes, achats, main-d'oeuvre, engins et sous-traitants restent relies au chantier."),
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
        field("btpTaskKind", "Type d'action BTP", true, "Preparation, terrassement, fondation, structure, second oeuvre, finition, controle, reserve ou reception."),
        field("projectRef", "Reference chantier", true, "Nom, code ou reference du chantier."),
        field("contractRef", "Reference marche/devis", false, "Numero de devis, marche, bon de commande ou contrat."),
        field("clientRef", "Client / maitre d'ouvrage", false, "Client, promoteur, maitre d'ouvrage ou beneficiaire."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier."),
        field("teamRef", "Equipe / corps de metier", false, "Equipe interne ou corps de metier responsable."),
        field("materialName", "Materiau / fourniture", false, "Materiau ou fourniture a controler, poser ou receptionner."),
        field("progressPercent", "Avancement (%)", false, "Avancement constate pour l'action ou le lot."),
        field("issueRef", "Reserve / point bloquant", false, "Reserve, malfacon, retard, rupture ou point a arbitrer.")
      ],
      workflow: [
        workflow("PLAN", "Planification chantier", "L'action est affectee, datee et rattachee a un lot."),
        workflow("EXECUTE", "Execution terrain", "L'equipe execute et met a jour l'avancement."),
        workflow("CONTROL", "Controle qualite", "Les controles, reserves et reprises restent rattaches au chantier."),
        workflow("ESCALATE", "Alerte blocage", "Tout blocage chantier remonte pour arbitrage."),
        workflow("CLOSE", "Reception interne", "Cloture apres verification de l'action ou levee de reserve.")
      ]
    },
    reporting: {
      focusArea: "Couts, recettes, avancement, main-d'oeuvre, engins, sous-traitance et blocages par chantier",
      exportSections: ["flux chantier", "lots de travaux", "achats materiaux", "main-d'oeuvre", "engins", "sous-traitance", "actions chantier", "blocages"],
      operationalDimensions: [
        dimension("projectRef", "Chantier", "Mesure rentabilite, avancement et alertes par chantier."),
        dimension("workPackage", "Lot de travaux", "Compare les couts et l'execution par lot de travaux."),
        dimension("teamRef", "Equipe / corps de metier", "Suit l'execution et les blocages par equipe ou corps de metier."),
        dimension("supplierRef", "Fournisseur", "Suit les achats et depenses par fournisseur chantier.")
      ],
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
          description: "Taches de chantier, reserves ou controles encore a traiter.",
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
        field("fishOperationKind", "Operation piscicole", false, "FINGERLING_PURCHASE, FEED_PURCHASE, POND_EXPENSE, FISH_SALE ou SUPPORT_INCOME selon l'operation."),
        field("pondRef", "Reference bassin", true, "Bassin, etang ou unite de production."),
        field("cycleRef", "Reference cycle", true, "Cycle d'elevage ou lot suivi."),
        field("species", "Espece", false, "Tilapia, silure, carpe ou autre espece."),
        field("fingerlingBatchRef", "Lot d'alevins", false, "Lot, origine ou reference d'alevins."),
        field("feedName", "Aliment ou intrant", false, "Aliment, traitement, oxygene ou intrant piscicole."),
        field("quantity", "Quantite", false, "Nombre d'alevins, kg d'aliment ou kg de poisson vendu."),
        field("unit", "Unite", false, "piece, kg, sac, tonne ou unite de suivi."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilise pour calculer le montant quand il est renseigne."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'alevins, aliment ou materiel."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la vente."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou financement."),
        field("mortalityCount", "Mortalite", false, "Nombre de poissons morts signales si applicable."),
        field("waterQuality", "Qualite eau", false, "pH, temperature, oxygene ou observation d'eau.")
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
        field("fishTaskKind", "Type d'intervention", false, "FEEDING, WATER_CONTROL, TREATMENT, SORTING, HARVEST, STOCKING ou FOLLOW_UP."),
        field("pondRef", "Reference bassin", true, "Bassin, etang ou unite de production."),
        field("cycleRef", "Reference cycle", true, "Cycle d'elevage ou lot suivi."),
        field("species", "Espece", false, "Tilapia, silure, carpe ou autre espece."),
        field("feedName", "Aliment ou intrant", false, "Aliment, traitement ou intrant utilise."),
        field("quantity", "Quantite prevue", false, "Quantite a distribuer, controler, trier ou recolter."),
        field("unit", "Unite", false, "kg, sac, piece, bassin ou unite de suivi."),
        field("mortalityCount", "Mortalite observee", false, "Nombre de poissons morts constates pendant l'intervention."),
        field("averageWeight", "Poids moyen", false, "Poids moyen observe si disponible."),
        field("waterQuality", "Qualite eau", false, "pH, temperature, oxygene ou observation d'eau.")
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
      exportSections: ["flux bassin", "cycles d'elevage", "stocks alevins", "aliments", "ventes", "interventions", "alertes sanitaires"],
      operationalDimensions: [
        dimension("pondRef", "Bassin", "Mesure rentabilite et suivi sanitaire par bassin."),
        dimension("cycleRef", "Cycle d'elevage", "Suit les charges, ventes et interventions par cycle."),
        dimension("species", "Espece", "Compare les performances par espece.")
      ],
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
  LIVESTOCK: makeProfile("LIVESTOCK", {
    operationsModel: "Elevage avec suivi des troupeaux, lots, especes, alimentation, soins, mortalite, achats et ventes.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte elevage", true, "Compte ou caisse de l'activite d'elevage."),
        field("amount", "Montant", true, "Montant d'achat animal, aliment, soin, charge ou vente."),
        field("description", "Troupeau ou lot", true, "Troupeau, lot, espece, aliment, soin ou vente concernee.")
      ],
      metadataFields: [
        field("livestockOperationKind", "Operation elevage", false, "ANIMAL_PURCHASE, FEED_PURCHASE, VET_CARE, FARM_EXPENSE, ANIMAL_SALE, PRODUCT_SALE ou SUPPORT_INCOME selon l'operation."),
        field("herdRef", "Reference troupeau", true, "Troupeau, bande, poulailler, enclos ou unite d'elevage."),
        field("batchRef", "Reference lot", true, "Lot, bande, cycle ou groupe d'animaux suivi."),
        field("species", "Espece", true, "Boeuf, mouton, poulet, chevre ou autre espece."),
        field("animalCategory", "Categorie", false, "Bovin, ovin, caprin, volaille ou autre categorie."),
        field("animalCount", "Nombre d'animaux", false, "Nombre d'animaux achetes, vendus, suivis ou impactes."),
        field("feedName", "Aliment ou intrant", false, "Aliment, complement, litiere, produit sanitaire ou intrant."),
        field("feedQuantity", "Quantite aliment", false, "Quantite d'aliment ou d'intrant en kg, sac ou unite suivie."),
        field("productName", "Produit d'elevage", false, "Oeufs, lait, fumier ou autre produit issu de l'elevage."),
        field("productQuantity", "Quantite produit", false, "Quantite de produit d'elevage vendue ou suivie."),
        field("unit", "Unite", false, "piece, tete, kg, sac, carton ou unite de suivi."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilise pour calculer le montant quand il est renseigne."),
        field("treatmentName", "Soin ou vaccin", false, "Vaccin, traitement, medicament ou intervention veterinaire."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'animaux, aliment, medicament ou materiel."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la vente."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou financement."),
        field("mortalityCount", "Mortalite", false, "Nombre d'animaux morts signales si applicable."),
        field("healthStatus", "Etat sanitaire", false, "Observation sanitaire, symptome ou statut du lot.")
      ],
      workflow: [
        workflow("CREATE", "Saisie elevage", "Les flux sont rattaches au troupeau, lot et espece."),
        workflow("TRACE", "Suivi lot", "Les achats, charges, soins et ventes gardent le contexte de production."),
        workflow("OVERVIEW", "Suivi global", "Le rapport consolide les flux d'elevage.")
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
        field("title", "Action elevage", true, "Exemple: nourrissage, vaccination, controle lot ou preparation vente."),
        field("description", "Troupeau ou lot", true, "Troupeau, lot, espece ou intervention sanitaire."),
        field("assignedToId", "Responsable elevage", true, "Agent ou responsable de l'unite d'elevage."),
        field("dueDate", "Date d'intervention", true, "Les actions d'elevage doivent etre datees.")
      ],
      metadataFields: [
        field("livestockTaskKind", "Type d'intervention", false, "FEEDING, HEALTH_CHECK, VACCINATION, TREATMENT, CLEANING, BREEDING, SALE_PREP ou FOLLOW_UP."),
        field("herdRef", "Reference troupeau", true, "Troupeau, bande, poulailler, enclos ou unite d'elevage."),
        field("batchRef", "Reference lot", true, "Lot, bande, cycle ou groupe d'animaux suivi."),
        field("species", "Espece", true, "Boeuf, mouton, poulet, chevre ou autre espece."),
        field("animalCategory", "Categorie", false, "Bovin, ovin, caprin, volaille ou autre categorie."),
        field("animalCount", "Nombre d'animaux", false, "Nombre d'animaux a nourrir, traiter, vacciner ou vendre."),
        field("feedName", "Aliment ou intrant", false, "Aliment, complement, litiere ou intrant utilise."),
        field("feedQuantity", "Quantite aliment", false, "Quantite a distribuer ou controler."),
        field("productName", "Produit d'elevage", false, "Oeufs, lait, fumier ou autre produit issu de l'elevage."),
        field("productQuantity", "Quantite produit", false, "Quantite de produit a recolter, vendre ou controler."),
        field("unit", "Unite", false, "piece, tete, kg, sac, carton ou unite de suivi."),
        field("treatmentName", "Soin ou vaccin", false, "Vaccin, traitement, medicament ou intervention veterinaire."),
        field("mortalityCount", "Mortalite observee", false, "Nombre d'animaux morts constates pendant l'intervention."),
        field("averageWeight", "Poids moyen", false, "Poids moyen observe si disponible."),
        field("healthStatus", "Etat sanitaire", false, "Observation sanitaire, symptome ou statut du lot.")
      ],
      workflow: [
        workflow("PLAN", "Plan d'elevage", "L'action est planifiee par troupeau, lot et espece."),
        workflow("EXECUTE", "Intervention elevage", "Nourrissage, controle, vaccination, traitement ou vente."),
        workflow("ESCALATE", "Alerte sanitaire", "Blocage ou anomalie sanitaire remonte rapidement."),
        workflow("CLOSE", "Retour elevage", "Cloture apres controle du lot ou troupeau.")
      ]
    },
    reporting: {
      focusArea: "Lots d'elevage, especes, alimentation, soins et alertes sanitaires",
      exportSections: ["flux troupeau", "lots d'elevage", "alimentation", "soins", "ventes", "interventions", "alertes sanitaires"],
      operationalDimensions: [
        dimension("herdRef", "Troupeau", "Mesure rentabilite et suivi sanitaire par troupeau ou unite d'elevage."),
        dimension("batchRef", "Lot", "Suit les charges, ventes et interventions par lot ou bande."),
        dimension("species", "Espece", "Compare les performances par boeufs, moutons, poulets ou autres especes.")
      ],
      highlights: [
        {
          code: "livestock-flows",
          label: "Flux d'elevage traces",
          description: "Flux relies aux troupeaux, lots, especes ou ventes.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "livestock-open-actions",
          label: "Actions elevage ouvertes",
          description: "Interventions d'elevage encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "livestock-blockers",
          label: "Alertes elevage",
          description: "Blocages ou anomalies de production animale.",
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
      operationalDimensions: [
        dimension("transportService", "Sous-section transport", "Compare location et gestion d'engins."),
        dimension("assetType", "Type d'engin", "Mesure les flux et blocages camions bennes, tracteurs et citernes."),
        dimension("vehicleRef", "Vehicule", "Suit rentabilite et disponibilite par vehicule.")
      ],
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
      operationalDimensions: [
        dimension("provider", "Reseau de transaction", "Compare volumes, marge et ecarts par reseau."),
        dimension("operationKind", "Type d'operation", "Suit depots, retraits, commissions et approvisionnements."),
        dimension("agentPointRef", "Point ou caisse", "Mesure le suivi par guichet ou caisse.")
      ],
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
    operationsModel: "Hotellerie et auberge avec suivi detaille des reservations, sejours, chambres, nuitees, restauration, blanchisserie, evenements, charges et maintenance.",
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
        field("hotelOperationKind", "Type d'operation hoteliere", false, "Nuitee, acompte, restauration, evenement, blanchisserie, maintenance, commission, taxe ou remboursement."),
        field("bookingRef", "Reference reservation", true, "Reservation, client ou facture."),
        field("stayRef", "Reference sejour", false, "Sejour, dossier client ou folio."),
        field("guestRef", "Client / hote", false, "Nom, reference client ou organisme."),
        field("roomRef", "Chambre ou unite", false, "Numero de chambre, dortoir ou unite louee."),
        field("roomType", "Type chambre", false, "Simple, double, suite, dortoir ou bungalow."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge."),
        field("checkInDate", "Date arrivee", false, "Date d'arrivee ou debut de sejour."),
        field("checkOutDate", "Date depart", false, "Date de depart ou fin de sejour."),
        field("nightsCount", "Nombre de nuitees", false, "Nombre de nuits facturees."),
        field("roomRate", "Tarif nuitee", false, "Prix par nuit ou tarif chambre."),
        field("guestCount", "Nombre de clients", false, "Nombre de personnes rattachees au sejour."),
        field("mealCount", "Repas / consommations", false, "Nombre de repas, petits dejeuners ou consommations."),
        field("mealUnitPrice", "Prix unitaire repas", false, "Prix unitaire restauration ou consommation."),
        field("serviceQuantity", "Quantite service", false, "Quantite de service hors chambre."),
        field("serviceUnitPrice", "Prix unitaire service", false, "Prix unitaire blanchisserie, evenement ou autre service."),
        field("eventRef", "Evenement", false, "Reference evenement, salle ou prestation groupe."),
        field("supplierRef", "Fournisseur", false, "Prestataire, fournisseur ou agence partenaire."),
        field("invoiceRef", "Reference facture", false, "Facture, recu, bon ou folio."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge hoteliere."),
        field("commissionAmount", "Commission", false, "Commission agence, plateforme ou intermediaire."),
        field("taxAmount", "Taxe", false, "Taxe de sejour, impot ou taxe appliquee."),
        field("refundAmount", "Montant remboursement", false, "Montant rembourse au client."),
        field("paymentRef", "Reference paiement", false, "Reference caisse, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie reception", "Chaque flux precise reservation, sejour, chambre, client et type d'operation."),
        workflow("TRACE", "Suivi sejour", "Les encaissements, charges, services, taxes et remboursements gardent le contexte client."),
        workflow("CONTROL", "Controle exploitation", "Les nuitees, restauration, maintenance, commissions et taxes sont isolees pour le suivi."),
        workflow("REPORTING", "Rapport hotelier", "Les recettes, charges, occupation et taches consolident le rapport par chambre et service.")
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
        field("hotelTaskKind", "Type d'action hoteliere", true, "Check-in, check-out, preparation chambre, menage, maintenance, restauration ou audit."),
        field("bookingRef", "Reference reservation", true, "Reservation, client ou facture."),
        field("stayRef", "Reference sejour", false, "Sejour, dossier client ou folio."),
        field("guestRef", "Client / hote", false, "Nom, reference client ou organisme."),
        field("roomRef", "Chambre ou unite", false, "Numero de chambre, dortoir ou unite louee."),
        field("roomType", "Type chambre", false, "Simple, double, suite, dortoir ou bungalow."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge."),
        field("checkInDate", "Date arrivee", false, "Date d'arrivee ou debut de sejour."),
        field("checkOutDate", "Date depart", false, "Date de depart ou fin de sejour."),
        field("eventRef", "Evenement", false, "Reference evenement, salle ou prestation groupe."),
        field("supplierRef", "Fournisseur", false, "Prestataire, fournisseur ou agence partenaire."),
        field("issueRef", "Incident / anomalie", false, "Blocage chambre, maintenance, plainte client ou ecart reception.")
      ],
      workflow: [
        workflow("PLAN", "Planification sejour", "L'action est rattachee a une reservation, chambre, client ou service."),
        workflow("EXECUTE", "Execution service", "Reception, menage, maintenance, restauration, blanchisserie ou service client."),
        workflow("ESCALATE", "Alerte exploitation", "Blocage chambre, plainte client ou service critique remonte au management."),
        workflow("CLOSE", "Cloture sejour", "Cloture apres verification du service rendu et mise a jour du rapport.")
      ]
    },
    reporting: {
      focusArea: "Occupation, recettes, charges, nuitees et qualite de service",
      exportSections: ["reservations", "chambres", "sejours", "nuitees", "restauration", "blanchisserie", "maintenance", "commissions", "taxes", "blocages"],
      operationalDimensions: [
        dimension("serviceLine", "Service hotelier", "Compare hebergement, restauration, entretien et evenements."),
        dimension("roomRef", "Chambre ou unite", "Suit rentabilite et interventions par chambre."),
        dimension("bookingRef", "Reservation", "Mesure encaissements et suivi par reservation."),
        dimension("guestRef", "Client", "Suit recettes, remboursements et qualite de service par client."),
        dimension("roomType", "Type chambre", "Analyse occupation et rentabilite par type de chambre.")
      ],
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
      metadataFields: [
        field("serviceType", "Type de service", false, "Type de prestation ou intervention."),
        field("clientRef", "Client", false, "Client, site ou dossier de prestation.")
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
      metadataFields: [
        field("serviceType", "Type de service", false, "Type de prestation ou intervention."),
        field("clientRef", "Client", false, "Client, site ou dossier de prestation.")
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
      operationalDimensions: [
        dimension("serviceType", "Type de service", "Compare rentabilite et execution par type de prestation."),
        dimension("clientRef", "Client", "Suit les flux, interventions et blocages par client.")
      ],
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
      operationalDimensions: [
        dimension("siteRef", "Site minier", "Suit rentabilite, operations et risques par site."),
        dimension("equipmentRef", "Equipement", "Mesure les charges et blocages par equipement.")
      ],
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
    operationsModel: "Production d'eau potable avec suivi detaille des stations, forages, zones reseau, volumes produits, volumes factures, branchements, analyses qualite, energie, produits de traitement, maintenance et reparations.",
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
        field("waterOperationKind", "Type d'operation eau", false, "Facture eau, vente en gros, branchement, subvention, produits de traitement, energie, maintenance, analyse qualite, reparation reseau ou fournisseur."),
        field("facilityRef", "Reference site", true, "Station, forage ou reseau concerne."),
        field("networkZone", "Zone reseau", false, "Secteur ou zone de distribution."),
        field("productionLine", "Ligne exploitation", false, "Production, traitement, distribution, branchement, qualite ou maintenance."),
        field("meterRef", "Compteur / point de comptage", false, "Compteur client, compteur production ou point de mesure."),
        field("customerRef", "Abonne / client", false, "Abonne, client institutionnel ou acheteur en gros."),
        field("billingPeriod", "Periode facture", false, "Mois, cycle ou periode de facturation."),
        field("meterStart", "Index depart", false, "Index compteur en debut de periode."),
        field("meterEnd", "Index fin", false, "Index compteur en fin de periode."),
        field("producedVolumeM3", "Volume produit m3", false, "Volume produit ou pompe sur la periode."),
        field("volumeM3", "Volume facture m3", false, "Volume facture, vendu ou distribue."),
        field("unitPrice", "Prix unitaire", false, "Prix du m3, prix unitaire produit ou tarif applicable."),
        field("connectionRef", "Reference branchement", false, "Dossier de nouveau branchement, extension ou raccordement."),
        field("connectionFee", "Frais branchement", false, "Montant encaisse pour le raccordement."),
        field("treatmentProduct", "Produit traitement", false, "Chlore, reactif, filtre, sel ou autre intrant de traitement."),
        field("chemicalQuantity", "Quantite traitement", false, "Quantite de produit de traitement utilisee ou achetee."),
        field("energySource", "Source energie", false, "Electricite, carburant, solaire, groupe ou autre source."),
        field("energyQuantity", "Quantite energie", false, "KWh, litres ou unite consommee."),
        field("equipmentRef", "Equipement", false, "Pompe, groupe, reservoir, conduite, vanne ou compteur."),
        field("maintenanceType", "Type maintenance", false, "Preventif, curatif, pompe, reseau, compteur ou reservoir."),
        field("testRef", "Reference analyse", false, "Reference analyse laboratoire ou controle terrain."),
        field("waterQuality", "Qualite eau", false, "pH, chlore residuel, turbidite, bacteriologie ou observation."),
        field("issueRef", "Incident / fuite", false, "Fuite, rupture, baisse pression, panne ou reclamation."),
        field("supplierRef", "Fournisseur / prestataire", false, "Fournisseur, laboratoire, technicien ou prestataire."),
        field("invoiceRef", "Reference facture", false, "Facture fournisseur, facture client ou piece justificative."),
        field("invoiceAmount", "Montant facture", false, "Montant facture fournisseur ou charge rattachee."),
        field("paymentRef", "Reference paiement", false, "Reference encaissement, quittance ou paiement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie exploitation eau", "Le flux est rattache au site, a la zone reseau, au compteur ou a l'equipement concerne."),
        workflow("TRACE", "Tracabilite technique", "Volumes, compteurs, factures, analyses et interventions documentent les flux."),
        workflow("CONTROL", "Controle exploitation", "Les charges critiques, pertes apparentes et blocages reseau sont suivis."),
        workflow("REPORTING", "Rapport eau", "Les volumes, recettes, charges et interventions alimentent le rapport sectoriel.")
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
        field("waterTaskKind", "Type d'action eau", true, "Releve production, controle qualite, maintenance pompe, inspection reseau, fuite, releve compteur, branchement, dosage, recouvrement ou remise en service."),
        field("facilityRef", "Reference site", true, "Station, reseau ou forage concerne."),
        field("networkZone", "Zone reseau", false, "Secteur ou zone de distribution."),
        field("productionLine", "Ligne exploitation", false, "Production, traitement, distribution, branchement, qualite ou maintenance."),
        field("meterRef", "Compteur / point de comptage", false, "Compteur client, compteur production ou point de mesure."),
        field("customerRef", "Abonne / client", false, "Abonne, dossier client ou acheteur concerne."),
        field("equipmentRef", "Equipement", false, "Pompe, reservoir, conduite, compteur, vanne ou groupe."),
        field("testRef", "Reference analyse", false, "Controle terrain ou analyse laboratoire."),
        field("waterQuality", "Qualite eau", false, "pH, chlore residuel, turbidite, bacteriologie ou observation."),
        field("issueRef", "Incident / fuite", false, "Fuite, panne, rupture, baisse pression ou reclamation."),
        field("connectionRef", "Reference branchement", false, "Dossier de branchement, extension ou raccordement."),
        field("supplierRef", "Fournisseur / prestataire", false, "Technicien, laboratoire, fournisseur ou prestataire.")
      ],
      workflow: [
        workflow("PLAN", "Planification exploitation", "Intervention planifiee et affectee."),
        workflow("EXECUTE", "Intervention", "Execution sur site ou reseau."),
        workflow("ESCALATE", "Escalade continuite", "Blocage remonte en priorite pour continuite de service."),
        workflow("CLOSE", "Remise en service", "Cloture apres verification de remise en service.")
      ]
    },
    reporting: {
      focusArea: "Production, distribution, facturation, qualite et continuite de service",
      exportSections: ["volumes produits", "volumes factures", "recettes eau", "charges exploitation", "qualite", "maintenance", "reparations reseau", "blocages critiques"],
      operationalDimensions: [
        dimension("facilityRef", "Site eau", "Mesure couts, interventions et continuite par station ou forage."),
        dimension("networkZone", "Zone reseau", "Suit les blocages et interventions par zone de distribution."),
        dimension("productionLine", "Ligne exploitation", "Compare production, traitement, distribution, qualite et maintenance."),
        dimension("meterRef", "Compteur", "Isole les volumes factures et releves par compteur.")
      ],
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
          label: "Blocages de continuite",
          description: "Blocages techniques menacant la continuite du service.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  REAL_ESTATE_AGENCY: makeProfile("REAL_ESTATE_AGENCY", {
    operationsModel: "Agence immobiliere avec suivi detaille des mandats, biens, proprietaires, prospects, visites, offres, dossiers de vente ou location, commissions, frais commerciaux, documents et closing.",
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
        field("agencyOperationKind", "Type d'operation agence", false, "Commission vente, commission location, frais mandat, visite, dossier, publicite, deplacement, reversement courtier, documents ou remboursement."),
        field("mandateRef", "Reference mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Reference bien", true, "Bien, lot, terrain, villa, appartement ou local concerne."),
        field("mandateType", "Type mandat", false, "Vente, location, gestion, recherche ou exclusivite."),
        field("propertyType", "Type de bien", false, "Villa, appartement, terrain, bureau, magasin, immeuble ou local."),
        field("locationZone", "Zone / quartier", false, "Quartier, commune ou zone commerciale."),
        field("ownerRef", "Proprietaire", false, "Proprietaire, bailleur ou vendeur."),
        field("clientRef", "Client / acquereur", false, "Client, locataire, acquereur ou entreprise interessee."),
        field("prospectRef", "Prospect", false, "Prospect, contact ou lead commercial."),
        field("dealRef", "Reference affaire", false, "Offre, compromis, bail, promesse ou dossier de closing."),
        field("dealStage", "Etape affaire", false, "Prospection, visite, offre, negociation, compromis, bail, acte ou cloture."),
        field("dealAmount", "Montant affaire", false, "Prix de vente, loyer annuel, valeur du bail ou base de commission."),
        field("commissionRate", "Taux commission %", false, "Taux de commission applique au dossier."),
        field("commissionAmount", "Montant commission", false, "Commission agence encaissee ou attendue."),
        field("feeAmount", "Montant frais", false, "Frais de dossier, visite, mandat ou service."),
        field("visitCount", "Nombre visites", false, "Nombre de visites facturees ou realisees."),
        field("unitPrice", "Prix unitaire", false, "Prix par visite, annonce ou prestation."),
        field("advertisingChannel", "Canal publicite", false, "Facebook, portail immobilier, panneau, radio, affichage ou autre canal."),
        field("documentRef", "Reference document", false, "Titre foncier, attestation, bail, compromis, acte ou dossier administratif."),
        field("supplierRef", "Prestataire / courtier", false, "Courtier partenaire, photographe, imprimeur, notaire, geometre ou prestataire."),
        field("invoiceRef", "Reference facture", false, "Facture, recu, note de frais ou piece commerciale."),
        field("expenseAmount", "Montant depense", false, "Depense commerciale, publicite, deplacement, document ou charge agence."),
        field("payoutAmount", "Montant reverse", false, "Part courtier, apporteur, partenaire ou retrocession."),
        field("refundAmount", "Montant rembourse", false, "Remboursement client ou annulation de frais."),
        field("paymentRef", "Reference paiement", false, "Reference encaissement, quittance, recu ou virement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie dossier agence", "Le flux est rattache au mandat, au bien, au client et a l'etape commerciale."),
        workflow("TRACE", "Tracabilite commerciale", "Mandat, affaire, paiement, facture et document conservent le suivi du dossier."),
        workflow("CONTROL", "Controle commission", "Les commissions, frais, retrocessions et charges commerciales sont controles."),
        workflow("REPORTING", "Rapport agence", "Les mandats, biens, recettes, depenses et actions alimentent le rapport sectoriel.")
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
        field("agencyTaskKind", "Type d'action agence", true, "Mandat, estimation, publication, prospection, visite, offre, documents, notaire, signature, recouvrement commission ou reporting proprietaire."),
        field("mandateRef", "Reference mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Reference bien", true, "Bien, lot, terrain, villa, appartement ou local concerne."),
        field("mandateType", "Type mandat", false, "Vente, location, gestion, recherche ou exclusivite."),
        field("propertyType", "Type de bien", false, "Villa, appartement, terrain, bureau, magasin, immeuble ou local."),
        field("locationZone", "Zone / quartier", false, "Quartier, commune ou zone commerciale."),
        field("ownerRef", "Proprietaire", false, "Proprietaire, bailleur ou vendeur."),
        field("clientRef", "Client / acquereur", false, "Client, locataire, acquereur ou entreprise interessee."),
        field("prospectRef", "Prospect", false, "Prospect, contact ou lead commercial."),
        field("dealRef", "Reference affaire", false, "Offre, compromis, bail, promesse ou dossier de closing."),
        field("dealStage", "Etape affaire", false, "Prospection, visite, offre, negociation, compromis, bail, acte ou cloture."),
        field("documentRef", "Reference document", false, "Titre foncier, attestation, bail, compromis, acte ou dossier administratif."),
        field("issueRef", "Blocage dossier", false, "Document manquant, client indisponible, litige, prix, notaire ou validation proprietaire."),
        field("supplierRef", "Prestataire / courtier", false, "Courtier partenaire, notaire, geometre, photographe ou prestataire.")
      ],
      workflow: [
        workflow("PLAN", "Planification commerciale", "Le dossier est affecte et date."),
        workflow("EXECUTE", "Execution", "Visite, relance ou traitement du mandat."),
        workflow("FOLLOW_UP", "Suivi dossier", "Le charge d'affaire alimente le suivi."),
        workflow("CLOSE", "Cloture", "Cloture une fois l'etape commerciale finalisee.")
      ]
    },
    reporting: {
      focusArea: "Mandats, biens, pipeline commercial, commissions et rentabilite agence",
      exportSections: ["mandats", "biens", "pipeline", "visites", "offres", "commissions", "frais commerciaux", "documents", "blocages dossier"],
      operationalDimensions: [
        dimension("mandateRef", "Mandat", "Suit rentabilite et execution par mandat commercial."),
        dimension("propertyRef", "Bien", "Mesure les flux et actions par bien."),
        dimension("dealStage", "Etape affaire", "Compare les dossiers par etape commerciale."),
        dimension("clientRef", "Client", "Suit prospects, clients, acquereurs ou locataires.")
      ],
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

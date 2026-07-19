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
        field("accountId", "Compte de caisse", true, "Caisse ou compte de vente utilisé."),
        field("amount", "Montant", true, "Montant encaissé ou dépense."),
        field("description", "Objet", false, "Référence achat, dépôt fournisseur ou vente spéciale.")
      ],
      metadataFields: [
        field("hardwareOperationKind", "Nature quincaillerie", false, "GLOBAL, ITEM_ENTRY ou ITEM_EXIT selon la nature de l'opération."),
        field("productFamily", "Famille produit", false, "Ciment, fer, outillage, plomberie ou autre famille."),
        field("itemName", "Désignation", false, "Article vendu ou acheté: ciment, fer, outillage ou référence précise."),
        field("quantity", "Quantité", false, "Nombre d'articles, sacs, barres, lots ou unités."),
        field("purchaseUnitPrice", "Prix d'achat unitaire", false, "Coût d'achat unitaire en XOF pour calculer le bénéfice."),
        field("saleUnitPrice", "Prix de vente unitaire", false, "Prix de vente unitaire en XOF pour calculer la vente du jour."),
        field("dailyPayment", "Versement du jour", false, "Montant effectivement versé ou déposé pour cette vente."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou source d'approvisionnement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie terrain", "Le point de vente saisit le flux financier."),
        workflow("PROOF_OPTIONAL", "Justificatif", "Une preuve peut être jointe quand elle est disponible."),
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
        field("title", "Action magasin", true, "Exemple: inventaire rayon ou réception palette."),
        field("description", "Détails", false, "Référence rayon, fournisseur ou emplacement."),
        field("dueDate", "Échéance", false, "Date utile pour les inventaires ou receptions.")
      ],
      metadataFields: [
        field("productFamily", "Famille produit", false, "Ciment, fer, outillage, plomberie ou autre famille."),
        field("itemName", "Désignation", false, "Article, rayon ou référence concernée."),
        field("quantity", "Quantité", false, "Quantité à contrôler, réceptionner ou ajuster."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou source d'approvisionnement.")
      ],
      workflow: [
        workflow("PLAN", "Planification", "Le superviseur planifie les actions magasin."),
        workflow("EXECUTE", "Exécution", "L'équipe exécute inventaire, mise en rayon ou réception."),
        workflow("CLOSE", "Clôture", "La tâche est clôturée une fois le contrôle réalise.")
      ]
    },
    reporting: {
      focusArea: "Rotation commerciale, marge article et exécution magasin",
      exportSections: ["transactions", "tâches", "inventaire commercial", "rapport mensuel ventes"],
      operationalDimensions: [
        dimension("productFamily", "Famille produit", "Mesure la rentabilité et l'exécution par famille de produits."),
        dimension("itemName", "Désignation", "Suit les ventes, coûts et bénéfices par article ou désignation."),
        dimension("supplierRef", "Fournisseur", "Suit les flux et blocages par fournisseur.")
      ],
      highlights: [
        {
          code: "sales-volume",
          label: "Flux de vente tracés",
          description: "Nombre de flux financiers rattachés au secteur quincaillerie.",
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
          description: "Anomalies d'approvisionnement ou de préparation non résolues.",
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
        field("accountId", "Compte d'exploitation", true, "Caisse ou compte utilisé."),
        field("amount", "Montant", true, "Montant de l'opération."),
        field("description", "Contexte", false, "Rayon, famille produit ou fournisseur.")
      ],
      metadataFields: [
        field("storeOperationKind", "Type d'opération magasin", false, "Vente, achat stock, paiement fournisseur, retour client, remise, inventaire, transfert ou charge."),
        field("department", "Rayon", false, "Rayon ou département commercial."),
        field("productFamily", "Famille produit", false, "Famille de produits ou catégorie vendue."),
        field("itemName", "Article", false, "Désignation de l'article ou produit."),
        field("skuRef", "Référence article", false, "SKU, code article ou référence interne."),
        field("barcode", "Code-barres", false, "Code-barres ou référence de caisse."),
        field("shelfRef", "Rayon / emplacement", false, "Rayon physique, étagère, gondole ou réserve."),
        field("registerRef", "Caisse", false, "Caisse ou point d'encaissement."),
        field("cashierRef", "Caissier", false, "Caissier, vendeur ou agent de vente."),
        field("quantity", "Quantité", false, "Quantité vendue, achetée ou transférée."),
        field("returnQuantity", "Quantité retour", false, "Quantité retournée par le client."),
        field("adjustmentQuantity", "Écart inventaire", false, "Quantité ajustée après inventaire."),
        field("unit", "Unité", false, "Pièce, carton, paquet, mètre, litre ou autre unité."),
        field("purchaseUnitPrice", "Prix achat unitaire", false, "Coût unitaire d'achat de l'article."),
        field("saleUnitPrice", "Prix vente unitaire", false, "Prix unitaire de vente."),
        field("discountAmount", "Montant remise", false, "Remise, geste commercial ou écart de caisse."),
        field("returnAmount", "Montant retour", false, "Montant rembourse ou deduit au client."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge magasin."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou grossiste."),
        field("customerRef", "Client", false, "Client, commande ou dossier retour."),
        field("invoiceRef", "Référence facture", false, "Facture, bon de livraison ou reçu fournisseur."),
        field("receiptRef", "Référence ticket", false, "Ticket de caisse, reçu ou référence vente."),
        field("transferRef", "Référence transfert", false, "Référence de transfert interne ou mouvement stock."),
        field("sourceStoreRef", "Magasin source", false, "Magasin, dépôt ou rayon d'origine."),
        field("destinationStoreRef", "Magasin destination", false, "Magasin, dépôt ou rayon destination."),
        field("expenseLabel", "Nature charge", false, "Loyer, nettoyage, transport, manutention, emballage ou autre charge."),
        field("paymentRef", "Référence paiement", false, "Référence caisse, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie magasin", "Chaque flux précise le rayon, l'article, la référence et le type d'opération."),
        workflow("TRACE", "Traçabilité caisse et stock", "Tickets, factures, fournisseurs, clients, caisses et emplacements restent rattachés au flux."),
        workflow("CONTROL", "Contrôle stock", "Les retours, remises, écarts inventaire et transferts sont isolés pour le suivi."),
        workflow("REPORTING", "Rapport magasin", "Les ventes, achats, marges, charges et tâches consolident le rapport par rayon et article.")
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
        field("title", "Action commerce", true, "Exemple: implantation, contrôle ou relance."),
        field("description", "Périmètre", false, "Rayon, fournisseur ou opération concernée."),
        field("assignedToId", "Responsable", false, "Responsable de rayon ou employé.")
      ],
      metadataFields: [
        field("storeTaskKind", "Type d'action magasin", true, "Ouverture caisse, clôture caisse, inventaire, réassort, prix, fournisseur ou sécurité."),
        field("department", "Rayon", false, "Rayon ou département commercial."),
        field("productFamily", "Famille produit", false, "Famille de produits ou catégorie vendue."),
        field("itemName", "Article", false, "Article ou produit concerné."),
        field("skuRef", "Référence article", false, "SKU, code article ou référence interne."),
        field("shelfRef", "Rayon / emplacement", false, "Rayon physique, étagère, gondole ou réserve."),
        field("registerRef", "Caisse", false, "Caisse ou point d'encaissement."),
        field("supplierRef", "Fournisseur", false, "Fournisseur ou grossiste concerné."),
        field("issueRef", "Incident / anomalie", false, "Rupture, écart caisse, retour, casse, sécurité ou inventaire.")
      ],
      workflow: [
        workflow("PLAN", "Planification rayon", "Le superviseur affecte les actions par rayon, caisse ou article."),
        workflow("EXECUTE", "Exécution magasin", "Réassort, inventaire, contrôle prix, caisse, fournisseur ou sécurité."),
        workflow("BLOCK", "Blocage", "Un blocage signale rupture, écart caisse, anomalie stock ou validation en attente."),
        workflow("CLOSE", "Clôture", "La tâche est fermée après vérification du rayon, de la caisse ou du stock.")
      ]
    },
    reporting: {
      focusArea: "Performance multi-rayons, marge article, caisse et rotation stock",
      exportSections: ["ventes caisse", "achats stock", "retours", "remises", "inventaire", "transferts", "fournisseurs", "charges magasin"],
      operationalDimensions: [
        dimension("department", "Rayon", "Compare rentabilité, suivi et exécution par rayon."),
        dimension("productFamily", "Famille produit", "Analyse les volumes et blocages par famille de produits."),
        dimension("itemName", "Article", "Suit ventes, achats, retours et marges par article."),
        dimension("skuRef", "Référence article", "Contrôle les mouvements stock par référence.")
      ],
      highlights: [
        {
          code: "store-volume",
          label: "Flux consolidés",
          description: "Nombre d'opérations financières consolidées sur le commerce général.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "pending-finance",
          label: "Flux suivis",
          description: "Opérations remontées dans le suivi financier du commerce général.",
          metric: "submittedTransactionsCount",
          thresholds: { warningAt: 2, criticalAt: 6 }
        },
        {
          code: "open-store-actions",
          label: "Actions terrain ouvertes",
          description: "Opérations magasin encore en cours ou à faire.",
          metric: "openTasksCount",
          thresholds: { warningAt: 6, criticalAt: 12 }
        }
      ]
    }
  }),
  FOOD: makeProfile("FOOD", {
    operationsModel: "Gestion alimentaire détaillée par famille, produit, lot, DLC, achats, ventes, pertes, chaîne du froid, fournisseurs et contrôles rapides.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte d'encaissement", true, "Caisse ou compte utilisé."),
        field("amount", "Montant", true, "Montant encaissé ou dépense."),
        field("description", "Lot ou produit", true, "Produit, lot, fournisseur ou nature de dépense.")
      ],
      metadataFields: [
        field("foodOperationKind", "Type d'opération alimentaire", false, "Vente, achat, paiement fournisseur, perte, chaîne du froid, emballage ou remboursement."),
        field("productFamily", "Famille produit", true, "Categorie ou famille de produit concerné."),
        field("productName", "Produit", false, "Désignation du produit alimentaire."),
        field("batchRef", "Lot ou référence", false, "Numéro de lot, DLC ou référence article."),
        field("expiryDate", "DLC / DLUO", false, "Date limite de consommation ou d'utilisation optimale."),
        field("storageArea", "Zone de stockage", false, "Rayon, chambre froide, congélateur, réserve ou vitrine."),
        field("temperatureRange", "Température", false, "Plage ou température observée pour les produits sensibles."),
        field("quantity", "Quantité", false, "Quantité achetée ou vendue."),
        field("lossQuantity", "Quantité perdue", false, "Quantité retiree, perimee ou cassee."),
        field("unit", "Unité", false, "Kg, carton, pièce, paquet, litre ou autre unité."),
        field("purchaseUnitPrice", "Prix achat unitaire", false, "Coût unitaire d'achat ou de valorisation du stock."),
        field("saleUnitPrice", "Prix vente unitaire", false, "Prix unitaire de vente."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, grossiste ou livreur."),
        field("buyerRef", "Client", false, "Client, commande ou point de vente."),
        field("invoiceRef", "Référence facture", false, "Facture, bon de livraison ou reçu."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge alimentaire."),
        field("lossReason", "Motif perte", false, "Peremption, casse, rupture froid, retour, avarie ou écart inventaire."),
        field("paymentRef", "Référence paiement", false, "Référence caisse, quittance, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie alimentaire", "Chaque flux précise famille, produit, lot, quantité et opération."),
        workflow("TRACE", "Traçabilité lot", "Le produit, le lot, la DLC, le fournisseur ou le client sont rattachés au flux."),
        workflow("CONTROL", "Contrôle stock", "Les pertes, DLC, chaîne du froid et charges sont isolées pour le suivi."),
        workflow("REPORTING", "Rapport alimentaire", "Les ventes, achats, pertes et tâches consolident le rapport par famille, produit et lot.")
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
        field("dueDate", "Échéance", true, "Les actions alimentaires doivent être datées.")
      ],
      metadataFields: [
        field("foodTaskKind", "Type d'action alimentaire", true, "Réception, contrôle stock, DLC, froid, rotation, retrait, inventaire ou nettoyage."),
        field("productFamily", "Famille produit", true, "Produit ou famille impactee."),
        field("productName", "Produit", false, "Désignation du produit alimentaire."),
        field("batchRef", "Lot ou DLC", false, "Numéro de lot, DLC ou référence de lot."),
        field("expiryDate", "DLC / DLUO", false, "Date limite à contrôler."),
        field("storageArea", "Zone de stockage", false, "Rayon, chambre froide, congélateur, réserve ou vitrine."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, grossiste ou livreur rattaché."),
        field("issueRef", "Incident / anomalie", false, "Rupture, avarie, température, péremption ou écart inventaire.")
      ],
      workflow: [
        workflow("PLAN", "Planification courte", "Les actions alimentaires sont planifiées avec échéance courte."),
        workflow("EXECUTE", "Exécution terrain", "Réception, contrôle DLC, rotation, retrait, inventaire ou froid."),
        workflow("BLOCK", "Anomalie", "Un blocage signale avarie, rupture froid, péremption, écart ou fournisseur en attente."),
        workflow("CLOSE", "Vérification", "Clôture après vérification de conformite, stock et traçabilité.")
      ]
    },
    reporting: {
      focusArea: "Traçabilité, rotation et marge des produits alimentaires",
      exportSections: ["ventes", "achats", "lots", "DLC", "pertes", "chaîne du froid", "fournisseurs", "contrôles"],
      operationalDimensions: [
        dimension("productFamily", "Famille produit", "Mesure marge, rotations et contrôles par famille alimentaire."),
        dimension("productName", "Produit", "Suit ventes, achats, pertes et contrôles par produit."),
        dimension("batchRef", "Lot ou référence", "Suit les anomalies et flux par lot ou référence."),
        dimension("storageArea", "Zone de stockage", "Contrôle stock, froid et rotation par zone.")
      ],
      highlights: [
        {
          code: "food-volume",
          label: "Flux alimentaires tracés",
          description: "Opérations rattachées à un produit, lot ou fournisseur.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "food-actions-open",
          label: "Actions stock ouvertes",
          description: "Contrôles et traitements encore ouverts.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "food-blocked",
          label: "Anomalies produit bloquées",
          description: "Tâches bloquées sur des produits ou lots.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  RENTAL: makeProfile("RENTAL", {
    operationsModel: "Gestion locative détaillée par bien, lot, locataire, bail, loyer, caution, charges, interventions et relances.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte locatif", true, "Compte ou caisse affecté au portefeuille locatif."),
        field("amount", "Montant du flux", true, "Montant du loyer, dépôt ou dépense."),
        field("description", "Bien ou locataire", true, "Référence du bien, du locataire ou de la charge.")
      ],
      metadataFields: [
        field("rentalOperationKind", "Type d'opération locative", false, "Loyer, caution, avance, charge, maintenance ou reversement."),
        field("propertyRef", "Référence bien", true, "Référence interne du bien ou lot."),
        field("unitRef", "Lot / appartement", false, "Numéro du lot, appartement, bureau ou magasin."),
        field("tenantRef", "Référence locataire", false, "Identifiant du locataire ou dossier."),
        field("leaseRef", "Référence bail", false, "Contrat de bail rattaché à l'opération."),
        field("propertyType", "Type de bien", false, "Villa, appartement, bureau, magasin ou terrain."),
        field("locationZone", "Zone / adresse", false, "Quartier, commune ou adresse du bien."),
        field("periodRef", "Période locative", false, "Mois ou période concernée par le flux."),
        field("monthsCount", "Nombre de mois", false, "Nombre de mois couverts par le loyer ou l'avance."),
        field("monthlyRent", "Loyer mensuel", false, "Montant du loyer mensuel hors charges."),
        field("serviceCharge", "Charges locatives", false, "Charges recuperees ou facturées au locataire."),
        field("depositAmount", "Montant caution", false, "Montant du dépôt de garantie encaissé."),
        field("chargeLabel", "Nature charge", false, "Syndic, eau, electricite, taxe, gardiennage ou autre charge."),
        field("maintenanceType", "Type maintenance", false, "Plomberie, electricite, peinture, serrure, climatisation ou autre intervention."),
        field("supplierRef", "Prestataire", false, "Entreprise, artisan ou fournisseur intervenant."),
        field("invoiceRef", "Référence facture", false, "Facture, reçu ou bon rattaché à la charge."),
        field("invoiceAmount", "Montant facture", false, "Montant de la facture ou dépense locative."),
        field("ownerRef", "Propriétaire", false, "Propriétaire concerné par le reversement."),
        field("payoutAmount", "Montant reverse", false, "Montant reverse au propriétaire."),
        field("paymentRef", "Référence paiement", false, "Référence reçu, quittance, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie locative", "Chaque flux précise le bien, le lot, le locataire et le type d'opération."),
        workflow("PROOF_OPTIONAL", "Quittance ou preuve", "Le reçu, la quittance, la facture ou l'avis peuvent être rattachés."),
        workflow("PORTFOLIO", "Suivi portefeuille", "Les loyers, cautions, charges, interventions et reversements alimentent le suivi par bien."),
        workflow("REPORTING", "Rapport locatif", "Les données consolident les recettes, dépenses, soldes et blocages par bien et locataire.")
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
        field("description", "Bien ou dossier", true, "Référence bien, locataire ou dossier."),
        field("dueDate", "Échéance", true, "Les engagements locatifs doivent être dates.")
      ],
      metadataFields: [
        field("rentalTaskKind", "Type d'action locative", true, "Relance, visite, bail, entree, sortie, maintenance, inspection ou reporting."),
        field("propertyRef", "Référence bien", true, "Bien ou lot concerné."),
        field("unitRef", "Lot / appartement", false, "Numéro du lot, appartement, bureau ou magasin."),
        field("tenantRef", "Référence locataire", false, "Locataire, client ou dossier rattaché."),
        field("leaseRef", "Référence bail", false, "Contrat de bail ou dossier administratif."),
        field("propertyType", "Type de bien", false, "Villa, appartement, bureau, magasin ou terrain."),
        field("locationZone", "Zone / adresse", false, "Quartier, commune ou adresse du bien."),
        field("periodRef", "Période concernée", false, "Mois, échéance ou période rattachée à l'action."),
        field("issueRef", "Incident / dossier", false, "Référence relance, incident, litige ou intervention.")
      ],
      workflow: [
        workflow("PLAN", "Planification locative", "Chaque action est planifiée avec bien, locataire et échéance."),
        workflow("EXECUTE", "Traitement", "Relance, visite, bail, intervention ou inspection du bien."),
        workflow("BLOCK", "Blocage", "Un dossier bloque signale impaye, litige, travaux ou validation en attente."),
        workflow("CLOSE", "Clôture", "Clôture avec trace du dossier locatif et impact sur le rapport.")
      ]
    },
    reporting: {
      focusArea: "Suivi du portefeuille locatif",
      exportSections: ["loyers", "cautions", "charges", "maintenance", "relances", "baux", "interventions"],
      operationalDimensions: [
        dimension("propertyRef", "Bien", "Mesure rentabilité et suivi par bien ou lot."),
        dimension("unitRef", "Lot", "Isole le suivi par appartement, bureau, magasin ou lot."),
        dimension("tenantRef", "Locataire", "Suit les flux, relances et interventions par dossier locataire."),
        dimension("leaseRef", "Bail", "Contrôle les opérations rattachées à chaque contrat.")
      ],
      highlights: [
        {
          code: "rental-cashflow",
          label: "Flux locatifs enregistres",
          description: "Nombre de flux financiers rattachés au portefeuille locatif.",
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
          description: "Dossiers locatifs bloques et à arbitrer.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  AGRICULTURE: makeProfile("AGRICULTURE", {
    operationsModel: "Exploitation terrain avec suivi de campagnes, types de champs, intrants et exécution datée.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte campagne", true, "Compte ou caisse de l'exploitation."),
        field("amount", "Montant", true, "Montant de l'opération."),
        field("description", "Parcelle ou intrant", true, "Parcelle, campagne, culture ou intrant concerné.")
      ],
      metadataFields: [
        field("agricultureOperationKind", "Opération agricole", false, "INPUT_PURCHASE, FIELD_EXPENSE, HARVEST_SALE ou SUPPORT_INCOME selon l'opération."),
        field("campaignRef", "Référence campagne", true, "Campagne ou saison concernée."),
        field("parcelRef", "Référence parcelle", true, "Parcelle ou zone d'exploitation."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures."),
        field("surfaceArea", "Surface exploitee", false, "Surface de la parcelle ou zone concernée, en hectare si disponible."),
        field("inputName", "Intrant ou matériel", false, "Semence, engrais, pesticide, carburant, location ou matériel concerné."),
        field("workType", "Travaux agricoles", false, "Labour, semis, entretien, traitement, récolte, transport ou stockage."),
        field("quantity", "Quantité", false, "Quantité d'intrant, de récolte ou d'unités concernées."),
        field("unit", "Unité", false, "kg, tonne, sac, litre, hectare ou unité terrain."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilisé pour calculer le montant quand il est renseigné."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'intrants, prestataire ou source d'approvisionnement."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la récolte."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou source de financement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie terrain", "Les dépenses et recettes sont saisies par campagne."),
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
        field("title", "Intervention terrain", true, "Exemple: semis, contrôle parcelle ou récolte."),
        field("description", "Parcelle ou campagne", true, "Parcelle, culture, intrant ou équipement concerné."),
        field("dueDate", "Date terrain", true, "Les opérations agricoles doivent être planifiées.")
      ],
      metadataFields: [
        field("agricultureTaskKind", "Type d'intervention", false, "PREPARATION, SOWING, MAINTENANCE, TREATMENT, HARVEST, STORAGE ou FOLLOW_UP."),
        field("campaignRef", "Référence campagne", true, "Campagne ou saison concernée."),
        field("parcelRef", "Référence parcelle", true, "Parcelle ou zone terrain concernée."),
        field("fieldType", "Type de champ", true, "Riz, maraichage, verger, coton ou autre type de champ."),
        field("cropType", "Culture", false, "Culture principale ou association de cultures."),
        field("surfaceArea", "Surface concernée", false, "Surface d'intervention en hectare si disponible."),
        field("inputName", "Intrant ou matériel", false, "Intrant, équipement ou matériel utile pour l'intervention."),
        field("workType", "Travaux agricoles", false, "Travail terrain ou action d'exécution attendue."),
        field("quantity", "Quantité prévue", false, "Quantité à appliquer, récolter, transporter ou contrôler."),
        field("unit", "Unité", false, "kg, tonne, sac, litre, hectare ou unité terrain.")
      ],
      workflow: [
        workflow("PLAN", "Plan de campagne", "Chaque intervention est planifiée avec date."),
        workflow("EXECUTE", "Exécution terrain", "Les équipes réalisent l'intervention."),
        workflow("CLOSE", "Retour terrain", "Clôture après retour terrain et vérification.")
      ]
    },
    reporting: {
      focusArea: "Exécution de campagne, types de champs et traçabilité terrain",
      exportSections: ["flux campagne", "types de champs", "interventions terrain", "blocages parcelles"],
      operationalDimensions: [
        dimension("fieldType", "Type de champ", "Compare rentabilité et exécution par type de champ."),
        dimension("cropType", "Culture", "Suit les flux et interventions par culture."),
        dimension("parcelRef", "Parcelle", "Mesure le suivi et les blocages par parcelle.")
      ],
      highlights: [
        {
          code: "agri-flows",
          label: "Flux de campagne tracés",
          description: "Flux financiers reliés à des parcelles ou intrants.",
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
          description: "Interventions bloquées qui menacent la campagne.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  BTP: makeProfile("BTP", {
    operationsModel: "Gestion de chantiers BTP avec suivi par chantier, contrat, client, lot de travaux, achats, main-d'oeuvre, engins, sous-traitance, avancement et réserves.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte chantier", true, "Compte ou caisse du chantier."),
        field("amount", "Montant", true, "Montant de l'encaissement ou de la charge."),
        field("description", "Chantier ou lot", true, "Chantier, devis, fournisseur, lot technique ou client concerné.")
      ],
      metadataFields: [
        field("btpOperationKind", "Opération BTP", false, "CLIENT_PAYMENT, MATERIAL_PURCHASE, LABOR_PAYMENT, EQUIPMENT_RENTAL, SUBCONTRACTING ou SITE_EXPENSE."),
        field("projectRef", "Référence chantier", true, "Nom, code ou référence du chantier."),
        field("contractRef", "Référence marché/devis", false, "Numéro de devis, marché, bon de commande ou contrat."),
        field("clientRef", "Client / maitre d'ouvrage", false, "Client, promoteur, maitre d'ouvrage ou beneficiaire."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier."),
        field("materialName", "Matériau / fourniture", false, "Ciment, fer, sable, gravier, plomberie, electricite ou autre fourniture."),
        field("quantity", "Quantité", false, "Quantité achetée, posee ou facturée."),
        field("unit", "Unité", false, "Sac, tonne, m3, m2, jour, heure, lot ou autre unité."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire pour calculer automatiquement le montant."),
        field("supplierRef", "Fournisseur", false, "Fournisseur, dépôt ou prestataire d'approvisionnement."),
        field("teamRef", "Equipe / corps de métier", false, "Equipe interne, macons, ferrailleurs, electriciens ou autre corps de métier."),
        field("workerCount", "Nombre d'ouvriers", false, "Effectif concerné par le paiement de main-d'oeuvre."),
        field("workDays", "Jours travailles", false, "Nombre de jours ou vacations payes."),
        field("dailyRate", "Taux journalier", false, "Coût journalier par ouvrier."),
        field("equipmentRef", "Engin / matériel", false, "Betonniere, camion, pelle, grue, compacteur ou autre équipement."),
        field("equipmentHours", "Heures engin", false, "Nombre d'heures ou vacations d'utilisation."),
        field("hourlyRate", "Taux horaire", false, "Coût horaire ou vacation de l'engin."),
        field("subcontractorRef", "Sous-traitant", false, "Entreprise ou artisan sous-traitant."),
        field("invoiceRef", "Facture / situation", false, "Numéro de facture, situation de travaux, bon ou pièce associée."),
        field("progressPercent", "Avancement (%)", false, "Pourcentage d'avancement constate sur le chantier ou le lot."),
        field("retentionAmount", "Retenue / garantie", false, "Retenue de garantie, réserve ou montant conservé.")
      ],
      workflow: [
        workflow("CREATE", "Saisie chantier", "Le flux est saisi avec référence chantier et lot de travaux."),
        workflow("TRACE", "Suivi coûts", "Les recettes, achats, main-d'oeuvre, engins et sous-traitants restent reliés au chantier."),
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
        field("title", "Action chantier", true, "Exemple: coulage dalle, achat ciment ou contrôle qualité."),
        field("description", "Détails chantier", true, "Chantier, lot, fournisseur ou équipe concernée."),
        field("assignedToId", "Responsable chantier", true, "Conducteur de travaux ou responsable terrain."),
        field("dueDate", "Échéance", true, "Les actions chantier doivent être planifiées.")
      ],
      metadataFields: [
        field("btpTaskKind", "Type d'action BTP", true, "Préparation, terrassement, fondation, structure, second oeuvre, finition, contrôle, réserve ou réception."),
        field("projectRef", "Référence chantier", true, "Nom, code ou référence du chantier."),
        field("contractRef", "Référence marché/devis", false, "Numéro de devis, marché, bon de commande ou contrat."),
        field("clientRef", "Client / maitre d'ouvrage", false, "Client, promoteur, maitre d'ouvrage ou beneficiaire."),
        field("workPackage", "Lot de travaux", true, "Gros oeuvre, second oeuvre, terrassement, finition ou autre lot."),
        field("siteLocation", "Localisation", false, "Quartier, ville ou zone du chantier."),
        field("teamRef", "Equipe / corps de métier", false, "Equipe interne ou corps de métier responsable."),
        field("materialName", "Matériau / fourniture", false, "Matériau ou fourniture à contrôler, poser ou réceptionner."),
        field("progressPercent", "Avancement (%)", false, "Avancement constate pour l'action ou le lot."),
        field("issueRef", "Réserve / point bloquant", false, "Réserve, malfacon, retard, rupture ou point à arbitrer.")
      ],
      workflow: [
        workflow("PLAN", "Planification chantier", "L'action est affectée, datée et rattachée à un lot."),
        workflow("EXECUTE", "Exécution terrain", "L'équipe exécute et met à jour l'avancement."),
        workflow("CONTROL", "Contrôle qualité", "Les contrôles, réserves et reprises restent rattachés au chantier."),
        workflow("ESCALATE", "Alerte blocage", "Tout blocage chantier remonte pour arbitrage."),
        workflow("CLOSE", "Réception interne", "Clôture après vérification de l'action ou levée de réserve.")
      ]
    },
    reporting: {
      focusArea: "Coûts, recettes, avancement, main-d'oeuvre, engins, sous-traitance et blocages par chantier",
      exportSections: ["flux chantier", "lots de travaux", "achats matériaux", "main-d'oeuvre", "engins", "sous-traitance", "actions chantier", "blocages"],
      operationalDimensions: [
        dimension("projectRef", "Chantier", "Mesure rentabilité, avancement et alertes par chantier."),
        dimension("workPackage", "Lot de travaux", "Compare les coûts et l'exécution par lot de travaux."),
        dimension("teamRef", "Equipe / corps de métier", "Suit l'exécution et les blocages par équipe ou corps de métier."),
        dimension("supplierRef", "Fournisseur", "Suit les achats et dépenses par fournisseur chantier.")
      ],
      highlights: [
        {
          code: "btp-flows",
          label: "Flux chantier tracés",
          description: "Opérations financières reliées aux chantiers et lots.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "btp-open-actions",
          label: "Actions chantier ouvertes",
          description: "Tâches de chantier, réserves ou contrôles encore à traiter.",
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
    operationsModel: "Pisciculture avec suivi des bassins, cycles d'élevage, aliments, ventes et alertes sanitaires.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte piscicole", true, "Compte ou caisse de l'activité piscicole."),
        field("amount", "Montant", true, "Montant de vente, achat aliment, alevins ou charge."),
        field("description", "Bassin ou cycle", true, "Bassin, cycle, lot d'alevins, aliment ou vente concernée.")
      ],
      metadataFields: [
        field("fishOperationKind", "Opération piscicole", false, "FINGERLING_PURCHASE, FEED_PURCHASE, POND_EXPENSE, FISH_SALE ou SUPPORT_INCOME selon l'opération."),
        field("pondRef", "Référence bassin", true, "Bassin, etang ou unité de production."),
        field("cycleRef", "Référence cycle", true, "Cycle d'élevage ou lot suivi."),
        field("species", "Espèce", false, "Tilapia, silure, carpe ou autre espèce."),
        field("fingerlingBatchRef", "Lot d'alevins", false, "Lot, origine ou référence d'alevins."),
        field("feedName", "Aliment ou intrant", false, "Aliment, traitement, oxygène ou intrant piscicole."),
        field("quantity", "Quantité", false, "Nombre d'alevins, kg d'aliment ou kg de poisson vendu."),
        field("unit", "Unité", false, "pièce, kg, sac, tonne ou unité de suivi."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilisé pour calculer le montant quand il est renseigné."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'alevins, aliment ou matériel."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la vente."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou financement."),
        field("mortalityCount", "Mortalité", false, "Nombre de poissons morts signalés si applicable."),
        field("waterQuality", "Qualité eau", false, "pH, température, oxygène ou observation d'eau.")
      ],
      workflow: [
        workflow("CREATE", "Saisie bassin", "Les flux sont rattachés au bassin et au cycle."),
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
        field("title", "Action piscicole", true, "Exemple: nourrissage, contrôle eau, tri ou récolte."),
        field("description", "Bassin ou cycle", true, "Bassin, cycle, lot ou intervention sanitaire."),
        field("assignedToId", "Responsable bassin", true, "Agent ou responsable du bassin."),
        field("dueDate", "Date d'intervention", true, "Les actions piscicoles doivent être datées.")
      ],
      metadataFields: [
        field("fishTaskKind", "Type d'intervention", false, "FEEDING, WATER_CONTROL, TREATMENT, SORTING, HARVEST, STOCKING ou FOLLOW_UP."),
        field("pondRef", "Référence bassin", true, "Bassin, étang ou unité de production."),
        field("cycleRef", "Référence cycle", true, "Cycle d'élevage ou lot suivi."),
        field("species", "Espèce", false, "Tilapia, silure, carpe ou autre espèce."),
        field("feedName", "Aliment ou intrant", false, "Aliment, traitement ou intrant utilisé."),
        field("quantity", "Quantité prévue", false, "Quantité à distribuer, contrôler, trier ou récolter."),
        field("unit", "Unité", false, "kg, sac, pièce, bassin ou unité de suivi."),
        field("mortalityCount", "Mortalité observée", false, "Nombre de poissons morts constatés pendant l'intervention."),
        field("averageWeight", "Poids moyen", false, "Poids moyen observé si disponible."),
        field("waterQuality", "Qualité eau", false, "pH, température, oxygène ou observation d'eau.")
      ],
      workflow: [
        workflow("PLAN", "Plan d'élevage", "L'action est planifiée par bassin et cycle."),
        workflow("EXECUTE", "Intervention bassin", "Nourrissage, contrôle, tri ou traitement."),
        workflow("ESCALATE", "Alerte sanitaire", "Blocage ou anomalie sanitaire remonte rapidement."),
        workflow("CLOSE", "Retour production", "Clôture après contrôle du bassin.")
      ]
    },
    reporting: {
      focusArea: "Cycles piscicoles, bassins et alertes de production",
      exportSections: ["flux bassin", "cycles d'élevage", "stocks alevins", "aliments", "ventes", "interventions", "alertes sanitaires"],
      operationalDimensions: [
        dimension("pondRef", "Bassin", "Mesure rentabilité et suivi sanitaire par bassin."),
        dimension("cycleRef", "Cycle d'élevage", "Suit les charges, ventes et interventions par cycle."),
        dimension("species", "Espèce", "Compare les performances par espèce.")
      ],
      highlights: [
        {
          code: "fish-flows",
          label: "Flux piscicoles tracés",
          description: "Flux reliés aux bassins, cycles ou ventes.",
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
    operationsModel: "Élevage avec suivi des troupeaux, lots, espèces, alimentation, soins, mortalité, achats et ventes.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte élevage", true, "Compte ou caisse de l'activité d'élevage."),
        field("amount", "Montant", true, "Montant d'achat animal, aliment, soin, charge ou vente."),
        field("description", "Troupeau ou lot", true, "Troupeau, lot, espèce, aliment, soin ou vente concernée.")
      ],
      metadataFields: [
        field("livestockOperationKind", "Opération élevage", false, "ANIMAL_PURCHASE, FEED_PURCHASE, VET_CARE, FARM_EXPENSE, ANIMAL_SALE, PRODUCT_SALE ou SUPPORT_INCOME selon l'opération."),
        field("herdRef", "Référence troupeau", true, "Troupeau, bande, poulailler, enclos ou unité d'élevage."),
        field("batchRef", "Référence lot", true, "Lot, bande, cycle ou groupe d'animaux suivi."),
        field("species", "Espèce", true, "Boeuf, mouton, poulet, chevre ou autre espèce."),
        field("animalCategory", "Catégorie", false, "Bovin, ovin, caprin, volaille ou autre catégorie."),
        field("animalCount", "Nombre d'animaux", false, "Nombre d'animaux achetés, vendus, suivis ou impactes."),
        field("feedName", "Aliment ou intrant", false, "Aliment, complement, litiere, produit sanitaire ou intrant."),
        field("feedQuantity", "Quantité aliment", false, "Quantité d'aliment ou d'intrant en kg, sac ou unité suivie."),
        field("productName", "Produit d'élevage", false, "Oeufs, lait, fumier ou autre produit issu de l'élevage."),
        field("productQuantity", "Quantité produit", false, "Quantité de produit d'élevage vendue ou suivie."),
        field("unit", "Unité", false, "pièce, tete, kg, sac, carton ou unité de suivi."),
        field("unitPrice", "Prix unitaire", false, "Prix unitaire utilisé pour calculer le montant quand il est renseigné."),
        field("treatmentName", "Soin ou vaccin", false, "Vaccin, traitement, medicament ou intervention veterinaire."),
        field("supplierRef", "Fournisseur", false, "Fournisseur d'animaux, aliment, medicament ou matériel."),
        field("buyerRef", "Acheteur", false, "Acheteur ou client de la vente."),
        field("sourceRef", "Source d'appui", false, "Partenaire, subvention, avance ou financement."),
        field("mortalityCount", "Mortalité", false, "Nombre d'animaux morts signalés si applicable."),
        field("healthStatus", "Etat sanitaire", false, "Observation sanitaire, symptome ou statut du lot.")
      ],
      workflow: [
        workflow("CREATE", "Saisie élevage", "Les flux sont rattachés au troupeau, lot et espèce."),
        workflow("TRACE", "Suivi lot", "Les achats, charges, soins et ventes gardent le contexte de production."),
        workflow("OVERVIEW", "Suivi global", "Le rapport consolide les flux d'élevage.")
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
        field("title", "Action élevage", true, "Exemple: nourrissage, vaccination, contrôle lot ou préparation vente."),
        field("description", "Troupeau ou lot", true, "Troupeau, lot, espèce ou intervention sanitaire."),
        field("assignedToId", "Responsable élevage", true, "Agent ou responsable de l'unité d'élevage."),
        field("dueDate", "Date d'intervention", true, "Les actions d'élevage doivent être datées.")
      ],
      metadataFields: [
        field("livestockTaskKind", "Type d'intervention", false, "FEEDING, HEALTH_CHECK, VACCINATION, TREATMENT, CLEANING, BREEDING, SALE_PREP ou FOLLOW_UP."),
        field("herdRef", "Référence troupeau", true, "Troupeau, bande, poulailler, enclos ou unité d'élevage."),
        field("batchRef", "Référence lot", true, "Lot, bande, cycle ou groupe d'animaux suivi."),
        field("species", "Espèce", true, "Boeuf, mouton, poulet, chevre ou autre espèce."),
        field("animalCategory", "Catégorie", false, "Bovin, ovin, caprin, volaille ou autre catégorie."),
        field("animalCount", "Nombre d'animaux", false, "Nombre d'animaux à nourrir, traiter, vacciner ou vendre."),
        field("feedName", "Aliment ou intrant", false, "Aliment, complement, litiere ou intrant utilisé."),
        field("feedQuantity", "Quantité aliment", false, "Quantité à distribuer ou contrôler."),
        field("productName", "Produit d'élevage", false, "Oeufs, lait, fumier ou autre produit issu de l'élevage."),
        field("productQuantity", "Quantité produit", false, "Quantité de produit à récolter, vendre ou contrôler."),
        field("unit", "Unité", false, "pièce, tete, kg, sac, carton ou unité de suivi."),
        field("treatmentName", "Soin ou vaccin", false, "Vaccin, traitement, medicament ou intervention veterinaire."),
        field("mortalityCount", "Mortalité observée", false, "Nombre d'animaux morts constatés pendant l'intervention."),
        field("averageWeight", "Poids moyen", false, "Poids moyen observé si disponible."),
        field("healthStatus", "Etat sanitaire", false, "Observation sanitaire, symptome ou statut du lot.")
      ],
      workflow: [
        workflow("PLAN", "Plan d'élevage", "L'action est planifiée par troupeau, lot et espèce."),
        workflow("EXECUTE", "Intervention élevage", "Nourrissage, contrôle, vaccination, traitement ou vente."),
        workflow("ESCALATE", "Alerte sanitaire", "Blocage ou anomalie sanitaire remonte rapidement."),
        workflow("CLOSE", "Retour élevage", "Clôture après contrôle du lot ou troupeau.")
      ]
    },
    reporting: {
      focusArea: "Lots d'élevage, espèces, alimentation, soins et alertes sanitaires",
      exportSections: ["flux troupeau", "lots d'élevage", "alimentation", "soins", "ventes", "interventions", "alertes sanitaires"],
      operationalDimensions: [
        dimension("herdRef", "Troupeau", "Mesure rentabilité et suivi sanitaire par troupeau ou unité d'élevage."),
        dimension("batchRef", "Lot", "Suit les charges, ventes et interventions par lot ou bande."),
        dimension("species", "Espèce", "Compare les performances par boeufs, moutons, poulets ou autres espèces.")
      ],
      highlights: [
        {
          code: "livestock-flows",
          label: "Flux d'élevage tracés",
          description: "Flux reliés aux troupeaux, lots, espèces ou ventes.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "livestock-open-actions",
          label: "Actions élevage ouvertes",
          description: "Interventions d'élevage encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "livestock-blockers",
          label: "Alertes élevage",
          description: "Blocages ou anomalies de production animale.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  TRANSPORT: makeProfile("TRANSPORT", {
    operationsModel: "Transport avec location et gestion de camions bennes, tracteurs, citernes, rotations et charges véhicules.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte transport", true, "Compte ou caisse transport."),
        field("amount", "Montant", true, "Recette de location, carburant, maintenance ou charge."),
        field("description", "Vehicule ou mission", true, "Mission, client, véhicule ou charge concernée.")
      ],
      metadataFields: [
        field("transportService", "Sous-section transport", true, "Location, gestion camion benne, tracteur ou citerne."),
        field("assetType", "Type d'engin", true, "Camion benne, tracteur, citerne ou autre engin."),
        field("vehicleRef", "Référence véhicule", false, "Immatriculation ou code interne."),
        field("routeRef", "Trajet ou mission", false, "Trajet, client ou ordre de mission.")
      ],
      workflow: [
        workflow("CREATE", "Saisie mission", "Le flux est rattaché au service, engin et véhicule si connu."),
        workflow("TRACE", "Suivi véhicule", "Les recettes et charges restent exploitables par engin."),
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
        field("title", "Action transport", true, "Exemple: location, entretien, rotation ou contrôle citerne."),
        field("description", "Vehicule ou mission", true, "Mission, client, véhicule ou problème à traiter."),
        field("assignedToId", "Responsable transport", true, "Chauffeur, gestionnaire ou responsable parc."),
        field("dueDate", "Échéance", true, "Les missions et entretiens doivent être dates.")
      ],
      metadataFields: [
        field("transportService", "Sous-section transport", true, "Location, gestion camion benne, tracteur ou citerne."),
        field("assetType", "Type d'engin", true, "Camion benne, tracteur, citerne ou autre engin."),
        field("vehicleRef", "Référence véhicule", false, "Immatriculation ou code interne."),
        field("routeRef", "Trajet ou mission", false, "Trajet, client ou ordre de mission.")
      ],
      workflow: [
        workflow("PLAN", "Planification mission", "La mission ou action parc est affectée et datée."),
        workflow("EXECUTE", "Exécution transport", "Le responsable suit la rotation, location ou maintenance."),
        workflow("ESCALATE", "Blocage parc", "Tout blocage véhicule remonte pour arbitrage."),
        workflow("CLOSE", "Clôture mission", "Clôture après retour ou vérification.")
      ]
    },
    reporting: {
      focusArea: "Rentabilité et disponibilité du parc transport",
      exportSections: ["locations", "camions bennes", "tracteurs", "citernes", "maintenance", "blocages"],
      operationalDimensions: [
        dimension("transportService", "Sous-section transport", "Compare location et gestion d'engins."),
        dimension("assetType", "Type d'engin", "Mesure les flux et blocages camions bennes, tracteurs et citernes."),
        dimension("vehicleRef", "Vehicule", "Suit rentabilité et disponibilité par véhicule.")
      ],
      highlights: [
        {
          code: "transport-flows",
          label: "Flux transport tracés",
          description: "Flux financiers liés aux missions, locations ou véhicules.",
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
          label: "Blocages véhicules",
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
        field("amount", "Montant", true, "Montant de dépôt, retrait, commission ou charge."),
        field("description", "Opération client", true, "Client, référence, réseau ou motif de l'opération.")
      ],
      metadataFields: [
        field("provider", "Reseau de transaction", true, "Orange Money, Moov Money, Wave, Western Union, MoneyGram ou Ria."),
        field("operationKind", "Type d'opération", true, "Depot, retrait, transfert, commission, approvisionnement ou charge."),
        field("agentPointRef", "Point ou caisse", false, "Guichet, agent, caisse ou telephone de service."),
        field("externalRef", "Référence externe", false, "Référence opérateur ou bordereau client.")
      ],
      workflow: [
        workflow("CREATE", "Saisie guichet", "Le flux est saisi avec réseau et type d'opération."),
        workflow("RECONCILE", "Rapprochement caisse", "Les écarts peuvent être suivis par réseau et guichet."),
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
        field("title", "Action transaction", true, "Exemple: rapprochement Orange Money ou contrôle Wave."),
        field("description", "Reseau ou caisse", true, "Reseau, guichet, écart caisse ou référence à traiter."),
        field("assignedToId", "Responsable guichet", true, "Agent, comptable ou superviseur responsable."),
        field("dueDate", "Échéance", true, "Les rapprochements et écarts doivent être dates.")
      ],
      metadataFields: [
        field("provider", "Reseau de transaction", true, "Orange Money, Moov Money, Wave, Western Union, MoneyGram ou Ria."),
        field("operationKind", "Type d'opération", true, "Depot, retrait, transfert, commission, approvisionnement ou charge."),
        field("agentPointRef", "Point ou caisse", false, "Guichet, agent, caisse ou telephone de service."),
        field("externalRef", "Référence externe", false, "Référence opérateur ou bordereau client.")
      ],
      workflow: [
        workflow("PLAN", "Planification contrôle", "Le contrôle ou rapprochement est affecté."),
        workflow("EXECUTE", "Traitement guichet", "L'agent traite l'opération ou l'écart."),
        workflow("ESCALATE", "Alerte écart", "Un écart bloque remonte en criticité élevée."),
        workflow("CLOSE", "Validation caisse", "Clôture après vérification ou rapprochement.")
      ]
    },
    reporting: {
      focusArea: "Volumes par réseau, écarts caisse et rapprochements",
      exportSections: ["Orange Money", "Moov Money", "Wave", "Western Union", "MoneyGram", "Ria", "écarts"],
      operationalDimensions: [
        dimension("provider", "Reseau de transaction", "Compare volumes, marge et écarts par réseau."),
        dimension("operationKind", "Type d'opération", "Suit depots, retraits, commissions et approvisionnements."),
        dimension("agentPointRef", "Point ou caisse", "Mesure le suivi par guichet ou caisse.")
      ],
      highlights: [
        {
          code: "money-transfer-flows",
          label: "Flux transaction tracés",
          description: "Opérations financières par réseau transactionnel.",
          metric: "transactionsCount",
          thresholds: { warningAt: 10 }
        },
        {
          code: "money-transfer-followup",
          label: "Rapprochements ouverts",
          description: "Contrôles, écarts ou traitements encore ouverts.",
          metric: "openTasksCount",
          thresholds: { warningAt: 4, criticalAt: 8 }
        },
        {
          code: "money-transfer-blockers",
          label: "Ecarts critiques",
          description: "Blocages de caisse ou réseau à arbitrer rapidement.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  HOTEL_LODGING: makeProfile("HOTEL_LODGING", {
    operationsModel: "Hôtellerie et auberge avec suivi détaillé des réservations, séjours, chambres, nuitées, restauration, blanchisserie, evenements, charges et maintenance.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte hotel", true, "Caisse, banque ou compte de l'etablissement."),
        field("amount", "Montant", true, "Nuitee, acompte, restauration, achat ou charge."),
        field("description", "Reservation ou service", true, "Client, chambre, réservation ou charge concernée.")
      ],
      metadataFields: [
        field("hotelOperationKind", "Type d'opération hôtelière", false, "Nuitee, acompte, restauration, evenement, blanchisserie, maintenance, commission, taxe ou remboursement."),
        field("bookingRef", "Référence réservation", true, "Reservation, client ou facture."),
        field("stayRef", "Référence séjour", false, "Sejour, dossier client ou folio."),
        field("guestRef", "Client / hote", false, "Nom, référence client ou organisme."),
        field("roomRef", "Chambre ou unité", false, "Numéro de chambre, dortoir ou unité louee."),
        field("roomType", "Type chambre", false, "Simple, double, suite, dortoir ou bungalow."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge."),
        field("checkInDate", "Date arrivée", false, "Date d'arrivée ou début de séjour."),
        field("checkOutDate", "Date depart", false, "Date de depart ou fin de séjour."),
        field("nightsCount", "Nombre de nuitées", false, "Nombre de nuits facturées."),
        field("roomRate", "Tarif nuitée", false, "Prix par nuit ou tarif chambre."),
        field("guestCount", "Nombre de clients", false, "Nombre de personnes rattachées au séjour."),
        field("mealCount", "Repas / consommations", false, "Nombre de repas, petits dejeuners ou consommations."),
        field("mealUnitPrice", "Prix unitaire repas", false, "Prix unitaire restauration ou consommation."),
        field("serviceQuantity", "Quantité service", false, "Quantité de service hors chambre."),
        field("serviceUnitPrice", "Prix unitaire service", false, "Prix unitaire blanchisserie, evenement ou autre service."),
        field("eventRef", "Evenement", false, "Référence evenement, salle ou prestation groupe."),
        field("supplierRef", "Fournisseur", false, "Prestataire, fournisseur ou agence partenaire."),
        field("invoiceRef", "Référence facture", false, "Facture, reçu, bon ou folio."),
        field("invoiceAmount", "Montant facture", false, "Montant facture ou charge hôtelière."),
        field("commissionAmount", "Commission", false, "Commission agence, plateforme ou intermediaire."),
        field("taxAmount", "Taxe", false, "Taxe de séjour, impot ou taxe appliquée."),
        field("refundAmount", "Montant remboursement", false, "Montant rembourse au client."),
        field("paymentRef", "Référence paiement", false, "Référence caisse, virement ou mobile money.")
      ],
      workflow: [
        workflow("CREATE", "Saisie réception", "Chaque flux précise réservation, séjour, chambre, client et type d'opération."),
        workflow("TRACE", "Suivi séjour", "Les encaissements, charges, services, taxes et remboursements gardent le contexte client."),
        workflow("CONTROL", "Contrôle exploitation", "Les nuitées, restauration, maintenance, commissions et taxes sont isolées pour le suivi."),
        workflow("REPORTING", "Rapport hotelier", "Les recettes, charges, occupation et tâches consolident le rapport par chambre et service.")
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
        field("title", "Action hotel", true, "Exemple: préparation chambre, maintenance ou check-in."),
        field("description", "Chambre ou réservation", true, "Client, chambre, réservation ou intervention."),
        field("assignedToId", "Responsable", false, "Réception, menage, maintenance ou superviseur."),
        field("dueDate", "Échéance", true, "Les actions hôtelières doivent être datées.")
      ],
      metadataFields: [
        field("hotelTaskKind", "Type d'action hôtelière", true, "Check-in, check-out, préparation chambre, menage, maintenance, restauration ou audit."),
        field("bookingRef", "Référence réservation", true, "Reservation, client ou facture."),
        field("stayRef", "Référence séjour", false, "Sejour, dossier client ou folio."),
        field("guestRef", "Client / hote", false, "Nom, référence client ou organisme."),
        field("roomRef", "Chambre ou unité", false, "Numéro de chambre, dortoir ou unité louee."),
        field("roomType", "Type chambre", false, "Simple, double, suite, dortoir ou bungalow."),
        field("serviceLine", "Service", true, "Hebergement, restauration, entretien, evenement ou charge."),
        field("checkInDate", "Date arrivée", false, "Date d'arrivée ou début de séjour."),
        field("checkOutDate", "Date depart", false, "Date de depart ou fin de séjour."),
        field("eventRef", "Evenement", false, "Référence evenement, salle ou prestation groupe."),
        field("supplierRef", "Fournisseur", false, "Prestataire, fournisseur ou agence partenaire."),
        field("issueRef", "Incident / anomalie", false, "Blocage chambre, maintenance, plainte client ou écart réception.")
      ],
      workflow: [
        workflow("PLAN", "Planification séjour", "L'action est rattachée à une réservation, chambre, client ou service."),
        workflow("EXECUTE", "Exécution service", "Réception, menage, maintenance, restauration, blanchisserie ou service client."),
        workflow("ESCALATE", "Alerte exploitation", "Blocage chambre, plainte client ou service critique remonte au management."),
        workflow("CLOSE", "Clôture séjour", "Clôture après vérification du service rendu et mise à jour du rapport.")
      ]
    },
    reporting: {
      focusArea: "Occupation, recettes, charges, nuitées et qualité de service",
      exportSections: ["réservations", "chambres", "séjours", "nuitées", "restauration", "blanchisserie", "maintenance", "commissions", "taxes", "blocages"],
      operationalDimensions: [
        dimension("serviceLine", "Service hotelier", "Compare hebergement, restauration, entretien et evenements."),
        dimension("roomRef", "Chambre ou unité", "Suit rentabilité et interventions par chambre."),
        dimension("bookingRef", "Reservation", "Mesure encaissements et suivi par réservation."),
        dimension("guestRef", "Client", "Suit recettes, remboursements et qualité de service par client."),
        dimension("roomType", "Type chambre", "Analyse occupation et rentabilité par type de chambre.")
      ],
      highlights: [
        {
          code: "hotel-flows",
          label: "Flux hôtel tracés",
          description: "Encaissements et charges rattachés aux réservations ou services.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "hotel-open-actions",
          label: "Actions exploitation ouvertes",
          description: "Réservations, chambres ou interventions encore ouvertes.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "hotel-blockers",
          label: "Blocages hotel",
          description: "Blocages de chambre, réservation ou service.",
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
        field("accountId", "Compte service", true, "Compte de facturation ou de dépense."),
        field("amount", "Montant", true, "Montant du flux."),
        field("description", "Mission", false, "Mission, client ou intervention.")
      ],
      metadataFields: [
        field("serviceType", "Type de service", false, "Type de prestation ou intervention."),
        field("clientRef", "Client", false, "Client, site ou dossier de prestation.")
      ],
      workflow: [
        workflow("CREATE", "Saisie", "Le flux est saisi à la création ou facturation."),
        workflow("PROOF_OPTIONAL", "Justificatif", "Facture ou pièce jointe si disponible."),
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
        workflow("PLAN", "Planification", "Les interventions sont planifiées selon disponibilité."),
        workflow("EXECUTE", "Réalisation", "Exécution de la prestation."),
        workflow("CLOSE", "Clôture", "Clôture une fois la prestation livree.")
      ]
    },
    reporting: {
      focusArea: "Pilotage des prestations",
      exportSections: ["facturation", "interventions", "charge équipe"],
      operationalDimensions: [
        dimension("serviceType", "Type de service", "Compare rentabilité et exécution par type de prestation."),
        dimension("clientRef", "Client", "Suit les flux, interventions et blocages par client.")
      ],
      highlights: [
        {
          code: "service-volume",
          label: "Flux de prestation",
          description: "Opérations financières consolidées sur les services.",
          metric: "transactionsCount",
          thresholds: { warningAt: 5 }
        },
        {
          code: "service-open",
          label: "Prestations ouvertes",
          description: "Interventions encore à livrer ou suivre.",
          metric: "openTasksCount",
          thresholds: { warningAt: 5, criticalAt: 10 }
        },
        {
          code: "service-blocked",
          label: "Prestations bloquées",
          description: "Interventions à arbitrer rapidement.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 3 }
        }
      ]
    }
  }),
  MINING: makeProfile("MINING", {
    operationsModel: "Exploitation minière avec exigences élevées de traçabilité, affectation et traitement des blocages.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte de site", true, "Compte ou caisse rattaché au site minier."),
        field("amount", "Montant", true, "Montant de la recette ou de la charge."),
        field("description", "Site, lot ou équipement", true, "Site, lot, fournisseur ou équipement concerné.")
      ],
      metadataFields: [
        field("siteRef", "Référence site", true, "Site ou zone minière concernée."),
        field("equipmentRef", "Référence équipement", false, "Engin, équipement ou lot associé.")
      ],
      workflow: [
        workflow("CREATE", "Declaration terrain", "Le flux est declare avec référence site ou lot."),
        workflow("TRACE", "Traçabilité forte", "Le contexte d'exploitation conserve la traçabilité du flux."),
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
        field("title", "Opération minière", true, "Exemple: contrôle site, maintenance ou sortie lot."),
        field("description", "Site ou équipement", true, "Site, zone, équipement ou lot concerné."),
        field("assignedToId", "Responsable terrain", true, "Toute opération minière doit être affectée."),
        field("dueDate", "Échéance", true, "Les opérations minières doivent être datées.")
      ],
      metadataFields: [
        field("siteRef", "Référence site", true, "Site ou zone minière concernée."),
        field("equipmentRef", "Référence équipement", false, "Engin, équipement ou lot associé.")
      ],
      workflow: [
        workflow("PLAN", "Ordonnancement", "L'opération est planifiée et affectée à un responsable."),
        workflow("EXECUTE", "Exécution terrain", "Le responsable pilote l'exécution."),
        workflow("ESCALATE", "Escalade blocage", "Tout blocage remonte immédiatement au management."),
        workflow("CLOSE", "Clôture", "Clôture après vérification terrain.")
      ]
    },
    reporting: {
      focusArea: "Traçabilite et risque d'exploitation",
      exportSections: ["flux site", "opérations critiques", "blocages miniers"],
      operationalDimensions: [
        dimension("siteRef", "Site minier", "Suit rentabilité, opérations et risques par site."),
        dimension("equipmentRef", "Équipement", "Mesure les charges et blocages par équipement.")
      ],
      highlights: [
        {
          code: "mining-pending-review",
          label: "Flux miniers suivis",
          description: "Opérations financières minières visibles dans le suivi global.",
          metric: "submittedTransactionsCount",
          thresholds: { warningAt: 1, criticalAt: 4 }
        },
        {
          code: "mining-open-operations",
          label: "Opérations minières ouvertes",
          description: "Opérations terrain encore en cours.",
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
    operationsModel: "Production d'eau potable avec suivi détaillé des stations, forages, zones réseau, volumes produits, volumes facturés, branchements, analyses qualité, énergie, produits de traitement, maintenance et réparations.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte exploitation eau", true, "Compte ou caisse du service d'eau."),
        field("amount", "Montant", true, "Montant de l'opération."),
        field("description", "Site, réseau ou équipement", true, "Station, réseau, intervention ou équipement.")
      ],
      metadataFields: [
        field("waterOperationKind", "Type d'opération eau", false, "Facture eau, vente en gros, branchement, subvention, produits de traitement, énergie, maintenance, analyse qualité, réparation réseau ou fournisseur."),
        field("facilityRef", "Référence site", true, "Station, forage ou réseau concerné."),
        field("networkZone", "Zone réseau", false, "Secteur ou zone de distribution."),
        field("productionLine", "Ligne exploitation", false, "Production, traitement, distribution, branchement, qualité ou maintenance."),
        field("meterRef", "Compteur / point de comptage", false, "Compteur client, compteur production ou point de mesure."),
        field("customerRef", "Abonne / client", false, "Abonne, client institutionnel ou acheteur en gros."),
        field("billingPeriod", "Période facture", false, "Mois, cycle ou période de facturation."),
        field("meterStart", "Index depart", false, "Index compteur en début de période."),
        field("meterEnd", "Index fin", false, "Index compteur en fin de période."),
        field("producedVolumeM3", "Volume produit m3", false, "Volume produit ou pompe sur la période."),
        field("volumeM3", "Volume facture m3", false, "Volume facture, vendu ou distribue."),
        field("unitPrice", "Prix unitaire", false, "Prix du m3, prix unitaire produit ou tarif applicable."),
        field("connectionRef", "Référence branchement", false, "Dossier de nouveau branchement, extension ou raccordement."),
        field("connectionFee", "Frais branchement", false, "Montant encaissé pour le raccordement."),
        field("treatmentProduct", "Produit traitement", false, "Chlore, réactif, filtre, sel ou autre intrant de traitement."),
        field("chemicalQuantity", "Quantité traitement", false, "Quantité de produit de traitement utilisée ou achetée."),
        field("energySource", "Source énergie", false, "Électricité, carburant, solaire, groupe ou autre source."),
        field("energyQuantity", "Quantité énergie", false, "KWh, litres ou unité consommée."),
        field("equipmentRef", "Équipement", false, "Pompe, groupe, réservoir, conduite, vanne ou compteur."),
        field("maintenanceType", "Type maintenance", false, "Préventif, curatif, pompe, réseau, compteur ou réservoir."),
        field("testRef", "Référence analyse", false, "Référence analyse laboratoire ou contrôle terrain."),
        field("waterQuality", "Qualité eau", false, "pH, chlore résiduel, turbidité, bactériologie ou observation."),
        field("issueRef", "Incident / fuite", false, "Fuite, rupture, baisse pression, panne ou réclamation."),
        field("supplierRef", "Fournisseur / prestataire", false, "Fournisseur, laboratoire, technicien ou prestataire."),
        field("invoiceRef", "Référence facture", false, "Facture fournisseur, facture client ou pièce justificative."),
        field("invoiceAmount", "Montant facture", false, "Montant facture fournisseur ou charge rattachée."),
        field("paymentRef", "Référence paiement", false, "Référence encaissement, quittance ou paiement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie exploitation eau", "Le flux est rattaché au site, à la zone réseau, au compteur ou à l'équipement concerné."),
        workflow("TRACE", "Traçabilité technique", "Volumes, compteurs, factures, analyses et interventions documentent les flux."),
        workflow("CONTROL", "Contrôle exploitation", "Les charges critiques, pertes apparentes et blocages réseau sont suivis."),
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
        field("title", "Intervention eau", true, "Exemple: maintenance pompe ou inspection réseau."),
        field("description", "Site ou réseau", true, "Station, réseau, secteur ou équipement."),
        field("assignedToId", "Responsable intervention", true, "Toute intervention eau doit être affectée."),
        field("dueDate", "Échéance", true, "Les interventions d'exploitation doivent être datées.")
      ],
      metadataFields: [
        field("waterTaskKind", "Type d'action eau", true, "Relevé production, contrôle qualité, maintenance pompe, inspection réseau, fuite, relevé compteur, branchement, dosage, recouvrement ou remise en service."),
        field("facilityRef", "Référence site", true, "Station, réseau ou forage concerné."),
        field("networkZone", "Zone réseau", false, "Secteur ou zone de distribution."),
        field("productionLine", "Ligne exploitation", false, "Production, traitement, distribution, branchement, qualité ou maintenance."),
        field("meterRef", "Compteur / point de comptage", false, "Compteur client, compteur production ou point de mesure."),
        field("customerRef", "Abonné / client", false, "Abonné, dossier client ou acheteur concerné."),
        field("equipmentRef", "Équipement", false, "Pompe, réservoir, conduite, compteur, vanne ou groupe."),
        field("testRef", "Référence analyse", false, "Contrôle terrain ou analyse laboratoire."),
        field("waterQuality", "Qualité eau", false, "pH, chlore résiduel, turbidité, bactériologie ou observation."),
        field("issueRef", "Incident / fuite", false, "Fuite, panne, rupture, baisse pression ou réclamation."),
        field("connectionRef", "Référence branchement", false, "Dossier de branchement, extension ou raccordement."),
        field("supplierRef", "Fournisseur / prestataire", false, "Technicien, laboratoire, fournisseur ou prestataire.")
      ],
      workflow: [
        workflow("PLAN", "Planification exploitation", "Intervention planifiée et affectée."),
        workflow("EXECUTE", "Intervention", "Exécution sur site ou réseau."),
        workflow("ESCALATE", "Escalade continuité", "Blocage remonte en priorité pour continuité de service."),
        workflow("CLOSE", "Remise en service", "Clôture après vérification de remise en service.")
      ]
    },
    reporting: {
      focusArea: "Production, distribution, facturation, qualité et continuité de service",
      exportSections: ["volumes produits", "volumes facturés", "recettes eau", "charges exploitation", "qualité", "maintenance", "réparations réseau", "blocages critiques"],
      operationalDimensions: [
        dimension("facilityRef", "Site eau", "Mesure coûts, interventions et continuité par station ou forage."),
        dimension("networkZone", "Zone réseau", "Suit les blocages et interventions par zone de distribution."),
        dimension("productionLine", "Ligne exploitation", "Compare production, traitement, distribution, qualité et maintenance."),
        dimension("meterRef", "Compteur", "Isole les volumes facturés et relevés par compteur.")
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
          description: "Interventions réseau ou station encore en cours.",
          metric: "openTasksCount",
          thresholds: { warningAt: 2, criticalAt: 5 }
        },
        {
          code: "water-critical-blockers",
          label: "Blocages de continuité",
          description: "Blocages techniques menacant la continuité du service.",
          metric: "blockedTasksCount",
          thresholds: { warningAt: 1, criticalAt: 2 }
        }
      ]
    }
  }),
  REAL_ESTATE_AGENCY: makeProfile("REAL_ESTATE_AGENCY", {
    operationsModel: "Agence immobilière avec suivi détaillé des mandats, biens, proprietaires, prospects, visites, offres, dossiers de vente ou location, commissions, frais commerciaux, documents et closing.",
    finance: {
      allowedTransactionTypes: ["CASH_IN", "CASH_OUT"],
      allowedCurrencies: ["XOF", "EUR", "USD"],
      requiresDescription: true,
      requiresProof: false,
      fields: [
        field("accountId", "Compte agence", true, "Compte ou caisse de l'agence."),
        field("amount", "Montant", true, "Montant de la commission, avance ou dépense."),
        field("description", "Mandat ou bien", true, "Référence du mandat, bien ou dossier commercial.")
      ],
      metadataFields: [
        field("agencyOperationKind", "Type d'opération agence", false, "Commission vente, commission location, frais mandat, visite, dossier, publicité, déplacement, reversement courtier, documents ou remboursement."),
        field("mandateRef", "Référence mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Référence bien", true, "Bien, lot, terrain, villa, appartement ou local concerné."),
        field("mandateType", "Type mandat", false, "Vente, location, gestion, recherche ou exclusivite."),
        field("propertyType", "Type de bien", false, "Villa, appartement, terrain, bureau, magasin, immeuble ou local."),
        field("locationZone", "Zone / quartier", false, "Quartier, commune ou zone commerciale."),
        field("ownerRef", "Propriétaire", false, "Propriétaire, bailleur ou vendeur."),
        field("clientRef", "Client / acquéreur", false, "Client, locataire, acquéreur ou entreprise intéressée."),
        field("prospectRef", "Prospect", false, "Prospect, contact ou lead commercial."),
        field("dealRef", "Référence affaire", false, "Offre, compromis, bail, promesse ou dossier de closing."),
        field("dealStage", "Étape affaire", false, "Prospection, visite, offre, négociation, compromis, bail, acte ou clôture."),
        field("dealAmount", "Montant affaire", false, "Prix de vente, loyer annuel, valeur du bail ou base de commission."),
        field("commissionRate", "Taux commission %", false, "Taux de commission appliqué au dossier."),
        field("commissionAmount", "Montant commission", false, "Commission agence encaissée ou attendue."),
        field("feeAmount", "Montant frais", false, "Frais de dossier, visite, mandat ou service."),
        field("visitCount", "Nombre visites", false, "Nombre de visites facturées ou réalisées."),
        field("unitPrice", "Prix unitaire", false, "Prix par visite, annonce ou prestation."),
        field("advertisingChannel", "Canal publicité", false, "Facebook, portail immobilier, panneau, radio, affichage ou autre canal."),
        field("documentRef", "Référence document", false, "Titre foncier, attestation, bail, compromis, acte ou dossier administratif."),
        field("supplierRef", "Prestataire / courtier", false, "Courtier partenaire, photographe, imprimeur, notaire, géomètre ou prestataire."),
        field("invoiceRef", "Référence facture", false, "Facture, reçu, note de frais ou pièce commerciale."),
        field("expenseAmount", "Montant dépense", false, "Dépense commerciale, publicité, déplacement, document ou charge agence."),
        field("payoutAmount", "Montant reversé", false, "Part courtier, apporteur, partenaire ou rétrocession."),
        field("refundAmount", "Montant rembourse", false, "Remboursement client ou annulation de frais."),
        field("paymentRef", "Référence paiement", false, "Référence encaissement, quittance, reçu ou virement.")
      ],
      workflow: [
        workflow("CREATE", "Saisie dossier agence", "Le flux est rattaché au mandat, au bien, au client et à l'étape commerciale."),
        workflow("TRACE", "Traçabilité commerciale", "Mandat, affaire, paiement, facture et document conservent le suivi du dossier."),
        workflow("CONTROL", "Contrôle commission", "Les commissions, frais, rétrocessions et charges commerciales sont contrôlés."),
        workflow("REPORTING", "Rapport agence", "Les mandats, biens, recettes, dépenses et actions alimentent le rapport sectoriel.")
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
        field("description", "Bien ou dossier", true, "Bien, client, mandat ou étape commerciale."),
        field("assignedToId", "Charge d'affaire", true, "Chaque dossier doit avoir un responsable."),
        field("dueDate", "Échéance", true, "Les actions commerciales doivent être planifiées.")
      ],
      metadataFields: [
        field("agencyTaskKind", "Type d'action agence", true, "Mandat, estimation, publication, prospection, visite, offre, documents, notaire, signature, recouvrement commission ou reporting propriétaire."),
        field("mandateRef", "Référence mandat", true, "Mandat ou dossier commercial."),
        field("propertyRef", "Référence bien", true, "Bien, lot, terrain, villa, appartement ou local concerné."),
        field("mandateType", "Type mandat", false, "Vente, location, gestion, recherche ou exclusivite."),
        field("propertyType", "Type de bien", false, "Villa, appartement, terrain, bureau, magasin, immeuble ou local."),
        field("locationZone", "Zone / quartier", false, "Quartier, commune ou zone commerciale."),
        field("ownerRef", "Propriétaire", false, "Propriétaire, bailleur ou vendeur."),
        field("clientRef", "Client / acquéreur", false, "Client, locataire, acquéreur ou entreprise intéressée."),
        field("prospectRef", "Prospect", false, "Prospect, contact ou lead commercial."),
        field("dealRef", "Référence affaire", false, "Offre, compromis, bail, promesse ou dossier de closing."),
        field("dealStage", "Étape affaire", false, "Prospection, visite, offre, négociation, compromis, bail, acte ou clôture."),
        field("documentRef", "Référence document", false, "Titre foncier, attestation, bail, compromis, acte ou dossier administratif."),
        field("issueRef", "Blocage dossier", false, "Document manquant, client indisponible, litige, prix, notaire ou validation propriétaire."),
        field("supplierRef", "Prestataire / courtier", false, "Courtier partenaire, notaire, géomètre, photographe ou prestataire.")
      ],
      workflow: [
        workflow("PLAN", "Planification commerciale", "Le dossier est affecté et daté."),
        workflow("EXECUTE", "Exécution", "Visite, relance ou traitement du mandat."),
        workflow("FOLLOW_UP", "Suivi dossier", "Le charge d'affaire alimenté le suivi."),
        workflow("CLOSE", "Clôture", "Clôture une fois l'étape commerciale finalisée.")
      ]
    },
    reporting: {
      focusArea: "Mandats, biens, pipeline commercial, commissions et rentabilité agence",
      exportSections: ["mandats", "biens", "pipeline", "visites", "offres", "commissions", "frais commerciaux", "documents", "blocages dossier"],
      operationalDimensions: [
        dimension("mandateRef", "Mandat", "Suit rentabilité et exécution par mandat commercial."),
        dimension("propertyRef", "Bien", "Mesure les flux et actions par bien."),
        dimension("dealStage", "Étape affaire", "Compare les dossiers par étape commerciale."),
        dimension("clientRef", "Client", "Suit prospects, clients, acquéreurs ou locataires.")
      ],
      highlights: [
        {
          code: "agency-commercial-flow",
          label: "Flux commerciaux tracés",
          description: "Flux financiers rattachés à des mandats ou biens.",
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
      `Le secteur ${profile.label} exige une description métier pour chaque transaction.`
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
      `Le secteur ${profile.label} exige une description métier pour chaque tâche.`
    );
  }
  if (profile.tasks.requiresAssignee && !input.assignedToId?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige qu'une tâche soit assignée dès sa création.`
    );
  }
  if (profile.tasks.requiresDueDate && !input.dueDate?.trim()) {
    throw new Error(
      `Le secteur ${profile.label} exige une échéance pour chaque tâche.`
    );
  }
  assertRequiredMetadataFields(
    profile.label,
    "tâche",
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
      `Le secteur ${profile.label} interdit de terminer une tâche non assignée.`
    );
  }
  if (nextStatus === "BLOCKED" && profile.tasks.blockedRequiresAssignee && !task.assignedToId) {
    throw new Error(
      `Le secteur ${profile.label} interdit de bloquer une tâche sans responsable assigné.`
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

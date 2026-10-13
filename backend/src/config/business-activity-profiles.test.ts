import { describe, expect, it } from "vitest";
import {
  assertTaskInputMatchesActivityProfile,
  assertTransactionInputMatchesActivityProfile,
  getBusinessActivityProfile
} from "./business-activity-profiles.js";

describe("hardware recipient validation", () => {
  it("requires a recipient and the matching cash flow for purchases and recoveries", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("HARDWARE", {
      type: "CASH_OUT", currency: "XOF",
      metadata: { hardwareOperationKind: "ITEM_ENTRY", recipientRef: "Quincaillerie A" }
    })).not.toThrow();
    expect(() => assertTransactionInputMatchesActivityProfile("HARDWARE", {
      type: "CASH_IN", currency: "XOF",
      metadata: { hardwareOperationKind: "RECOUVREMENT", recipientRef: "Quincaillerie A" }
    })).not.toThrow();
    expect(() => assertTransactionInputMatchesActivityProfile("HARDWARE", {
      type: "CASH_IN", currency: "XOF",
      metadata: { hardwareOperationKind: "RECOUVREMENT" }
    })).toThrow(/destinataire/);
    expect(() => assertTransactionInputMatchesActivityProfile("HARDWARE", {
      type: "CASH_OUT", currency: "XOF",
      metadata: { hardwareOperationKind: "RECOUVREMENT", recipientRef: "Quincaillerie A" }
    })).toThrow(/type de flux/);
    expect(() => assertTransactionInputMatchesActivityProfile("HARDWARE", {
      type: "CASH_IN", currency: "XOF", metadata: { hardwareOperationKind: "GLOBAL" }
    })).not.toThrow();
  });
});

describe("dump truck transaction validation", () => {
  it("exposes dump truck operations as a transport reporting dimension", () => {
    const profile = getBusinessActivityProfile("TRANSPORT");

    expect(profile.finance.metadataFields?.find((field) => field.key === "transportCategory")?.options)
      .toContain("Camion benne");
    expect(profile.reporting.operationalDimensions?.map((dimension) => dimension.key))
      .toContain("dumpTruckOperationKind");
    expect(profile.finance.metadataFields?.find((field) => field.key === "transportCategory")?.options)
      .not.toContain("Citerne");
  });

  it("keeps existing transport transactions valid without the dump truck category", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "25000",
      currency: "XOF",
      description: "Entretien tracteur",
      metadata: {
        transportCategory: "Tracteur",
        transportService: "Gestion tracteur",
        assetType: "Tracteur"
      }
    })).not.toThrow();

    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "25000",
      currency: "XOF",
      description: "Ancien suivi citerne",
      metadata: { transportCategory: "Citerne", assetType: "Citerne" }
    })).not.toThrow();
  });

  it("accepts a work trip with a calculated gross amount", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_IN",
      amount: "420000.00",
      currency: "XOF",
      description: "Voyage de banco vers Koursalé",
      metadata: {
        transportService: "Gestion camion benne",
        transportCategory: "Camion benne",
        dumpTruckOperationKind: "TRAVAUX",
        assetType: "Camion benne",
        vehicleRef: "AB-1234-MD",
        routeRef: "Koursalé",
        quantity: "3",
        purchaseUnitPrice: "140000",
        amccoAmount: "315000"
      }
    })).not.toThrow();
  });

  it("rejects truck transactions with a mismatched flow or incorrect trip total", () => {
    const baseMetadata = {
      transportService: "Gestion camion benne",
      transportCategory: "Camion benne",
      dumpTruckOperationKind: "TRAVAUX",
      assetType: "Camion benne",
      vehicleRef: "AB-1234-MD",
      routeRef: "Koursalé",
      quantity: "3",
      purchaseUnitPrice: "140000"
    };

    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "420000",
      currency: "XOF",
      description: "Voyage de banco vers Koursalé",
      metadata: baseMetadata
    })).toThrow(/type de flux/);

    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_IN",
      amount: "400000",
      currency: "XOF",
      description: "Voyage de banco vers Koursalé",
      metadata: baseMetadata
    })).toThrow(/nombre de voyages multiplié/);
  });

  it("requires a route and prevents the AMCCO share from exceeding the gross amount", () => {
    const base = {
      type: "CASH_IN" as const,
      amount: "420000",
      currency: "XOF",
      description: "Travaux camion benne",
      metadata: {
        transportService: "Gestion camion benne",
        transportCategory: "Camion benne",
        dumpTruckOperationKind: "TRAVAUX",
        assetType: "Camion benne",
        vehicleRef: "AB-1234-MD",
        quantity: "3",
        purchaseUnitPrice: "140000",
        amccoAmount: "450000"
      }
    };

    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", base))
      .toThrow(/trajet, chantier ou ordre de mission/);

    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      ...base,
      metadata: { ...base.metadata, routeRef: "Koursalé" }
    })).toThrow(/part AMCCO ne peut pas dépasser/);
  });

  it("requires an expense category for truck maintenance and other charges", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "240000",
      currency: "XOF",
      description: "Achat de pneus",
      metadata: {
        transportService: "Gestion camion benne",
        transportCategory: "Camion benne",
        dumpTruckOperationKind: "ENTRETIEN",
        assetType: "Camion benne",
        vehicleRef: "AB-1234-MD"
      }
    })).toThrow(/nature de la dépense/);
  });

  it("requires the counterparty when recording an AMCCO payment", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "250000",
      currency: "XOF",
      description: "Versement AMCCO",
      metadata: {
        transportService: "Gestion camion benne",
        transportCategory: "Camion benne",
        dumpTruckOperationKind: "VERSEMENT_AMCCO",
        assetType: "Camion benne",
        vehicleRef: "AB-1234-MD"
      }
    })).toThrow(/client ou partenaire/);
  });
});

describe("transport task validation", () => {
  it("requires a supported vehicle category and accepts task details", () => {
    const profile = getBusinessActivityProfile("TRANSPORT");
    const fields = profile.tasks.metadataFields ?? [];
    expect(fields.find((field) => field.key === "transportCategory")?.required).toBe(true);
    expect(fields.find((field) => field.key === "transportTaskKind")?.options)
      .toContain("Entretien");
    expect(fields.find((field) => field.key === "assetType")?.required).toBe(false);

    expect(() => assertTaskInputMatchesActivityProfile("TRANSPORT", {
      description: "Entretenir le camion au dépôt",
      assignedToId: "driver-1",
      dueDate: "2026-10-20T09:00:00.000Z",
      metadata: {
        transportCategory: "Camion benne",
        transportTaskKind: "Entretien",
        vehicleRef: "TR-001"
      }
    })).not.toThrow();
  });

  it("rejects unsupported vehicle and intervention values", () => {
    const base = {
      description: "Vérifier le véhicule",
      assignedToId: "driver-1",
      dueDate: "2026-10-20T09:00:00.000Z"
    };

    expect(() => assertTaskInputMatchesActivityProfile("TRANSPORT", {
      ...base,
      metadata: { transportCategory: "Vélo" }
    })).toThrow(/type de véhicule Transport valide/);
    expect(() => assertTaskInputMatchesActivityProfile("TRANSPORT", {
      ...base,
      metadata: { transportCategory: "Tracteur", transportTaskKind: "Non reconnu" }
    })).toThrow(/type d'intervention Transport valide/);
  });
});

describe("hydrocarbon cistern category", () => {
  it("places Citerne in Hydrocarbure with a traceable equipment reference", () => {
    const profile = getBusinessActivityProfile("HYDROCARBON");
    const categoryField = profile.finance.metadataFields?.find((field) => field.key === "hydrocarbonCategory");

    expect(categoryField?.required).toBe(true);
    expect(categoryField?.options).toContain("Citerne");
    expect(profile.finance.metadataFields?.map((field) => field.key)).toContain("hydrocarbonAssetRef");
    expect(profile.reporting.operationalDimensions?.map((entry) => entry.key))
      .toContain("hydrocarbonAssetRef");
  });

  it("requires a reference for cistern transactions while accepting other categories", () => {
    const base = {
      type: "CASH_IN" as const,
      amount: "100000",
      currency: "XOF",
      description: "Opération hydrocarbure"
    };

    expect(() => assertTransactionInputMatchesActivityProfile("HYDROCARBON", {
      ...base,
      metadata: { hydrocarbonCategory: "Citerne" }
    })).toThrow(/référence de la citerne/);

    expect(() => assertTransactionInputMatchesActivityProfile("HYDROCARBON", {
      ...base,
      metadata: { hydrocarbonCategory: "Citerne", hydrocarbonAssetRef: "CT-001" }
    })).not.toThrow();

    expect(() => assertTransactionInputMatchesActivityProfile("HYDROCARBON", {
      ...base,
      metadata: { hydrocarbonCategory: "Carburant" }
    })).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
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
  });

  it("keeps existing transport transactions valid without the dump truck category", () => {
    expect(() => assertTransactionInputMatchesActivityProfile("TRANSPORT", {
      type: "CASH_OUT",
      amount: "25000",
      currency: "XOF",
      description: "Entretien tracteur",
      metadata: {
        transportService: "Gestion tracteur",
        assetType: "Tracteur"
      }
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

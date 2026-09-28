import { describe, expect, it } from "vitest";
import { assertTransactionInputMatchesActivityProfile } from "./business-activity-profiles.js";

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

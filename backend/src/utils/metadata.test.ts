import { describe, expect, it } from "vitest";
import { toMetadataStringMap } from "./metadata.js";

describe("toMetadataStringMap", () => {
  it("keeps string metadata and converts JSON scalar values to strings", () => {
    expect(
      toMetadataStringMap({
        productFamily: "Ciment",
        quantity: 12,
        saleUnitPrice: 4500.5,
        isUrgent: true,
        ignored: null,
        nested: { value: "not supported" },
        list: ["not supported"]
      })
    ).toEqual({
      productFamily: "Ciment",
      quantity: "12",
      saleUnitPrice: "4500.5",
      isUrgent: "true"
    });
  });

  it("parses stringified JSON metadata", () => {
    expect(toMetadataStringMap('{"quantity":10,"productFamily":"Fer"}')).toEqual({
      quantity: "10",
      productFamily: "Fer"
    });
  });

  it("returns an empty map for invalid metadata", () => {
    expect(toMetadataStringMap("{invalid")).toEqual({});
    expect(toMetadataStringMap(["quantity"])).toEqual({});
  });
});

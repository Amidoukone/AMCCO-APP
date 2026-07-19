import { describe, expect, it } from "vitest";
import { repairMojibakeText } from "./text-encoding.js";

describe("repairMojibakeText", () => {
  it("repairs common French mojibake sequences", () => {
    expect(
      repairMojibakeText(
        "Soci\u00c3\u00a9t\u00c3\u00a9 C\u00c3\u00b4te d'Ivoire - H\u00c3\u00b4tellerie - S\u00c3\u00a9gou"
      )
    ).toBe("Société Côte d'Ivoire - Hôtellerie - Ségou");
  });

  it("repairs Windows-1252 variants for uppercase letters and ligatures", () => {
    expect(repairMojibakeText("\u00c3\u2030tat - c\u00c5\u201cur d'activit\u00c3\u00a9")).toBe(
      "État - cœur d'activité"
    );
  });
});

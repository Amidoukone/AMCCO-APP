import { describe, expect, it } from "vitest";
import { buildListSearchFilters } from "./list-search.js";

describe("literal list search", () => {
  it("leaves requests without a search unchanged", () => {
    expect(buildListSearchFilters(undefined, ["t.title"])).toEqual({ filters: [], values: [] });
    expect(buildListSearchFilters("  ", ["t.title"])).toEqual({ filters: [], values: [] });
  });

  it("requires every term, allowing matches in different fields", () => {
    const result = buildListSearchFilters("  ciment   Bamako ", ["t.description", "t.metadata_json"]);
    expect(result.filters).toHaveLength(2);
    expect(result.filters[0]).toBe("(COALESCE(t.description, '') LIKE ? ESCAPE '!' OR COALESCE(t.metadata_json, '') LIKE ? ESCAPE '!')");
    expect(result.values).toEqual(["%ciment%", "%ciment%", "%Bamako%", "%Bamako%"]);
  });

  it("treats wildcards and SQL syntax as literal parameter values", () => {
    const result = buildListSearchFilters("50%_! 'OR'", ["t.title"]);
    expect(result.values).toEqual(["%50!%!_!!%", "%'OR'%"]);
    expect(result.filters.join(" ")).not.toContain("50");
    expect(result.filters.join(" ")).not.toContain("'OR'");
  });
});

// Use a literal LIKE pattern: user-entered %, _ and ! must not act as wildcards.
export function buildListSearchFilters(search: string | undefined, columns: string[]) {
  const terms = (search ?? "").trim().split(/\s+/).filter(Boolean);
  return {
    filters: terms.map(() => `(${columns.map((column) => `COALESCE(${column}, '') LIKE ? ESCAPE '!'`).join(" OR ")})`),
    values: terms.flatMap((term) => columns.map(() => `%${term.replace(/[!%_]/g, "!$&")}%`))
  };
}

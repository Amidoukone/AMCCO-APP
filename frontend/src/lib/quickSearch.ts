function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesQuickSearch(query: string, values: Array<string | null | undefined>): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 0);
  const haystack = normalizeSearchValue(values.filter((value): value is string => Boolean(value)).join(" "));

  return terms.every((term) => haystack.includes(term));
}

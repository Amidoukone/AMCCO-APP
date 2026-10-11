function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildQuickSearchText(values: Array<string | null | undefined>): string {
  return normalizeSearchValue(values.filter((value): value is string => Boolean(value)).join(" "));
}

export function createQuickSearchMatcher(query: string): (searchText: string) => boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return () => true;
  }

  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 0);
  return (searchText) => terms.every((term) => searchText.includes(term));
}

export function matchesQuickSearch(query: string, values: Array<string | null | undefined>): boolean {
  return createQuickSearchMatcher(query)(buildQuickSearchText(values));
}

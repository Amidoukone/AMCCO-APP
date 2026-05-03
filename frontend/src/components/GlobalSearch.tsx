import { useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { isReadOnlyOwnerRole } from "../config/permissions";
import { matchesQuickSearch } from "../lib/quickSearch";
import type { NavigationItem } from "../config/permissions";
import type { RoleCode } from "../types/role";

type SearchItem = {
  label: string;
  description: string;
  to: string;
  keywords: string[];
};

type GlobalSearchProps = {
  navigation: NavigationItem[];
  role: RoleCode;
  selectedActivityCode: string | null;
};

function buildSearchItems(
  navigation: NavigationItem[],
  role: RoleCode,
  selectedActivityCode: string | null
): SearchItem[] {
  const isReadOnlyOwner = isReadOnlyOwnerRole(role);
  const activityQuery = selectedActivityCode ? `?activityCode=${selectedActivityCode}` : "";
  const items: SearchItem[] = navigation.map((item) => ({
    label: item.label,
    description: item.section,
    to: item.to,
    keywords: [item.label, item.section, item.key]
  }));

  items.push(
    {
      label: "Mon travail",
      description: "Taches ouvertes, validations et echeances",
      to: "/my-work",
      keywords: ["mon travail", "mes taches", "a faire", "echeances", "urgent"]
    },
    {
      label: isReadOnlyOwner ? "Voir les taches" : "Creer une tache",
      description: "Voir les taches",
      to: `/operations/tasks${activityQuery}`,
      keywords: isReadOnlyOwner
        ? ["taches", "operations", "suivi", "controle"]
        : ["nouvelle tache", "creer tache", "assigner", "operation"]
    },
    {
      label: isReadOnlyOwner ? "Voir les transactions" : "Creer une transaction",
      description: "Voir les transactions",
      to: `/finance/transactions${activityQuery}`,
      keywords: isReadOnlyOwner
        ? ["transactions", "finance", "controle", "caisse"]
        : ["nouvelle transaction", "finance", "caisse", "depense", "recette"]
    },
    {
      label: "Alertes",
      description: "Consulter les notifications a traiter",
      to: "/alerts",
      keywords: ["alerte", "notification", "risque"]
    }
  );

  return items;
}

export function GlobalSearch({
  navigation,
  role,
  selectedActivityCode
}: GlobalSearchProps): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const items = useMemo(
    () => buildSearchItems(navigation, role, selectedActivityCode),
    [navigation, role, selectedActivityCode]
  );
  const results = useMemo(() => {
    if (!query.trim()) {
      return items.slice(0, 5);
    }
    return items
      .filter((item) => matchesQuickSearch(query, [item.label, item.description, ...item.keywords]))
      .slice(0, 6);
  }, [items, query]);

  function openResult(to: string): void {
    setQuery("");
    setIsFocused(false);
    navigate(to);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" && results[0]) {
      event.preventDefault();
      openResult(results[0].to);
    }
    if (event.key === "Escape") {
      setQuery("");
      setIsFocused(false);
    }
  }

  return (
    <div className="global-search">
      <label htmlFor="global-search-input">Recherche</label>
      <input
        id="global-search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => window.setTimeout(() => setIsFocused(false), 120)}
        placeholder="Rechercher une page ou une action..."
        autoComplete="off"
      />
      {isFocused ? (
        <div className="global-search-results">
          {results.length === 0 ? (
            <p>Aucun raccourci trouve.</p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.label}-${result.to}`}
                type="button"
                onClick={() => openResult(result.to)}
              >
                <strong>{result.label}</strong>
                <span>{result.description}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

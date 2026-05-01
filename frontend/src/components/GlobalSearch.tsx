import { useMemo, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { matchesQuickSearch } from "../lib/quickSearch";
import type { NavigationItem } from "../config/permissions";

type SearchItem = {
  label: string;
  description: string;
  to: string;
  keywords: string[];
};

type GlobalSearchProps = {
  navigation: NavigationItem[];
  selectedActivityCode: string | null;
};

function buildSearchItems(
  navigation: NavigationItem[],
  selectedActivityCode: string | null
): SearchItem[] {
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
      description: "Tâches ouvertes, validations et échéances",
      to: "/my-work",
      keywords: ["mon travail", "mes tâches", "à faire", "échéances", "urgent"]
    },
    {
      label: "Créer une tâche",
      description: "Voir les tâches",
      to: `/operations/tasks${activityQuery}`,
      keywords: ["nouvelle tâche", "créer tâche", "assigner", "opération"]
    },
    {
      label: "Créer une transaction",
      description: "Voir les transactions",
      to: `/finance/transactions${activityQuery}`,
      keywords: ["nouvelle transaction", "finance", "caisse", "dépense", "recette"]
    },
    {
      label: "Alertes",
      description: "Consulter les notifications à traiter",
      to: "/alerts",
      keywords: ["alerte", "notification", "risque"]
    }
  );

  return items;
}

export function GlobalSearch({
  navigation,
  selectedActivityCode
}: GlobalSearchProps): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const items = useMemo(
    () => buildSearchItems(navigation, selectedActivityCode),
    [navigation, selectedActivityCode]
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
            <p>Aucun raccourci trouvé.</p>
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

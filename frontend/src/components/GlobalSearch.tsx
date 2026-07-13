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
  const canUse = (key: NavigationItem["key"]): boolean =>
    navigation.some((item) => item.key === key);
  const items: SearchItem[] = navigation.map((item) => ({
    label: item.label,
    description: item.section,
    to: item.to,
    keywords: [item.label, item.section, item.key]
  }));

  const shortcuts: SearchItem[] = [
    canUse("myWork")
      ? {
          label: "Mon travail",
          description: "T\u00e2ches ouvertes, validations et \u00e9ch\u00e9ances",
          to: "/my-work",
          keywords: ["mon travail", "mes t\u00e2ches", "\u00e0 faire", "\u00e9ch\u00e9ances", "urgent"]
        }
      : null,
    canUse("operationsTasks")
      ? {
      label: isReadOnlyOwner ? "Voir les t\u00e2ches" : "Cr\u00e9er une t\u00e2che",
      description: "Voir les t\u00e2ches",
      to: `/operations/tasks${activityQuery}`,
      keywords: isReadOnlyOwner
        ? ["t\u00e2ches", "op\u00e9rations", "suivi", "contr\u00f4le"]
        : ["nouvelle t\u00e2che", "cr\u00e9er t\u00e2che", "assigner", "op\u00e9ration"]
        }
      : null,
    canUse("financeTransactions")
      ? {
      label: isReadOnlyOwner ? "Voir les transactions" : "Cr\u00e9er une transaction",
      description: "Voir les transactions",
      to: `/finance/transactions${activityQuery}`,
      keywords: isReadOnlyOwner
        ? ["transactions", "finance", "contr\u00f4le", "caisse"]
        : ["nouvelle transaction", "finance", "caisse", "d\u00e9pense", "recette"]
        }
      : null,
    canUse("reports")
      ? {
          label: isReadOnlyOwner ? "Vue propriétaire" : "Rapports",
          description: isReadOnlyOwner ? "Contrôle, synthèse et exports" : "Exports PDF et Excel",
          to: isReadOnlyOwner ? "/dashboard" : "/reports",
          keywords: isReadOnlyOwner
            ? ["propriétaire", "controle", "pilotage", "synthese", "vue propriétaire"]
            : ["rapport", "export", "pdf", "excel"]
        }
      : null,
    canUse("alerts")
      ? {
          label: "Alertes",
          description: "Consulter les notifications \u00e0 traiter",
          to: "/alerts",
          keywords: ["alerte", "notification", "risque"]
        }
      : null
  ].filter((item): item is SearchItem => item !== null);

  items.push(
    ...shortcuts
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
            <p>Aucun raccourci trouv\u00e9.</p>
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

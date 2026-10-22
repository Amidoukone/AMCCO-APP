import { useState, type ReactNode } from "react";
import { matchesQuickSearch } from "../lib/quickSearch";

type Props<T> = {
  title: string;
  searchLabel: string;
  emptyMessage: string;
  noResultsMessage: string;
  records: T[];
  getSearchValues: (record: T) => Array<string | null | undefined>;
  renderDetails: (record: T) => ReactNode;
  busyId: string | null;
  isSaving: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  onReload: () => void;
  onEdit: (record: T) => void;
  onDelete: (record: T) => void;
  sectionId: string;
  formTitle: string;
  formDescription: string;
  isExpanded: boolean;
  onExpandedChange: (value: boolean) => void;
  children: ReactNode;
};

export function SectorDirectoryPanel<T extends { id: string; name: string }>({
  title, searchLabel, emptyMessage, noResultsMessage, records, getSearchValues,
  renderDetails, busyId, isSaving, isLoading, hasLoaded, onReload, onEdit, onDelete,
  sectionId, formTitle, formDescription, isExpanded, onExpandedChange, children
}: Props<T>): JSX.Element {
  const [search, setSearch] = useState("");
  const filtered = records.filter((record) => matchesQuickSearch(search, getSearchValues(record)));
  return (
    <>
      <section className="panel finance-page-panel" aria-label={title}>
        <div className="dashboard-panel-header">
          <h3>{title}{hasLoaded && !isLoading ? ` (${records.length})` : ""}</h3>
          <button type="button" className="secondary-btn" disabled={isLoading || isSaving} onClick={onReload}>Actualiser</button>
        </div>
        <label className="operations-inline-group">
          <span>{searchLabel}</span>
          <input type="search" className="quick-search-input" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        {isLoading ? <p role="status">Chargement en cours…</p> : !hasLoaded ? (
          <div>
            <p className="hint" role="alert">La liste n’a pas pu être chargée.</p>
            <button type="button" className="secondary-btn" onClick={onReload}>Réessayer</button>
          </div>
        ) : filtered.length > 0 ? (
          <div className="operations-member-grid">
            {filtered.map((record) => (
              <article key={record.id} className="operations-member-card">
                <h4>{record.name}</h4>
                {renderDetails(record)}
                <div className="actions-inline">
                  <button type="button" className="secondary-btn" disabled={isSaving || busyId === record.id} onClick={() => onEdit(record)}>Modifier</button>
                  <button type="button" className="danger-btn" disabled={isSaving || busyId === record.id} onClick={() => onDelete(record)}>Supprimer</button>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="hint" role="status">{search.trim() ? noResultsMessage : emptyMessage}</p>}
      </section>
      <section className="panel finance-page-panel">
        <details id={sectionId} className="finance-section-toggle" open={isExpanded} onToggle={(event) => onExpandedChange(event.currentTarget.open)}>
          <summary className="finance-section-summary">
            <span>{formTitle}</span>
            <small>{formDescription}</small>
          </summary>
          {children}
        </details>
      </section>
    </>
  );
}

import type { SectorTransactionPreset, SectorTransactionWorkspace } from "../config/sectorTransactionWorkspaces";

type Props = {
  workspace: SectorTransactionWorkspace;
  onSelect: (preset: SectorTransactionPreset) => void;
  disabled: boolean;
};

export function SectorTransactionActions({ workspace, onSelect, disabled }: Props): JSX.Element {
  return (
    <section className="panel finance-page-panel" aria-label="Saisie rapide du secteur">
      <h3>Nouvelle opération</h3>
      <p className="hint">{workspace.helpText}</p>
      <div className="sector-page-shortcuts-actions" role="group" aria-label="Choisir une opération">
        {workspace.presets.map((preset) => (
          <button key={preset.id} type="button" className="secondary-btn" disabled={disabled} onClick={() => onSelect(preset)}>{preset.label}</button>
        ))}
      </div>
    </section>
  );
}

import type { ReportsOverview } from "../types/reporting";
import { formatAmountForDisplay } from "../lib/amountFormatting";
import { getSectorRecordContext } from "../utils/sectorRecordContext";

const STATUS: Record<string, string> = { TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Terminée", BLOCKED: "Bloquée" };
const date = (value: string) => new Date(value).toLocaleDateString("fr-FR");

export function FieldSectorReport({ overview }: { overview: ReportsOverview }): JSX.Element | null {
  const report = overview.fieldOperationsReport;
  if (!report) return null;
  const accounted = report.transactions.filter((row) => ["SUBMITTED", "APPROVED"].includes(row.status));
  const currencies = [...new Set(accounted.map((row) => row.currency))].sort();
  const dimensions = overview.operationalPerformance.filter((row) => row.scope === "SUBSECTION" && row.activityCode === overview.filters.activityCode);
  const context = (code: typeof overview.filters.activityCode, metadata: Record<string, string>) => {
    const fields = [...getSectorRecordContext(code, metadata), ...(code === "SERVICES" && metadata.serviceCategory?.trim() ? [{ label: "Catégorie", value: metadata.serviceCategory }] : [])];
    return fields.length ? fields.map((field) => `${field.label} : ${field.value}`).join(" · ") : "Non renseigné";
  };
  return (
    <section className="panel" aria-label="Rapport métier détaillé">
      <h3>Rapport {overview.activityProfile?.label}</h3>
      <p className="hint">Opérations enregistrées ou finalisées, séparées par devise. Les brouillons et rejets sont exclus des montants.</p>
      {!accounted.length ? <p>Aucune opération comptabilisée sur la période sélectionnée.</p> : null}
      {currencies.map((currency) => ["CASH_IN", "CASH_OUT"].map((type) => {
        const rows = accounted.filter((row) => row.currency === currency && row.type === type).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
        if (!rows.length) return null;
        return <div key={`${currency}-${type}`} className="reports-owner-section">
          <h4>{type === "CASH_IN" ? "Recettes" : "Dépenses"} — {currency}</h4>
          <div className="table-wrap"><table className="admin-table">
            <thead><tr><th>Date</th><th>Références</th><th>Désignation</th><th>Montant</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index}>
              <td>{date(row.occurredAt)}</td><td>{context(row.activityCode, row.metadata)}</td>
              <td>{row.description?.trim() || "Non renseignée"}</td><td>{formatAmountForDisplay(row.amount)} {currency}</td>
            </tr>)}</tbody>
          </table></div>
        </div>;
      }))}
      <h4>{overview.filters.activityCode === "MINING" ? "Suivi par site et équipement — XOF" : "Suivi par client et prestation — XOF"}</h4>
      <div className="table-wrap"><table className="admin-table">
        <thead><tr><th>Dimension</th><th>Référence</th><th>Entrées XOF</th><th>Sorties XOF</th><th>Net XOF</th><th>Tâches</th><th>Bloquées</th><th>Exécution</th></tr></thead>
        <tbody>{!dimensions.length ? <tr><td colSpan={8}>Aucune référence métier suivie sur la période sélectionnée.</td></tr> : dimensions.map((row) => <tr key={`${row.dimensionKey}-${row.itemKey}`}>
          <td>{row.dimensionLabel}</td><td>{row.itemLabel}</td><td>{formatAmountForDisplay(row.approvedCashIn)}</td><td>{formatAmountForDisplay(row.approvedCashOut)}</td><td>{formatAmountForDisplay(row.netProfit)}</td><td>{row.totalTasksCount}</td><td>{row.blockedTasksCount}</td><td>{row.executionRate} %</td>
        </tr>)}</tbody>
      </table></div>
      <h4>Interventions et échéances</h4>
      <div className="table-wrap"><table className="admin-table">
        <thead><tr><th>Intervention</th><th>Références</th><th>Statut</th><th>Échéance</th></tr></thead>
        <tbody>{!report.tasks.length ? <tr><td colSpan={4}>Aucune tâche sur la période sélectionnée.</td></tr> : report.tasks.map((row, index) => <tr key={index}>
          <td>{row.title || row.description || "Non renseignée"}</td><td>{context(row.activityCode, row.metadata)}</td>
          <td>{STATUS[row.status] ?? row.status}</td><td>{row.dueDate ? date(row.dueDate) : "Sans échéance"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  );
}

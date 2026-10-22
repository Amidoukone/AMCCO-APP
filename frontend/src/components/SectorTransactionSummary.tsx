import { useMemo } from "react";
import { formatAmountForDisplay, toAmountNumber } from "../lib/amountFormatting";
import type { FinancialTransaction } from "../types/finance";

export function SectorTransactionSummary({ transactions }: { transactions: FinancialTransaction[] }): JSX.Element | null {
  const totals = useMemo(() => {
    const byCurrency = new Map<string, { currency: string; cashIn: number; cashOut: number }>();
    for (const transaction of transactions) {
      const row = byCurrency.get(transaction.currency) ?? { currency: transaction.currency, cashIn: 0, cashOut: 0 };
      if (transaction.type === "CASH_IN") row.cashIn += toAmountNumber(transaction.amount);
      else row.cashOut += toAmountNumber(transaction.amount);
      byCurrency.set(transaction.currency, row);
    }
    return [...byCurrency.values()].sort((left, right) => left.currency.localeCompare(right.currency));
  }, [transactions]);

  if (!totals.length) return null;
  return (
    <section className="panel finance-page-panel" aria-label="Synthèse des opérations par devise">
      <details className="finance-section-toggle">
        <summary className="finance-section-summary">
          <span>Synthèse par devise</span>
          <small>{totals.map((row) => row.currency).join(" · ")}</small>
        </summary>
      <p className="hint">Totaux des opérations chargées après recherche et filtres, tous statuts. Consultez les rapports pour les montants comptabilisés de toute la période.</p>
      {totals.map((row) => (
        <div key={row.currency} className="grid finance-summary-grid" role="group" aria-label={`Totaux ${row.currency}`}>
          {[
            { title: "Entrées", amount: row.cashIn },
            { title: "Sorties", amount: row.cashOut },
            { title: "Écart entrées / sorties", amount: row.cashIn - row.cashOut }
          ].map((card) => (
            <article key={card.title} className="metric-card finance-overview-card">
              <h2>{card.title} · {row.currency}</h2>
              <p className="metric-value">{formatAmountForDisplay(card.amount)} {row.currency}</p>
            </article>
          ))}
        </div>
      ))}
      </details>
    </section>
  );
}

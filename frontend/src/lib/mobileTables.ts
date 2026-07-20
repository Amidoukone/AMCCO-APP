const MOBILE_CARD_COLUMN_LIMIT = 8;

function getTableHeaders(table: HTMLTableElement): string[] {
  return Array.from(table.querySelectorAll("thead th")).map((header) =>
    header.textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

function labelTableRows(table: HTMLTableElement, headers: string[]): void {
  const rows = table.querySelectorAll("tbody tr, tfoot tr");

  rows.forEach((row) => {
    let headerIndex = 0;
    const cells = Array.from(row.children).filter(
      (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
    );

    cells.forEach((cell) => {
      const label = headers[headerIndex];
      if (label && cell.dataset.label !== label) {
        cell.dataset.label = label;
      }
      headerIndex += Math.max(cell.colSpan, 1);
    });
  });
}

export function enhanceMobileTables(root: HTMLElement): void {
  const wrappers = root.querySelectorAll<HTMLElement>(".table-wrap");

  wrappers.forEach((wrapper) => {
    const table = wrapper.querySelector("table.admin-table");
    if (!(table instanceof HTMLTableElement)) {
      return;
    }

    const headers = getTableHeaders(table).filter(Boolean);
    if (headers.length === 0) {
      return;
    }

    labelTableRows(table, headers);

    if (wrapper.classList.contains("mobile-card-table")) {
      wrapper.classList.remove("mobile-auto-card-table", "mobile-scroll-table");
      return;
    }

    if (wrapper.classList.contains("mobile-force-scroll-table")) {
      wrapper.classList.add("mobile-scroll-table");
      wrapper.classList.remove("mobile-auto-card-table");
      return;
    }

    const shouldUseCards = headers.length <= MOBILE_CARD_COLUMN_LIMIT;
    const targetClass = shouldUseCards ? "mobile-auto-card-table" : "mobile-scroll-table";
    const staleClass = shouldUseCards ? "mobile-scroll-table" : "mobile-auto-card-table";

    if (!wrapper.classList.contains(targetClass)) {
      wrapper.classList.add(targetClass);
    }
    if (wrapper.classList.contains(staleClass)) {
      wrapper.classList.remove(staleClass);
    }
  });
}

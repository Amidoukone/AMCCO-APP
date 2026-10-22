import type PDFDocument from "pdfkit";

type Doc = InstanceType<typeof PDFDocument>;
const MARGIN = 40;
const INK = "#111827";
const MUTED = "#486581";

function fittedText(doc: Doc, text: string, x: number, y: number, width: number, size: number, align: "left" | "center" = "left"): void {
  doc.fontSize(size);
  while (doc.widthOfString(text) > width && size > 7) doc.fontSize(size -= 0.25);
  doc.text(text, x, y, { width, lineBreak: false, align });
}

export function drawSectorReportHeader(doc: Doc, title: string, subtitle: string, logo: (x: number, y: number, size: number) => void): void {
  const width = doc.page.width - MARGIN * 2;
  logo(MARGIN, 20, 64);
  const centerX = MARGIN + 82;
  const centerWidth = width - 164;
  doc.fillColor(INK).font("Helvetica-Bold");
  fittedText(doc, title, centerX, 23, centerWidth, 17, "center");
  doc.fillColor("#92400e").font("Helvetica-Bold").fontSize(9);
  doc.text("Agence Mandingue de Courtage de Conseil et d'Orientation", centerX, 44, { width: centerWidth, align: "center", height: 23 });
  doc.fillColor("#d21f1f").font("Helvetica-Bold").fontSize(12);
  doc.text('"AMCCO"', centerX, 69, { width: centerWidth, align: "center", lineBreak: false });
  doc.fillColor("#78350f").font("Helvetica");
  fittedText(doc, "N Fiscal 084126139L  |  TEL: 79 07 24 40", centerX, 85, centerWidth, 8.5, "center");
  doc.moveTo(MARGIN, 104).lineTo(doc.page.width - MARGIN, 104).strokeColor("#f59e0b").lineWidth(2).stroke();
  doc.fillColor(INK).font("Helvetica-Bold");
  fittedText(doc, subtitle, MARGIN, 117, width, 13, "center");
  doc.y = 144;
}

export function drawSectorReportFooter(doc: Doc, sector: string, period: string, page: number, total: number): void {
  const bottom = doc.page.margins.bottom;
  doc.save();
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 44;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor("#fde68a").lineWidth(1).stroke();
  doc.fillColor(MUTED).font("Helvetica");
  fittedText(doc, `AMCCO - ${sector} | ${period}`, MARGIN, y + 12, doc.page.width - MARGIN * 2 - 100, 8);
  doc.fontSize(8).text(`Page ${page} / ${total}`, doc.page.width - MARGIN - 80, y + 12, { width: 80, align: "right", lineBreak: false });
  doc.page.margins.bottom = bottom;
  doc.restore();
}

function wrapCell(doc: Doc, text: string, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of (text || "-").split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && doc.widthOfString(`${line} ${word}`) > width) { result.push(line); line = ""; }
      for (const character of word) {
        if (line && doc.widthOfString(line + character) > width) { result.push(line); line = ""; }
        line += character;
      }
      line += " ";
    }
    result.push(line.trimEnd());
  }
  return result;
}

export type ReportTableColumn = { label: string; share: number; align?: "left" | "right" };

// Repeats headings on every page and splits oversized rows without dropping text.
export function drawReportTable(doc: Doc, title: string, columns: ReportTableColumn[], rows: string[][], nextPage: () => void, empty = "Aucune donnée sur la période sélectionnée."): void {
  const width = doc.page.width - MARGIN * 2;
  const shares = columns.reduce((sum, column) => sum + column.share, 0);
  const widths = columns.map((column) => width * column.share / shares);
  const bottom = () => doc.page.height - 70;
  const cell = (text: string, x: number, y: number, w: number, h: number, header: boolean, align: "left" | "right", shade: boolean) => {
    doc.rect(x, y, w, h).fillAndStroke(header ? "#fffbeb" : shade ? "#f8fafc" : "#ffffff", "#d7e3f1");
    doc.fillColor(INK).font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8);
    doc.text(text, x + 6, y + 5, { width: w - 12, height: h - 8, lineGap: 1, align });
  };
  const header = () => {
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(title, MARGIN, doc.y, { width });
    const y = doc.y + 8;
    let x = MARGIN;
    columns.forEach((column, index) => { cell(column.label, x, y, widths[index], 30, true, column.align ?? "left", false); x += widths[index]; });
    doc.y = y + 30;
  };
  if (doc.y + 85 > bottom()) nextPage();
  header();
  if (!rows.length) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(empty, MARGIN, doc.y + 12, { width });
    doc.y += 18;
    return;
  }
  rows.forEach((row, rowIndex) => {
    doc.font("Helvetica").fontSize(8);
    const lines = columns.map((_, index) => wrapCell(doc, row[index] ?? "-", widths[index] - 12));
    let offset = 0;
    const count = Math.max(...lines.map((item) => item.length));
    while (offset < count) {
      if (doc.y + 24 > bottom()) { nextPage(); header(); }
      const take = Math.min(count - offset, Math.max(1, Math.floor((bottom() - doc.y - 12) / 12)));
      const height = take * 12 + 12;
      const y = doc.y;
      let x = MARGIN;
      columns.forEach((column, index) => { cell(lines[index].slice(offset, offset + take).join("\n"), x, y, widths[index], height, false, column.align ?? "left", rowIndex % 2 === 1); x += widths[index]; });
      doc.y = y + height;
      offset += take;
    }
  });
  doc.y += 18;
}

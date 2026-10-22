"""Inspect locally generated PDF fixtures; no database or network access."""
import json
import re
from shutil import copyfile
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "artifacts" / "sector-reports"
CODES = ["HARDWARE", "GENERAL_STORE", "RENTAL", "AGRICULTURE", "BTP", "FISH_FARMING", "TRANSPORT", "SERVICES", "MINING", "WATER", "BEVERAGE_DEPOT", "HYDROCARBON", "GENERAL_EXPENSES", "DAILY_ACTIVITIES"]
manifest = []
issues = []
sheet = pymupdf.open()
sheet_page = sheet.new_page(width=1800, height=1780)

def score(overview):
    details = sum(len(value) for report in overview.values() if isinstance(report, dict) for value in report.values() if isinstance(value, list))
    return details + sum(row["count"] for row in overview["financeByType"]) + sum(row["count"] for row in overview["taskByStatus"])

for index, code in enumerate(CODES):
    fixtures = list(DIRECTORY.glob(f"{code}-preview-*.json"))
    assert fixtures, f"No overview fixture for {code}"
    fixture = max(fixtures, key=lambda file: score(json.loads(file.read_text(encoding="utf-8"))))
    source = fixture.with_suffix(".pdf")
    copyfile(source, DIRECTORY / f"{code}-review.pdf")
    document = pymupdf.open(source)
    assert len(document), source.name
    if code == "BTP":
        positions = [document[0].search_for(label)[0].y0 for label in ["Matériaux", "Engins", "Charges chantier"]]
        assert max(positions) - min(positions) < 1, "BTP summary categories must remain aligned"
    for page_index, page in enumerate(document):
        text = page.get_text()
        assert len(text.strip()) > 30, f"Blank page in {source.name}: {page_index + 1}"
        assert re.search(rf"Page\s+{page_index + 1}\s*/\s*{len(document)}", text), f"Missing page number in {source.name}: {page_index + 1}"
        assert not re.search(r"\b(NaN|undefined|Infinity)\b", text), source.name
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    x0, y0, x1, y1 = span["bbox"]
                    if x0 < 35 or x1 > page.rect.width - 35 or y0 < 0 or y1 > page.rect.height - 16:
                        issues.append({"file": source.name, "page": page_index + 1, "text": span["text"], "bounds": span["bbox"]})
    # First and last page of every chosen example are available for inspection.
    for page_index in {0, len(document) - 1}:
        document[page_index].get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(DIRECTORY / f"{code}-page-{page_index + 1}.png")
    cell_x, cell_y = (index % 4) * 450, (index // 4) * 445
    sheet_page.insert_text((cell_x + 12, cell_y + 18), f"{code} ({len(document)} pages)", fontsize=12)
    thumb = document[0].get_pixmap(matrix=pymupdf.Matrix(0.65, 0.65)).tobytes("png")
    sheet_page.insert_image(pymupdf.Rect(cell_x + 10, cell_y + 30, cell_x + 440, cell_y + 435), stream=thumb, keep_proportion=True)
    manifest.append({"code": code, "pdf": source.name, "overview": fixture.name, "pages": len(document)})
    print(f"PASS {code}: {len(document)} pages, numbered, nonempty")

sheet_page.get_pixmap().save(DIRECTORY / "contact-sheet.png")
(DIRECTORY / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
(DIRECTORY / "layout-issues.json").write_text(json.dumps(issues, indent=2), encoding="utf-8")
assert not issues, f"Text outside page margins: {len(issues)}; see layout-issues.json"

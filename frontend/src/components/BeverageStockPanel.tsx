import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, countBeverageStockRequest, createBeverageProductRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { useFormChanges } from "../lib/useFormChanges";
import type { BeverageProduct } from "../types/beverage-stock";

const number = (value: string | number) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const emptyProduct = () => ({ name: "", unit: "casier", hasOpeningStock: false, openingQuantity: "", openingUnitCost: "" });
const units = ["casier", "carton", "pack", "bouteille", "canette", "fût"];
const quantityUnit = (quantity: string, unit: string) => units.includes(unit) && Math.abs(Number(quantity)) >= 2 ? `${unit}s` : unit;
function writeError(error: unknown): string {
  if (error instanceof ApiError && error.statusCode >= 500 && error.statusCode !== 503) return "L'enregistrement n'a pas pu être confirmé. Actualisez le stock pour vérifier avant de réessayer.";
  return error instanceof Error ? error.message : "L'enregistrement n'a pas pu être confirmé.";
}

export function BeverageStockPanel({ items, loading, error, refresh, canManage, canCount, onOperation }: {
  items: BeverageProduct[]; loading: boolean; error: string | null; refresh: () => Promise<void>;
  canManage: boolean; canCount: boolean; onOperation: (product: BeverageProduct, kind: "VENTE" | "ACHAT_STOCK") => void;
}) {
  const authorize = useAuthorizedRequest();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [counting, setCounting] = useState<BeverageProduct | null>(null);
  const [countForm, setCountForm] = useState({ countedQuantity: "", unitCost: "0", reason: "" });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const changes = useFormChanges(form, "beverage-product");
  const countChanges = useFormChanges(countForm, `beverage-count:${counting?.id ?? "none"}`);
  const ready = !loading && !error;
  const filtered = items.filter((item) => `${item.name} ${item.unit}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  const openingValue = Number(form.openingQuantity) * Number(form.openingUnitCost);

  function cancelProduct() {
    if (!changes.confirmDiscard()) return;
    changes.markClean(); setForm(emptyProduct()); setExpanded(false); setNotice(null);
  }
  async function saveCount(event: FormEvent) {
    event.preventDefault();
    if (!counting || !ready || saving) return;
    setSaving(true); setNotice(null);
    try {
      await authorize((token) => countBeverageStockRequest(token, counting.id, { ...countForm, expectedQuantity: counting.quantity }));
      if (!alive.current) return;
      countChanges.markClean(); setCounting(null);
      setNotice({ kind: "success", text: "Comptage enregistré. Le stock a été corrigé et le motif conservé." });
      await refresh();
    } catch (failure) {
      if (alive.current) { setNotice({ kind: "error", text: writeError(failure) }); await refresh(); }
    } finally { if (alive.current) setSaving(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || saving) return;
    setSaving(true); setNotice(null);
    try {
      const response = await authorize((token) => createBeverageProductRequest(token, {
        name: form.name.trim(), unit: form.unit,
        openingQuantity: form.hasOpeningStock ? form.openingQuantity : "0",
        openingUnitCost: form.hasOpeningStock ? form.openingUnitCost : "0"
      }));
      if (!alive.current) return;
      changes.markClean(); setForm(emptyProduct()); setExpanded(false);
      setNotice({ kind: "success", text: `${response.item.name} ajouté. ${Number(response.item.quantity) > 0 ? "Le stock de départ est enregistré." : "Enregistrez un achat avec Approvisionner pour alimenter son stock."}` });
      await refresh();
    } catch (failure) {
      if (alive.current) setNotice({ kind: "error", text: writeError(failure) });
    } finally { if (alive.current) setSaving(false); }
  }

  return <section className="panel beverage-stock-panel" aria-label="Stock du dépôt"
    data-unsaved-sector-form={changes.isDirty || countChanges.isDirty || saving ? "true" : undefined}>
    <div className="dashboard-panel-header">
      <div><h3>Stock disponible</h3><p className="hint">Les achats ajoutent des quantités au stock. Les ventes les retirent automatiquement.</p></div>
      {!error ? <button type="button" className="secondary-btn" disabled={loading || saving} onClick={() => void refresh()}>Actualiser le stock</button> : null}
    </div>
    {notice ? <p role={notice.kind === "error" ? "alert" : "status"} className={notice.kind === "error" ? "error-box" : "success-box"}>{notice.text}</p> : null}
    {error ? <div className="beverage-stock-unavailable" role="alert">
      <h4>Stock indisponible</h4><p>{error}</p>
      <p className="hint">La disponibilité des produits n'a pas pu être vérifiée. Les nouvelles ventes et les achats liés au stock restent bloqués.</p>
      <button type="button" className="secondary-btn" disabled={loading || saving} onClick={() => void refresh()}>Réessayer le chargement</button>
    </div> : null}
    {loading ? <p role="status">{items.length ? "Actualisation du stock…" : "Chargement du stock…"}</p> : null}
    {!error && items.length > 0 ? <>
      <div className="beverage-stock-metrics" aria-label="Résumé du stock">
        <div><span>Produits suivis</span><strong>{items.length}</strong></div>
        <div><span>En rupture</span><strong>{items.filter((item) => Number(item.quantity) === 0).length}</strong></div>
        <div><span>Valeur du stock</span><strong>{number(items.reduce((total, item) => total + Number(item.stockValue), 0))} XOF</strong></div>
      </div>
      <label className="operations-inline-group"><span>Rechercher un produit en stock</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Nom ou unité du produit" /></label>
      <p className="hint">Stock commun au dépôt, dans l'unité indiquée pour chaque produit.</p>
      {filtered.length ? <div className="table-wrap"><table className="admin-table beverage-stock-table"><thead><tr><th>Produit</th><th>Disponible</th><th>Coût moyen d'achat</th><th>Valeur du stock</th>{canManage ? <th>Action</th> : null}</tr></thead><tbody>
        {filtered.map((item) => <tr key={item.id}>
          <td data-label="Produit"><span>{item.name}<small className="hint"> · {item.unit}</small></span></td>
          <td data-label="Disponible">{number(item.quantity)} {quantityUnit(item.quantity, item.unit)}{Number(item.quantity) === 0 ? " · Épuisé" : ""}</td>
          <td data-label="Coût moyen">{number(item.averageUnitCost)} XOF / {item.unit}</td>
          <td data-label="Valeur">{number(item.stockValue)} XOF</td>
          {canManage ? <td data-label="Action"><div className="actions-inline"><button type="button" disabled={!ready || saving || Number(item.quantity) <= 0} onClick={() => onOperation(item, "VENTE")}>Vendre</button><button type="button" className="secondary-btn" disabled={!ready || saving} onClick={() => onOperation(item, "ACHAT_STOCK")}>Approvisionner</button></div></td> : null}
        </tr>)}
      </tbody></table></div> : <p role="status">Aucun produit ne correspond à cette recherche.</p>}
    </> : null}
    {ready && items.length === 0 ? <div className="beverage-stock-empty">
      <h4>Aucun produit enregistré</h4>
      <p>{canManage ? "Ajoutez votre premier produit, puis enregistrez les achats pour alimenter son stock." : "Les produits apparaîtront ici une fois enregistrés par l'opérateur ou le comptable."}</p>
      <p className="hint">Si des boissons sont déjà présentes dans le dépôt, renseignez uniquement le stock réellement compté au démarrage. Les anciennes transactions restent dans l'historique.</p>
    </div> : null}
    {!error && (ready || changes.isDirty || countChanges.isDirty) ? <>
      {canManage ? <details className="beverage-product-create" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}><summary>Ajouter un produit</summary>
        <form className="beverage-product-form" onSubmit={save} onChangeCapture={changes.onChangeCapture}>
          <fieldset disabled={!ready || saving} className="beverage-product-fields">
            <legend>Identifier le produit</legend>
            <div className="beverage-product-grid">
              <label className="operations-inline-group"><span>Nom du produit *</span><input required minLength={2} maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex. Coca 50 cl" /><small className="hint">Précisez la boisson et sa contenance.</small></label>
              <label className="operations-inline-group"><span>Unité de stock *</span><select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>{units.map((unit) => <option key={unit} value={unit}>{unit.charAt(0).toUpperCase() + unit.slice(1)}</option>)}</select><small className="hint">La même unité sera utilisée pour acheter et vendre.</small></label>
            </div>
            <label className="beverage-opening-choice"><input type="checkbox" checked={form.hasOpeningStock} onChange={(event) => setForm({ ...form, hasOpeningStock: event.target.checked })} /><span>Ce produit est déjà présent dans le dépôt</span></label>
            {form.hasOpeningStock ? <>
              <p className="hint">Saisissez la quantité physique comptée et son coût d'achat. Ce stock de départ ne crée pas de dépense.</p>
              <div className="beverage-product-grid">
                <label className="operations-inline-group"><span>Stock de départ compté *</span><input required type="number" min="0.001" max="999999999" step="0.001" value={form.openingQuantity} onChange={(event) => setForm({ ...form, openingQuantity: event.target.value })} placeholder="Ex. 12" /><small className="hint">Unité : {form.unit}.</small></label>
                <label className="operations-inline-group"><span>Coût d'achat par {form.unit} (XOF) *</span><input required type="number" min="0.000001" max="999999999" step="0.000001" value={form.openingUnitCost} onChange={(event) => setForm({ ...form, openingUnitCost: event.target.value })} placeholder="Prix payé par unité" /></label>
              </div>
              {openingValue > 0 && Number.isFinite(openingValue) ? <p className="hint">Valeur du stock de départ : <strong>{number(openingValue)} XOF</strong></p> : null}
            </> : <p className="hint">Le produit démarrera avec un stock à zéro. Utilisez ensuite Approvisionner pour enregistrer le premier achat.</p>}
            <details className="beverage-unit-help"><summary>Comment choisir l'unité ?</summary><p className="hint">Pour vendre à la bouteille, suivez ce produit en bouteilles et convertissez les casiers reçus en nombre de bouteilles. Ne comptez pas les mêmes boissons une fois en casiers et une seconde fois en bouteilles.</p></details>
            <div className="actions-inline"><button type="submit">{saving ? "Enregistrement…" : "Enregistrer le produit"}</button><button type="button" className="secondary-btn" onClick={cancelProduct}>Annuler</button></div>
          </fieldset>
        </form>
      </details> : null}
      {canCount && items.length > 0 ? <details className="beverage-stock-count"><summary>Corriger un écart après comptage</summary>
        <p className="hint">Réservé au comptable et à l'administrateur pour un écart réellement constaté : casse, perte ou erreur de comptage. Le motif sera conservé dans les rapports. Enregistrez les achats et les ventes depuis leurs opérations habituelles.</p>
        <label className="operations-inline-group"><span>Produit à compter</span><select value={counting?.id ?? ""} disabled={!ready || saving} onChange={(event) => {
          if (!countChanges.confirmDiscard()) return;
          const product = items.find((item) => item.id === event.target.value) ?? null;
          setCounting(product); setCountForm({ countedQuantity: product?.quantity ?? "", unitCost: "0", reason: "" }); countChanges.markClean();
        }}><option value="">Choisir un produit</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} / {item.unit}</option>)}</select></label>
        {counting ? <form className="beverage-product-form" onSubmit={saveCount} onChangeCapture={countChanges.onChangeCapture}>
          <fieldset disabled={!ready || saving} className="beverage-product-fields"><legend>Comptage de {counting.name}</legend>
            <p>Stock enregistré à vérifier : {counting.quantity} {counting.unit}. La correction ne crée aucun mouvement de caisse.</p>
            <label className="operations-inline-group"><span>Quantité physique comptée *</span><input type="number" required min="0" max="999999999" step="0.001" value={countForm.countedQuantity} onChange={(event) => setCountForm({ ...countForm, countedQuantity: event.target.value })} /></label>
            {Number(counting.quantity) === 0 && Number(countForm.countedQuantity) > 0 ? <label className="operations-inline-group"><span>Coût d'achat par unité retrouvée (XOF) *</span><input type="number" required min="0.000001" max="999999999" step="0.000001" value={countForm.unitCost} onChange={(event) => setCountForm({ ...countForm, unitCost: event.target.value })} /></label> : null}
            <label className="operations-inline-group"><span>Motif de l'écart *</span><input required minLength={5} maxLength={500} value={countForm.reason} onChange={(event) => setCountForm({ ...countForm, reason: event.target.value })} /></label>
            <button type="submit">Enregistrer le comptage et sa correction</button>
          </fieldset>
        </form> : null}
      </details> : null}
    </> : null}
  </section>;
}

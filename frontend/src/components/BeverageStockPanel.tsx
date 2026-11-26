import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  archiveBeverageProductRequest,
  cancelBeverageLossRequest,
  countBeverageStockRequest,
  createBeverageProductRequest,
  recordBeverageLossRequest
} from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { useFormChanges } from "../lib/useFormChanges";
import type { BeverageProduct, BeverageStockLoss } from "../types/beverage-stock";
import { ConfirmDialog } from "./ConfirmDialog";

const number = (value: string | number) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const money = (value: string | number) => Number(value).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const emptyProduct = () => ({ name: "", unit: "casier", hasOpeningStock: false, openingQuantity: "", openingUnitCost: "" });
const emptyLoss = () => ({ productId: "", quantity: "", usePieces: false, pieces: "1", piecesPerUnit: "24", cause: "Casse", note: "" });
const units = ["casier", "carton", "pack", "bouteille", "canette", "fût"];
const packUnits = new Set(["casier", "carton", "pack"]);
const lossCauses = ["Casse", "Péremption", "Fuite / avarie", "Vol / manquant", "Autre"];
const defaultPiecesPerUnit = (unit: string) => (unit === "pack" ? "6" : "24");
const quantityUnit = (quantity: string, unit: string) => units.includes(unit) && Math.abs(Number(quantity)) >= 2 ? `${unit}s` : unit;

function computePieceQuantity(piecesValue: string, perUnitValue: string, available: string): string | null {
  const pieces = Number(piecesValue.replace(",", "."));
  const perUnit = Number(perUnitValue.replace(",", "."));
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 999999 ||
      !Number.isInteger(perUnit) || perUnit < 1 || perUnit > 1000) return null;
  // Round the remaining piece balance to avoid accumulating rounding errors.
  const fraction = Number((available.split(".")[1] ?? "").padEnd(3, "0"));
  const remainingPieces = Math.round(fraction * perUnit / 1000);
  const aligned = Math.round(remainingPieces * 1000 / perUnit) === fraction;
  const removed = aligned
    ? fraction - Math.round((remainingPieces - pieces) * 1000 / perUnit)
    : Math.round(pieces * 1000 / perUnit);
  return (removed / 1000).toString();
}

function writeError(error: unknown): string {
  if (error instanceof ApiError && error.statusCode >= 500 && error.statusCode !== 503) return "L'enregistrement n'a pas pu être confirmé. Actualisez le stock pour vérifier avant de réessayer.";
  return error instanceof Error ? error.message : "L'enregistrement n'a pas pu être confirmé.";
}

export function BeverageStockPanel({ items, losses = [], loading, error, refresh, canManage, canCount, canArchiveProducts, onOperation }: {
  items: BeverageProduct[]; losses?: BeverageStockLoss[]; loading: boolean; error: string | null; refresh: () => Promise<void>;
  canManage: boolean; canCount: boolean; onOperation: (product: BeverageProduct, kind: "VENTE" | "ACHAT_STOCK") => void;
  canArchiveProducts: boolean;
}) {
  const authorize = useAuthorizedRequest();
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyProduct);
  const [lossForm, setLossForm] = useState(emptyLoss);
  const [lossOpen, setLossOpen] = useState(false);
  const [confirmCancelLossId, setConfirmCancelLossId] = useState<string | null>(null);
  const [pendingArchive, setPendingArchive] = useState<BeverageProduct | null>(null);
  const closeArchiveDialog = useCallback(() => setPendingArchive(null), []);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [counting, setCounting] = useState<BeverageProduct | null>(null);
  const [countForm, setCountForm] = useState({ countedQuantity: "", unitCost: "0", reason: "" });
  const lossPanelRef = useRef<HTMLDetailsElement | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const changes = useFormChanges(form, "beverage-product");
  const lossChanges = useFormChanges(lossForm, `beverage-loss:${lossForm.productId || "none"}`);
  const countChanges = useFormChanges(countForm, `beverage-count:${counting?.id ?? "none"}`);
  const ready = !loading && !error;
  const filtered = items.filter((item) => `${item.name} ${item.unit}`.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  const openingValue = Number(form.openingQuantity) * Number(form.openingUnitCost);
  const totalLostValue = items.reduce((total, item) => total + Number(item.lostValue ?? 0), 0);
  const selectedLossProduct = items.find((item) => item.id === lossForm.productId) ?? null;
  const supportsPieceHelper = Boolean(selectedLossProduct && packUnits.has(selectedLossProduct.unit));
  const effectiveLossQuantity = selectedLossProduct && supportsPieceHelper && lossForm.usePieces
    ? (computePieceQuantity(lossForm.pieces, lossForm.piecesPerUnit, selectedLossProduct.quantity) ?? "")
    : lossForm.quantity.trim().replace(",", ".");
  const estimatedLossValue = selectedLossProduct && Number(effectiveLossQuantity) > 0
    ? Number(effectiveLossQuantity) * Number(selectedLossProduct.averageUnitCost)
    : 0;

  function cancelProduct() {
    if (!changes.confirmDiscard()) return;
    changes.markClean(); setForm(emptyProduct()); setExpanded(false); setNotice(null);
  }
  function openLossForProduct(product: BeverageProduct) {
    if (!lossChanges.confirmDiscard()) return;
    setLossForm({
      ...emptyLoss(),
      productId: product.id,
      usePieces: packUnits.has(product.unit),
      piecesPerUnit: defaultPiecesPerUnit(product.unit)
    });
    lossChanges.markClean();
    setLossOpen(true);
    setNotice(null);
    requestAnimationFrame(() => {
      lossPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  function cancelLossDraft() {
    if (!lossChanges.confirmDiscard()) return;
    lossChanges.markClean(); setLossForm(emptyLoss()); setLossOpen(false); setNotice(null);
  }
  async function saveLoss(event: FormEvent) {
    event.preventDefault();
    if (!selectedLossProduct || !ready || saving) return;
    const qtyNum = Number(effectiveLossQuantity);
    if (!effectiveLossQuantity || !Number.isFinite(qtyNum) || qtyNum <= 0) {
      setNotice({ kind: "error", text: "Indiquez une quantité perdue supérieure à zéro." });
      return;
    }
    if (qtyNum > Number(selectedLossProduct.quantity)) {
      setNotice({ kind: "error", text: `Stock insuffisant : ${number(selectedLossProduct.quantity)} ${quantityUnit(selectedLossProduct.quantity, selectedLossProduct.unit)} disponible(s). Vérifiez la quantité.` });
      return;
    }
    const pieceHint = supportsPieceHelper && lossForm.usePieces
      ? `${lossForm.pieces} pièce${Number(lossForm.pieces) > 1 ? "s" : ""} / ${selectedLossProduct.unit} de ${lossForm.piecesPerUnit}`
      : "";
    const reason = [lossForm.cause.trim(), pieceHint, lossForm.note.trim()].filter(Boolean).join(" - ");
    setSaving(true); setNotice(null);
    try {
      await authorize((token) => recordBeverageLossRequest(token, selectedLossProduct.id, {
        quantity: effectiveLossQuantity,
        expectedQuantity: pieceHint ? selectedLossProduct.quantity : undefined,
        reason
      }));
      if (!alive.current) return;
      lossChanges.markClean(); setLossForm(emptyLoss()); setLossOpen(false);
      setNotice({ kind: "success", text: `Perte enregistrée pour ${selectedLossProduct.name} (−${number(effectiveLossQuantity)} ${quantityUnit(effectiveLossQuantity, selectedLossProduct.unit)}). Stock mis à jour hors caisse.` });
      await refresh();
    } catch (failure) {
      if (alive.current) { setNotice({ kind: "error", text: writeError(failure) }); await refresh(); }
    } finally { if (alive.current) setSaving(false); }
  }
  async function confirmCancelLoss(loss: BeverageStockLoss) {
    if (!ready || saving) return;
    setSaving(true); setNotice(null);
    try {
      await authorize((token) => cancelBeverageLossRequest(token, loss.id));
      if (!alive.current) return;
      setConfirmCancelLossId(null);
      setNotice({ kind: "success", text: `Perte annulée pour ${loss.productName}.` });
      await refresh();
    } catch (failure) {
      if (alive.current) { setNotice({ kind: "error", text: writeError(failure) }); await refresh(); }
    } finally { if (alive.current) setSaving(false); }
  }
  async function confirmArchive() {
    if (!canArchiveProducts || !pendingArchive || !ready || saving) return;
    const product = pendingArchive;
    setPendingArchive(null);
    setSaving(true); setNotice(null);
    try {
      await authorize((token) => archiveBeverageProductRequest(token, product.id, product.quantity));
      if (!alive.current) return;
      if (lossForm.productId === product.id) {
        lossChanges.markClean(); setLossForm(emptyLoss()); setLossOpen(false);
      }
      if (counting?.id === product.id) {
        countChanges.markClean(); setCounting(null);
      }
      setNotice({ kind: "success", text: `${product.name} et son stock ont été retirés du stock actif.` });
      await refresh();
    } catch (failure) {
      if (alive.current) { setNotice({ kind: "error", text: writeError(failure) }); await refresh(); }
    } finally { if (alive.current) setSaving(false); }
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
    data-unsaved-sector-form={changes.isDirty || lossChanges.isDirty || countChanges.isDirty || saving ? "true" : undefined}>
    <div className="dashboard-panel-header">
      <div><h3>Stock disponible</h3><p className="hint">Les achats ajoutent des quantités au stock. Les ventes et les pertes (casse, avarie…) les retirent automatiquement.</p></div>
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
        <div><span>Valeur du stock</span><strong>{money(items.reduce((total, item) => total + Number(item.stockValue), 0))} XOF</strong></div>
        <div><span>Pertes des produits suivis</span><strong>{money(totalLostValue)} XOF</strong></div>
      </div>
      <label className="operations-inline-group"><span>Rechercher un produit en stock</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Nom ou unité du produit" /></label>
      <p className="hint">Stock commun au dépôt, dans l'unité indiquée pour chaque produit.</p>
      {filtered.length ? <div className="table-wrap"><table className="admin-table beverage-stock-table"><thead><tr><th>Produit</th><th>Disponible</th><th>Vendu</th><th>Perdu</th><th>Coût moyen d'achat</th><th>Valeur du stock</th>{canManage ? <th>Action</th> : null}</tr></thead><tbody>
        {filtered.map((item) => <tr key={item.id}>
          <td data-label="Produit"><span>{item.name}<small className="hint"> · {item.unit}</small></span></td>
          <td data-label="Disponible">{number(item.quantity)} {quantityUnit(item.quantity, item.unit)}{Number(item.quantity) === 0 ? " · Épuisé" : ""}</td>
          <td data-label="Vendu">{number(item.soldQuantity ?? "0")} {quantityUnit(item.soldQuantity ?? "0", item.unit)}</td>
          <td data-label="Perdu"><span>{number(item.lostQuantity ?? "0")} {quantityUnit(item.lostQuantity ?? "0", item.unit)}{Number(item.lostValue ?? 0) > 0 ? <small className="hint"> · {money(item.lostValue ?? "0")} XOF</small> : null}</span></td>
          <td data-label="Coût moyen">{money(item.averageUnitCost)} XOF / {item.unit}</td>
          <td data-label="Valeur">{money(item.stockValue)} XOF</td>
          {canManage ? <td data-label="Action"><div className="actions-inline"><button type="button" disabled={!ready || saving || Number(item.quantity) <= 0} onClick={() => onOperation(item, "VENTE")}>Vendre</button><button type="button" className="secondary-btn" disabled={!ready || saving} onClick={() => onOperation(item, "ACHAT_STOCK")}>Approvisionner</button><button type="button" className="secondary-btn" disabled={!ready || saving || Number(item.quantity) <= 0} onClick={() => openLossForProduct(item)}>Perte</button>
            {canArchiveProducts ? <button type="button" className="secondary-btn" disabled={!ready || saving} onClick={() => setPendingArchive(item)}>Supprimer</button> : null}
          </div></td> : null}
        </tr>)}
      </tbody></table></div> : <p role="status">Aucun produit ne correspond à cette recherche.</p>}
    </> : null}
    {canManage && canArchiveProducts && pendingArchive ? <ConfirmDialog
      open
      title="Supprimer le produit et son stock ?"
      description="Le produit sera retiré des listes de vente et d’approvisionnement."
      objectLabel="Produit et stock disponible"
      objectName={`${pendingArchive.name} · ${number(pendingArchive.quantity)} ${quantityUnit(pendingArchive.quantity, pendingArchive.unit)}`}
      impactText="Les achats, ventes et pertes enregistrés restent dans l’historique."
      confirmLabel="Supprimer le produit"
      onCancel={closeArchiveDialog}
      onConfirm={() => void confirmArchive()}
    /> : null}
    {ready && items.length === 0 ? <div className="beverage-stock-empty">
      <h4>Aucun produit enregistré</h4>
      <p>{canManage ? "Ajoutez votre premier produit, puis enregistrez les achats pour alimenter son stock." : "Les produits apparaîtront ici une fois enregistrés par l'opérateur ou le comptable."}</p>
      <p className="hint">Si des boissons sont déjà présentes dans le dépôt, renseignez uniquement le stock réellement compté au démarrage. Les anciennes transactions restent dans l'historique.</p>
    </div> : null}
    {!error && (ready || changes.isDirty || lossChanges.isDirty || countChanges.isDirty) ? <>
      {canManage && items.length > 0 ? <details ref={lossPanelRef} className="beverage-stock-loss" open={lossOpen} onToggle={(event) => setLossOpen(event.currentTarget.open)}><summary>Déclarer une perte</summary>
        <form className="beverage-product-form" onSubmit={saveLoss} onChangeCapture={lossChanges.onChangeCapture}>
          <fieldset disabled={!ready || saving} className="beverage-product-fields">
            <legend>Enregistrer une perte de stock</legend>
            <label className="operations-inline-group">
              <span>Produit concerné *</span>
              <select required value={lossForm.productId} onChange={(event) => {
                const product = items.find((item) => item.id === event.target.value) ?? null;
                setLossForm((prev) => ({
                  ...prev,
                  productId: product?.id ?? "",
                  quantity: "",
                  usePieces: Boolean(product && packUnits.has(product.unit)),
                  pieces: "1",
                  piecesPerUnit: product ? defaultPiecesPerUnit(product.unit) : "24"
                }));
              }}>
                <option value="">Choisir un produit</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id} disabled={Number(item.quantity) <= 0}>
                    {item.name} / {item.unit} ({number(item.quantity)} dispo)
                  </option>
                ))}
              </select>
            </label>
            {selectedLossProduct ? <>
              <p className="hint">Disponible : <strong>{number(selectedLossProduct.quantity)} {quantityUnit(selectedLossProduct.quantity, selectedLossProduct.unit)}</strong> · Coût moyen : {money(selectedLossProduct.averageUnitCost)} XOF / {selectedLossProduct.unit}</p>
              {supportsPieceHelper ? <label className="beverage-opening-choice">
                <input type="checkbox" checked={lossForm.usePieces} onChange={(event) => setLossForm((prev) => ({ ...prev, usePieces: event.target.checked }))} />
                <span>Saisir en pièces individuelles</span>
              </label> : null}
              {supportsPieceHelper && lossForm.usePieces ? <>
                <div className="beverage-product-grid">
                  <label className="operations-inline-group">
                    <span>Nombre de pièces perdues *</span>
                    <input required type="number" min="1" max="999999" step="1" value={lossForm.pieces} onChange={(event) => setLossForm((prev) => ({ ...prev, pieces: event.target.value }))} placeholder="Ex. 1" />
                  </label>
                  <label className="operations-inline-group">
                    <span>Pièces par {selectedLossProduct.unit} *</span>
                    <input required type="number" min="1" max="1000" step="1" value={lossForm.piecesPerUnit} onChange={(event) => setLossForm((prev) => ({ ...prev, piecesPerUnit: event.target.value }))} placeholder="Ex. 24" />
                  </label>
                </div>
                {effectiveLossQuantity ? <p className="hint">À retirer du stock : <strong>{number(effectiveLossQuantity)} {quantityUnit(effectiveLossQuantity, selectedLossProduct.unit)}</strong> ({lossForm.pieces} / {lossForm.piecesPerUnit})</p> : null}
              </> : (
                <label className="operations-inline-group">
                  <span>Quantité perdue ({selectedLossProduct.unit}) *</span>
                  <input required type="number" min="0.001" max={selectedLossProduct.quantity} step="0.001" value={lossForm.quantity} onChange={(event) => setLossForm((prev) => ({ ...prev, quantity: event.target.value }))} placeholder="Ex. 1" />
                </label>
              )}
              <div className="beverage-product-grid">
                <label className="operations-inline-group">
                  <span>Cause (facultatif)</span>
                  <select value={lossForm.cause} onChange={(event) => setLossForm((prev) => ({ ...prev, cause: event.target.value }))}>
                    {lossCauses.map((cause) => <option key={cause} value={cause}>{cause}</option>)}
                    <option value="">Non précisée</option>
                  </select>
                </label>
                <label className="operations-inline-group">
                  <span>Précision (facultatif)</span>
                  <input maxLength={400} value={lossForm.note} onChange={(event) => setLossForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="Ex. Canette percée au rangement" />
                </label>
              </div>
              {estimatedLossValue > 0 && Number.isFinite(estimatedLossValue) ? <p className="hint">Valeur estimée de la perte : <strong>{money(estimatedLossValue)} XOF</strong> (hors caisse)</p> : null}
            </> : null}
            <div className="actions-inline">
              <button type="submit" disabled={!selectedLossProduct || !effectiveLossQuantity}>{saving ? "Enregistrement…" : "Enregistrer la perte"}</button>
              <button type="button" className="secondary-btn" onClick={cancelLossDraft}>Annuler</button>
            </div>
          </fieldset>
        </form>
      </details> : null}
      {losses.length > 0 ? <details className="beverage-loss-history"><summary>Historique des pertes ({losses.length})</summary>
        <div className="table-wrap"><table className="admin-table beverage-stock-table"><thead><tr><th>Date</th><th>Produit</th><th>Quantité perdue</th><th>Valeur</th><th>Motif</th>{canManage ? <th>Action</th> : null}</tr></thead><tbody>
          {losses.map((loss) => <tr key={loss.id}>
            <td data-label="Date">{new Date(loss.date).toLocaleDateString("fr-FR")}</td>
            <td data-label="Produit"><span>{loss.productName}<small className="hint"> · {loss.unit}</small></span></td>
            <td data-label="Quantité perdue">{number(loss.quantity)} {quantityUnit(loss.quantity, loss.unit)}</td>
            <td data-label="Valeur">{money(loss.value)} XOF</td>
            <td data-label="Motif">{loss.reason || "—"}</td>
            {canManage ? <td data-label="Action">
              {confirmCancelLossId === loss.id ? (
                <div className="actions-inline">
                  <button type="button" disabled={!ready || saving} onClick={() => void confirmCancelLoss(loss)}>Confirmer l'annulation</button>
                  <button type="button" className="secondary-btn" disabled={saving} onClick={() => setConfirmCancelLossId(null)}>Garder</button>
                </div>
              ) : (
                <button type="button" className="secondary-btn" disabled={!ready || saving} onClick={() => setConfirmCancelLossId(loss.id)}>Annuler</button>
              )}
            </td> : null}
          </tr>)}
        </tbody></table></div>
      </details> : null}
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
        <p className="hint">Réservé au comptable et à l'administrateur pour ajuster le stock après un inventaire physique. Pour une casse ou perte courante, utilisez « Déclarer une perte ».</p>
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

import { useState, type Dispatch, type SetStateAction, type FormEvent } from "react";
import { ButtonSpinner } from "./ButtonSpinner";
import { formatAmountForDisplay, formatAmountForInput, formatEditableAmountForInput } from "../lib/amountFormatting";
import { matchesQuickSearch } from "../lib/quickSearch";
import type { ActivityArticle } from "../types/articles";

type ArticleForm = { name: string; defaultMargin: string; defaultPurchaseUnitPrice: string };
type Props = {
  articles: ActivityArticle[];
  articleForm: ArticleForm;
  setArticleForm: Dispatch<SetStateAction<ArticleForm>>;
  editingArticleId: string | null;
  busyArticleId: string | null;
  isSavingArticle: boolean;
  isArticleManagementExpanded: boolean;
  setIsArticleManagementExpanded: (value: boolean) => void;
  articleChanges: { isDirty: boolean; onChangeCapture: () => void };
  isLoadingArticles: boolean;
  hasLoadedArticles: boolean;
  onReload: () => void;
  handleSaveArticle: (event: FormEvent<HTMLFormElement>) => void;
  handleCancelEditArticle: () => void;
  handleStartEditArticle: (article: ActivityArticle) => void;
  handleDeleteArticle: (article: ActivityArticle) => void;
};

export function HardwareArticlesPanel({
  articles, articleForm, setArticleForm, editingArticleId, busyArticleId,
  isSavingArticle, isArticleManagementExpanded, setIsArticleManagementExpanded,
  articleChanges, isLoadingArticles, hasLoadedArticles, onReload, handleSaveArticle,
  handleCancelEditArticle, handleStartEditArticle, handleDeleteArticle
}: Props): JSX.Element {
  const [articleSearch, setArticleSearch] = useState("");
  const filteredArticles = articles.filter((article) => matchesQuickSearch(articleSearch, [article.name]));
  return (
    <>
      <section className="panel finance-page-panel" aria-label="Catalogue des articles">
        <h3>Articles ({articles.length})</h3>
            <label className="operations-inline-group">
              <span>Rechercher un article</span>
              <input type="search" value={articleSearch} onChange={(event) => setArticleSearch(event.target.value)} placeholder="Nom de l'article..." />
            </label>
            {isLoadingArticles ? <p role="status">Chargement des articles...</p> : !hasLoadedArticles ? (
              <button type="button" className="secondary-btn" onClick={onReload}>Réessayer le chargement des articles</button>
            ) : filteredArticles.length > 0 ? (
              <div className="operations-member-grid">
                {filteredArticles.map((article) => {
                  const isBusy = busyArticleId === article.id;
                  return (
                    <article key={article.id} className="operations-member-card">
                      <h4>{article.name}</h4>
                      <p className="hint">
                        Prix d'achat de référence:{" "}
                        {article.defaultPurchaseUnitPrice
                          ? formatAmountForDisplay(article.defaultPurchaseUnitPrice)
                          : "Non défini"}
                      </p>
                      <p className="hint">
                        Bénéfice de référence:{" "}
                        {article.defaultMargin ? formatAmountForDisplay(article.defaultMargin) : "Non défini"}
                      </p>
                      <div className="actions-inline">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleStartEditArticle(article)}
                          disabled={isBusy}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => handleDeleteArticle(article)}
                          disabled={isBusy}
                        >
                          Supprimer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="hint">{articleSearch.trim() ? "Aucun article ne correspond à votre recherche." : "Aucun article enregistré pour le moment."}</p>
            )}
      </section>
      <section className="panel finance-page-panel">
          <details
            id="article-management"
            className="finance-section-toggle"
            open={isArticleManagementExpanded}
            onToggle={(event) => setIsArticleManagementExpanded(event.currentTarget.open)}
          >
            <summary className="finance-section-summary">
              <span>{editingArticleId ? "Modifier un article" : "Ajouter un article"}</span>
              <small>
                {editingArticleId
                  ? "Modification d'un article du catalogue."
                  : "Ajoutez les articles vendus par la quincaillerie pour les retrouver en sélection."}
              </small>
            </summary>
            <form className="finance-account-form" onSubmit={handleSaveArticle} onChangeCapture={articleChanges.onChangeCapture} data-unsaved-sector-form={articleChanges.isDirty ? "true" : undefined}>
              <label className="operations-inline-group">
                <span>Nom de l'article</span>
                <input
                  type="text"
                  placeholder="Ex: Ciment, Barre fer 08, Tôle 4kg"
                  value={articleForm.name}
                  onChange={(event) =>
                    setArticleForm((prev) => ({
                      ...prev,
                      name: event.target.value
                    }))
                  }
                  required
                />
              </label>
              <label className="operations-inline-group">
                <span>Prix d'achat de référence</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Optionnel, ex: 5000"
                  value={articleForm.defaultPurchaseUnitPrice}
                  onChange={(event) =>
                    setArticleForm((prev) => ({
                      ...prev,
                      defaultPurchaseUnitPrice: formatEditableAmountForInput(event.target.value)
                    }))
                  }
                  onBlur={() =>
                    setArticleForm((prev) => ({
                      ...prev,
                      defaultPurchaseUnitPrice: formatAmountForInput(prev.defaultPurchaseUnitPrice)
                    }))
                  }
                />
                <small className="hint">
                  Pré-remplit le prix d'achat quand cet article est choisi dans une opération.
                </small>
              </label>
              <label className="operations-inline-group">
                <span>Bénéfice de référence</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Optionnel, ex: 1500"
                  value={articleForm.defaultMargin}
                  onChange={(event) =>
                    setArticleForm((prev) => ({
                      ...prev,
                      defaultMargin: formatEditableAmountForInput(event.target.value)
                    }))
                  }
                  onBlur={() =>
                    setArticleForm((prev) => ({
                      ...prev,
                      defaultMargin: formatAmountForInput(prev.defaultMargin)
                    }))
                  }
                />
              </label>
              <div className="mobile-sticky-form-actions">
                <button type="submit" disabled={isSavingArticle}>
                  {isSavingArticle ? (
                    <>
                      <ButtonSpinner />
                      Enregistrement...
                    </>
                  ) : editingArticleId ? (
                    "Enregistrer les modifications"
                  ) : (
                    "Ajouter l'article"
                  )}
                </button>
                {editingArticleId ? (
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={handleCancelEditArticle}
                    disabled={isSavingArticle}
                  >
                    Annuler la modification
                  </button>
                ) : null}
              </div>
            </form>

          </details>
        </section>
    </>
  );
}

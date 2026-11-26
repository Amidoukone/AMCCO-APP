import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBeverageStockRequest } from "./api";
import { useAuthorizedRequest } from "./useAuthorizedRequest";
import type { BeverageProduct, BeverageStockLoss } from "../types/beverage-stock";

export function useBeverageStock(companyId: string | undefined, enabled: boolean) {
  const authorize = useAuthorizedRequest();
  const scope = enabled ? companyId : undefined;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const sequence = useRef(0);
  const [state, setState] = useState<{
    scope?: string; items: BeverageProduct[]; losses: BeverageStockLoss[]; canArchiveProducts: boolean; loading: boolean; error: string | null;
  }>({ items: [], losses: [], canArchiveProducts: false, loading: false, error: null });
  const refresh = useCallback(async () => {
    if (!scope) return;
    const requestId = ++sequence.current;
    setState((old) => ({
      scope,
      items: old.scope === scope ? old.items : [],
      losses: old.scope === scope ? old.losses : [],
      canArchiveProducts: old.scope === scope && old.canArchiveProducts,
      loading: true,
      error: null
    }));
    try {
      const { items, losses, canArchiveProducts } = await authorize(getBeverageStockRequest);
      if (scopeRef.current === scope && sequence.current === requestId) {
        setState({ scope, items, losses: losses ?? [], canArchiveProducts: canArchiveProducts === true, loading: false, error: null });
      }
    } catch (error) {
      const message = error instanceof ApiError && error.statusCode === 503 ? error.message
        : error instanceof ApiError && error.statusCode < 500 ? error.message
          : "Impossible de charger le stock pour le moment. Réessayez ; si le problème persiste, prévenez le comptable ou l'administrateur.";
      if (scopeRef.current === scope && sequence.current === requestId) {
        setState({ scope, items: [], losses: [], canArchiveProducts: false, loading: false, error: message });
      }
    }
  }, [scope, authorize]);
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [refresh]);
  return {
    items: scope && state.scope === scope ? state.items : [],
    losses: scope && state.scope === scope ? state.losses : [],
    canArchiveProducts: Boolean(scope && state.scope === scope && state.canArchiveProducts),
    loading: Boolean(scope && (state.scope !== scope || state.loading)),
    error: state.scope === scope ? state.error : null,
    refresh
  };
}

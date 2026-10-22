import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBeverageStockRequest } from "./api";
import { useAuthorizedRequest } from "./useAuthorizedRequest";
import type { BeverageProduct } from "../types/beverage-stock";

export function useBeverageStock(companyId: string | undefined, enabled: boolean) {
  const authorize = useAuthorizedRequest();
  const scope = enabled ? companyId : undefined;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const sequence = useRef(0);
  const [state, setState] = useState<{ scope?: string; items: BeverageProduct[]; loading: boolean; error: string | null }>({ items: [], loading: false, error: null });
  const refresh = useCallback(async () => {
    if (!scope) return;
    const requestId = ++sequence.current;
    setState((old) => ({ scope, items: old.scope === scope ? old.items : [], loading: true, error: null }));
    try {
      const { items } = await authorize(getBeverageStockRequest);
      if (scopeRef.current === scope && sequence.current === requestId) setState({ scope, items, loading: false, error: null });
    } catch (error) {
      const message = error instanceof ApiError && error.statusCode === 503 ? error.message
        : error instanceof ApiError && error.statusCode < 500 ? error.message
          : "Impossible de charger le stock pour le moment. Réessayez ; si le problème persiste, prévenez le comptable ou l'administrateur.";
      if (scopeRef.current === scope && sequence.current === requestId) setState({ scope, items: [], loading: false, error: message });
    }
  }, [scope, authorize]);
  useEffect(() => { void refresh(); return () => { sequence.current++; }; }, [refresh]);
  return { items: scope && state.scope === scope ? state.items : [],
    loading: Boolean(scope && (state.scope !== scope || state.loading)),
    error: state.scope === scope ? state.error : null, refresh };
}

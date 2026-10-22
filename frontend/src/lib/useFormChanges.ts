import { useCallback, useRef, useState } from "react";

// Track user edits, while accepting programmatic defaults until the first edit.
export function useFormChanges<T>(value: T, scope: string) {
  const serialized = JSON.stringify(value);
  const baseline = useRef({ scope, value: serialized });
  const [touchedScope, setTouchedScope] = useState<string | null>(null);
  if (baseline.current.scope !== scope || touchedScope !== scope) {
    baseline.current = { scope, value: serialized };
  }
  const isDirty = touchedScope === scope && baseline.current.value !== serialized;
  return {
    isDirty,
    onChangeCapture: () => setTouchedScope(scope),
    markClean: useCallback(() => setTouchedScope(null), []),
    confirmDiscard: () => !isDirty || window.confirm("Des modifications ne sont pas enregistrées. Abandonner cette saisie ?")
  };
}

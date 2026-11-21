import { useCallback, useEffect, useRef } from "react";

// Discard UI effects of an old action after a context change or unmount. The
// network operation itself is not cancelled: the server may have committed it.
export function useActionScope(key: string): () => () => boolean {
  const scope = useRef({ key, version: 0 });
  if (scope.current.key !== key) {
    scope.current = { key, version: scope.current.version + 1 };
  }
  useEffect(() => () => {
    scope.current.version += 1;
  }, []);
  return useCallback(() => {
    const version = scope.current.version;
    return () => scope.current.version === version;
  }, []);
}

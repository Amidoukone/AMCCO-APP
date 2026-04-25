import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

function readStoredValue<T>(storageKey: string, fallbackValue: T): T {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return fallbackValue;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallbackValue;
  }
}

function writeStoredValue<T>(storageKey: string, value: T): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

export function buildPersistedViewStorageKey(
  viewId: string,
  companyId: string | null | undefined,
  userId: string | null | undefined
): string | null {
  if (!companyId || !userId) {
    return null;
  }

  return `amcco:view:${viewId}:${companyId}:${userId}`;
}

export function usePersistedViewState<T>(
  storageKey: string | null,
  initialState: T
): readonly [T, Dispatch<SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() =>
    storageKey ? readStoredValue(storageKey, initialState) : initialState
  );

  useEffect(() => {
    if (!storageKey) {
      setState(initialState);
      return;
    }

    setState(readStoredValue(storageKey, initialState));
  }, [initialState, storageKey]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    writeStoredValue(storageKey, state);
  }, [state, storageKey]);

  const resetState = useCallback(() => {
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
    setState(initialState);
  }, [initialState, storageKey]);

  return [state, setState, resetState] as const;
}

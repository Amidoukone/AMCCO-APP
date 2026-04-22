import type { SessionTokens } from "../types/auth";

const STORAGE_KEY = "amcco_session_v1";

export function loadSessionTokens(): SessionTokens | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SessionTokens>;
    if (!parsed.accessToken || !parsed.refreshToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      companyCode: parsed.companyCode,
      companyId: parsed.companyId
    };
  } catch {
    return null;
  }
}

export function saveSessionTokens(tokens: SessionTokens): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

export function clearSessionTokens(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

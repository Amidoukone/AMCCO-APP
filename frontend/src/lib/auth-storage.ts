import type { SessionTokens } from "../types/auth";

const STORAGE_KEY = "amcco_session_v1";

export function isAccessTokenExpired(token: string, now = Date.now()): boolean {
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) {
    return false;
  }

  try {
    const unpaddedBase64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const base64 = unpaddedBase64 + "=".repeat((4 - unpaddedBase64.length % 4) % 4);
    const payload = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) && payload.exp * 1_000 <= now;
  } catch {
    return false;
  }
}

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

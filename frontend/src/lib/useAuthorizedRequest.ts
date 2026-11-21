import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "./api";

export function useAuthorizedRequest(): <T>(
  action: (accessToken: string) => Promise<T>
) => Promise<T> {
  const { getSession, getRequestContext, refreshSession } = useAuth();

  return useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      const currentSession = getSession();
      const context = getRequestContext();
      const ensureCurrentContext = (): void => {
        if (getRequestContext() !== context) throw new ApiError(409, "Le contexte a changé. Relancez l'action depuis l'écran actuel.");
      };
      if (!currentSession?.accessToken) {
        throw new ApiError(401, "Session absente.");
      }

      try {
        return await action(currentSession.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }

        ensureCurrentContext();
        // Another request may already have renewed this same session.
        const latestSession = getSession();
        if (latestSession && latestSession.accessToken !== currentSession.accessToken) {
          return action(latestSession.accessToken);
        }
        const refreshedAccessToken = await refreshSession();
        ensureCurrentContext();
        if (!refreshedAccessToken) {
          throw new ApiError(401, "Session expirée. Reconnectez-vous.");
        }

        return action(refreshedAccessToken);
      }
    },
    [getSession, getRequestContext, refreshSession]
  );
}

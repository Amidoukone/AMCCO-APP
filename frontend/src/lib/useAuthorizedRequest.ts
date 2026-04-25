import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "./api";

export function useAuthorizedRequest(): <T>(
  action: (accessToken: string) => Promise<T>
) => Promise<T> {
  const { refreshSession, session } = useAuth();

  return useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      if (!session?.accessToken) {
        throw new ApiError(401, "Session absente.");
      }

      try {
        return await action(session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }

        const refreshedAccessToken = await refreshSession();
        if (!refreshedAccessToken) {
          throw new ApiError(401, "Session expirée. Reconnectez-vous.");
        }

        return action(refreshedAccessToken);
      }
    },
    [refreshSession, session?.accessToken]
  );
}

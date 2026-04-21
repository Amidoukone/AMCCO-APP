import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { ApiError, loginRequest, logoutRequest, meRequest, refreshRequest } from "../lib/api";
import { clearSessionTokens, loadSessionTokens, saveSessionTokens } from "../lib/auth-storage";
import type { LoginInput, LoginUser, SessionTokens } from "../types/auth";
import { isRoleCode } from "../types/role";

type AuthState = {
  isInitializing: boolean;
  isAuthenticated: boolean;
  user: LoginUser | null;
  session: SessionTokens | null;
  login: (input: LoginInput) => Promise<void>;
  refreshSession: () => Promise<string | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function toLoginUser(me: Awaited<ReturnType<typeof meRequest>>, companyCode: string): LoginUser {
  const safeRole = isRoleCode(me.user.role) ? me.user.role : "EMPLOYEE";
  return {
    id: me.user.id,
    email: me.user.email,
    fullName: me.user.fullName,
    role: safeRole,
    companyId: me.companyId,
    companyCode
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [session, setSession] = useState<SessionTokens | null>(null);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const resetAuth = useCallback(() => {
    setUser(null);
    setSession(null);
    clearSessionTokens();
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const response = await loginRequest(input);
    const nextTokens: SessionTokens = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      companyCode: response.user.companyCode
    };
    setSession(nextTokens);
    setUser(response.user);
    saveSessionTokens(nextTokens);
  }, []);

  const logout = useCallback(async () => {
    if (session?.refreshToken) {
      try {
        await logoutRequest(session.refreshToken);
      } catch {
        // no-op: local logout must still succeed
      }
    }
    resetAuth();
  }, [resetAuth, session?.refreshToken]);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (!session?.refreshToken) {
      resetAuth();
      return null;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshPromise = (async (): Promise<string | null> => {
      try {
        const refreshed = await refreshRequest(session.refreshToken);
        const nextTokens: SessionTokens = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          companyCode: session.companyCode ?? "AMCCO"
        };

        const me = await meRequest(nextTokens.accessToken);
        const nextUser = toLoginUser(me, nextTokens.companyCode ?? "AMCCO");

        setSession(nextTokens);
        setUser(nextUser);
        saveSessionTokens(nextTokens);
        return nextTokens.accessToken;
      } catch {
        resetAuth();
        return null;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    return refreshPromise;
  }, [resetAuth, session?.companyCode, session?.refreshToken]);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async (): Promise<void> => {
      const persisted = loadSessionTokens();
      if (!persisted) {
        if (isMounted) {
          setIsInitializing(false);
        }
        return;
      }

      try {
        const me = await meRequest(persisted.accessToken);
        if (!isMounted) {
          return;
        }
        setSession(persisted);
        setUser(toLoginUser(me, persisted.companyCode ?? "AMCCO"));
        setIsInitializing(false);
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          if (isMounted) {
            resetAuth();
            setIsInitializing(false);
          }
          return;
        }
      }

      try {
        const refreshed = await refreshRequest(persisted.refreshToken);
        const nextTokens: SessionTokens = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          companyCode: persisted.companyCode ?? "AMCCO"
        };
        const me = await meRequest(nextTokens.accessToken);
        if (!isMounted) {
          return;
        }
        setSession(nextTokens);
        setUser(toLoginUser(me, nextTokens.companyCode ?? "AMCCO"));
        saveSessionTokens(nextTokens);
      } catch {
        if (!isMounted) {
          return;
        }
        resetAuth();
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, [resetAuth]);

  const value = useMemo<AuthState>(
    () => ({
      isInitializing,
      isAuthenticated: Boolean(session && user),
      user,
      session,
      login,
      refreshSession,
      logout
    }),
    [isInitializing, login, logout, refreshSession, session, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}

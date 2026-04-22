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
import {
  ApiError,
  loginRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  switchCompanyRequest
} from "../lib/api";
import { clearSessionTokens, loadSessionTokens, saveSessionTokens } from "../lib/auth-storage";
import type { LoginInput, LoginUser, SessionTokens } from "../types/auth";
import type { CompanyMembershipSummary, CompanyProfile } from "../types/companies";
import { isRoleCode } from "../types/role";

type AuthState = {
  isInitializing: boolean;
  isAuthenticated: boolean;
  user: LoginUser | null;
  session: SessionTokens | null;
  activeCompany: CompanyProfile | null;
  memberships: CompanyMembershipSummary[];
  login: (input: LoginInput) => Promise<void>;
  refreshSession: () => Promise<string | null>;
  switchCompany: (companyId: string) => Promise<void>;
  reloadProfile: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function toLoginUser(me: Awaited<ReturnType<typeof meRequest>>): LoginUser {
  const safeRole = isRoleCode(me.user.role) ? me.user.role : "EMPLOYEE";
  return {
    id: me.user.id,
    email: me.user.email,
    fullName: me.user.fullName,
    role: safeRole,
    companyId: me.company?.id ?? null,
    companyCode: me.company?.code ?? null,
    bootstrapMode: me.bootstrapMode
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isInitializing, setIsInitializing] = useState(true);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [session, setSession] = useState<SessionTokens | null>(null);
  const [activeCompany, setActiveCompany] = useState<CompanyProfile | null>(null);
  const [memberships, setMemberships] = useState<CompanyMembershipSummary[]>([]);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const resetAuth = useCallback(() => {
    setUser(null);
    setSession(null);
    setActiveCompany(null);
    setMemberships([]);
    clearSessionTokens();
  }, []);

  const applyAuthenticatedState = useCallback(
    (nextTokens: SessionTokens, me: Awaited<ReturnType<typeof meRequest>>) => {
      const normalizedTokens: SessionTokens = {
        accessToken: nextTokens.accessToken,
        refreshToken: nextTokens.refreshToken,
        companyCode: me.company?.code,
        companyId: me.company?.id
      };

      setSession(normalizedTokens);
      setUser(toLoginUser(me));
      setActiveCompany(me.company ?? null);
      setMemberships(me.memberships);
      saveSessionTokens(normalizedTokens);
    },
    []
  );

  const login = useCallback(async (input: LoginInput) => {
    const response = await loginRequest(input);
    const baseTokens: SessionTokens = {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken
    };
    const me = await meRequest(response.accessToken);
    applyAuthenticatedState(baseTokens, me);
  }, [applyAuthenticatedState]);

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
          refreshToken: refreshed.refreshToken
        };

        const me = await meRequest(nextTokens.accessToken);
        applyAuthenticatedState(nextTokens, me);
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
  }, [applyAuthenticatedState, resetAuth, session?.refreshToken]);

  const switchCompany = useCallback(
    async (companyId: string): Promise<void> => {
      if (!session?.refreshToken) {
        resetAuth();
        return;
      }
      if (activeCompany?.id === companyId) {
        return;
      }

      const switched = await switchCompanyRequest(session.refreshToken, companyId);
      const nextTokens: SessionTokens = {
        accessToken: switched.accessToken,
        refreshToken: switched.refreshToken
      };
      const me = await meRequest(nextTokens.accessToken);
      applyAuthenticatedState(nextTokens, me);
    },
    [activeCompany, applyAuthenticatedState, resetAuth, session?.refreshToken]
  );

  const reloadProfile = useCallback(async (): Promise<void> => {
    if (!session?.accessToken || !session.refreshToken) {
      resetAuth();
      return;
    }

    try {
      const me = await meRequest(session.accessToken);
      applyAuthenticatedState(session, me);
    } catch (error) {
      if (!(error instanceof ApiError) || error.statusCode !== 401) {
        throw error;
      }

      const refreshedAccessToken = await refreshSession();
      if (!refreshedAccessToken) {
        throw new ApiError(401, "Session expiree. Reconnecte-toi.");
      }
    }
  }, [applyAuthenticatedState, resetAuth, session, refreshSession]);

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
        applyAuthenticatedState(persisted, me);
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
          refreshToken: refreshed.refreshToken
        };
        const me = await meRequest(nextTokens.accessToken);
        if (!isMounted) {
          return;
        }
        applyAuthenticatedState(nextTokens, me);
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
  }, [applyAuthenticatedState, resetAuth]);

  const value = useMemo<AuthState>(
    () => ({
      isInitializing,
      isAuthenticated: Boolean(session && user),
      user,
      session,
      activeCompany,
      memberships,
      login,
      refreshSession,
      switchCompany,
      reloadProfile,
      logout
    }),
    [
      activeCompany,
      isInitializing,
      login,
      logout,
      memberships,
      refreshSession,
      reloadProfile,
      session,
      switchCompany,
      user
    ]
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

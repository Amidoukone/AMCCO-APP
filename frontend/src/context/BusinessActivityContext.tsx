import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../config/businessActivities";
import { ApiError, listCompanyActivitiesRequest } from "../lib/api";
import type { BusinessActivityProfile, CompanyActivityItem } from "../types/activities";
import { useAuth } from "./AuthContext";

type BusinessActivityContextValue = {
  activities: CompanyActivityItem[];
  enabledActivities: CompanyActivityItem[];
  profiles: BusinessActivityProfile[];
  selectedActivity: CompanyActivityItem | null;
  selectedProfile: BusinessActivityProfile | null;
  selectedActivityCode: BusinessActivityCode | null;
  isLoading: boolean;
  errorMessage: string | null;
  setSelectedActivityCode: (activityCode: BusinessActivityCode) => void;
  reloadActivities: () => Promise<void>;
};

const STORAGE_PREFIX = "amcco:selected-activity";

const BusinessActivityContext = createContext<BusinessActivityContextValue | null>(null);

function getStorageKey(companyId: string): string {
  return `${STORAGE_PREFIX}:${companyId}`;
}

function readPersistedActivityCode(companyId: string): BusinessActivityCode | null {
  const stored = window.localStorage.getItem(getStorageKey(companyId));
  return stored && isBusinessActivityCode(stored) ? stored : null;
}

function persistActivityCode(companyId: string, activityCode: BusinessActivityCode | null): void {
  const key = getStorageKey(companyId);
  if (!activityCode) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, activityCode);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Chargement impossible des secteurs d'activité.";
}

export function BusinessActivityProvider({ children }: { children: ReactNode }): JSX.Element {
  const { activeCompany, refreshSession, session, user } = useAuth();
  const [activities, setActivities] = useState<CompanyActivityItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessActivityProfile[]>([]);
  const [selectedActivityCode, setSelectedActivityCodeState] =
    useState<BusinessActivityCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const syncSelectedActivity = useCallback(
    (items: CompanyActivityItem[], preferredCode: BusinessActivityCode | null = null) => {
      if (!activeCompany?.id) {
        setSelectedActivityCodeState(null);
        return;
      }

      const enabledItems = items.filter((item) => item.isEnabled);
      const persistedCode = readPersistedActivityCode(activeCompany.id);
      const nextSelectedCode =
        enabledItems.find((item) => item.code === preferredCode)?.code ??
        enabledItems.find((item) => item.code === persistedCode)?.code ??
        enabledItems[0]?.code ??
        null;

      setSelectedActivityCodeState(nextSelectedCode);
      persistActivityCode(activeCompany.id, nextSelectedCode);
    },
    [activeCompany?.id]
  );

  const withAuthorizedToken = useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      if (!session?.accessToken) {
        throw new ApiError(401, "Session absente");
      }

      try {
        return await action(session.accessToken);
      } catch (error) {
        if (!(error instanceof ApiError) || error.statusCode !== 401) {
          throw error;
        }

        const refreshedAccessToken = await refreshSession();
        if (!refreshedAccessToken) {
          throw new ApiError(401, "Session expiree. Reconnecte-toi.");
        }
        return action(refreshedAccessToken);
      }
    },
    [refreshSession, session?.accessToken]
  );

  const reloadActivities = useCallback(async () => {
    if (!user || !activeCompany) {
      setActivities([]);
      setProfiles([]);
      setSelectedActivityCodeState(null);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await withAuthorizedToken((accessToken) =>
        listCompanyActivitiesRequest(accessToken)
      );
      setActivities(response.items);
      setProfiles(response.profiles);
      syncSelectedActivity(response.items, selectedActivityCode);
    } catch (error) {
      setActivities([]);
      setProfiles([]);
      setSelectedActivityCodeState(null);
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [activeCompany, selectedActivityCode, syncSelectedActivity, user, withAuthorizedToken]);

  useEffect(() => {
    void reloadActivities();
  }, [reloadActivities]);

  const setSelectedActivityCode = useCallback(
    (activityCode: BusinessActivityCode) => {
      setSelectedActivityCodeState(activityCode);
      if (activeCompany?.id) {
        persistActivityCode(activeCompany.id, activityCode);
      }
    },
    [activeCompany?.id]
  );

  const selectedActivity = useMemo(
    () => activities.find((item) => item.code === selectedActivityCode) ?? null,
    [activities, selectedActivityCode]
  );

  const selectedProfile = useMemo(
    () => profiles.find((item) => item.activityCode === selectedActivityCode) ?? null,
    [profiles, selectedActivityCode]
  );

  const enabledActivities = useMemo(
    () => activities.filter((item) => item.isEnabled),
    [activities]
  );

  const value = useMemo<BusinessActivityContextValue>(
    () => ({
      activities,
      enabledActivities,
      profiles,
      selectedActivity,
      selectedProfile,
      selectedActivityCode,
      isLoading,
      errorMessage,
      setSelectedActivityCode,
      reloadActivities
    }),
    [
      activities,
      enabledActivities,
      errorMessage,
      isLoading,
      profiles,
      reloadActivities,
      selectedActivity,
      selectedProfile,
      selectedActivityCode,
      setSelectedActivityCode
    ]
  );

  return (
    <BusinessActivityContext.Provider value={value}>
      {children}
    </BusinessActivityContext.Provider>
  );
}

export function useBusinessActivity(): BusinessActivityContextValue {
  const context = useContext(BusinessActivityContext);
  if (!context) {
    throw new Error("useBusinessActivity must be used inside BusinessActivityProvider");
  }
  return context;
}

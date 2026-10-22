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
  isBusinessActivityCode,
  type BusinessActivityCode
} from "../config/businessActivities";
import { ApiError, listCompanyActivitiesRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import type { BusinessActivityProfile, CompanyActivityItem } from "../types/activities";
import { getRoleActivityCode } from "../types/role";
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
  setSelectedActivityCode: (activityCode: BusinessActivityCode | null) => void;
  applyActivityUpdate: (activity: CompanyActivityItem) => void;
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
  const { activeCompany, user } = useAuth();
  const restrictedActivityCode = user ? getRoleActivityCode(user.role) : null;
  const activeCompanyId = activeCompany?.id;
  const currentCompanyRef = useRef(activeCompanyId);
  currentCompanyRef.current = activeCompanyId;
  const [activities, setActivities] = useState<CompanyActivityItem[]>([]);
  const [profiles, setProfiles] = useState<BusinessActivityProfile[]>([]);
  const [activitiesCompanyId, setActivitiesCompanyId] = useState<string | undefined>();
  const selectionCompanyRef = useRef<string | undefined>();
  const isCurrentCompany = activitiesCompanyId === activeCompanyId;
  const [selectedActivityCode, setSelectedActivityCodeState] =
    useState<BusinessActivityCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activitiesRequestRef = useRef(0);
  const withAuthorizedToken = useAuthorizedRequest();

  const syncSelectedActivity = useCallback(
    (items: CompanyActivityItem[]) => {
      if (!activeCompany?.id) {
        setSelectedActivityCodeState(null);
        return;
      }

      const enabledItems = items.filter((item) => item.isEnabled);
      const persistedCode = readPersistedActivityCode(activeCompany.id);
      const keepCurrentSelection = selectionCompanyRef.current === activeCompany.id;
      selectionCompanyRef.current = activeCompany.id;

      setSelectedActivityCodeState((currentCode) => {
        if (restrictedActivityCode) {
          const scopedCode = enabledItems.find((item) => item.code === restrictedActivityCode)?.code ?? null;
          persistActivityCode(activeCompany.id, scopedCode);
          return scopedCode;
        }
        const nextSelectedCode =
          (keepCurrentSelection ? enabledItems.find((item) => item.code === currentCode)?.code : undefined) ??
          enabledItems.find((item) => item.code === persistedCode)?.code ??
          enabledItems[0]?.code ??
          null;

        persistActivityCode(activeCompany.id as string, nextSelectedCode);
        return nextSelectedCode;
      });
    },
    [activeCompany?.id, restrictedActivityCode]
  );

  const reloadActivities = useCallback(async () => {
    const requestId = ++activitiesRequestRef.current;
    if (!user || !activeCompanyId) {
      setActivities([]);
      setProfiles([]);
      setActivitiesCompanyId(undefined);
      selectionCompanyRef.current = undefined;
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
      if (requestId !== activitiesRequestRef.current || currentCompanyRef.current !== activeCompanyId) return;
      setActivities(response.items);
      setProfiles(response.profiles);
      setActivitiesCompanyId(activeCompanyId);
      syncSelectedActivity(response.items);
    } catch (error) {
      if (requestId !== activitiesRequestRef.current || currentCompanyRef.current !== activeCompanyId) return;
      setActivities([]);
      setProfiles([]);
      setActivitiesCompanyId(activeCompanyId);
      setSelectedActivityCodeState(null);
      setErrorMessage(toErrorMessage(error));
    } finally {
      if (requestId === activitiesRequestRef.current) setIsLoading(false);
    }
  }, [activeCompanyId, syncSelectedActivity, user, withAuthorizedToken]);

  useEffect(() => {
    void reloadActivities();
  }, [reloadActivities]);

  const setSelectedActivityCode = useCallback(
    (activityCode: BusinessActivityCode | null) => {
      if (restrictedActivityCode && activityCode !== restrictedActivityCode) return;
      if (!isCurrentCompany || (activityCode && !activities.some((item) => item.code === activityCode && item.isEnabled))) return;
      setSelectedActivityCodeState(activityCode);
      if (activeCompany?.id) {
        persistActivityCode(activeCompany.id, activityCode);
      }
    },
    [activeCompany?.id, activities, isCurrentCompany, restrictedActivityCode]
  );

  const applyActivityUpdate = useCallback(
    (updatedActivity: CompanyActivityItem) => {
      if (!isCurrentCompany || currentCompanyRef.current !== activeCompanyId) return;
      const nextActivities = activities.some((item) => item.code === updatedActivity.code)
        ? activities.map((item) =>
            item.code === updatedActivity.code ? updatedActivity : item
          )
        : [...activities, updatedActivity];
      setActivities(nextActivities);

      if (!updatedActivity.isEnabled && selectedActivityCode === updatedActivity.code) {
        const nextSelectedCode = nextActivities.find((item) => item.isEnabled)?.code ?? null;
        setSelectedActivityCodeState(nextSelectedCode);
        if (activeCompanyId) {
          persistActivityCode(activeCompanyId, nextSelectedCode);
        }
      }
    },
    [activeCompanyId, activities, isCurrentCompany, selectedActivityCode]
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
      activities: isCurrentCompany ? activities : [],
      enabledActivities: isCurrentCompany ? enabledActivities : [],
      profiles: isCurrentCompany ? profiles : [],
      selectedActivity: isCurrentCompany ? selectedActivity : null,
      selectedProfile: isCurrentCompany ? selectedProfile : null,
      selectedActivityCode: isCurrentCompany ? selectedActivityCode : null,
      isLoading: isLoading || !isCurrentCompany,
      errorMessage: isCurrentCompany ? errorMessage : null,
      setSelectedActivityCode,
      applyActivityUpdate,
      reloadActivities
    }),
    [
      activities,
      applyActivityUpdate,
      enabledActivities,
      errorMessage,
      isLoading,
      profiles,
      isCurrentCompany,
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { BusinessActivityCode } from "../config/businessActivities";
import { ApiError, getAlertsSummaryRequest } from "../lib/api";
import { getNavigationForRole, ROLE_LABELS } from "../config/permissions";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";

export function AppLayout(): JSX.Element {
  const { user, logout, refreshSession, session } = useAuth();
  const {
    enabledActivities,
    errorMessage: activityErrorMessage,
    isLoading: isLoadingActivities,
    selectedActivity,
    selectedActivityCode,
    setSelectedActivityCode
  } = useBusinessActivity();
  const location = useLocation();
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);

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
        const refreshed = await refreshSession();
        if (!refreshed) {
          throw error;
        }
        return action(refreshed);
      }
    },
    [refreshSession, session?.accessToken]
  );

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async (): Promise<void> => {
      try {
        const response = await withAuthorizedToken((accessToken) =>
          getAlertsSummaryRequest(accessToken)
        );
        if (isMounted) {
          setUnreadAlertsCount(response.item.unreadCount);
        }
      } catch {
        if (isMounted) {
          setUnreadAlertsCount(0);
        }
      }
    };

    void loadSummary();

    const onAlertsChanged = (): void => {
      void loadSummary();
    };

    window.addEventListener("amcco-alerts-changed", onAlertsChanged);

    return () => {
      isMounted = false;
      window.removeEventListener("amcco-alerts-changed", onAlertsChanged);
    };
  }, [location.pathname, withAuthorizedToken]);

  if (!user) {
    return <main className="page center">Session invalide</main>;
  }

  const navigation = getNavigationForRole(user.role);
  const navigationSections = useMemo(() => {
    return navigation.reduce<Record<string, typeof navigation>>((groups, item) => {
      groups[item.section] = [...(groups[item.section] ?? []), item];
      return groups;
    }, {});
  }, [navigation]);

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <h1>AMCCO</h1>
          <p>Pilotage multi-secteurs</p>
        </div>
        <section className="sidebar-sector-card" aria-label="Secteur actif">
          <p className="sidebar-section-label">Secteur actif</p>
          <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
          <p className="hint">
            {selectedActivity?.description ??
              "Active au moins un secteur pour cadrer les operations et la saisie."}
          </p>
          <select
            className="sidebar-sector-select"
            value={selectedActivityCode ?? ""}
            onChange={(event) =>
              setSelectedActivityCode(event.target.value as BusinessActivityCode)
            }
            disabled={isLoadingActivities || enabledActivities.length === 0}
            aria-label="Selectionner le secteur actif"
          >
            {enabledActivities.length === 0 ? (
              <option value="">Aucun secteur actif</option>
            ) : null}
            {enabledActivities.map((activity) => (
              <option key={activity.code} value={activity.code}>
                {activity.label}
              </option>
            ))}
          </select>
          <p className="sidebar-sector-note">
            Dashboard, Transactions, Taches et Rapports suivent automatiquement ce secteur.
          </p>
          {activityErrorMessage ? <p className="sidebar-error">{activityErrorMessage}</p> : null}
        </section>

        <nav aria-label="Navigation principale">
          {Object.entries(navigationSections).map(([section, items]) => (
            <div key={section} className="nav-section">
              <p className="sidebar-section-label">{section}</p>
              <div className="nav-list">
                {items.map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.to}
                    className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
                  >
                    <span className="nav-item-label">{item.label}</span>
                    {item.key === "alerts" && unreadAlertsCount > 0 ? (
                      <span className="nav-badge">{unreadAlertsCount}</span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div>
            <p className="header-user">{user.fullName}</p>
            <p className="header-meta">
              {ROLE_LABELS[user.role]} | {user.companyCode}
            </p>
            <p className="header-scope">
              Secteur de travail: {selectedActivity?.label ?? "Non defini"}
            </p>
          </div>
          <button className="secondary-btn" type="button" onClick={() => void logout()}>
            Deconnexion
          </button>
        </header>
        <section className="app-content">
          <Outlet />
        </section>
      </div>
    </div>
  );
}

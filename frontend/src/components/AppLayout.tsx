import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { BusinessActivityCode } from "../config/businessActivities";
import { ApiError, getAlertsSummaryRequest } from "../lib/api";
import { getNavigationForRole, ROLE_LABELS } from "../config/permissions";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";

export function AppLayout(): JSX.Element {
  const {
    activeCompany,
    memberships,
    user,
    logout,
    refreshSession,
    session,
    switchCompany
  } = useAuth();
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
  const [isSwitchingCompany, setIsSwitchingCompany] = useState(false);
  const [companySwitchError, setCompanySwitchError] = useState<string | null>(null);
  const canManageCompanies = user?.role === "OWNER" || user?.role === "SYS_ADMIN";
  const isBootstrapMode = !activeCompany;
  const navigation = useMemo(
    () => (user ? getNavigationForRole(user.role) : []),
    [user]
  );
  const visibleNavigation = useMemo(
    () =>
      isBootstrapMode
        ? navigation.filter((item) => item.key === "adminCompanies")
        : navigation,
    [isBootstrapMode, navigation]
  );
  const navigationSections = useMemo(() => {
    return visibleNavigation.reduce<Record<string, typeof visibleNavigation>>((groups, item) => {
      groups[item.section] = [...(groups[item.section] ?? []), item];
      return groups;
    }, {});
  }, [visibleNavigation]);

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
    if (isBootstrapMode) {
      setUnreadAlertsCount(0);
      return;
    }

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
  }, [isBootstrapMode, location.pathname, withAuthorizedToken]);

  if (!user) {
    return <main className="page center">Session invalide</main>;
  }

  async function handleCompanyChange(nextCompanyId: string): Promise<void> {
    if (!nextCompanyId || nextCompanyId === activeCompany?.id) {
      return;
    }

    setCompanySwitchError(null);
    setIsSwitchingCompany(true);
    try {
      await switchCompany(nextCompanyId);
    } catch (error) {
      setCompanySwitchError(
        error instanceof ApiError
          ? error.message
          : "Impossible de changer d'entreprise pour le moment."
      );
    } finally {
      setIsSwitchingCompany(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-block">
          <h1>AMCCO</h1>
          <p>Pilotage multi-secteurs</p>
        </div>
        {isBootstrapMode ? (
          <section className="sidebar-sector-card" aria-label="Mode initialisation">
            <p className="sidebar-section-label">Mode initialisation</p>
            <strong>Aucune entreprise active</strong>
            <p className="hint">
              Cree d'abord une entreprise pour debloquer le tableau de bord, les transactions,
              les taches et les rapports.
            </p>
            <p className="sidebar-sector-note">
              L'application reste accessible, mais seules les fonctions d'administration des
              entreprises sont ouvertes tant que l'initialisation n'est pas terminee.
            </p>
          </section>
        ) : (
          <section className="sidebar-sector-card" aria-label="Secteur actif">
            <p className="sidebar-section-label">Secteur actif</p>
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            <p className="hint">
              {selectedActivity?.description ??
                "Activez au moins un secteur pour structurer les operations et la saisie."}
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
              Le tableau de bord, les transactions, les taches et les rapports suivent ce secteur.
            </p>
            {activityErrorMessage ? <p className="sidebar-error">{activityErrorMessage}</p> : null}
          </section>
        )}

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
          <div className="header-identity-block">
            <p className="header-user">{user.fullName}</p>
            <p className="header-meta">
              {ROLE_LABELS[user.role]} | {activeCompany?.name ?? "Mode initialisation"}
            </p>
            <p className="header-company-code">
              Entreprise active: {activeCompany?.code ?? "Aucune"}
            </p>
            <p className="header-scope">
              Secteur de travail:{" "}
              {isBootstrapMode ? "Initialisation en cours" : selectedActivity?.label ?? "Aucun secteur actif"}
            </p>
            {companySwitchError ? <p className="header-switch-error">{companySwitchError}</p> : null}
          </div>
          <div className="header-actions">
            {activeCompany ? (
              <div className="company-switcher">
                <label htmlFor="active-company">Entreprise</label>
                <select
                  id="active-company"
                  value={activeCompany.id}
                  onChange={(event) => void handleCompanyChange(event.target.value)}
                  disabled={isSwitchingCompany || memberships.length <= 1}
                >
                  {memberships.map((membership) => (
                    <option key={membership.companyId} value={membership.companyId}>
                      {membership.companyName} ({membership.companyCode})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {canManageCompanies ? (
              <Link to="/admin/companies" className="secondary-btn company-manage-link">
                {isBootstrapMode ? "Creer une entreprise" : "Gerer les entreprises"}
              </Link>
            ) : null}
            <button className="secondary-btn" type="button" onClick={() => void logout()}>
              Se deconnecter
            </button>
          </div>
        </header>
        <section className="app-content">
          <Outlet />
        </section>
      </div>
    </div>
  );
}

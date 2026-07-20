import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Breadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";
import { QuickActions } from "./QuickActions";
import { isBusinessActivityCode } from "../config/businessActivities";
import { ApiError, getAlertsSummaryRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";
import { getNavigationForRole, ROLE_LABELS, type FeatureKey } from "../config/permissions";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { enhanceMobileTables } from "../lib/mobileTables";

const amccoLogoUrl = "/logo-amcco-web.jpg";

export function AppLayout(): JSX.Element {
  const { activeCompany, memberships, user, switchCompany } = useAuth();
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const withAuthorizedToken = useAuthorizedRequest();
  const canManageCompanies = user?.role === "SYS_ADMIN";
  const isBootstrapMode = !activeCompany;
  const navigation = useMemo(
    () => (user ? getNavigationForRole(user.role) : []),
    [user]
  );
  const visibleNavigation = useMemo(
    () =>
      isBootstrapMode
        ? navigation.filter((item) => item.key === "adminCompanies" || item.key === "settingsSecurity")
        : navigation,
    [isBootstrapMode, navigation]
  );
  const navigationSections = useMemo(() => {
    return visibleNavigation.reduce<Record<string, typeof visibleNavigation>>((groups, item) => {
      groups[item.section] = [...(groups[item.section] ?? []), item];
      return groups;
    }, {});
  }, [visibleNavigation]);
  const activeNavigationItem = useMemo(
    () =>
      visibleNavigation.find(
        (item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
      ),
    [location.pathname, visibleNavigation]
  );
  const mobilePrimaryNavigation = useMemo(() => {
    const preferredKeys: FeatureKey[] =
      user?.role === "OWNER"
        ? ["dashboard", "financeTransactions", "operationsTasks", "alerts"]
        : ["dashboard", "myWork", "financeTransactions", "alerts"];
    const preferredItems = preferredKeys
      .map((key) => visibleNavigation.find((item) => item.key === key))
      .filter((item): item is typeof visibleNavigation[number] => item !== undefined);

    return (preferredItems.length > 0 ? preferredItems : visibleNavigation).slice(0, 4);
  }, [user?.role, visibleNavigation]);

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

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return undefined;
    }

    let animationFrameId = 0;
    const scheduleEnhancement = (): void => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(() => enhanceMobileTables(root));
    };

    scheduleEnhancement();
    const observer = new MutationObserver(scheduleEnhancement);
    observer.observe(root, {
      childList: true,
      subtree: true
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, [location.pathname]);

  if (!user) {
    return <main className="page center">Session invalide</main>;
  }

  function handleActivityChange(nextValue: string): void {
    setSelectedActivityCode(isBusinessActivityCode(nextValue) ? nextValue : null);
    setIsMobileMenuOpen(false);
  }

  async function handleCompanyChange(nextCompanyId: string): Promise<void> {
    if (!nextCompanyId || nextCompanyId === activeCompany?.id) {
      return;
    }

    setCompanySwitchError(null);
    setIsSwitchingCompany(true);
    try {
      await switchCompany(nextCompanyId);
      setIsMobileMenuOpen(false);
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
        <div className="app-sidebar-inner">
          <div className="brand-block">
          <h1>AMCCO &amp; SND</h1>
          <p>Pilotage multi-secteurs</p>
          </div>
          {isBootstrapMode ? (
          <section className="sidebar-sector-card" aria-label="Mode initialisation">
            <p className="sidebar-section-label">Mode initialisation</p>
            <strong>Aucune entreprise active</strong>
            <p className="hint">
              Crée d'abord une entreprise pour débloquer le tableau de bord, les transactions,
              les tâches et les rapports.
            </p>
            <p className="sidebar-sector-note">
              L'application reste accessible, mais seules les fonctions d'administration des
              entreprises sont ouvertes tant que l'initialisation n'est pas terminée.
            </p>
          </section>
        ) : (
          <section className="sidebar-sector-card" aria-label="Secteur actif">
            <p className="sidebar-section-label">Secteur actif</p>
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
            <p className="hint">
              {selectedActivity?.description ??
                "Activez au moins un secteur pour structurer les opérations et la saisie."}
            </p>
            <select
              className="sidebar-sector-select"
              value={selectedActivityCode ?? ""}
              onChange={(event) => handleActivityChange(event.target.value)}
              disabled={isLoadingActivities || enabledActivities.length === 0}
              aria-label="Sélectionner le secteur actif"
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
              Le tableau de bord, les transactions, les tâches et les rapports suivent ce secteur.
            </p>
            {activityErrorMessage ? <p className="sidebar-error">{activityErrorMessage}</p> : null}
          </section>
          )}

          <nav className="sidebar-nav" aria-label="Navigation principale">
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
          <Link to="/" className="sidebar-public-link">
            Site vitrine
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          <div className="mobile-header-row">
            <button
              type="button"
              className="mobile-menu-toggle"
              aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-app-menu"
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            >
              <span aria-hidden="true" />
            </button>
            <div className="mobile-title-block">
              <p className="header-mobile-title">{activeNavigationItem?.label ?? "Pilotage"}</p>
              <button
                type="button"
                className="mobile-context-summary"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Changer le contexte actif"
              >
                <span>{activeCompany?.name ?? "Initialisation"}</span>
                <span>
                  {isBootstrapMode
                    ? "Entreprise à créer"
                    : selectedActivity?.label ?? "Aucun secteur actif"}
                </span>
              </button>
            </div>
            <div className="mobile-top-actions">
              {unreadAlertsCount > 0 ? (
                <Link to="/alerts" className="mobile-alert-shortcut" aria-label="Alertes non lues">
                  {unreadAlertsCount}
                </Link>
              ) : null}
              <Link to="/" className="topbar-logo-link mobile-topbar-logo" aria-label="Retour au site vitrine">
                <img src={amccoLogoUrl} alt="Logo AMCCO MBAG" />
              </Link>
            </div>
          </div>
          <div className="mobile-context-chips" aria-label="Contexte actif">
            <button
              type="button"
              className="mobile-context-chip"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <span>Secteur</span>
              <strong>
                {isBootstrapMode
                  ? "Initialisation"
                  : selectedActivity?.label ?? "Aucun secteur actif"}
              </strong>
            </button>
            <button
              type="button"
              className="mobile-context-chip"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <span>Entreprise</span>
              <strong>{activeCompany?.name ?? "Aucune entreprise"}</strong>
            </button>
          </div>
          <div className="header-identity-block">
            <p className="header-user">{user.fullName}</p>
            <p className="header-meta">
              {ROLE_LABELS[user.role]} | {activeCompany?.name ?? "Mode initialisation"}
            </p>
            <div className="header-context-row">
              <p className="header-scope">
                Secteur:{" "}
                {isBootstrapMode
                  ? "Initialisation en cours"
                  : selectedActivity?.label ?? "Aucun secteur actif"}
              </p>
            </div>
            {companySwitchError ? <p className="header-switch-error">{companySwitchError}</p> : null}
          </div>
          <div
            className={isMobileMenuOpen ? "mobile-menu-backdrop is-open" : "mobile-menu-backdrop"}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            id="mobile-app-menu"
            className={isMobileMenuOpen ? "mobile-context-panel is-open" : "mobile-context-panel"}
            aria-label="Menu mobile"
            aria-hidden={!isMobileMenuOpen}
          >
            <div className="mobile-app-menu-header">
              <div>
                <p className="header-mobile-kicker">AMCCO &amp; SND</p>
                <strong>Menu</strong>
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fermer le menu"
              >
                X
              </button>
            </div>
            <div className="mobile-smart-menu">
              <div className="mobile-menu-utility-grid" aria-label="Acces rapides">
                <Link
                  to="/"
                  className="mobile-utility-link"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span>Vitrine</span>
                  <strong>Retour au site</strong>
                </Link>
                {canManageCompanies ? (
                  <Link
                    to="/admin/companies"
                    className="mobile-utility-link"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <span>Admin</span>
                    <strong>{isBootstrapMode ? "Entreprise" : "Entreprises"}</strong>
                  </Link>
                ) : null}
              </div>

              <details className="mobile-menu-section" open>
                <summary>
                  <span>Navigation</span>
                  <strong>{activeNavigationItem?.label ?? "Tableau de bord"}</strong>
                </summary>
                <nav className="mobile-drawer-nav mobile-smart-nav" aria-label="Navigation mobile">
                  {Object.entries(navigationSections).map(([section, items]) => (
                    <div key={section} className="mobile-drawer-section">
                      <p className="sidebar-section-label">{section}</p>
                      <div className="mobile-drawer-list">
                        {items.map((item) => (
                          <NavLink
                            key={item.key}
                            to={item.to}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              isActive ? "mobile-drawer-link active" : "mobile-drawer-link"
                            }
                          >
                            <span>{item.label}</span>
                            {item.key === "alerts" && unreadAlertsCount > 0 ? (
                              <strong>{unreadAlertsCount}</strong>
                            ) : null}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ))}
                </nav>
              </details>

              {!isBootstrapMode ? (
                <details className="mobile-menu-section">
                  <summary>
                    <span>Secteur</span>
                    <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
                  </summary>
                  {enabledActivities.length === 0 ? (
                    <p className="hint">Aucun secteur actif pour cette entreprise.</p>
                  ) : (
                    <div className="mobile-choice-list" role="group" aria-label="Choisir un secteur">
                      {enabledActivities.map((activity) => {
                        const isSelected = selectedActivityCode === activity.code;
                        return (
                          <button
                            key={activity.code}
                            type="button"
                            className={isSelected ? "mobile-choice-item is-selected" : "mobile-choice-item"}
                            onClick={() => handleActivityChange(activity.code)}
                            disabled={isLoadingActivities}
                            aria-pressed={isSelected}
                          >
                            <strong>{activity.label}</strong>
                            <span>{isSelected ? "Secteur actif" : "Choisir ce secteur"}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </details>
              ) : (
                <div className="mobile-context-card">
                  <span>Initialisation</span>
                  <strong>Aucune entreprise active</strong>
                </div>
              )}

              {activeCompany ? (
                <details className="mobile-menu-section">
                  <summary>
                    <span>Entreprise</span>
                    <strong>{activeCompany.name}</strong>
                  </summary>
                  <div className="mobile-choice-list" role="group" aria-label="Choisir une entreprise">
                    {memberships.map((membership) => {
                      const isSelected = membership.companyId === activeCompany.id;
                      return (
                        <button
                          key={membership.companyId}
                          type="button"
                          className={isSelected ? "mobile-choice-item is-selected" : "mobile-choice-item"}
                          onClick={() => void handleCompanyChange(membership.companyId)}
                          disabled={isSwitchingCompany || isSelected}
                          aria-pressed={isSelected}
                        >
                          <strong>{membership.companyName}</strong>
                          <span>{isSelected ? "Entreprise active" : "Basculer"}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              ) : null}

              {!isBootstrapMode ? (
                <details className="mobile-menu-section">
                  <summary>
                    <span>Recherche</span>
                    <strong>Pages et modules</strong>
                  </summary>
                  <GlobalSearch
                    className="mobile-drawer-search"
                    inputId="mobile-global-search-input-smart"
                    navigation={visibleNavigation}
                    role={user.role}
                    selectedActivityCode={selectedActivityCode}
                  />
                </details>
              ) : null}
            </div>
            {!isBootstrapMode ? (
              <GlobalSearch
                className="mobile-drawer-search"
                inputId="mobile-global-search-input"
                navigation={visibleNavigation}
                role={user.role}
                selectedActivityCode={selectedActivityCode}
              />
            ) : null}
            {isBootstrapMode ? (
              <div className="mobile-context-card">
                <span>Initialisation</span>
                <strong>Aucune entreprise active</strong>
              </div>
            ) : (
              <section className="mobile-context-group" aria-label="Secteur actif">
                <div className="mobile-context-group-header">
                  <span>Secteur actif</span>
                  <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
                </div>
                {enabledActivities.length === 0 ? (
                  <p className="hint">Aucun secteur actif pour cette entreprise.</p>
                ) : (
                  <div className="mobile-choice-list" role="group" aria-label="Choisir un secteur">
                    {enabledActivities.map((activity) => {
                      const isSelected = selectedActivityCode === activity.code;
                      return (
                        <button
                          key={activity.code}
                          type="button"
                          className={isSelected ? "mobile-choice-item is-selected" : "mobile-choice-item"}
                          onClick={() => handleActivityChange(activity.code)}
                          disabled={isLoadingActivities}
                          aria-pressed={isSelected}
                        >
                          <strong>{activity.label}</strong>
                          <span>{activity.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
            {activeCompany ? (
              <section className="mobile-context-group" aria-label="Entreprise active">
                <div className="mobile-context-group-header">
                  <span>Entreprise</span>
                  <strong>{activeCompany.name}</strong>
                </div>
                <div className="mobile-choice-list" role="group" aria-label="Choisir une entreprise">
                  {memberships.map((membership) => {
                    const isSelected = membership.companyId === activeCompany.id;
                    return (
                      <button
                        key={membership.companyId}
                        type="button"
                        className={isSelected ? "mobile-choice-item is-selected" : "mobile-choice-item"}
                        onClick={() => void handleCompanyChange(membership.companyId)}
                        disabled={isSwitchingCompany || isSelected}
                        aria-pressed={isSelected}
                      >
                        <strong>{membership.companyName}</strong>
                        <span>{isSelected ? "Entreprise active" : "Basculer vers cette entreprise"}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {canManageCompanies ? (
              <Link to="/admin/companies" className="secondary-btn mobile-context-link">
                {isBootstrapMode ? "Créer une entreprise" : "Entreprises"}
              </Link>
            ) : null}
            {companySwitchError ? <p className="header-switch-error">{companySwitchError}</p> : null}
            <nav className="mobile-drawer-nav" aria-label="Navigation mobile">
              {Object.entries(navigationSections).map(([section, items]) => (
                <div key={section} className="mobile-drawer-section">
                  <p className="sidebar-section-label">{section}</p>
                  <div className="mobile-drawer-list">
                    {items.map((item) => (
                      <NavLink
                        key={item.key}
                        to={item.to}
                        className={({ isActive }) =>
                          isActive ? "mobile-drawer-link active" : "mobile-drawer-link"
                        }
                      >
                        <span>{item.label}</span>
                        {item.key === "alerts" && unreadAlertsCount > 0 ? (
                          <strong>{unreadAlertsCount}</strong>
                        ) : null}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>
          {!isBootstrapMode ? (
            <GlobalSearch
              className="desktop-header-search"
              inputId="desktop-global-search-input"
              navigation={visibleNavigation}
              role={user.role}
              selectedActivityCode={selectedActivityCode}
            />
          ) : null}
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
                      {membership.companyName}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {canManageCompanies ? (
              <Link to="/admin/companies" className="secondary-btn company-manage-link">
                {isBootstrapMode ? "Créer une entreprise" : "Gérer les entreprises"}
              </Link>
            ) : null}
            <Link to="/" className="topbar-logo-link desktop-topbar-logo" aria-label="Retour au site vitrine">
              <img src={amccoLogoUrl} alt="Logo AMCCO MBAG" />
            </Link>
          </div>
        </header>
        <section className="app-content" ref={contentRef}>
          {!isBootstrapMode ? (
            <div className="workspace-toolbar">
              <Breadcrumbs />
              <QuickActions
                role={user.role}
                selectedActivityCode={selectedActivityCode}
                navigation={visibleNavigation}
              />
            </div>
          ) : null}
          <Outlet />
        </section>
        {mobilePrimaryNavigation.length > 0 ? (
          <nav className="mobile-bottom-nav" aria-label="Navigation mobile principale">
            {mobilePrimaryNavigation.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "mobile-bottom-nav-item active" : "mobile-bottom-nav-item"
                }
              >
                <span className="mobile-bottom-nav-mark" aria-hidden="true">
                  {item.label.slice(0, 2)}
                </span>
                <span className="mobile-bottom-nav-label">{item.label}</span>
                {item.key === "alerts" && unreadAlertsCount > 0 ? (
                  <strong className="mobile-bottom-nav-badge">{unreadAlertsCount}</strong>
                ) : null}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

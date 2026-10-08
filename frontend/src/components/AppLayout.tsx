import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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

function MobileNavigationIcon({ featureKey }: { featureKey: FeatureKey }): JSX.Element {
  const commonProps = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const
  };

  if (featureKey === "financeTransactions") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18M7 15h3" />
      </svg>
    );
  }

  if (featureKey === "operationsTasks") {
    return (
      <svg {...commonProps}>
        <rect x="5" y="4" width="14" height="17" rx="2.5" />
        <path d="M9 4.5v-1h6v1M8.5 11l2 2 5-5M8.5 17h7" />
      </svg>
    );
  }

  if (featureKey === "alerts") {
    return (
      <svg {...commonProps}>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
    );
  }

  if (featureKey === "reports") {
    return (
      <svg {...commonProps}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    );
  }

  if (featureKey === "adminCompanies") {
    return (
      <svg {...commonProps}>
        <path d="M3 21h18M5 21V5l7-3 7 3v16M9 8h1m4 0h1M9 12h1m4 0h1M10 21v-5h4v5" />
      </svg>
    );
  }

  if (featureKey === "adminUsers" || featureKey === "myWork") {
    return (
      <svg {...commonProps}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 5v1" />
      </svg>
    );
  }

  if (featureKey === "adminActivities") {
    return (
      <svg {...commonProps}>
        <path d="M4 7h16M4 17h16M8 4v6m8 4v6" />
        <circle cx="8" cy="7" r="2" />
        <circle cx="16" cy="17" r="2" />
      </svg>
    );
  }

  if (featureKey === "settingsSecurity") {
    return (
      <svg {...commonProps}>
        <path d="M12 3 19 6v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  if (featureKey === "financeSalaries") {
    return (
      <svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M7 10h10M7 14h4" />
        <circle cx="16" cy="14" r="1" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

export function AppLayout(): JSX.Element {
  const { activeCompany, memberships, user, switchCompany, logout } = useAuth();
  const {
    enabledActivities,
    errorMessage: activityErrorMessage,
    isLoading: isLoadingActivities,
    selectedActivity,
    selectedActivityCode,
    setSelectedActivityCode
  } = useBusinessActivity();
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(0);
  const [isSwitchingCompany, setIsSwitchingCompany] = useState(false);
  const [companySwitchError, setCompanySwitchError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobilePanelMode, setMobilePanelMode] = useState<"menu" | "sectors">("menu");
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const contentRef = useRef<HTMLElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileSectorToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuWasOpenRef = useRef(false);
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
    const preferredKeys: FeatureKey[] = [
      "dashboard",
      "operationsTasks",
      "financeTransactions",
      "reports",
      "alerts"
    ];
    const preferredItems = preferredKeys
      .map((key) => visibleNavigation.find((item) => item.key === key))
      .filter((item): item is typeof visibleNavigation[number] => item !== undefined);

    return (preferredItems.length > 0 ? preferredItems : visibleNavigation).slice(0, 5);
  }, [visibleNavigation]);
  const mobileSecondaryNavigationSections = useMemo(() => {
    const bottomNavigationKeys = new Set(mobilePrimaryNavigation.map((item) => item.key));
    const menuNavigation = isBootstrapMode
      ? visibleNavigation
      : visibleNavigation.filter((item) => !bottomNavigationKeys.has(item.key));

    return menuNavigation.reduce<Record<string, typeof menuNavigation>>((groups, item) => {
      groups[item.section] = [...(groups[item.section] ?? []), item];
      return groups;
    }, {});
  }, [isBootstrapMode, mobilePrimaryNavigation, visibleNavigation]);

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
  }, [activeCompany?.id, isBootstrapMode, withAuthorizedToken]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMobileSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      if (mobileMenuWasOpenRef.current) {
        mobileMenuWasOpenRef.current = false;
        (mobilePanelMode === "sectors"
          ? mobileSectorToggleRef.current
          : mobileMenuToggleRef.current)?.focus();
      }
      return;
    }

    mobileMenuWasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileMenuCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = Array.from(
          mobileMenuRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
          ) ?? []
        ).filter((element) => element.getClientRects().length > 0);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          event.preventDefault();
          mobileMenuRef.current?.focus();
        } else if (!mobileMenuRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? lastElement : firstElement).focus();
        } else if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen, mobilePanelMode]);

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

  async function handleMobileLogout(): Promise<void> {
    await logout();
    setIsMobileMenuOpen(false);
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <a className="skip-to-main" href="#main-content">
        Aller au contenu principal
      </a>
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
              Créez d’abord une entreprise pour activer l’espace de travail.
            </p>
          </section>
        ) : (
          <section className="sidebar-sector-card" aria-label="Secteur actif">
            <p className="sidebar-section-label">Secteur actif</p>
            <strong>{selectedActivity?.label ?? "Aucun secteur actif"}</strong>
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
              ref={mobileMenuToggleRef}
              type="button"
              className="mobile-menu-toggle"
              aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-app-menu"
              onClick={() => {
                setMobilePanelMode("menu");
                setIsMobileSearchOpen(false);
                setIsMobileMenuOpen((isOpen) => !isOpen);
              }}
            >
              <span aria-hidden="true" />
            </button>
            <div className="mobile-title-block">
              <p className="header-mobile-title">{activeNavigationItem?.label ?? "Pilotage"}</p>
            </div>
            <div className="mobile-top-actions">
              {!isBootstrapMode ? (
                <button
                  type="button"
                  className="mobile-sector-shortcut"
                  ref={mobileSectorToggleRef}
                  onClick={() => {
                    setMobilePanelMode("sectors");
                    setIsMobileSearchOpen(false);
                    setIsMobileMenuOpen(true);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="mobile-app-menu"
                  aria-label={`Secteur actif : ${selectedActivity?.label ?? "aucun secteur actif"}. Modifier le secteur.`}
                  title={selectedActivity?.label ?? "Aucun secteur actif"}
                >
                  <span>Secteur</span>
                  <strong>{selectedActivity?.label ?? "Aucun secteur"}</strong>
                </button>
              ) : null}
              <Link to="/" className="topbar-logo-link mobile-topbar-logo" aria-label="Retour au site vitrine">
                <img src={amccoLogoUrl} alt="Logo AMCCO MBAG" />
              </Link>
            </div>
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
            ref={mobileMenuRef}
            id="mobile-app-menu"
            className={isMobileMenuOpen ? "mobile-context-panel is-open" : "mobile-context-panel"}
            role="dialog"
            aria-label={mobilePanelMode === "sectors" ? "Choisir un secteur" : "Menu mobile"}
            aria-modal={isMobileMenuOpen}
            aria-hidden={!isMobileMenuOpen}
            tabIndex={-1}
          >
            <div className="mobile-app-menu-header">
              <div>
                <p className="header-mobile-kicker">AMCCO &amp; SND</p>
                <strong>{mobilePanelMode === "sectors" ? "Secteurs" : "Menu"}</strong>
              </div>
              <button
                ref={mobileMenuCloseRef}
                type="button"
                className="mobile-menu-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Fermer le menu"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m18 6-12 12M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mobile-smart-menu">
              {mobilePanelMode === "sectors" ? (
                <div className="mobile-sector-picker">
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
                </div>
              ) : (
                <>
              {isBootstrapMode ? (
                <div className="mobile-context-card">
                  <span>Initialisation</span>
                  <strong>Aucune entreprise active</strong>
                </div>
              ) : null}
              {!isBootstrapMode ? (
                <>
                  <button
                    type="button"
                    className="mobile-search-toggle"
                    aria-expanded={isMobileSearchOpen}
                    aria-controls="mobile-menu-search"
                    onClick={() => setIsMobileSearchOpen((isOpen) => !isOpen)}
                  >
                    {isMobileSearchOpen ? "Fermer la recherche" : "Rechercher une page"}
                  </button>
                  <div id="mobile-menu-search" hidden={!isMobileSearchOpen}>
                    {isMobileSearchOpen ? (
                      <GlobalSearch
                        className="mobile-drawer-search"
                        inputId="mobile-global-search-input-smart"
                        navigation={visibleNavigation}
                        role={user.role}
                        selectedActivityCode={selectedActivityCode}
                      />
                    ) : null}
                  </div>
                </>
              ) : null}

              <nav className="mobile-smart-nav" aria-label="Navigation mobile">
                {Object.entries(mobileSecondaryNavigationSections).map(([section, items], sectionIndex) => (
                  <details
                    key={section}
                    className="mobile-menu-section mobile-nav-section"
                    open={items.some((item) => item.key === activeNavigationItem?.key) || sectionIndex === 0}
                  >
                    <summary>
                      <span>{section}</span>
                      <strong>{items.length} {items.length > 1 ? "pages" : "page"}</strong>
                    </summary>
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
                  </details>
                ))}
              </nav>

              {activeCompany && memberships.length > 1 ? (
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
                </>
              )}
            </div>
            {companySwitchError ? <p className="header-switch-error">{companySwitchError}</p> : null}
            {mobilePanelMode === "menu" ? (
              <div className="mobile-menu-footer">
                <button
                  type="button"
                  className="secondary-btn mobile-menu-logout"
                  onClick={() => void handleMobileLogout()}
                >
                  Se déconnecter
                </button>
              </div>
            ) : null}
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
        <main className="app-content" id="main-content" ref={contentRef} tabIndex={-1}>
          {!isBootstrapMode ? (
          <div className={user.role === "OWNER" ? "workspace-toolbar mobile-owner-toolbar" : "workspace-toolbar"}>
              <Breadcrumbs />
              <QuickActions
                role={user.role}
                selectedActivityCode={selectedActivityCode}
                navigation={visibleNavigation}
              />
            </div>
          ) : null}
          <Outlet />
        </main>
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
                <span className="mobile-bottom-nav-mark">
                  <MobileNavigationIcon featureKey={item.key} />
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

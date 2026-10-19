import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { isBusinessActivityCode } from "../config/businessActivities";
import { canAccessFeature, type FeatureKey } from "../config/permissions";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";
import { getRoleActivityCode } from "../types/role";

export type SectorWorkspaceAction = {
  label: string;
  onClick: () => void;
};

const SECTOR_PAGES: Array<{ key: FeatureKey; label: string; path: string }> = [
  { key: "dashboard", label: "Vue d’ensemble", path: "/dashboard" },
  { key: "financeTransactions", label: "Transactions", path: "/finance/transactions" },
  { key: "operationsTasks", label: "Tâches", path: "/operations/tasks" },
  { key: "reports", label: "Rapports", path: "/reports" }
];

export function SectorWorkspaceNav({ actions = [] }: { actions?: SectorWorkspaceAction[] }): JSX.Element | null {
  const { user } = useAuth();
  const { enabledActivities, selectedActivity, selectedActivityCode, selectedProfile, setSelectedActivityCode } = useBusinessActivity();
  const location = useLocation();
  const requestedActivityCode = new URLSearchParams(location.search).get("activityCode");
  const restrictedActivityCode = user ? getRoleActivityCode(user.role) : null;

  useEffect(() => {
    if (
      requestedActivityCode &&
      isBusinessActivityCode(requestedActivityCode) &&
      (!restrictedActivityCode || requestedActivityCode === restrictedActivityCode) &&
      enabledActivities.some((activity) => activity.code === requestedActivityCode) &&
      selectedActivityCode !== requestedActivityCode
    ) {
      setSelectedActivityCode(requestedActivityCode);
    }
  }, [enabledActivities, requestedActivityCode, restrictedActivityCode, selectedActivityCode, setSelectedActivityCode]);

  if (!user || !selectedActivityCode || !selectedActivity?.isEnabled) return null;

  const query = `?activityCode=${encodeURIComponent(selectedActivityCode)}`;

  return (
    <section className="panel sector-page-shortcuts" aria-label={`Espace ${selectedActivity.label}`}>
      <div className="sector-page-shortcuts-heading">
        <strong>{selectedActivity.label}</strong>
        <span>{selectedProfile?.reporting.focusArea ?? "Accès au secteur actif"}</span>
      </div>
      <nav className="sector-workspace-tabs" aria-label="Pages du secteur">
        {SECTOR_PAGES.filter((page) => canAccessFeature(user.role, page.key)).map((page) => (
          <Link
            key={page.key}
            to={`${page.path}${query}`}
            className={location.pathname === page.path ? "sector-workspace-tab is-active" : "sector-workspace-tab"}
            aria-current={location.pathname === page.path ? "page" : undefined}
            onClick={(event) => {
              if (
                location.pathname !== page.path &&
                document.querySelector('[data-unsaved-sector-form="true"]') &&
                !window.confirm("Une saisie ou une modification est en cours. Quitter cette page abandonnera le formulaire. Continuer ?")
              ) event.preventDefault();
            }}
          >
            {page.label}
          </Link>
        ))}
      </nav>
      {actions.length > 0 ? (
        <div className="sector-page-shortcuts-actions" role="group" aria-label="Actions du secteur">
          {actions.map((action) => (
            <button key={action.label} type="button" className="secondary-btn" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

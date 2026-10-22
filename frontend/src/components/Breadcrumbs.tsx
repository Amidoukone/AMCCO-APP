import { Link, useLocation } from "react-router-dom";
import { getActiveSectorReferenceView } from "../config/sectorWorkspaces";
import { useAuth } from "../context/AuthContext";
import { useBusinessActivity } from "../context/BusinessActivityContext";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Tableau de bord",
  "my-work": "Mon travail",
  alerts: "Alertes",
  reports: "Rapports",
  finance: "Finance",
  transactions: "Transactions",
  salaries: "Salaires",
  operations: "Opérations",
  tasks: "Tâches",
  admin: "Administration",
  companies: "Entreprises",
  users: "Utilisateurs",
  activities: "Secteurs",
  settings: "Paramètres",
  security: "Sécurité"
};

export function Breadcrumbs(): JSX.Element | null {
  const location = useLocation();
  const { user } = useAuth();
  const { selectedActivityCode } = useBusinessActivity();
  const activeReferenceView = getActiveSectorReferenceView(location.pathname, location.search, selectedActivityCode, user?.role);
  const parts = location.pathname.split("/").filter(Boolean);

  if (parts.length === 0 || location.pathname === "/dashboard") {
    return null;
  }

  const crumbs = parts.map((part, index) => {
    const href = `/${parts.slice(0, index + 1).join("/")}`;
    const isCurrent = index === parts.length - 1;
    const label = isCurrent && activeReferenceView
      ? activeReferenceView.label : ROUTE_LABELS[part] ?? (part.length > 8 ? "Détail" : part);
    return { href, isCurrent, label };
  });

  return (
    <nav className="breadcrumb-nav" aria-label="Fil d'Ariane">
      <Link to="/dashboard">Accueil</Link>
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="breadcrumb-item">
          <span aria-hidden="true">/</span>
          {crumb.isCurrent ? (
            <strong>{crumb.label}</strong>
          ) : (
            <Link to={crumb.href}>{crumb.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

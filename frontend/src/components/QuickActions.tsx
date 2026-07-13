import { Link } from "react-router-dom";
import type { NavigationItem } from "../config/permissions";
import { canAccessFeature, isReadOnlyOwnerRole } from "../config/permissions";
import type { RoleCode } from "../types/role";

type QuickActionsProps = {
  role: RoleCode;
  selectedActivityCode: string | null;
  navigation: NavigationItem[];
};

export function QuickActions({
  role,
  selectedActivityCode,
  navigation
}: QuickActionsProps): JSX.Element {
  const canUse = (key: NavigationItem["key"]): boolean =>
    navigation.some((item) => item.key === key) && canAccessFeature(role, key);
  const isReadOnlyOwner = isReadOnlyOwnerRole(role);
  const activityQuery = selectedActivityCode ? `?activityCode=${selectedActivityCode}` : "";

  const ownerActions = [
    canUse("reports")
      ? {
          label: "Rapports",
          to: "/reports",
          tone: "primary"
        }
      : null,
    canUse("financeTransactions")
      ? {
          label: "Contrôle finance",
          to: `/finance/transactions${activityQuery}`,
          tone: "neutral"
        }
      : null,
    canUse("alerts")
      ? {
          label: "Alertes",
          to: "/alerts",
          tone: "neutral"
        }
      : null,
    canUse("operationsTasks")
      ? {
          label: "Suivi tâches",
          to: `/operations/tasks${activityQuery}`,
          tone: "neutral"
        }
      : null
  ];

  const defaultActions = [
    canUse("operationsTasks")
      ? {
          label: isReadOnlyOwner ? "Voir les t\u00e2ches" : "Nouvelle t\u00e2che",
          to: `/operations/tasks${activityQuery}`,
          tone: "primary"
        }
      : null,
    canUse("financeTransactions")
      ? {
          label: isReadOnlyOwner ? "Voir les transactions" : "Nouvelle transaction",
          to: `/finance/transactions${activityQuery}`,
          tone: "neutral"
        }
      : null,
    canUse("reports")
      ? {
          label: "Rapport du jour",
          to: `/reports${activityQuery}`,
          tone: "neutral"
        }
      : null,
    canUse("alerts")
      ? {
          label: "Alertes",
          to: "/alerts",
          tone: "neutral"
        }
      : null
  ];
  const actions = (isReadOnlyOwner ? ownerActions : defaultActions).filter(
    (item): item is { label: string; to: string; tone: string } => item !== null
  );

  return (
    <div className="quick-actions" aria-label="Actions rapides">
      {actions.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className={action.tone === "primary" ? "quick-action is-primary" : "quick-action"}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

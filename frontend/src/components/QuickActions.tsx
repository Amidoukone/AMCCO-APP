import { Link } from "react-router-dom";
import type { NavigationItem } from "../config/permissions";
import { canAccessFeature } from "../config/permissions";
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
  const activityQuery = selectedActivityCode ? `?activityCode=${selectedActivityCode}` : "";

  const actions = [
    canUse("operationsTasks")
      ? {
          label: "Nouvelle tâche",
          to: `/operations/tasks${activityQuery}`,
          tone: "primary"
        }
      : null,
    canUse("financeTransactions")
      ? {
          label: "Nouvelle transaction",
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
          label: "Alertes critiques",
          to: "/alerts",
          tone: "neutral"
        }
      : null
  ].filter((item): item is { label: string; to: string; tone: string } => item !== null);

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

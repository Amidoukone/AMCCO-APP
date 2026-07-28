import { Link } from "react-router-dom";
import type { NavigationItem } from "../config/permissions";
import { canAccessFeature, isReadOnlyOwnerRole } from "../config/permissions";
import type { RoleCode } from "../types/role";

type QuickActionsProps = {
  role: RoleCode;
  selectedActivityCode: string | null;
  navigation: NavigationItem[];
};

type QuickAction = {
  label: string;
  to: string;
  tone: string;
  description: string;
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
          tone: "primary",
          description: "Ouvrir les synthèses et exports"
        }
      : null,
    canUse("financeTransactions")
      ? {
          label: "Contrôle finance",
          to: `/finance/transactions${activityQuery}`,
          tone: "neutral",
          description: "Consulter les écritures du périmètre"
        }
      : null,
    canUse("alerts")
      ? {
          label: "Alertes",
          to: "/alerts",
          tone: "neutral",
          description: "Voir les signaux à contrôler"
        }
      : null,
    canUse("operationsTasks")
      ? {
          label: "Suivi tâches",
          to: `/operations/tasks${activityQuery}`,
          tone: "neutral",
          description: "Contrôler les blocages et échéances"
        }
      : null
  ];

  const defaultActions = [
    canUse("operationsTasks")
      ? {
          label: isReadOnlyOwner ? "Voir les tâches" : "Nouvelle tâche",
          to: `/operations/tasks${activityQuery}`,
          tone: "primary",
          description: "Créer ou suivre une tâche opérationnelle"
        }
      : null,
    canUse("financeTransactions")
      ? {
          label: isReadOnlyOwner ? "Voir les transactions" : "Nouvelle transaction",
          to: `/finance/transactions${activityQuery}`,
          tone: "neutral",
          description: "Créer ou consulter une écriture financière"
        }
      : null,
    canUse("reports")
      ? {
          label: "Rapport du jour",
          to: `/reports${activityQuery}`,
          tone: "neutral",
          description: "Générer une synthèse du périmètre"
        }
      : null,
    canUse("alerts")
      ? {
          label: "Alertes",
          to: "/alerts",
          tone: "neutral",
          description: "Ouvrir les notifications à traiter"
        }
      : null
  ];
  const actions = (isReadOnlyOwner ? ownerActions : defaultActions).filter(
    (item): item is QuickAction => item !== null
  );

  return (
    <div className="quick-actions" aria-label="Actions rapides">
      {actions.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className={action.tone === "primary" ? "quick-action is-primary" : "quick-action"}
          title={action.description}
          aria-label={`${action.label}: ${action.description}`}
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}

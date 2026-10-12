import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDefaultRouteForRole } from "../config/permissions";

export function ForbiddenPage(): JSX.Element {
  const { user } = useAuth();
  return (
    <section className="panel">
      <h2>Accès refusé</h2>
      <p>Votre rôle ne permet pas d'accéder à cette section.</p>
      <Link to={user ? getDefaultRouteForRole(user.role) : "/dashboard"}>Retour</Link>
    </section>
  );
}

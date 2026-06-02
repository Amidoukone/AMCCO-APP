import { Link } from "react-router-dom";

export function ForbiddenPage(): JSX.Element {
  return (
    <section className="panel">
      <h2>Accès refusé</h2>
      <p>Votre rôle ne permet pas d'accéder à cette section.</p>
      <Link to="/dashboard">Retour au tableau de bord</Link>
    </section>
  );
}

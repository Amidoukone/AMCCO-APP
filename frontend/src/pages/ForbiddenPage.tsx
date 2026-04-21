import { Link } from "react-router-dom";

export function ForbiddenPage(): JSX.Element {
  return (
    <section className="panel">
      <h2>Acces refuse</h2>
      <p>Ton role ne permet pas d'acceder a cette section.</p>
      <Link to="/dashboard">Retour au tableau de bord</Link>
    </section>
  );
}

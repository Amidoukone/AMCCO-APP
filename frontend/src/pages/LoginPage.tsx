import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("bakayoko@amcco.local");
  const [password, setPassword] = useState("Bakayoko1234!");
  const [companyCode, setCompanyCode] = useState("AMCCO");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login({
        email: email.trim().toLowerCase(),
        password,
        companyCode: companyCode.trim().toUpperCase()
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Connexion impossible. Verifie le backend.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page center">
      <section className="card">
        <h1>AMCCO</h1>
        <p>Connexion securisee</p>
        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            placeholder="user@amcco.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />
          <label htmlFor="companyCode">Code entreprise</label>
          <input
            id="companyCode"
            type="text"
            placeholder="AMCCO"
            value={companyCode}
            onChange={(event) => setCompanyCode(event.target.value)}
            required
          />
          {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Connexion..." : "Se connecter"}
          </button>
        </form>
        <p className="hint">Compte dev configure: bakayoko@amcco.local / AMCCO</p>
      </section>
    </main>
  );
}

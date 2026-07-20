import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const LOGIN_BACKEND_ERROR = "Connexion impossible. Vérifiez le backend.";

function normalizeLoginEmail(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await login({
        email: normalizeLoginEmail(email),
        password
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(LOGIN_BACKEND_ERROR);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-brand-mark" aria-hidden="true">
            <span>A</span>
          </div>
          <p>GROUPE NIOUMALA DIADY</p>
          <h1>AMCCO &amp; SND</h1>
        </div>

        <div className="login-card-intro">
          <h2 id="login-title">Connexion</h2>
        </div>

        <form className="form login-form" onSubmit={handleSubmit}>
          <label className="login-field" htmlFor="email">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              placeholder="nom@entreprise.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              autoFocus
            />
          </label>
          <div className="login-field">
            <label className="login-field-label" htmlFor="password">
              Mot de passe
            </label>
            <div className="login-password-control">
              <input
                id="password"
                name="password"
                type={isPasswordVisible ? "text" : "password"}
                placeholder="Votre mot de passe"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                aria-label={isPasswordVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={isPasswordVisible}
              >
                {isPasswordVisible ? "Masquer" : "Afficher"}
              </button>
            </div>
          </div>
          {errorMessage ? <p className="error-box">{errorMessage}</p> : null}
          <button className="login-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </section>
    </main>
  );
}

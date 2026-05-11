import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FeedbackBanner } from "../components/FeedbackBanner";
import { ApiError, changeOwnPasswordRequest } from "../lib/api";
import { useAuthorizedRequest } from "../lib/useAuthorizedRequest";

const SECURITY_PAGE_TITLE = "S\u00e9curit\u00e9 et acc\u00e8s";
const SECURITY_PANEL_TITLE = "S\u00e9curit\u00e9 personnelle";
const OWNER_SECURITY_HINT = "G\u00e9rez votre mot de passe et votre session propri\u00e9taire.";
const USER_SECURITY_HINT = "G\u00e9rez votre mot de passe et votre session active.";
const PASSWORD_LENGTH_ERROR = "Le nouveau mot de passe doit contenir au moins 8 caract\u00e8res.";
const PASSWORD_CONFIRMATION_ERROR = "La confirmation ne correspond pas au nouveau mot de passe.";
const PASSWORD_UPDATE_SUCCESS = "Mot de passe mis \u00e0 jour.";
const PASSWORD_UPDATE_FAILURE = "Impossible de modifier le mot de passe.";
const PASSWORD_UPDATE_PENDING = "Mise \u00e0 jour...";
const CHANGE_PASSWORD_LABEL = "Modifier le mot de passe";
const LOGOUT_LABEL = "Se d\u00e9connecter";

export function SecuritySettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const isReadOnlyOwner = user?.role === "OWNER";
  const withAuthorizedToken = useAuthorizedRequest();
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string | null>(null);
  const [passwordSuccessMessage, setPasswordSuccessMessage] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordErrorMessage(null);
    setPasswordSuccessMessage(null);

    if (passwordForm.newPassword.length < 8) {
      setPasswordErrorMessage(PASSWORD_LENGTH_ERROR);
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErrorMessage(PASSWORD_CONFIRMATION_ERROR);
      return;
    }

    setIsChangingPassword(true);
    try {
      await withAuthorizedToken((accessToken) =>
        changeOwnPasswordRequest(accessToken, {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      );
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordSuccessMessage(PASSWORD_UPDATE_SUCCESS);
    } catch (error) {
      setPasswordErrorMessage(
        error instanceof ApiError ? error.message : PASSWORD_UPDATE_FAILURE
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <header className="section-header">
        <h2>{SECURITY_PAGE_TITLE}</h2>
      </header>

      <section className="panel security-personal-panel">
        <h3>{SECURITY_PANEL_TITLE}</h3>
        <p className="hint">{isReadOnlyOwner ? OWNER_SECURITY_HINT : USER_SECURITY_HINT}</p>
        <FeedbackBanner
          errorMessage={passwordErrorMessage}
          successMessage={passwordSuccessMessage}
          isLoading={isChangingPassword}
        />
        <form className="admin-form security-password-form" onSubmit={handlePasswordSubmit}>
          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={passwordForm.currentPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                currentPassword: event.target.value
              }))
            }
            autoComplete="current-password"
            required
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                newPassword: event.target.value
              }))
            }
            autoComplete="new-password"
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={passwordForm.confirmPassword}
            onChange={(event) =>
              setPasswordForm((prev) => ({
                ...prev,
                confirmPassword: event.target.value
              }))
            }
            autoComplete="new-password"
            minLength={8}
            required
          />
          <button type="submit" disabled={isChangingPassword}>
            {isChangingPassword ? PASSWORD_UPDATE_PENDING : CHANGE_PASSWORD_LABEL}
          </button>
        </form>
        <div className="security-session-actions">
          <button className="secondary-btn" type="button" onClick={() => void handleLogout()}>
            {LOGOUT_LABEL}
          </button>
        </div>
      </section>
    </>
  );
}

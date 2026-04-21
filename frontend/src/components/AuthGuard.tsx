import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AuthGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isInitializing, isAuthenticated } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return <main className="page center">Chargement de la session...</main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}


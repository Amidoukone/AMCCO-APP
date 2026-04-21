import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function PublicOnlyRoute({ children }: { children: ReactNode }): JSX.Element {
  const { isInitializing, isAuthenticated } = useAuth();

  if (isInitializing) {
    return <main className="page center">Chargement de la session...</main>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}


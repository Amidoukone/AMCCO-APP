import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getDefaultRouteForRole } from "../config/permissions";

export function PublicOnlyRoute({ children }: { children: ReactNode }): JSX.Element {
  const { isInitializing, isAuthenticated, user } = useAuth();

  if (isInitializing) {
    return <main className="page center">Chargement de la session en cours...</main>;
  }

  if (isAuthenticated) {
    return <Navigate to={user ? getDefaultRouteForRole(user.role) : "/dashboard"} replace />;
  }

  return <>{children}</>;
}

import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { canAccessFeature, type FeatureKey } from "../config/permissions";
import { useAuth } from "../context/AuthContext";

export function RoleGuard({
  feature,
  children
}: {
  feature: FeatureKey;
  children: ReactNode;
}): JSX.Element {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessFeature(user.role, feature)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}


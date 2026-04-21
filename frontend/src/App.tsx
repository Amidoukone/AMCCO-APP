import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AuthGuard } from "./components/AuthGuard";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { RoleGuard } from "./components/RoleGuard";
import { getDefaultRouteForRole } from "./config/permissions";
import { useAuth } from "./context/AuthContext";
import { BusinessActivityProvider } from "./context/BusinessActivityContext";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { AdminActivitiesPage } from "./pages/AdminActivitiesPage";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FinanceTransactionsPage } from "./pages/FinanceTransactionsPage";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { LoginPage } from "./pages/LoginPage";
import { OperationsTasksPage } from "./pages/OperationsTasksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SecuritySettingsPage } from "./pages/SecuritySettingsPage";
import { TaskDetailsPage } from "./pages/TaskDetailsPage";

export function App(): JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const defaultAuthenticatedPath = user ? getDefaultRouteForRole(user.role) : "/dashboard";

  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? defaultAuthenticatedPath : "/login"} replace />}
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />

      <Route
        element={
          <AuthGuard>
            <BusinessActivityProvider>
              <AppLayout />
            </BusinessActivityProvider>
          </AuthGuard>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/alerts"
          element={
            <RoleGuard feature="alerts">
              <AlertsPage />
            </RoleGuard>
          }
        />
        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route
          path="/admin/users"
          element={
            <RoleGuard feature="adminUsers">
              <AdminUsersPage />
            </RoleGuard>
          }
        />

        <Route
          path="/admin/activities"
          element={
            <RoleGuard feature="adminActivities">
              <AdminActivitiesPage />
            </RoleGuard>
          }
        />

        <Route
          path="/finance/transactions"
          element={
            <RoleGuard feature="financeTransactions">
              <FinanceTransactionsPage />
            </RoleGuard>
          }
        />

        <Route
          path="/operations/tasks"
          element={
            <RoleGuard feature="operationsTasks">
              <OperationsTasksPage />
            </RoleGuard>
          }
        />

        <Route
          path="/operations/tasks/:taskId"
          element={
            <RoleGuard feature="operationsTasks">
              <TaskDetailsPage />
            </RoleGuard>
          }
        />

        <Route
          path="/reports"
          element={
            <RoleGuard feature="reports">
              <ReportsPage />
            </RoleGuard>
          }
        />

        <Route
          path="/settings/security"
          element={
            <RoleGuard feature="settingsSecurity">
              <SecuritySettingsPage />
            </RoleGuard>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { AuthGuard } from "./components/AuthGuard";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { RoleGuard } from "./components/RoleGuard";
import { BusinessActivityProvider } from "./context/BusinessActivityContext";
import type { FeatureKey } from "./config/permissions";

const AdminUsersPage = lazy(() =>
  import("./pages/AdminUsersPage").then(({ AdminUsersPage }) => ({ default: AdminUsersPage }))
);
const AdminActivitiesPage = lazy(() =>
  import("./pages/AdminActivitiesPage").then(({ AdminActivitiesPage }) => ({
    default: AdminActivitiesPage
  }))
);
const AdminCompaniesPage = lazy(() =>
  import("./pages/AdminCompaniesPage").then(({ AdminCompaniesPage }) => ({
    default: AdminCompaniesPage
  }))
);
const AlertsPage = lazy(() =>
  import("./pages/AlertsPage").then(({ AlertsPage }) => ({ default: AlertsPage }))
);
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then(({ DashboardPage }) => ({ default: DashboardPage }))
);
const FinanceSalariesPage = lazy(() =>
  import("./pages/FinanceSalariesPage").then(({ FinanceSalariesPage }) => ({
    default: FinanceSalariesPage
  }))
);
const FinanceTransactionsPage = lazy(() =>
  import("./pages/FinanceTransactionsPage").then(({ FinanceTransactionsPage }) => ({
    default: FinanceTransactionsPage
  }))
);
const ForbiddenPage = lazy(() =>
  import("./pages/ForbiddenPage").then(({ ForbiddenPage }) => ({ default: ForbiddenPage }))
);
const HomePage = lazy(() =>
  import("./pages/HomePage").then(({ HomePage }) => ({ default: HomePage }))
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then(({ LoginPage }) => ({ default: LoginPage }))
);
const MyWorkPage = lazy(() =>
  import("./pages/MyWorkPage").then(({ MyWorkPage }) => ({ default: MyWorkPage }))
);
const OperationsTasksPage = lazy(() =>
  import("./pages/OperationsTasksPage").then(({ OperationsTasksPage }) => ({
    default: OperationsTasksPage
  }))
);
const ReportsPage = lazy(() =>
  import("./pages/ReportsPage").then(({ ReportsPage }) => ({ default: ReportsPage }))
);
const SecuritySettingsPage = lazy(() =>
  import("./pages/SecuritySettingsPage").then(({ SecuritySettingsPage }) => ({
    default: SecuritySettingsPage
  }))
);
const TaskDetailsPage = lazy(() =>
  import("./pages/TaskDetailsPage").then(({ TaskDetailsPage }) => ({ default: TaskDetailsPage }))
);

function PageFallback(): JSX.Element {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-indicator" aria-hidden="true" />
      <span>Chargement de la page...</span>
    </div>
  );
}

function page(Page: ComponentType): JSX.Element {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  );
}

function publicOnlyPage(Page: ComponentType): JSX.Element {
  return (
    <PublicOnlyRoute>
      {page(Page)}
    </PublicOnlyRoute>
  );
}

function guardedPage(feature: FeatureKey, Page: ComponentType): JSX.Element {
  return (
    <RoleGuard feature={feature}>
      {page(Page)}
    </RoleGuard>
  );
}

function protectedLayout(children: ReactNode): JSX.Element {
  return (
    <AuthGuard>
      <BusinessActivityProvider>{children}</BusinessActivityProvider>
    </AuthGuard>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={page(HomePage)} />
      <Route
        path="/login"
        element={publicOnlyPage(LoginPage)}
      />

      <Route
        element={protectedLayout(<AppLayout />)}
      >
        <Route
          path="/dashboard"
          element={guardedPage("dashboard", DashboardPage)}
        />
        <Route
          path="/alerts"
          element={guardedPage("alerts", AlertsPage)}
        />
        <Route
          path="/my-work"
          element={guardedPage("myWork", MyWorkPage)}
        />
        <Route path="/forbidden" element={page(ForbiddenPage)} />

        <Route
          path="/admin/companies"
          element={guardedPage("adminCompanies", AdminCompaniesPage)}
        />

        <Route
          path="/admin/users"
          element={guardedPage("adminUsers", AdminUsersPage)}
        />

        <Route
          path="/admin/activities"
          element={guardedPage("adminActivities", AdminActivitiesPage)}
        />

        <Route
          path="/finance/transactions"
          element={guardedPage("financeTransactions", FinanceTransactionsPage)}
        />

        <Route
          path="/finance/salaries"
          element={guardedPage("financeSalaries", FinanceSalariesPage)}
        />

        <Route
          path="/operations/tasks"
          element={guardedPage("operationsTasks", OperationsTasksPage)}
        />

        <Route
          path="/operations/tasks/:taskId"
          element={guardedPage("operationsTasks", TaskDetailsPage)}
        />

        <Route
          path="/reports"
          element={guardedPage("reports", ReportsPage)}
        />

        <Route
          path="/settings/security"
          element={guardedPage("settingsSecurity", SecuritySettingsPage)}
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

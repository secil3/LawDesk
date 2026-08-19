import { useEffect } from "react";

import PublicLayout from "../layouts/PublicLayout";
import AuthLayout from "../layouts/AuthLayout";
import ProtectedRoute from "../components/ProtectedRoute";

import HomePage from "../pages/Public/HomePage";
import FeaturesPage from "../pages/Public/FeaturesPage";
import LoginPage from "../pages/Public/LoginPage";
import RegisterPage from "../pages/Public/RegisterPage";

import DashboardPage from "../pages/Authenticated/DashboardPage";
import TasksPage from "../pages/Authenticated/TasksPage";
import GroupsPage from "../pages/Authenticated/GroupsPage";
import SettingsPage from "../pages/Authenticated/SettingsPage";
import NotificationsPage from "../pages/Authenticated/NotificationsPage";

const PUBLIC_ROUTES = ["/", "/features", "/login", "/register"];

const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/tasks",
  "/groups",
  "/notifications",
  "/settings",
];

function AppRouter({
  user,
  checkingSession,
  currentPath,
  navigate,
  onLogout,
  email,
  setEmail,
  password,
  setPassword,
  error,
  submitting,
  handleLogin,
  taskPanelRevision,
  renderGroupsPage,
}) {
  useEffect(() => {
    if (
      !checkingSession &&
      user &&
      PUBLIC_ROUTES.includes(currentPath)
    ) {
      navigate("/dashboard");
    }
  }, [checkingSession, currentPath, navigate, user]);

  const renderPublicPage = () => {
    switch (currentPath) {
      case "/features":
        return <FeaturesPage onNavigate={navigate} />;
      case "/login":
        return (
          <LoginPage
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            error={error}
            submitting={submitting}
            onLogin={handleLogin}
            onNavigate={navigate}
          />
        );
      case "/register":
        return <RegisterPage onNavigate={navigate} />;
      case "/":
      default:
        return <HomePage onNavigate={navigate} />;
    }
  };

  const renderAuthenticatedPage = () => {
    switch (currentPath) {
      case "/tasks":
        return (
          <TasksPage taskPanelRevision={taskPanelRevision} />
        );
      case "/groups":
        return (
          <GroupsPage>
            {renderGroupsPage && renderGroupsPage()}
          </GroupsPage>
        );
      case "/notifications":
        return <NotificationsPage />;
      case "/settings":
        return <SettingsPage user={user} />;
      case "/dashboard":
      default:
        return <DashboardPage user={user} />;
    }
  };

  if (checkingSession) {
    return (
      <main className="auth-page">
        <section className="auth-card status-card">
          <div className="spinner" aria-hidden="true" />
          <p>Oturum kontrol ediliyor...</p>
        </section>
      </main>
    );
  }

  if (!user && AUTHENTICATED_ROUTES.includes(currentPath)) {
    return (
      <PublicLayout currentPath={currentPath} onNavigate={navigate}>
        <LoginPage
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          error={error}
          submitting={submitting}
          onLogin={handleLogin}
          onNavigate={navigate}
        />
      </PublicLayout>
    );
  }

  if (!user) {
    return (
      <PublicLayout currentPath={currentPath} onNavigate={navigate}>
        {renderPublicPage()}
      </PublicLayout>
    );
  }

  return (
    <AuthLayout
      user={user}
      currentPath={currentPath}
      onNavigate={navigate}
      onLogout={onLogout}
    >
      <ProtectedRoute
        user={user}
        checkingSession={checkingSession}
      >
        {renderAuthenticatedPage()}
      </ProtectedRoute>
    </AuthLayout>
  );
}

export default AppRouter;
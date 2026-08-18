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
  const publicRoutes = ["/", "/features", "/login", "/register"];
  const authenticatedRoutes = [
    "/dashboard",
    "/tasks",
    "/groups",
    "/notifications",
    "/settings",
  ];

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
          <TasksPage
            taskPanelRevision={taskPanelRevision}
          />
        );
      case "/groups":
        return <GroupsPage>{renderGroupsPage && renderGroupsPage()}</GroupsPage>;
      case "/notifications":
        return <NotificationsPage />;
      case "/settings":
        return <SettingsPage user={user} />;
      case "/dashboard":
      default:
        return <DashboardPage user={user} />;
    }
  };

  if (!user && authenticatedRoutes.includes(currentPath)) {
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

  useEffect(() => {
    if (user && publicRoutes.includes(currentPath)) {
      navigate("/dashboard");
    }
  }, [currentPath, navigate, user]);

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
        onNavigate={navigate}
      >
        {renderAuthenticatedPage()}
      </ProtectedRoute>
    </AuthLayout>
  );
}

export default AppRouter;

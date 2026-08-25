import { useEffect } from "react";

import PublicLayout from "../layouts/PublicLayout";
import AuthLayout from "../layouts/AuthLayout";
import ProtectedRoute from "../components/ProtectedRoute";

import HomePage from "../pages/Public/HomePage";
import FeaturesPage from "../pages/Public/FeaturesPage";
import LoginPage from "../pages/Public/LoginPage";
import RegisterPage from "../pages/Public/RegisterPage";
import ActivationPage from "../pages/Public/ActivationPage";

import DashboardPage from "../pages/Authenticated/DashboardPage";
import TasksPage from "../pages/Authenticated/TasksPage";
import TaskDetailPage from "../pages/Authenticated/TaskDetailPage";
import GroupsPage from "../pages/Authenticated/GroupsPage";
import UserCreatePage from "../pages/Authenticated/UserCreatePage";
import SettingsPage from "../pages/Authenticated/SettingsPage";
import NotificationsPage from "../pages/Authenticated/NotificationsPage";
import ManagementPage from "../pages/Authenticated/ManagementPage";
import RegistrationRequestsPage from "../pages/Authenticated/RegistrationRequestsPage";

const PUBLIC_ROUTES = ["/", "/features", "/login", "/register", "/activate"];

const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/tasks",
  "/groups",
  "/users/create",
  "/notifications",
  "/management",
  "/registration-requests",
  "/settings",
];

const isTaskPath = (path) => /^\/tasks(?:\/\d+)?$/.test(path || "");
const isRegistrationRequestPath = (path) =>
  /^\/registration-requests(?:\/\d+)?$/.test(path || "");

const canCreateUsers = (user) => {
  return user?.rol === "admin";
};

const canManageSystem = (user) => {
  return ["admin", "yonetici"].includes(user?.rol);
};

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
  groupOptions,
  users,
  loadingUsers,
  userPagination,
  onUserPageChange,
  openMembershipEditor,
  handleToggleActive,
  membershipEditor,
  closeMembershipEditor,
  toggleMembership,
  updateMembershipRole,
  handleSaveMemberships,
  savingMemberships,
  creationMessage,
  theme,
  onThemeChange,
}) {
  useEffect(() => {
    if (
      !checkingSession &&
      user &&
      PUBLIC_ROUTES.includes(currentPath)
    ) {
      navigate("/dashboard");
    }

    if (
      !checkingSession &&
      user &&
      currentPath === "/management" &&
      !canManageSystem(user)
    ) {
      navigate("/dashboard");
    }

    if (
      !checkingSession &&
      user &&
      currentPath === "/users/create" &&
      !canCreateUsers(user)
    ) {
      navigate("/dashboard");
    }
  }, [checkingSession, currentPath, navigate, user]);

  const taskDetailMatch = /^\/tasks\/(\d+)$/.exec(currentPath || "");
  const registrationRequestMatch =
    /^\/registration-requests\/(\d+)$/.exec(currentPath || "");

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
      case "/activate":
        return <ActivationPage onNavigate={navigate} />;
      case "/":
      default:
        return <HomePage onNavigate={navigate} />;
    }
  };

  const renderAuthenticatedPage = () => {
    if (registrationRequestMatch) {
      return canCreateUsers(user) ? (
        <RegistrationRequestsPage
          initialRequestId={Number(registrationRequestMatch[1])}
        />
      ) : (
        <DashboardPage user={user} onNavigate={navigate} />
      );
    }

    if (taskDetailMatch) {
      return (
        <TaskDetailPage
          taskId={Number(taskDetailMatch[1])}
          onNavigate={navigate}
        />
      );
    }

    switch (currentPath) {
      case "/tasks":
        return (
          <TasksPage
            taskPanelRevision={taskPanelRevision}
            onNavigate={navigate}
          />
        );
      case "/groups":
        return (
          <GroupsPage>
            {renderGroupsPage && renderGroupsPage()}
          </GroupsPage>
        );
      case "/users/create":
        return canCreateUsers(user) ? (
          <UserCreatePage
            onNavigate={navigate}
            groupOptions={groupOptions}
            users={users}
            loadingUsers={loadingUsers}
            userPagination={userPagination}
            onUserPageChange={onUserPageChange}
            openMembershipEditor={openMembershipEditor}
            handleToggleActive={handleToggleActive}
            membershipEditor={membershipEditor}
            closeMembershipEditor={closeMembershipEditor}
            toggleMembership={toggleMembership}
            updateMembershipRole={updateMembershipRole}
            handleSaveMemberships={handleSaveMemberships}
            savingMemberships={savingMemberships}
            error={error}
            creationMessage={creationMessage}
          />
        ) : (
          <DashboardPage user={user} onNavigate={navigate} />
        );
      case "/notifications":
        return <NotificationsPage onNavigate={navigate} />;
      case "/management":
        return canManageSystem(user) ? (
          <ManagementPage user={user} />
        ) : (
          <DashboardPage user={user} onNavigate={navigate} />
        );
      case "/registration-requests":
        return canCreateUsers(user) ? (
          <RegistrationRequestsPage />
        ) : (
          <DashboardPage user={user} onNavigate={navigate} />
        );
      case "/settings":
        return (
          <SettingsPage
            user={user}
            theme={theme}
            onThemeChange={onThemeChange}
          />
        );
      case "/dashboard":
      default:
        return <DashboardPage user={user} onNavigate={navigate} />;
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

  if (
    !user &&
    (
      AUTHENTICATED_ROUTES.includes(currentPath) ||
      isTaskPath(currentPath) ||
      isRegistrationRequestPath(currentPath)
    )
  ) {
    return (
      <PublicLayout
        currentPath={currentPath}
        onNavigate={navigate}
        theme={theme}
        onThemeChange={onThemeChange}
      >
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
      <PublicLayout
        currentPath={currentPath}
        onNavigate={navigate}
        theme={theme}
        onThemeChange={onThemeChange}
      >
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

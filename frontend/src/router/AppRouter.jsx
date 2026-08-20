import { useEffect } from "react";

import PublicLayout from "../layouts/PublicLayout";
import AuthLayout from "../layouts/AuthLayout";
import ProtectedRoute from "../components/ProtectedRoute";

import HomePage from "../pages/Public/HomePage";
import FeaturesPage from "../pages/Public/FeaturesPage";
import LoginPage from "../pages/Public/LoginPage";

import DashboardPage from "../pages/Authenticated/DashboardPage";
import TasksPage from "../pages/Authenticated/TasksPage";
import TaskDetailPage from "../pages/Authenticated/TaskDetailPage";
import GroupsPage from "../pages/Authenticated/GroupsPage";
import UserCreatePage from "../pages/Authenticated/UserCreatePage";
import SettingsPage from "../pages/Authenticated/SettingsPage";
import NotificationsPage from "../pages/Authenticated/NotificationsPage";

const PUBLIC_ROUTES = ["/", "/features", "/login"];

const AUTHENTICATED_ROUTES = [
  "/dashboard",
  "/tasks",
  "/groups",
  "/users/create",
  "/notifications",
  "/settings",
];

const isTaskPath = (path) => /^\/tasks(?:\/\d+)?$/.test(path || "");

const canCreateUsers = (user) => {
  if (!user) {
    return false;
  }

  if (["admin", "yonetici", "kullanici"].includes(user.rol)) {
    return true;
  }

  return (
    Array.isArray(user.groups) &&
    user.groups.some((group) =>
      ["grup_uyesi", "grup_yoneticisi"].includes(group.grupRolu),
    )
  );
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
  userForm,
  setUserForm,
  groupOptions,
  toggleGroupSelection,
  creatingUser,
  handleCreateUser,
  users,
  archivedUsers,
  loadingUsers,
  loadingArchivedUsers,
  userListMode,
  setUserListMode,
  openMembershipEditor,
  handleToggleActive,
  openDeleteConfirmation,
  handleRestoreUser,
  restoringUserId,
  deleteConfirmation,
  closeDeleteConfirmation,
  confirmDeleteUser,
  membershipEditor,
  closeMembershipEditor,
  toggleMembership,
  updateMembershipRole,
  handleSaveMemberships,
  savingMemberships,
  creationMessage,
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
      currentPath === "/users/create" &&
      !canCreateUsers(user)
    ) {
      navigate("/dashboard");
    }
  }, [checkingSession, currentPath, navigate, user]);

  const taskDetailMatch = /^\/tasks\/(\d+)$/.exec(currentPath || "");

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
      case "/":
      default:
        return <HomePage onNavigate={navigate} />;
    }
  };

  const renderAuthenticatedPage = () => {
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
        return (
          <UserCreatePage
            user={user}
            userForm={userForm}
            setUserForm={setUserForm}
            groupOptions={groupOptions}
            toggleGroupSelection={toggleGroupSelection}
            creatingUser={creatingUser}
            handleCreateUser={handleCreateUser}
            users={users}
            archivedUsers={archivedUsers}
            loadingUsers={loadingUsers}
            loadingArchivedUsers={loadingArchivedUsers}
            userListMode={userListMode}
            setUserListMode={setUserListMode}
            openMembershipEditor={openMembershipEditor}
            handleToggleActive={handleToggleActive}
            openDeleteConfirmation={openDeleteConfirmation}
            handleRestoreUser={handleRestoreUser}
            restoringUserId={restoringUserId}
            deleteConfirmation={deleteConfirmation}
            closeDeleteConfirmation={closeDeleteConfirmation}
            confirmDeleteUser={confirmDeleteUser}
            membershipEditor={membershipEditor}
            closeMembershipEditor={closeMembershipEditor}
            toggleMembership={toggleMembership}
            updateMembershipRole={updateMembershipRole}
            handleSaveMemberships={handleSaveMemberships}
            savingMemberships={savingMemberships}
            error={error}
            creationMessage={creationMessage}
          />
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

  if (!user && (AUTHENTICATED_ROUTES.includes(currentPath) || isTaskPath(currentPath))) {
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
import { useEffect, useRef, useState } from "react";

import { readResponse } from "./api";
import GroupTable from "./components/GroupTable";
import PaginationControls from "./components/PaginationControls";
import AppRouter from "./router/AppRouter";

const LIST_PAGE_LIMIT = 9;
const EMPTY_LIST_PAGINATION = {
  page: 1,
  limit: LIST_PAGE_LIMIT,
  total: 0,
  totalPages: 0,
};

const THEME_STORAGE_KEY = "lawdesk-theme";

const getInitialTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }

  const initialTheme = window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
    ? "dark"
    : "light";

  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;

  return initialTheme;
};

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creationMessage, setCreationMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [listedUsers, setListedUsers] = useState([]);
  const [userPagination, setUserPagination] = useState({
    ...EMPTY_LIST_PAGINATION,
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  const [groupOptions, setGroupOptions] = useState([]);
  const [groupList, setGroupList] = useState([]);
  const [groupPagination, setGroupPagination] = useState({
    ...EMPTY_LIST_PAGINATION,
  });
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
  });
  const [groupDrafts, setGroupDrafts] = useState({});
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [membershipEditor, setMembershipEditor] = useState({
    open: false,
    userId: null,
    userName: "",
    memberships: [],
  });
  const [savingMemberships, setSavingMemberships] = useState(false);
  const [groupAssignmentDrafts, setGroupAssignmentDrafts] = useState({});
  const [taskPanelRevision, setTaskPanelRevision] = useState(0);
  const userSearchTimerRef = useRef(null);
  const groupSearchTimerRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => () => {
    window.clearTimeout(userSearchTimerRef.current);
    window.clearTimeout(groupSearchTimerRef.current);
  }, []);

  const canCreateUsers = (userRecord) => {
    return userRecord?.rol === "admin";
  };

  const refreshTaskPanel = () => {
    setTaskPanelRevision((current) => current + 1);
  };

  const handleExpiredSession = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    } finally {
      setUser(null);
      setError("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
      setCurrentPath("/login");
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", "/login");
      }
    }
  };

  const loadUsers = async () => {
    try {
      const response = await fetch("/api/admin/users", {
        credentials: "include",
      });

      const data = await readResponse(response);
      setUsers(data.users || []);
    } catch (requestError) {
      setUsers([]);
      setError(requestError.message || "Kullanıcı listesi yüklenemedi");
    }
  };

  const loadUserPage = async (page = 1, search = userSearch) => {
    setLoadingUsers(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIST_PAGE_LIMIT),
      });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });
      const data = await readResponse(response);

      setListedUsers(Array.isArray(data.users) ? data.users : []);
      setUserPagination({
        page: Number(data.pagination?.page) || 1,
        limit: Number(data.pagination?.limit) || LIST_PAGE_LIMIT,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setListedUsers([]);
      setUserPagination({ ...EMPTY_LIST_PAGINATION });
      setError(requestError.message || "Kullanıcı listesi yüklenemedi");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await fetch("/api/groups", {
        credentials: "include",
      });

      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }

      const data = await readResponse(response);
      const groups = Array.isArray(data.groups) ? data.groups : [];
      setGroupOptions(groups);
      setGroupDrafts(
        Object.fromEntries(
          groups.map((group) => [
            group.id,
            {
              name: group.name || "",
              description: group.description || "",
            },
          ]),
        ),
      );
    } catch (requestError) {
      setGroupOptions([]);
      setError(requestError.message || "Grup listesi yüklenemedi");
    }
  };

  const loadGroupPage = async (page = 1, search = groupSearch) => {
    setLoadingGroups(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIST_PAGE_LIMIT),
      });
      if (search.trim()) params.set("q", search.trim());
      const response = await fetch(`/api/groups?${params}`, {
        credentials: "include",
      });

      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }

      const data = await readResponse(response);
      setGroupList(Array.isArray(data.groups) ? data.groups : []);
      setGroupPagination({
        page: Number(data.pagination?.page) || 1,
        limit: Number(data.pagination?.limit) || LIST_PAGE_LIMIT,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setGroupList([]);
      setGroupPagination({ ...EMPTY_LIST_PAGINATION });
      setError(requestError.message || "Grup listesi yüklenemedi");
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleUserSearchChange = (value) => {
    setUserSearch(value);
    window.clearTimeout(userSearchTimerRef.current);
    userSearchTimerRef.current = window.setTimeout(() => {
      loadUserPage(1, value);
    }, 250);
  };

  const handleGroupSearchChange = (value) => {
    setGroupSearch(value);
    window.clearTimeout(groupSearchTimerRef.current);
    groupSearchTimerRef.current = window.setTimeout(() => {
      loadGroupPage(1, value);
    }, 250);
  };

  const handleCreateGroup = async (event) => {
    event.preventDefault();
    setError("");
    setCreationMessage("");
    setCreatingGroup(true);

    try {
      const response = await fetch("/api/admin/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: groupForm.name.trim(),
          description: groupForm.description.trim(),
        }),
      });

      if (response.status === 401) {
        await handleExpiredSession();
        return;
      }

      const data = await readResponse(response);
      const successMessage = data.message || "Grup başarıyla oluşturuldu";
      setCreationMessage(successMessage);
      setGroupForm({ name: "", description: "" });
      await Promise.all([
        loadGroups(),
        loadGroupPage(groupPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(requestError.message || "Grup oluşturulamadı");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroup = async (groupId) => {
    const draft = groupDrafts[groupId];

    if (!draft) {
      return;
    }

    setError("");
    setCreationMessage("");
    setSavingGroupId(groupId);

    try {
      const response = await fetch(`/api/admin/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim(),
        }),
      });

      const data = await readResponse(response);
      const successMessage = data.message || "Grup güncellendi";
      setCreationMessage(successMessage);
      await Promise.all([
        loadGroups(),
        loadGroupPage(groupPagination.page),
        loadUsers(),
        loadUserPage(userPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(
        requestError.message || "Grup bilgileri güncellenemedi",
      );
    } finally {
      setSavingGroupId(null);
    }
  };

  const openMembershipEditor = (item) => {
    setError("");
    setCreationMessage("");
    setMembershipEditor({
      open: true,
      userId: item.id,
      userName: item.adSoyad,
      memberships: (item.groups || []).map((group) => ({
        grupId: Number(group.grupId),
        grupRolu: group.grupRolu,
      })),
    });
  };

  const closeMembershipEditor = () => {
    if (savingMemberships) {
      return;
    }

    setMembershipEditor({
      open: false,
      userId: null,
      userName: "",
      memberships: [],
    });
  };

  const toggleMembership = (groupId) => {
    setMembershipEditor((current) => {
      const exists = current.memberships.some(
        (membership) => Number(membership.grupId) === Number(groupId),
      );

      return {
        ...current,
        memberships: exists
          ? current.memberships.filter(
              (membership) =>
                Number(membership.grupId) !== Number(groupId),
            )
          : [
              ...current.memberships,
              {
                grupId: Number(groupId),
                grupRolu: "grup_uyesi",
              },
            ],
      };
    });
  };

  const updateMembershipRole = (groupId, groupRole) => {
    setMembershipEditor((current) => ({
      ...current,
      memberships: current.memberships.map((membership) =>
        Number(membership.grupId) === Number(groupId)
          ? { ...membership, grupRolu: groupRole }
          : membership,
      ),
    }));
  };

  const updateGroupAssignmentDraft = (groupId, nextValues) => {
    setGroupAssignmentDrafts((current) => ({
      ...current,
      [groupId]: {
        userId: "",
        role: "grup_uyesi",
        ...(current[groupId] || {}),
        ...nextValues,
      },
    }));
  };

  const handleAssignUserToGroup = async (groupId) => {
    const draft = groupAssignmentDrafts[groupId] || {
      userId: "",
      role: "grup_uyesi",
    };
    const targetUserId = Number(draft.userId);

    if (!Number.isInteger(targetUserId) || targetUserId < 1) {
      setError("Gruba eklemek için bir kullanıcı seçiniz");
      return;
    }

    const targetUser = users.find((userItem) => userItem.id === targetUserId);

    if (!targetUser) {
      setError("Seçilen kullanıcı listede bulunamadı");
      return;
    }

    const memberships = Array.isArray(targetUser.groups)
      ? targetUser.groups.map((group) => ({
          grupId: Number(group.grupId),
          grupRolu: group.grupRolu || "grup_uyesi",
        }))
      : [];

    if (memberships.some((membership) => Number(membership.grupId) === Number(groupId))) {
      setCreationMessage(`${targetUser.adSoyad} kullanıcısı bu gruba zaten atanmış.`);
      return;
    }

    setError("");
    setCreationMessage("");

    try {
      const response = await fetch(
        `/api/admin/users/${targetUserId}/memberships`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            memberships: [...memberships, {
              grupId: Number(groupId),
              grupRolu: draft.role,
            }],
          }),
        },
      );

      const data = await readResponse(response);
      const successMessage =
        data.message || `${targetUser.adSoyad} kullanıcısı gruba eklendi`;
      setCreationMessage(successMessage);
      setGroupAssignmentDrafts((current) => ({
        ...current,
        [groupId]: {
          userId: "",
          role: "grup_uyesi",
        },
      }));
      await Promise.all([
        loadUsers(),
        loadUserPage(userPagination.page),
        loadGroups(),
        loadGroupPage(groupPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(
        requestError.message || "Kullanıcı gruba eklenemedi",
      );
    }
  };

  const handleSaveMemberships = async (event) => {
    event.preventDefault();

    if (!membershipEditor.open || !membershipEditor.userId) {
      return;
    }

    setError("");
    setCreationMessage("");
    setSavingMemberships(true);

    try {
      const response = await fetch(
        `/api/admin/users/${membershipEditor.userId}/memberships`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            memberships: membershipEditor.memberships,
          }),
        },
      );

      const data = await readResponse(response);
      const successMessage =
        data.message || "Grup üyelikleri güncellendi";
      setCreationMessage(successMessage);
      await Promise.all([
        loadUsers(),
        loadUserPage(userPagination.page),
        loadGroups(),
        loadGroupPage(groupPagination.page),
      ]);
      refreshTaskPanel();
      setMembershipEditor({
        open: false,
        userId: null,
        userName: "",
        memberships: [],
      });
    } catch (requestError) {
      setError(
        requestError.message ||
          "Kullanıcının grup üyelikleri güncellenemedi",
      );
    } finally {
      setSavingMemberships(false);
    }
  };

  useEffect(() => {
    let isActive = true;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (response.status === 401) {
          if (isActive) {
            setUser(null);
          }
          return;
        }

        const data = await readResponse(response);

        if (isActive) {
          setUser(data.user);

          await Promise.all([
            loadGroups(),
            loadGroupPage(),
            ...(canCreateUsers(data.user)
              ? [loadUsers(), loadUserPage()]
              : []),
          ]);
        }
      } catch (requestError) {
        if (isActive) {
          setError(
            requestError.message || "Sunucuya bağlanılamadı",
          );
        }
      } finally {
        if (isActive) {
          setCheckingSession(false);
        }
      }
    };

    checkSession();

    return () => {
      isActive = false;
    };
  }, []);

  const navigate = (path) => {
    const nextPath = path || "/";
    setCurrentPath(nextPath);
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", nextPath);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname || "/");
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readResponse(response);

      setUser(data.user);
      setPassword("");
      navigate("/dashboard");

      await Promise.all([
        loadGroups(),
        loadGroupPage(),
        ...(canCreateUsers(data.user)
          ? [loadUsers(), loadUserPage()]
          : []),
      ]);
    } catch (requestError) {
      setError(
        requestError.message || "Giriş işlemi tamamlanamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (userId, newActive) => {
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ aktifMi: newActive }),
      });

      const data = await readResponse(response);
      const successMessage = data.message || "Kullanıcı durumu güncellendi";

      setCreationMessage(successMessage);

      // Update local users state to reflect change without reloading whole list
      setUsers((current) =>
        current.map((u) =>
          u.id === userId ? { ...u, aktifMi: data.user?.aktifMi ?? newActive } : u,
        ),
      );
      setListedUsers((current) =>
        current.map((listedUser) =>
          listedUser.id === userId
            ? {
                ...listedUser,
                aktifMi: data.user?.aktifMi ?? newActive,
              }
            : listedUser,
        ),
      );
      refreshTaskPanel();
    } catch (requestError) {
      setError(requestError.message || "Kullanıcı durumu güncellenemedi");
    }
  };

  const handleLogout = async () => {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      await readResponse(response);

      setUser(null);
      setEmail("");
      setPassword("");
      setCreationMessage("");
      setUsers([]);
      setListedUsers([]);
      setUserPagination({ ...EMPTY_LIST_PAGINATION });
      setGroupOptions([]);
      setGroupList([]);
      setGroupPagination({ ...EMPTY_LIST_PAGINATION });
      setGroupForm({ name: "", description: "" });
      setGroupDrafts({});
      setMembershipEditor({
        open: false,
        userId: null,
        userName: "",
        memberships: [],
      });
      setTaskPanelRevision(0);
      navigate("/");
    } catch (requestError) {
      setError(
        requestError.message || "Çıkış işlemi tamamlanamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderGroupsPage = () => {
    const isAdmin = user?.rol === "admin";
    const isSystemManager = user?.rol === "yonetici";
    const isGroupManager =
      Array.isArray(user?.groups) &&
      user.groups.some(
        (group) => group.grupRolu === "grup_yoneticisi",
      );
    const isGroupMember =
      Array.isArray(user?.groups) &&
      user.groups.some((group) =>
        ["grup_uyesi", "grup_yoneticisi"].includes(group.grupRolu),
      );

    return (
      <>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}

        {creationMessage && (
          <p className="success-message" role="status">
            {creationMessage}
          </p>
        )}

        <section className="group-management-panel">
          <div className="list-heading-with-tabs">
            <div>
              <p className="eyebrow">Erişim yapısı</p>
              <h3 className="section-panel-title">
                {isAdmin || isSystemManager ? "Tüm Gruplar" : "Grup üyeliklerim"}
              </h3>
            </div>
            <span className="info-chip">{groupPagination.total} grup</span>
          </div>

          <GroupTable
            groups={groupList}
            loading={loadingGroups}
            emptyMessage={
              isAdmin || isSystemManager
                ? "Henüz gösterilecek grup yok."
                : "Üyesi olduğunuz bir grup bulunmuyor."
            }
            canManage={isAdmin}
            drafts={groupDrafts}
            assignmentDrafts={groupAssignmentDrafts}
            users={users}
            savingGroupId={savingGroupId}
            searchTerm={groupSearch}
            onSearchChange={handleGroupSearchChange}
            onDraftChange={(groupId, draft) =>
              setGroupDrafts((current) => ({ ...current, [groupId]: draft }))
            }
            onUpdateGroup={handleUpdateGroup}
            onAssignmentChange={updateGroupAssignmentDraft}
            onAssignUser={handleAssignUserToGroup}
          />

          <PaginationControls
            page={groupPagination.page}
            totalPages={groupPagination.totalPages}
            total={groupPagination.total}
            disabled={loadingGroups}
            label="Grup sayfalama"
            onPageChange={loadGroupPage}
          />
        </section>

        {isAdmin && (
          <div className="role-panel admin-panel">
            <h2>Yönetici paneli</h2>
            <ul>
              <li>Kullanıcı erişim yönetimi</li>
              <li>Grup ve üyelik yönetimi</li>
              <li>Genel görev takibi</li>
            </ul>

            <section className="group-management-panel">
              <div className="list-heading-with-tabs">
                <div>
                  <p className="eyebrow">Erişim yapısı</p>
                  <h3 className="section-panel-title">Yeni Grup Ekle</h3>
                </div>
              </div>

              <form className="group-create-form" onSubmit={handleCreateGroup}>
                <label>
                  <span>Yeni grup adı</span>
                  <input
                    value={groupForm.name}
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    maxLength={100}
                    required
                  />
                </label>
                <label>
                  <span>Açıklama</span>
                  <input
                    value={groupForm.description}
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    maxLength={500}
                  />
                </label>
                <button type="submit" disabled={creatingGroup}>
                  {creatingGroup ? "Oluşturuluyor..." : "Grup oluştur"}
                </button>
              </form>

            </section>
          </div>
        )}

        {!isAdmin && !isGroupMember && !isSystemManager && (
          <div className="role-panel user-panel">
            <h2>Kullanıcı paneli</h2>
            <ul>
              <li>Atanmış ve oluşturduğun görevleri gör</li>
              <li>Oluşturduğun aktif görevleri düzenle</li>
              <li>Grup içi görevleri takip et</li>
            </ul>
          </div>
        )}

        {!isAdmin && isGroupManager && (
          <div className="role-panel manager-panel">
            <h2>Grup yöneticisi paneli</h2>
            <ul>
              <li>Grup üyelerini görüntüle</li>
              <li>Görev atama ve izleme</li>
              <li>Grup içi işlemleri yönet</li>
            </ul>
          </div>
        )}

        {!isAdmin && isGroupMember && !isGroupManager && !isSystemManager && (
          <div className="role-panel user-panel">
            <h2>Grup üyesi paneli</h2>
            <ul>
              <li>Grup bilgilerini gör</li>
              <li>Grup üyelerini takip et</li>
              <li>Grup görevlerini incele</li>
            </ul>
          </div>
        )}

      </>
    );
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

  return (
    <AppRouter
      user={user}
      checkingSession={checkingSession}
      currentPath={currentPath}
      navigate={navigate}
      onLogout={handleLogout}
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      error={error}
      submitting={submitting}
      handleLogin={handleLogin}
      taskPanelRevision={taskPanelRevision}
      renderGroupsPage={renderGroupsPage}
      groupOptions={groupOptions}
      users={listedUsers}
      loadingUsers={loadingUsers}
      userPagination={userPagination}
      userSearch={userSearch}
      onUserSearchChange={handleUserSearchChange}
      onUserPageChange={loadUserPage}
      openMembershipEditor={openMembershipEditor}
      handleToggleActive={handleToggleActive}
      membershipEditor={membershipEditor}
      closeMembershipEditor={closeMembershipEditor}
      toggleMembership={toggleMembership}
      updateMembershipRole={updateMembershipRole}
      handleSaveMemberships={handleSaveMemberships}
      savingMemberships={savingMemberships}
      creationMessage={creationMessage}
      theme={theme}
      onThemeChange={setTheme}
    />
  );
}

export default App;

import { useEffect, useState } from "react";

import { readResponse } from "./api";
import PaginationControls from "./components/PaginationControls";
import AppRouter from "./router/AppRouter";

const LIST_PAGE_LIMIT = 9;
const EMPTY_LIST_PAGINATION = {
  page: 1,
  limit: LIST_PAGE_LIMIT,
  total: 0,
  totalPages: 0,
};

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userForm, setUserForm] = useState({
    adSoyad: "",
    email: "",
    password: "",
    roleMode: "kullanici",
    aktifMi: true,
    grupIds: [],
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [creationMessage, setCreationMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [listedUsers, setListedUsers] = useState([]);
  const [userPagination, setUserPagination] = useState({
    ...EMPTY_LIST_PAGINATION,
  });
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [archivedUserPagination, setArchivedUserPagination] = useState({
    ...EMPTY_LIST_PAGINATION,
  });
  const [loadingArchivedUsers, setLoadingArchivedUsers] = useState(false);
  const [userListMode, setUserListMode] = useState("active");
  const [restoringUserId, setRestoringUserId] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    open: false,
    userId: null,
    userName: "",
  });
  const [currentPath, setCurrentPath] = useState(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  const [groupOptions, setGroupOptions] = useState([]);
  const [groupList, setGroupList] = useState([]);
  const [groupPagination, setGroupPagination] = useState({
    ...EMPTY_LIST_PAGINATION,
  });
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
  });
  const [groupDrafts, setGroupDrafts] = useState({});
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [groupDeleteState, setGroupDeleteState] = useState({
    open: false,
    groupId: null,
    groupName: "",
  });
  const [membershipEditor, setMembershipEditor] = useState({
    open: false,
    userId: null,
    userName: "",
    memberships: [],
  });
  const [savingMemberships, setSavingMemberships] = useState(false);
  const [groupAssignmentDrafts, setGroupAssignmentDrafts] = useState({});
  const [taskPanelRevision, setTaskPanelRevision] = useState(0);

  const canCreateUsers = (userRecord) => {
    return userRecord?.rol === "admin";
  };

  const refreshTaskPanel = () => {
    setTaskPanelRevision((current) => current + 1);
  };

  const clearClientSession = () => {
    if (typeof document !== "undefined") {
      document.cookie =
        "lawdesk_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
    }
  };

  const handleExpiredSession = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    } finally {
      clearClientSession();
      setUser(null);
      setError("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
      setCurrentPath("/login");
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", "/login");
      }
    }
  };

  const toggleGroupSelection = (groupId) => {
    const groupKey = String(groupId);
    setUserForm((current) => {
      const currentIds = Array.isArray(current.grupIds)
        ? current.grupIds.map(String)
        : [];

      return currentIds.includes(groupKey)
        ? {
            ...current,
            grupIds: currentIds.filter((id) => id !== groupKey),
          }
        : {
            ...current,
            grupIds: [...currentIds, groupKey],
          };
    });
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

  const loadUserPage = async (page = 1) => {
    setLoadingUsers(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIST_PAGE_LIMIT),
      });
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

  const loadArchivedUsers = async (page = 1) => {
    setLoadingArchivedUsers(true);

    try {
      const params = new URLSearchParams({
        archived: "true",
        page: String(page),
        limit: String(LIST_PAGE_LIMIT),
      });
      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
      });

      const data = await readResponse(response);
      setArchivedUsers(Array.isArray(data.users) ? data.users : []);
      setArchivedUserPagination({
        page: Number(data.pagination?.page) || 1,
        limit: Number(data.pagination?.limit) || LIST_PAGE_LIMIT,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setArchivedUsers([]);
      setArchivedUserPagination({ ...EMPTY_LIST_PAGINATION });
      setError(
        requestError.message || "Kullanıcı arşivi yüklenemedi",
      );
    } finally {
      setLoadingArchivedUsers(false);
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

  const loadGroupPage = async (page = 1) => {
    setLoadingGroups(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIST_PAGE_LIMIT),
      });
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

  const openGroupDeleteConfirmation = (groupId, groupName) => {
    setGroupDeleteState({
      open: true,
      groupId,
      groupName,
    });
  };

  const closeGroupDeleteConfirmation = () => {
    setGroupDeleteState({
      open: false,
      groupId: null,
      groupName: "",
    });
  };

  const confirmDeleteGroup = async () => {
    if (!groupDeleteState.open || !groupDeleteState.groupId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/groups/${groupDeleteState.groupId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      const data = await readResponse(response);
      const successMessage = data.message || "Grup silindi";
      setCreationMessage(successMessage);
      await Promise.all([
        loadGroups(),
        loadGroupPage(groupPagination.page),
        loadUsers(),
        loadUserPage(userPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(requestError.message || "Grup silinemedi");
    } finally {
      closeGroupDeleteConfirmation();
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

    const isPageReload =
      typeof window !== "undefined" &&
      window.performance &&
      window.performance.getEntriesByType("navigation")[0]?.type ===
        "reload";

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (response.status === 401) {
          if (isActive) {
            await handleExpiredSession();
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
              ? [loadUsers(), loadUserPage(), loadArchivedUsers()]
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
          ? [loadUsers(), loadUserPage(), loadArchivedUsers()]
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

  const openDeleteConfirmation = (userId, userName) => {
    setDeleteConfirmation({
      open: true,
      userId,
      userName,
    });
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({
      open: false,
      userId: null,
      userName: "",
    });
  };

  const confirmDeleteUser = async () => {
    if (!deleteConfirmation.open || !deleteConfirmation.userId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/users/${deleteConfirmation.userId}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );

      const data = await readResponse(response);
      const successMessage = data.message || "Kullanıcı arşivlendi";
      setCreationMessage(successMessage);
      await Promise.all([
        loadUsers(),
        loadUserPage(userPagination.page),
        loadArchivedUsers(1),
      ]);
      refreshTaskPanel();
      setUserListMode("archived");
    } catch (requestError) {
      setError(requestError.message || "Kullanıcı arşivlenemedi");
    } finally {
      closeDeleteConfirmation();
    }
  };

  const handleRestoreUser = async (userId) => {
    setError("");
    setCreationMessage("");
    setRestoringUserId(userId);

    try {
      const response = await fetch(
        `/api/admin/users/${userId}/restore`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );

      const data = await readResponse(response);
      const successMessage = data.message || "Kullanıcı geri yüklendi";
      setCreationMessage(successMessage);
      await Promise.all([
        loadUsers(),
        loadUserPage(userPagination.page),
        loadArchivedUsers(archivedUserPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(requestError.message || "Kullanıcı geri yüklenemedi");
    } finally {
      setRestoringUserId(null);
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
      setArchivedUsers([]);
      setArchivedUserPagination({ ...EMPTY_LIST_PAGINATION });
      setUserListMode("active");
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

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setError("");
    setCreationMessage("");
    setCreatingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          adSoyad: userForm.adSoyad.trim(),
          email: userForm.email.trim(),
          password: userForm.password,
          roleMode: userForm.roleMode,
          aktifMi: userForm.aktifMi,
          grupIds: Array.isArray(userForm.grupIds)
            ? userForm.grupIds.map((groupId) => Number(groupId))
            : [],
        }),
      });

      const data = await readResponse(response);
      const successMessage = `Kullanıcı oluşturuldu: ${data.user.email}`;

      setCreationMessage(successMessage);
      setUserForm({
        adSoyad: "",
        email: "",
        password: "",
        roleMode: "kullanici",
        aktifMi: true,
        grupIds: [],
      });
      await Promise.all([
        loadUsers(),
        loadUserPage(userPagination.page),
      ]);
      refreshTaskPanel();
    } catch (requestError) {
      setError(
        requestError.message || "Kullanıcı oluşturulamadı",
      );
    } finally {
      setCreatingUser(false);
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

          <div className="group-overview-grid">
            {loadingGroups ? (
              <div className="empty-state-box">Gruplar yükleniyor...</div>
            ) : groupList.length === 0 ? (
              <div className="empty-state-box">
                {isAdmin || isSystemManager
                  ? "Henüz gösterilecek grup yok."
                  : "Üyesi olduğunuz bir grup bulunmuyor."}
              </div>
            ) : (
              groupList.map((group) => (
                <article className="group-overview-card" key={group.id}>
                  <div className="group-overview-header">
                    <div>
                      <p className="eyebrow">Grup</p>
                      <h4>{group.name}</h4>
                    </div>
                  </div>

                  <p className="group-overview-description">
                    {group.description?.trim() || "Bu grubun açıklaması henüz eklenmemiş."}
                  </p>

                  <div className="group-metric-row simple">
                    <div>
                      <span>Üye</span>
                      <strong>{group.memberCount || 0}</strong>
                    </div>
                    <div>
                      <span>Yönetici</span>
                      <strong>{group.managerCount || 0}</strong>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

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

              <div className="list-heading-with-tabs" style={{ marginTop: 22 }}>
                <div>
                  <p className="eyebrow">Grup düzenleme</p>
                  <h3 className="section-panel-title">Grup Güncelle</h3>
                </div>
              </div>

              <div className="group-management-grid">
                {groupList.map((group) => {
                  const draft = groupDrafts[group.id] || {
                    name: group.name || "",
                    description: group.description || "",
                  };
                  const unchanged =
                    draft.name.trim() === group.name &&
                    draft.description.trim() ===
                      (group.description || "");

                  return (
                    <article className="group-management-card" key={group.id}>
                      <div className="group-stat-row">
                        <span>{group.memberCount || 0} üye</span>
                        <span>{group.managerCount || 0} grup yöneticisi</span>
                      </div>

                      <div className="group-assignment-block">
                        <label>
                          <span>Kişi ata</span>
                          <select
                            value={groupAssignmentDrafts[group.id]?.userId || ""}
                            onChange={(event) =>
                              updateGroupAssignmentDraft(group.id, {
                                userId: event.target.value,
                              })
                            }
                          >
                            <option value="">Kullanıcı seçiniz</option>
                            {users.map((userItem) => (
                              <option key={userItem.id} value={userItem.id}>
                                {userItem.adSoyad}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          <span>Rol</span>
                          <select
                            value={groupAssignmentDrafts[group.id]?.role || "grup_uyesi"}
                            onChange={(event) =>
                              updateGroupAssignmentDraft(group.id, {
                                role: event.target.value,
                              })
                            }
                          >
                            <option value="grup_uyesi">Grup üyesi</option>
                            <option value="grup_yoneticisi">Grup yöneticisi</option>
                          </select>
                        </label>

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleAssignUserToGroup(group.id)}
                          disabled={!groupAssignmentDrafts[group.id]?.userId}
                        >
                          Gruba ekle
                        </button>
                      </div>

                      <label>
                        <span>Grup adı</span>
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setGroupDrafts((current) => ({
                              ...current,
                              [group.id]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }))
                          }
                          maxLength={100}
                        />
                      </label>
                      <label>
                        <span>Açıklama</span>
                        <input
                          value={draft.description}
                          onChange={(event) =>
                            setGroupDrafts((current) => ({
                              ...current,
                              [group.id]: {
                                ...draft,
                                description: event.target.value,
                              },
                            }))
                          }
                          maxLength={500}
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleUpdateGroup(group.id)}
                        disabled={
                          unchanged ||
                          !draft.name.trim() ||
                          savingGroupId === group.id
                        }
                      >
                        {savingGroupId === group.id
                          ? "Kaydediliyor..."
                          : "Grubu güncelle"}
                      </button>
                    </article>
                  );
                })}
              </div>
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
      userForm={userForm}
      setUserForm={setUserForm}
      groupOptions={groupOptions}
      toggleGroupSelection={toggleGroupSelection}
      creatingUser={creatingUser}
      handleCreateUser={handleCreateUser}
      users={listedUsers}
      archivedUsers={archivedUsers}
      loadingUsers={loadingUsers}
      loadingArchivedUsers={loadingArchivedUsers}
      userPagination={userPagination}
      archivedUserPagination={archivedUserPagination}
      onUserPageChange={loadUserPage}
      onArchivedUserPageChange={loadArchivedUsers}
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
      creationMessage={creationMessage}
    />
  );
}

export default App;

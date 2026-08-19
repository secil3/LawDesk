import { useEffect, useState } from "react";

import { readResponse } from "./api";
import AppRouter from "./router/AppRouter";

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
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [archivedUsers, setArchivedUsers] = useState([]);
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

  const refreshTaskPanel = () => {
    setTaskPanelRevision((current) => current + 1);
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
    setLoadingUsers(true);

    try {
      const response = await fetch("/api/admin/users", {
        credentials: "include",
      });

      const data = await readResponse(response);
      setUsers(data.users || []);
    } catch (requestError) {
      setError(requestError.message || "Kullanıcı listesi yüklenemedi");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadArchivedUsers = async () => {
    setLoadingArchivedUsers(true);

    try {
      const response = await fetch("/api/admin/users?archived=true", {
        credentials: "include",
      });

      const data = await readResponse(response);
      setArchivedUsers(data.users || []);
    } catch (requestError) {
      setError(
        requestError.message || "Kullanıcı arşivi yüklenemedi",
      );
    } finally {
      setLoadingArchivedUsers(false);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await fetch("/api/admin/groups", {
        credentials: "include",
      });

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

      const data = await readResponse(response);
      const successMessage = data.message || "Grup başarıyla oluşturuldu";
      setCreationMessage(successMessage);
      setGroupForm({ name: "", description: "" });
      showToast(successMessage, "success");
      await loadGroups();
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
      showToast(successMessage, "success");
      await Promise.all([loadGroups(), loadUsers()]);
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
      showToast(successMessage, "success");
      await Promise.all([loadGroups(), loadUsers()]);
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
      showToast("Kullanıcı bu gruba zaten atanmış", "info");
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
      showToast(successMessage, "success");
      setGroupAssignmentDrafts((current) => ({
        ...current,
        [groupId]: {
          userId: "",
          role: "grup_uyesi",
        },
      }));
      await Promise.all([loadUsers(), loadGroups()]);
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
      showToast(successMessage, "success");
      await Promise.all([loadUsers(), loadGroups()]);
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
            setUser(null);
            setError("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
          }
          return;
        }

        const data = await readResponse(response);

        if (isActive) {
          setUser(data.user);

          if (data.user?.rol === "admin") {
            await Promise.all([
              loadUsers(),
              loadArchivedUsers(),
              loadGroups(),
            ]);
          }
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

      if (data.user?.rol === "admin") {
        await Promise.all([
          loadUsers(),
          loadArchivedUsers(),
          loadGroups(),
        ]);
      }
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
      showToast(successMessage, "success");
      await Promise.all([loadUsers(), loadArchivedUsers()]);
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
      showToast(successMessage, "success");
      await Promise.all([loadUsers(), loadArchivedUsers()]);
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
      showToast(successMessage, "success");

      // Update local users state to reflect change without reloading whole list
      setUsers((current) =>
        current.map((u) =>
          u.id === userId ? { ...u, aktifMi: data.user?.aktifMi ?? newActive } : u,
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
      setArchivedUsers([]);
      setUserListMode("active");
      setGroupOptions([]);
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
      showToast(successMessage, "success");
      setUserForm({
        adSoyad: "",
        email: "",
        password: "",
        roleMode: "kullanici",
        aktifMi: true,
        grupIds: [],
      });
      await loadUsers();
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
    const isGroupManager =
      Array.isArray(user?.groups) &&
      user.groups.some(
        (group) => group.grupRolu === "grup_yoneticisi",
      );

    return (
      <>
        {isAdmin && (
          <div className="role-panel admin-panel">
            <h2>Yönetici paneli</h2>
            <ul>
              <li>Kullanıcı erişim yönetimi</li>
              <li>Grup ve üyelik yönetimi</li>
              <li>Genel görev takibi</li>
            </ul>

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
                  <h3 className="section-panel-title">Yeni Grup Ekle</h3>
                </div>
                <span className="info-chip">
                  {groupOptions.length} grup
                </span>
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
                  <p className="eyebrow">Grup görünümü</p>
                  <h3 className="section-panel-title">Mevcut Gruplar</h3>
                </div>
              </div>

              <div className="group-overview-grid">
                {groupOptions.length === 0 ? (
                  <div className="empty-state-box">
                    Henüz gösterilecek grup yok. Yeni bir grup ekleyerek başlatabilirsiniz.
                  </div>
                ) : (
                  groupOptions.map((group) => (
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

              <div className="list-heading-with-tabs" style={{ marginTop: 22 }}>
                <div>
                  <p className="eyebrow">Grup düzenleme</p>
                  <h3 className="section-panel-title">Grup Güncelle</h3>
                </div>
              </div>

              <div className="group-management-grid">
                {groupOptions.map((group) => {
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

        {!isAdmin && !isGroupManager && (
          <div className="role-panel user-panel">
            <h2>Kullanıcı paneli</h2>
            <ul>
              <li>Atanmış ve oluşturduğun görevleri gör</li>
              <li>Oluşturduğun aktif görevleri düzenle</li>
              <li>Grup içi görevleri takip et</li>
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
      creationMessage={creationMessage}
    />
  );
}

export default App;

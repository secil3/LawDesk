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
  const [membershipEditor, setMembershipEditor] = useState({
    open: false,
    userId: null,
    userName: "",
    memberships: [],
  });
  const [savingMemberships, setSavingMemberships] = useState(false);
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
      setCreationMessage(data.message || "Grup oluşturuldu");
      setGroupForm({ name: "", description: "" });
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
      setCreationMessage(
        data.message || "Grup bilgileri güncellendi",
      );
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
      setCreationMessage(
        data.message || "Kullanıcının grup üyelikleri güncellendi",
      );
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
      setCreationMessage(data.message || "Kullanıcı arşivlendi");
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
      setCreationMessage(
        data.message || "Kullanıcı pasif olarak geri yüklendi",
      );
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

      setCreationMessage(data.message || "Kullanıcı güncellendi");

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

      setCreationMessage(
        `Kullanıcı oluşturuldu: ${data.user.email}`,
      );
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

    const displayedUsers =
      userListMode === "archived" ? archivedUsers : users;
    const isUserListLoading =
      userListMode === "archived"
        ? loadingArchivedUsers
        : loadingUsers;

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
                  <h3>Grup yönetimi</h3>
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

            <form className="admin-form" onSubmit={handleCreateUser}>
              <h3>Kullanıcı oluştur</h3>
              <p className="form-hint">
                Admin hesabı ayrı oluşturulur. Bu form yalnızca standart kullanıcı,
                grup üyesi, grup yöneticisi ve yönetici kayıtları için kullanılır.
              </p>

              <label htmlFor="admin-user-name">Ad soyad</label>
              <input
                id="admin-user-name"
                value={userForm.adSoyad}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    adSoyad: event.target.value,
                  }))
                }
                maxLength={150}
                required
              />

              <label htmlFor="admin-user-email">E-posta</label>
              <input
                id="admin-user-email"
                type="email"
                value={userForm.email}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                maxLength={150}
                required
              />

              <label htmlFor="admin-user-password">Şifre</label>
              <input
                id="admin-user-password"
                type="password"
                value={userForm.password}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                minLength={8}
                maxLength={256}
                required
              />

              <label htmlFor="admin-user-role">Kayıt tipi</label>
              <select
                id="admin-user-role"
                value={userForm.roleMode}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    roleMode: event.target.value,
                  }))
                }
              >
                <option value="kullanici">Standart kullanıcı</option>
                <option value="grup_uyesi">Grup üyesi</option>
                <option value="grup_yoneticisi">Grup yöneticisi</option>
                <option value="yonetici">Yönetici</option>
              </select>

              {(userForm.roleMode === "grup_uyesi" || userForm.roleMode === "grup_yoneticisi") && (
                <>
                  <label>Grup seçimi</label>
                  <div className="group-toggle" role="group" aria-label="Grup seçimi">
                    {groupOptions.map((group) => {
                      const isSelected = Array.isArray(userForm.grupIds)
                        ? userForm.grupIds.map(String).includes(String(group.id))
                        : false;

                      return (
                        <label
                          key={group.id}
                          className={`group-chip ${isSelected ? "selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            value={group.id}
                            checked={isSelected}
                            onChange={() => toggleGroupSelection(group.id)}
                          />
                          {group.name}
                        </label>
                      );
                    })}
                  </div>
                  <p className="form-hint">Birden fazla grup seçebilirsiniz. Kullanıcıya hangi gruplar üzerinden erişim verileceğini buradan belirleyin.</p>
                </>
              )}

              <button type="submit" disabled={creatingUser}>
                {creatingUser ? "Oluşturuluyor..." : "Kullanıcı oluştur"}
              </button>
            </form>

            <div className="user-list-panel">
              <div className="list-heading-with-tabs">
                <h3>Kullanıcılar</h3>
                <div className="view-tabs" aria-label="Kullanıcı görünümü">
                  <button
                    type="button"
                    className={userListMode === "active" ? "active" : ""}
                    onClick={() => setUserListMode("active")}
                  >
                    Aktif ({users.length})
                  </button>
                  <button
                    type="button"
                    className={userListMode === "archived" ? "active" : ""}
                    onClick={() => setUserListMode("archived")}
                  >
                    Arşiv ({archivedUsers.length})
                  </button>
                </div>
              </div>

              {userListMode === "archived" && (
                <p className="form-hint">
                  Geri yüklenen kullanıcı güvenlik için pasif açılır. Aktif
                  sekmesinden ayrıca aktifleştirebilirsiniz.
                </p>
              )}

              {isUserListLoading ? (
                <p>Yükleniyor...</p>
              ) : displayedUsers.length === 0 ? (
                <p>
                  {userListMode === "archived"
                    ? "Arşivlenmiş kullanıcı bulunmuyor."
                    : "Henüz kullanıcı oluşturulmadı."}
                </p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  {displayedUsers.map((item) => (
                    <div
                      key={item.id}
                      className="user-card-mini"
                      style={{
                        background: "white",
                        borderRadius: 12,
                        boxShadow: "0 6px 18px rgba(15,23,42,0.06)",
                        padding: 16,
                        width: 320,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        minHeight: 140,
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                              {item.adSoyad}
                            </div>
                            <div style={{ color: "#374151", fontSize: 13 }}>{item.email}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, color: "#111827", fontWeight: 600 }}>
                              {item.rol === "yonetici" ? "Yönetici" : item.rol === "kullanici" ? "Kullanıcı" : item.rol}
                            </div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>{item.groups && item.groups.length > 0 ? item.groups.map((g) => g.grupAdi).join(", ") : "Grup ataması yok"}</div>
                          </div>
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {item.groups && item.groups.length > 0 ? (
                            item.groups.map((g, idx) => (
                              <span key={idx} style={{
                                background: "#eef2ff",
                                color: "#3730a3",
                                padding: "4px 8px",
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 600,
                              }}>{g.grupAdi} ({g.grupRolu})</span>
                            ))
                          ) : (
                            <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>
                          )}
                          {userListMode === "archived" && (
                            <span className="archive-chip">
                              Arşivlenme: {new Date(item.archivedAt).toLocaleString("tr-TR")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="user-card-actions">
                        {userListMode === "active" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(item.id, !item.aktifMi)}
                              aria-pressed={item.aktifMi}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                background: item.aktifMi ? "#16a34a" : "#9ca3af",
                                color: "white",
                                fontWeight: 700,
                              }}
                              title={item.aktifMi ? "Kullanıcı aktif - tıklayarak pasifleştir" : "Kullanıcı pasif - tıklayarak aktifleştir"}
                            >
                              {item.aktifMi ? "Aktif" : "Pasif"}
                            </button>

                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => openMembershipEditor(item)}
                            >
                              Grupları düzenle
                            </button>

                            <button
                              type="button"
                              onClick={() => openDeleteConfirmation(item.id, item.adSoyad)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "1px solid #1d4ed8",
                                background: "#1d4ed8",
                                color: "white",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              Arşivle
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="restore-button"
                            onClick={() => handleRestoreUser(item.id)}
                            disabled={restoringUserId === item.id}
                          >
                            {restoringUserId === item.id
                              ? "Geri yükleniyor..."
                              : "Geri yükle"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {deleteConfirmation.open && (
              <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
                <div className="confirm-card">
                  <p className="eyebrow">Onay gerektiriyor</p>
                  <h3 id="delete-dialog-title">Kullanıcıyı arşivlemek üzeresiniz</h3>
                  <p>
                    <strong>{deleteConfirmation.userName}</strong> adlı kullanıcıyı arşivlemek istediğinizden emin misiniz? Kullanıcının geçmiş kayıtları korunacaktır.
                  </p>
                  <div className="confirm-actions">
                    <button type="button" onClick={confirmDeleteUser}>Evet, arşivle</button>
                    <button type="button" className="secondary-button" onClick={closeDeleteConfirmation}>Vazgeç</button>
                  </div>
                </div>
              </div>
            )}

            {membershipEditor.open && (
              <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title">
                <form className="confirm-card membership-card" onSubmit={handleSaveMemberships}>
                  <p className="eyebrow">Üyelik yönetimi</p>
                  <h3 id="membership-dialog-title">{membershipEditor.userName} için gruplar</h3>
                  <p>
                    Kullanıcının dahil olacağı grupları ve her gruptaki rolünü seçin. Bütün seçimleri kaldırmak da mümkündür.
                  </p>

                  <div className="membership-list">
                    {groupOptions.length === 0 ? (
                      <p>Önce en az bir grup oluşturmalısınız.</p>
                    ) : (
                      groupOptions.map((group) => {
                        const membership = membershipEditor.memberships.find(
                          (item) => Number(item.grupId) === Number(group.id),
                        );

                        return (
                          <div className="membership-row" key={group.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(membership)}
                                onChange={() => toggleMembership(group.id)}
                              />
                              <span>{group.name}</span>
                            </label>
                            <select
                              aria-label={`${group.name} grup rolü`}
                              value={membership?.grupRolu || "grup_uyesi"}
                              onChange={(event) =>
                                updateMembershipRole(group.id, event.target.value)
                              }
                              disabled={!membership}
                            >
                              <option value="grup_uyesi">Grup üyesi</option>
                              <option value="grup_yoneticisi">Grup yöneticisi</option>
                            </select>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="confirm-actions">
                    <button type="submit" disabled={savingMemberships}>
                      {savingMemberships ? "Kaydediliyor..." : "Üyelikleri kaydet"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={closeMembershipEditor}
                      disabled={savingMemberships}
                    >
                      Vazgeç
                    </button>
                  </div>
                </form>
              </div>
            )}
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
    />
  );
}

export default App;

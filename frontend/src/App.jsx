import { useEffect, useState } from "react";

const readResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "İşlem tamamlanamadı");
  }

  return data;
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
  const [loadingUsers, setLoadingUsers] = useState(false);

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
            await loadUsers();
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

      if (data.user?.rol === "admin") {
        await loadUsers();
      }
    } catch (requestError) {
      setError(
        requestError.message || "Giriş işlemi tamamlanamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await readResponse(response);
      setCreationMessage(data.message || "Kullanıcı silindi");
      await loadUsers();
    } catch (requestError) {
      setError(requestError.message || "Kullanıcı silinemedi");
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
        grupIds: Array.isArray(userForm.grupIds) ? userForm.grupIds.map((g) => Number(g)) : [],
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
        grupId: "2",
      });
      await loadUsers();
    } catch (requestError) {
      setError(
        requestError.message || "Kullanıcı oluşturulamadı",
      );
    } finally {
      setCreatingUser(false);
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

  if (user) {
    const isAdmin = user.rol === "admin";
    const isGroupManager =
      Array.isArray(user.groups) &&
      user.groups.some(
        (group) => group.grupRolu === "grup_yoneticisi",
      );
    const groupedRoles =
      Array.isArray(user.groups) && user.groups.length > 0
        ? user.groups
            .map(
              (group) =>
                `${group.grupAdi} (${group.grupRolu})`,
            )
            .join(", ")
        : "Grup ataması yok";

    return (
      <main className="auth-page">
        <section className="auth-card user-card">
          <p className="eyebrow success">Oturum açık</p>
          <h1>Hoş geldiniz, {user.adSoyad}</h1>
          <p>
            {isAdmin
              ? "Sistem yöneticisi olarak tüm yönetim alanına erişim sağlıyorsunuz."
              : isGroupManager
                ? "Grup yöneticisi olarak görev ve üyelik yönetimini yapabilirsiniz."
                : "Standart kullanıcı olarak atanmış görevlerinizi görüntüleyebilirsiniz."}
          </p>

          <div className="role-badges">
            <span className="info-chip">
              Sistem rolü: {user.rol}
            </span>
            <span className="info-chip">
              Grup rolleri: {groupedRoles}
            </span>
          </div>

          {isAdmin && (
            <div className="role-panel admin-panel">
              <h2>Yönetici paneli</h2>
              <ul>
                <li>Kullanıcı erişim yönetimi</li>
                <li>Sistem ayarları</li>
                <li>Genel görev takibi</li>
              </ul>

              <form className="admin-form" onSubmit={handleCreateUser}>
                <h3>Örnek kullanıcı oluştur</h3>
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
                    <label htmlFor="admin-user-group">Grup</label>
                    <select
                      id="admin-user-group"
                      multiple
                      value={userForm.grupIds}
                      onChange={(event) => {
                        const options = Array.from(event.target.selectedOptions || []);
                        const values = options.map((o) => o.value);
                        setUserForm((current) => ({
                          ...current,
                          grupIds: values,
                        }));
                      }}
                      size={2}
                    >
                      <option value="1">Uyum</option>
                      <option value="2">KVKK</option>
                    </select>
                  </>
                )}

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

                <button type="submit" disabled={creatingUser}>
                  {creatingUser ? "Oluşturuluyor..." : "Kullanıcı oluştur"}
                </button>
              </form>

              <div className="user-list-panel">
                <h3>Oluşturulan kullanıcılar</h3>

                {loadingUsers ? (
                  <p>Yükleniyor...</p>
                ) : users.length === 0 ? (
                  <p>Henüz kullanıcı oluşturulmadı.</p>
                ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {users.map((item) => (
                  <div
                    key={item.id}
                    className="user-card-mini"
                    style={{
                      background: 'white',
                      borderRadius: 12,
                      boxShadow: '0 6px 18px rgba(15,23,42,0.06)',
                      padding: 16,
                      width: 320,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 140,
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>
                            {item.adSoyad}
                          </div>
                          <div style={{ color: '#374151', fontSize: 13 }}>{item.email}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13, color: '#111827', fontWeight: 600 }}>
                            {item.rol === 'yonetici' ? 'Yönetici' : item.rol === 'kullanici' ? 'Kullanıcı' : item.rol}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{item.groups && item.groups.length > 0 ? item.groups.map((g) => g.grupAdi).join(', ') : 'Grup ataması yok'}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {item.groups && item.groups.length > 0 ? (
                          item.groups.map((g, idx) => (
                            <span key={idx} style={{
                              background: '#eef2ff',
                              color: '#3730a3',
                              padding: '4px 8px',
                              borderRadius: 9999,
                              fontSize: 12,
                              fontWeight: 600,
                            }}>{g.grupAdi} ({g.grupRolu})</span>
                          ))
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item.id, !item.aktifMi)}
                        aria-pressed={item.aktifMi}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: 'none',
                          cursor: 'pointer',
                          background: item.aktifMi ? '#16a34a' : '#9ca3af',
                          color: 'white',
                          fontWeight: 700,
                        }}
                        title={item.aktifMi ? 'Kullanıcı aktif - tıklayarak pasifleştir' : 'Kullanıcı pasif - tıklayarak aktifleştir'}
                      >
                        {item.aktifMi ? 'Aktif' : 'Pasif'}
                      </button>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(item.id)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #1d4ed8',
                            background: '#1d4ed8',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          Sil
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                )}
              </div>
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
              <h2>Standart kullanıcı paneli</h2>
              <ul>
                <li>Atanmış görevleri gör</li>
                <li>Durum güncelle</li>
                <li>Grup içi aksiyonları takip et</li>
              </ul>
            </div>
          )}

          <dl className="user-details">
            <div>
              <dt>E-posta</dt>
              <dd>{user.email}</dd>
            </div>

            <div>
              <dt>Sistem rolü</dt>
              <dd>{user.rol}</dd>
            </div>
          </dl>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={submitting}
          >
            {submitting
              ? "Çıkış yapılıyor..."
              : "Çıkış yap"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section
        className="auth-card"
        aria-labelledby="login-title"
      >
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>

          <div>
            <p className="brand-name">LawDesk</p>
            <p className="brand-subtitle">
              Görev Yönetim Sistemi
            </p>
          </div>
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Güvenli giriş</p>
          <h1 id="login-title">
            Hesabınıza giriş yapın
          </h1>
          <p>
            Devam etmek için kurum hesabınızı kullanın.
          </p>
        </div>

        <form
          className="login-form"
          onSubmit={handleLogin}
        >
          <label htmlFor="email">E-posta</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            maxLength={150}
            required
          />

          <label htmlFor="password">Şifre</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            maxLength={256}
            required
          />

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting
              ? "Giriş yapılıyor..."
              : "Giriş yap"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
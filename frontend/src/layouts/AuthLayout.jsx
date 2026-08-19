function AuthLayout({
  user,
  children,
  currentPath,
  onNavigate,
  onLogout,
}) {
  const menuItems = [
    { label: "Ana Sayfa", path: "/dashboard" },
    { label: "Görevler", path: "/tasks" },
    { label: "Gruplar", path: "/groups" },
    { label: "Kullanıcılar", path: "/users/create" },
    { label: "Bildirimler", path: "/notifications" },
    { label: "Ayarlar", path: "/settings" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-brand-button"
          onClick={() => onNavigate("/dashboard")}
          aria-label="Ana sayfaya git"
        >
          <span className="brand-mark">L</span>
          <div className="brand-meta">
            <strong>LawDesk</strong>
            <small>Panel</small>
          </div>
        </button>

        <nav
          className="sidebar-nav"
          aria-label="Uygulama menüsü"
        >
          {menuItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={
                currentPath === item.path
                  ? "sidebar-link active"
                  : "sidebar-link"
              }
              onClick={() => onNavigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <span>
              {user?.adSoyad ||
                user?.email ||
                "Kullanıcı"}
            </span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={onLogout}
          >
            Çıkış Yap
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>
    </div>
  );
}

export default AuthLayout;
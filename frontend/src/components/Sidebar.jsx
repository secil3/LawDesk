import BrandLogo from "./BrandLogo";

function Sidebar({ user, currentPath, onNavigate, onLogout }) {
  const items = [
    { label: "Ana Sayfa", path: "/dashboard" },
    { label: "Görevler", path: "/tasks" },
    { label: "Gruplar", path: "/groups" },
    { label: "Kullanıcılar", path: "/users/create" },
    { label: "Bildirimler", path: "/notifications" },
    { label: "Ayarlar", path: "/settings" },
  ];

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-brand-button"
        onClick={() => onNavigate("/dashboard")}
        aria-label="Ana sayfaya git"
      >
        <BrandLogo subtitle="Panel" variant="navbar" />
      </button>

      <nav className="sidebar-nav" aria-label="Uygulama menüsü">
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            className={currentPath === item.path ? "sidebar-link active" : "sidebar-link"}
            onClick={() => onNavigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-pill">
          <span>{user?.adSoyad || user?.email || "Kullanıcı"}</span>
        </div>
        <button type="button" className="logout-button" onClick={onLogout}>
          Çıkış Yap
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;

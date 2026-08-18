function PublicLayout({ children, currentPath, onNavigate }) {
  const navItems = [
    { label: "Ana Sayfa", path: "/" },
    { label: "Özellikler", path: "/features" },
    { label: "Giriş Yap", path: "/login" },
    { label: "Kayıt Ol", path: "/register" },
  ];

  return (
    <div className="public-layout">
      <header className="public-navbar">
        <div className="nav-brand" onClick={() => onNavigate("/")} role="button" tabIndex={0} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onNavigate("/");
          }
        }}>
          <span className="brand-mark">L</span>
          <div>
            <strong>LawDesk</strong>
            <small>Görev Yönetim Sistemi</small>
          </div>
        </div>

        <nav className="public-nav" aria-label="Ana menü">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={currentPath === item.path ? "nav-link active" : "nav-link"}
              onClick={() => onNavigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default PublicLayout;

function PublicLayout({ children, currentPath, onNavigate, theme, onThemeChange }) {
  const navItems = [
    { label: "Ana Sayfa", path: "/" },
    { label: "Platform", path: "/features" },
    { label: "Kayıt Ol", path: "/register" },
    { label: "Giriş Yap", path: "/login" },
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
          <button
            type="button"
            className={`public-theme-toggle ${theme === "dark" ? "is-dark" : "is-light"}`}
            onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
            aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"}
            aria-pressed={theme === "dark"}
            title={theme === "dark" ? "Açık tema" : "Koyu tema"}
          >
            <span className="public-theme-toggle-track" aria-hidden="true">
              <span className="public-theme-toggle-thumb" />
              <span className="public-theme-icon sun">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
                </svg>
              </span>
              <span className="public-theme-icon moon">
                <svg viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              </span>
            </span>
          </button>
        </nav>
      </header>

      <main>{children}</main>
    </div>
  );
}

export default PublicLayout;

import { useEffect, useState } from "react";

import { readResponse } from "../api";
import BrandLogo from "../components/BrandLogo";

function AuthLayout({
  user,
  children,
  currentPath,
  onNavigate,
  onLogout,
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUnreadCount = async () => {
      try {
        const response = await fetch("/api/notifications/unread-count", {
          credentials: "include",
        });
        const data = await readResponse(response);

        if (isMounted) {
          setUnreadCount(Number(data.unreadCount) || 0);
        }
      } catch {
        // Sessizce yok say; badge sadece iyileştirme amaçlıdır.
      }
    };

    loadUnreadCount();
    const timer = window.setInterval(loadUnreadCount, 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [currentPath]);

  useEffect(() => {
    if (!logoutConfirmationOpen) {
      return undefined;
    }

    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !loggingOut) {
        setLogoutConfirmationOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loggingOut, logoutConfirmationOpen]);

  const confirmLogout = async () => {
    setLoggingOut(true);

    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setLogoutConfirmationOpen(false);
    }
  };

  const canCreateUsers = (userRecord) => {
    return userRecord?.rol === "admin";
  };

  const canManageSystem = (userRecord) => {
    return ["admin", "yonetici"].includes(userRecord?.rol);
  };

  const menuItems = [
    { label: "Ana Sayfa", path: "/dashboard" },
    { label: "Görevler", path: "/tasks" },
    { label: "Gruplar", path: "/groups" },
    ...(canCreateUsers(user)
      ? [
          { label: "Kullanıcılar", path: "/users/create" },
          { label: "Kayıt Talepleri", path: "/registration-requests" },
        ]
      : []),
    ...(canManageSystem(user)
      ? [{ label: "Yönetim", path: "/management" }]
      : []),
    {
      label: "Bildirimler",
      path: "/notifications",
      badge: unreadCount > 0 ? unreadCount : null,
    },
    { label: "Ayarlar", path: "/settings" },
  ];

  const displayName = user?.adSoyad || user?.email || "Kullanıcı";
  const userInitials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("tr-TR"))
    .join("");
  const roleLabels = {
    admin: "Sistem Yöneticisi",
    yonetici: "Yönetici",
    kullanici: "Kullanıcı",
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          type="button"
          className="sidebar-brand-button"
          onClick={() => onNavigate("/dashboard")}
          aria-label="Ana sayfaya git"
        >
          <BrandLogo subtitle="Panel" variant="navbar" />
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
                currentPath === item.path ||
                currentPath.startsWith(`${item.path}/`)
                  ? "sidebar-link active"
                  : "sidebar-link"
              }
              onClick={() => onNavigate(item.path)}
            >
              <span>{item.label}</span>
              {Boolean(item.badge) && (
                <span className="sidebar-link-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

      </aside>

      <div className="app-content">
        <header className="app-topbar">
          <div className="app-topbar-context">
            <span className="app-topbar-label">LawDesk</span>
            <strong>Yönetim Paneli</strong>
          </div>

          <div className="app-topbar-actions">
            <div className="app-topbar-profile">
              <span className="app-topbar-avatar" aria-hidden="true">
                {userInitials || "K"}
              </span>
              <span className="app-topbar-profile-copy">
                <strong>{displayName}</strong>
                <small>{roleLabels[user?.rol] || "Kullanıcı"}</small>
              </span>
            </div>
            <button
              type="button"
              className="topbar-logout-button"
              onClick={() => setLogoutConfirmationOpen(true)}
              aria-haspopup="dialog"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                <path d="M14 8l4 4-4 4" />
                <path d="M18 12H9" />
              </svg>
              <span>Çıkış</span>
            </button>
          </div>
        </header>

        {children}
      </div>

      {logoutConfirmationOpen && (
        <div
          className="modal-overlay logout-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !loggingOut) {
              setLogoutConfirmationOpen(false);
            }
          }}
        >
          <section className="confirm-card logout-confirm-card">
            <span className="logout-confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
                <path d="M14 8l4 4-4 4" />
                <path d="M18 12H9" />
              </svg>
            </span>
            <div className="logout-confirm-copy">
              <p className="eyebrow">Oturum işlemi</p>
              <h3 id="logout-confirm-title">Çıkış yapmak istediğinize emin misiniz?</h3>
              <p>Açık oturumunuz güvenli şekilde sonlandırılacaktır.</p>
            </div>
            <div className="logout-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLogoutConfirmationOpen(false)}
                disabled={loggingOut}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="logout-confirm-submit"
                onClick={confirmLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Çıkış yapılıyor..." : "Çıkış Yap"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AuthLayout;

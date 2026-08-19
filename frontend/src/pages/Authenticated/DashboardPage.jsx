import { useEffect, useState } from "react";

import { readResponse } from "../../api";

const EMPTY_SUMMARY = {
  totalTasks: 0,
  activeTasks: 0,
  archivedTasks: 0,
  groupCount: 0,
  canViewArchive: false,
  statusCounts: {},
  recentTasks: [],
};

const STATUS_LABELS = {
  "Yeni Atandi": "Yeni Atandı",
  "Devam Ediyor": "Devam Ediyor",
  Beklemede: "Beklemede",
  Tamamlandi: "Tamamlandı",
  "Iptal Edildi": "İptal Edildi",
};

const PRIORITY_LABELS = {
  Kritik: "Kritik",
  Yuksek: "Yüksek",
  Orta: "Orta",
  Dusuk: "Düşük",
};

const STATUS_CLASS_MAP = {
  "Yeni Atandi": "status-badge status-new",
  "Devam Ediyor": "status-badge status-progress",
  Beklemede: "status-badge status-pending",
  Tamamlandi: "status-badge status-done",
  "Iptal Edildi": "status-badge status-cancelled",
};

const formatDate = (value) => {
  if (!value) {
    return "Bitiş tarihi yok";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Bitiş tarihi yok";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function DashboardPage({ user }) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const roleText =
    user?.rol === "admin"
      ? "Sistem yöneticisi olarak tüm yönetim alanına erişim sağlıyorsunuz."
      : user?.groups?.length
        ? "Grup rolleriniz ve görev kapsamınız doğrultusunda işlem yapabilirsiniz."
        : "Oluşturduğunuz ve doğrudan size atanan görevleri takip edebilirsiniz.";

  const statusBadgeClass = (status) => {
    const label = STATUS_LABELS[status] || status;
    return STATUS_CLASS_MAP[label] || "status-badge status-default";
  };

  const statusItems = Object.entries(summary.statusCounts || {});
  const hasStatusData = statusItems.length > 0;

  const normalizedRole =
    user?.rol === "admin"
      ? "Sistem Yöneticisi"
      : user?.rol === "yonetici"
        ? "Yönetici"
        : "Kullanıcı";

  useEffect(() => {
    let isActive = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          "/api/tasks/dashboard-summary",
          {
            credentials: "include",
          },
        );

        const data = await readResponse(response);

        if (!isActive) {
          return;
        }

        setSummary({
          totalTasks: Number(data.totalTasks) || 0,
          activeTasks: Number(data.activeTasks) || 0,
          archivedTasks: Number(data.archivedTasks) || 0,
          groupCount: Number(data.groupCount) || 0,
          canViewArchive: data.canViewArchive === true,
          statusCounts:
            data.statusCounts &&
            typeof data.statusCounts === "object"
              ? data.statusCounts
              : {},
          recentTasks: Array.isArray(data.recentTasks)
            ? data.recentTasks
            : [],
        });
      } catch (requestError) {
        if (!isActive) {
          return;
        }

        setError(
          requestError.message ||
            "Dashboard bilgileri yüklenemedi",
        );
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section className="page-shell dashboard-page">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">LawDesk</p>
          <h2>Uygulama kontrol paneli</h2>
          <p className="form-hint">
            Hoş geldiniz, {user?.adSoyad || user?.email || "Kullanıcı"}. {roleText}
          </p>
          <div className="dashboard-hero-meta">
            <span className="dashboard-chip">Rol: {normalizedRole}</span>
            <span className="dashboard-chip">Grup: {summary.groupCount}</span>
          </div>
        </div>

        <div className="dashboard-hero-summary">
          <span className="summary-label">Aktif görev</span>
          <strong>{summary.activeTasks}</strong>
          <small>güncel takipte</small>
        </div>
      </header>

      {loading ? (
        <section className="dashboard-state-card" aria-live="polite">
          <p className="dashboard-state-title">Dashboard yükleniyor...</p>
          <p className="dashboard-state-text">Görev özetleri hazırlanıyor.</p>
        </section>
      ) : error ? (
        <section className="dashboard-state-card dashboard-state-error" role="alert">
          <p className="dashboard-state-title">Dashboard bilgileri alınamadı</p>
          <p className="dashboard-state-text">{error}</p>
        </section>
      ) : (
        <>
          <div className="stats-grid dashboard-stats">
            <div className="stat-card metric-card">
              <span>Toplam görünür görev</span>
              <strong>{summary.totalTasks}</strong>
              <small>Kapsamınızdaki tüm kayıtlar</small>
            </div>

            <div className="stat-card metric-card accent-card">
              <span>Aktif görevler</span>
              <strong>{summary.activeTasks}</strong>
              <small>İşlem bekleyen görevler</small>
            </div>

            {summary.canViewArchive && (
              <div className="stat-card metric-card soft-card">
                <span>Arşivlenmiş görevler</span>
                <strong>{summary.archivedTasks}</strong>
                <small>Geçmiş kayıtlar</small>
              </div>
            )}

            <div className="stat-card metric-card muted-card">
              <span>İlgili grup sayısı</span>
              <strong>{summary.groupCount}</strong>
              <small>Yetki kapsamındaki gruplar</small>
            </div>
          </div>

          <section className="dashboard-section dashboard-info-grid">
            <article className="dashboard-info-card">
              <h3>Kullanıcı bilgisi</h3>
              <p>{user?.adSoyad || "-"}</p>
              <small>{user?.email || "-"}</small>
            </article>

            <article className="dashboard-info-card">
              <h3>Grup kapsamı</h3>
              <p>{summary.groupCount} grup ile ilişkili</p>
              <small>Görev görünürlüğü ve yetkiler grup rollerine göre belirlenir.</small>
            </article>

            <article className="dashboard-info-card">
              <h3>Bildirim durumu</h3>
              <p>Güncel bildirim özeti yok</p>
              <small>Yeni bildirimler oluştuğunda bu alanda listelenir.</small>
            </article>
          </section>

          <section className="dashboard-section">
            <div className="section-heading-row">
              <h3>Görev özeti</h3>
            </div>

            {!hasStatusData ? (
              <div className="dashboard-inline-empty">Durum bazlı görev özeti bulunamadı.</div>
            ) : (
              <div className="status-summary-list">
                {statusItems.map(([status, count]) => (
                  <div key={status} className="status-summary-item">
                    <span className={statusBadgeClass(status)}>
                      {STATUS_LABELS[status] || status}
                    </span>
                    <strong>{Number(count) || 0}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading-row">
              <h3>Aktif görev görünümü</h3>
            </div>

            {summary.recentTasks.length === 0 ? (
              <div className="task-empty-state">
                Henüz gösterilecek görev yok.
              </div>
            ) : (
              <div className="recent-task-list">
                {summary.recentTasks.map((task) => (
                  <article key={task.id} className="task-card recent-task-card">
                    <div className="recent-task-top">
                      <div className="recent-task-main">
                        <div className="recent-task-title-row">
                          <span className="task-number">Görev #{task.id}</span>
                          <span className={`priority-badge ${String(task.priority || "Orta").toLowerCase()}`}>
                            {PRIORITY_LABELS[task.priority] || task.priority || "-"}
                          </span>
                        </div>

                        <h4>{task.title}</h4>

                        {task.description && (
                          <p className="task-description">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="recent-task-footer">
                      <span className={statusBadgeClass(task.status)}>
                        {STATUS_LABELS[task.status] || task.status || "-"}
                      </span>
                      <span className="task-date">
                        {formatDate(task.dueDate)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

export default DashboardPage;
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
      <div className="section-header">
        <div>
          <p className="eyebrow">LawDesk</p>
          <h2>Uygulama kontrol paneli</h2>
          <p className="form-hint">
            Hoş geldiniz,{" "}
            {user?.adSoyad || user?.email || "Kullanıcı"}.{" "}
            {roleText}
          </p>
        </div>
      </div>

      {loading ? (
        <p>Dashboard yükleniyor...</p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            <div className="stat-card">
              <span>Toplam görünür görev</span>
              <strong style={{ fontSize: 28 }}>
                {summary.totalTasks}
              </strong>
            </div>

            <div className="stat-card">
              <span>Aktif görevler</span>
              <strong style={{ fontSize: 28 }}>
                {summary.activeTasks}
              </strong>
            </div>

            {summary.canViewArchive && (
              <div className="stat-card">
                <span>Arşivlenmiş görevler</span>
                <strong style={{ fontSize: 28 }}>
                  {summary.archivedTasks}
                </strong>
              </div>
            )}

            <div className="stat-card">
              <span>İlgili grup sayısı</span>
              <strong style={{ fontSize: 28 }}>
                {summary.groupCount}
              </strong>
            </div>
          </div>

          <section style={{ marginTop: 20 }}>
            <h3>Görev özeti</h3>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 12,
                flexWrap: "wrap",
              }}
            >
              {Object.entries(summary.statusCounts).map(
                ([status, count]) => (
                  <div
                    key={status}
                    className="stat-card"
                    style={{ minWidth: 180 }}
                  >
                    <span>
                      {STATUS_LABELS[status] || status}
                    </span>
                    <strong>{Number(count) || 0}</strong>
                  </div>
                ),
              )}
            </div>
          </section>

          <section style={{ marginTop: 22 }}>
            <h3>Aktif görev görünümü</h3>

            {summary.recentTasks.length === 0 ? (
              <div className="task-empty-state">
                Henüz gösterilecek görev yok.
              </div>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gap: 12,
                }}
              >
                {summary.recentTasks.map((task) => (
                  <article
                    key={task.id}
                    className="task-card"
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>
                          {task.title}
                        </div>

                        {task.description && (
                          <div
                            style={{
                              color: "#475569",
                              marginTop: 6,
                            }}
                          >
                            {task.description}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          minWidth: 140,
                          textAlign: "right",
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {PRIORITY_LABELS[task.priority] ||
                            task.priority ||
                            "-"}
                        </div>

                        <div
                          style={{
                            color: "#64748b",
                            fontSize: 13,
                          }}
                        >
                          {STATUS_LABELS[task.status] ||
                            task.status ||
                            "-"}
                        </div>

                        <div
                          style={{
                            color: "#6b7280",
                            fontSize: 12,
                            marginTop: 8,
                          }}
                        >
                          {formatDate(task.dueDate)}
                        </div>
                      </div>
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
import { useEffect, useState } from "react";
import { readResponse } from "../../api";

function DashboardPage({ user }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [totalTasks, setTotalTasks] = useState(0);
  const [activeTasks, setActiveTasks] = useState(0);
  const [archivedTasks, setArchivedTasks] = useState(0);
  const [groupCount, setGroupCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState({});
  const [recentTasks, setRecentTasks] = useState([]);

  const roleText = user?.rol === "admin"
    ? "Sistem yöneticisi olarak tüm yönetim alanına erişim sağlıyorsunuz."
    : user?.groups?.length
      ? "Grup rolleri ve görev takibi alanını kullanabilirsiniz."
      : "Kullanıcı olarak atanmış ve oluşturduğunuz görevleri takip edebilirsiniz.";

  useEffect(() => {
    let isActive = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError("");

      try {
        // Active tasks (not archived)
        const respActive = await fetch("/api/tasks?limit=1", { credentials: "include" });
        const dataActive = await readResponse(respActive);
        const activeTotal = Number(dataActive.pagination?.total ?? (Array.isArray(dataActive.tasks) ? dataActive.tasks.length : 0));

        // Archived tasks
        const respArchived = await fetch("/api/tasks?archived=true&limit=1", { credentials: "include" });
        const dataArchived = await readResponse(respArchived);
        const archivedTotal = Number(dataArchived.pagination?.total ?? (Array.isArray(dataArchived.tasks) ? dataArchived.tasks.length : 0));

        // Groups
        const respGroups = await fetch("/api/admin/groups", { credentials: "include" });
        const dataGroups = await readResponse(respGroups);
        const groups = Array.isArray(dataGroups.groups) ? dataGroups.groups : [];

        // Status counts - common statuses
        const statuses = ["Yeni Atandi", "Devam Ediyor", "Beklemede", "Tamamlandi"];
        const counts = {};

        await Promise.all(statuses.map(async (status) => {
          try {
            const r = await fetch(`/api/tasks?status=${encodeURIComponent(status)}&limit=1`, { credentials: "include" });
            const d = await readResponse(r);
            counts[status] = Number(d.pagination?.total ?? (Array.isArray(d.tasks) ? d.tasks.length : 0));
          } catch (e) {
            counts[status] = 0;
          }
        }));

        // Recent tasks (active)
        const respRecent = await fetch("/api/tasks?limit=6&sortBy=due_date&sortOrder=asc", { credentials: "include" });
        const dataRecent = await readResponse(respRecent);
        const recent = Array.isArray(dataRecent.tasks) ? dataRecent.tasks : [];

        if (!isActive) return;

        setActiveTasks(activeTotal);
        setArchivedTasks(archivedTotal);
        setTotalTasks(activeTotal + archivedTotal);
        setGroupCount(groups.length);
        setStatusCounts(counts);
        setRecentTasks(recent);
      } catch (requestError) {
        if (!isActive) return;
        setError(requestError.message || "Panel verileri yüklenemedi");
      } finally {
        if (isActive) setLoading(false);
      }
    };

    loadDashboard();

    return () => { isActive = false; };
  }, []);

  return (
    <section className="page-shell dashboard-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">LAWDesk</p>
          <h2>Uygulama kontrol paneli</h2>
          <p className="form-hint">Hoş geldiniz, {user?.adSoyad || user?.email || "Kullanıcı"}. {roleText}</p>
        </div>
      </div>

      {loading ? (
        <p>Yükleniyor...</p>
      ) : error ? (
        <p className="error-message">{error}</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
            <div className="stat-card">
              <span>Toplam görev</span>
              <strong style={{ fontSize: 28 }}>{totalTasks}</strong>
            </div>
            <div className="stat-card">
              <span>Aktif görevler</span>
              <strong style={{ fontSize: 28 }}>{activeTasks}</strong>
            </div>
            <div className="stat-card">
              <span>Grup sayısı</span>
              <strong style={{ fontSize: 28 }}>{groupCount}</strong>
            </div>
          </div>

          <section style={{ marginTop: 20 }}>
            <h3>Görev Özeti</h3>
            <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
              {Object.keys(statusCounts).length === 0 ? (
                <p>Durum bilgisi bulunmuyor.</p>
              ) : (
                Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="stat-card" style={{ minWidth: 180 }}>
                    <span>{status}</span>
                    <strong>{count}</strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <section style={{ marginTop: 22 }}>
            <h3>Son görevler</h3>
            {recentTasks.length === 0 ? (
              <div className="task-empty-state">Henüz gösterilecek görev yok.</div>
            ) : (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {recentTasks.map((t) => (
                  <article key={t.id} className="task-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800 }}>{t.title || t.baslik}</div>
                        <div style={{ color: '#475569', marginTop: 6 }}>{t.description || t.aciklama || ''}</div>
                      </div>
                      <div style={{ minWidth: 140, textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{t.priority || t.oncelik || '-'}</div>
                        <div style={{ color: '#64748b', fontSize: 13 }}>{t.status || t.durum || '-'}</div>
                        <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>{t.dueDate ? new Date(t.dueDate).toLocaleString('tr-TR') : (t.bitisTarihi ? new Date(t.bitisTarihi).toLocaleString('tr-TR') : 'Bitiş tarihi yok')}</div>
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

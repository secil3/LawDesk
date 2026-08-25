import { useCallback, useEffect, useMemo, useState } from "react";

import { readResponse } from "../../api";
import GlobalSearch from "../../components/GlobalSearch";

const EMPTY_SUMMARY = {
  reportPeriod: "30",
  generatedAt: null,
  totalTasks: 0,
  activeTasks: 0,
  archivedTasks: 0,
  openTasks: 0,
  closedTasks: 0,
  groupCount: 0,
  canViewArchive: false,
  statusCounts: {},
  riskCounts: {
    overdue: 0,
    dueSoon: 0,
    withoutDueDate: 0,
  },
  priorityCounts: {},
  performance: {
    createdTasks: 0,
    completedTasks: 0,
    completionRate: 0,
    averageCompletionHours: 0,
  },
  typeBreakdown: [],
  assignmentBreakdown: [],
  recentTasks: [],
};

const PERIOD_OPTIONS = [
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 90 gün" },
  { value: "365", label: "Son 1 yıl" },
  { value: "all", label: "Tüm zamanlar" },
];

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

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatDate = (value, emptyText = "Bitiş tarihi yok") => {
  if (!value) {
    return emptyText;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return emptyText;
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  });
};

const downloadFilename = (response) => {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);

  return match?.[1] || "lawdesk-gorev-raporu.csv";
};

const normalizeSummary = (data) => ({
  reportPeriod: String(data.reportPeriod || "30"),
  generatedAt: data.generatedAt || null,
  totalTasks: toNumber(data.totalTasks),
  activeTasks: toNumber(data.activeTasks),
  archivedTasks: toNumber(data.archivedTasks),
  openTasks: toNumber(data.openTasks),
  closedTasks: toNumber(data.closedTasks),
  groupCount: toNumber(data.groupCount),
  canViewArchive: data.canViewArchive === true,
  statusCounts:
    data.statusCounts && typeof data.statusCounts === "object"
      ? data.statusCounts
      : {},
  riskCounts: {
    overdue: toNumber(data.riskCounts?.overdue),
    dueSoon: toNumber(data.riskCounts?.dueSoon),
    withoutDueDate: toNumber(data.riskCounts?.withoutDueDate),
  },
  priorityCounts:
    data.priorityCounts && typeof data.priorityCounts === "object"
      ? data.priorityCounts
      : {},
  performance: {
    createdTasks: toNumber(data.performance?.createdTasks),
    completedTasks: toNumber(data.performance?.completedTasks),
    completionRate: toNumber(data.performance?.completionRate),
    averageCompletionHours: toNumber(
      data.performance?.averageCompletionHours,
    ),
  },
  typeBreakdown: Array.isArray(data.typeBreakdown)
    ? data.typeBreakdown
    : [],
  assignmentBreakdown: Array.isArray(data.assignmentBreakdown)
    ? data.assignmentBreakdown
    : [],
  recentTasks: Array.isArray(data.recentTasks) ? data.recentTasks : [],
});

function BreakdownBars({ items, emptyText }) {
  const maximum = Math.max(
    1,
    ...items.map((item) => toNumber(item.count)),
  );

  if (items.length === 0) {
    return <div className="dashboard-inline-empty">{emptyText}</div>;
  }

  return (
    <div className="dashboard-bar-list">
      {items.map((item) => {
        const count = toNumber(item.count);
        const width = count === 0 ? 0 : Math.max(6, (count / maximum) * 100);

        return (
          <div className="dashboard-bar-row" key={`${item.id ?? "none"}-${item.name}`}>
            <div className="dashboard-bar-label">
              <span>{item.name}</span>
              <strong>{count}</strong>
            </div>
            <div
              className="dashboard-bar-track"
              role="img"
              aria-label={`${item.name}: ${count} görev`}
            >
              <span style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardPage({ user, onNavigate }) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const roleText =
    user?.rol === "admin"
      ? "Sistem yöneticisi olarak tüm yönetim alanına erişim sağlıyorsunuz."
      : user?.groups?.length
        ? "Grup rolleriniz ve görev kapsamınız doğrultusunda işlem yapabilirsiniz."
        : "Oluşturduğunuz ve doğrudan size atanan görevleri takip edebilirsiniz.";

  const normalizedRole =
    user?.rol === "admin"
      ? "Sistem Yöneticisi"
      : user?.rol === "yonetici"
        ? "Yönetici"
        : "Kullanıcı";

  const statusBadgeClass = (status) => {
    return STATUS_CLASS_MAP[status] || "status-badge status-default";
  };

  const statusItems = Object.entries(summary.statusCounts || {});
  const priorityItems = useMemo(
    () =>
      Object.entries(summary.priorityCounts || {}).map(([priority, count]) => ({
        id: priority,
        name: PRIORITY_LABELS[priority] || priority,
        count: toNumber(count),
      })),
    [summary.priorityCounts],
  );

  const loadDashboard = useCallback(async (selectedPeriod) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ period: selectedPeriod });
      const response = await fetch(
        `/api/tasks/dashboard-summary?${params}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);
      setSummary(normalizeSummary(data));
    } catch (requestError) {
      setError(
        requestError.message || "Dashboard bilgileri yüklenemedi",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard(period);
  }, [loadDashboard, period]);

  const exportReport = async () => {
    setExporting(true);
    setError("");

    try {
      const params = new URLSearchParams({ period });
      const response = await fetch(
        `/api/tasks/dashboard-report/export?${params}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Görev raporu indirilemedi");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = downloadFilename(response);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (requestError) {
      setError(requestError.message || "Görev raporu indirilemedi");
    } finally {
      setExporting(false);
    }
  };

  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.label ||
    "Seçili dönem";

  return (
    <section className="page-shell dashboard-page">
      <GlobalSearch onNavigate={onNavigate} />

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
          <span className="summary-label">Açık görev</span>
          <strong>{summary.openTasks}</strong>
          <small>işlem bekliyor</small>
        </div>
      </header>

      <section className="dashboard-report-toolbar" aria-label="Rapor seçenekleri">
        <div>
          <label htmlFor="dashboard-period">Performans dönemi</label>
          <select
            id="dashboard-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            disabled={loading || exporting}
          >
            {PERIOD_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="dashboard-report-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadDashboard(period)}
            disabled={loading || exporting}
          >
            {loading ? "Yenileniyor..." : "Yenile"}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={exportReport}
            disabled={loading || exporting}
          >
            {exporting ? "Hazırlanıyor..." : "Görev raporunu indir"}
          </button>
        </div>
      </section>

      {error && (
        <section className="dashboard-state-card dashboard-state-error" role="alert">
          <p className="dashboard-state-title">İşlem tamamlanamadı</p>
          <p className="dashboard-state-text">{error}</p>
        </section>
      )}

      {loading && summary.generatedAt === null ? (
        <section className="dashboard-state-card" aria-live="polite">
          <p className="dashboard-state-title">Dashboard yükleniyor...</p>
          <p className="dashboard-state-text">Görev özetleri hazırlanıyor.</p>
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
              <span>Açık görevler</span>
              <strong>{summary.openTasks}</strong>
              <small>İşlem bekleyen kayıtlar</small>
            </div>

            <div className="stat-card metric-card soft-card">
              <span>Kapalı görevler</span>
              <strong>{summary.closedTasks}</strong>
              <small>Tamamlanan veya iptal edilen</small>
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

          <section className="dashboard-section">
            <div className="section-heading-row dashboard-heading-with-note">
              <div>
                <h3>Zaman ve iş yükü riski</h3>
                <p>Açık ve arşivlenmemiş görevlerin güncel görünümü</p>
              </div>
            </div>

            <div className="dashboard-risk-grid">
              <article className="dashboard-risk-card risk-danger">
                <span>Geciken</span>
                <strong>{summary.riskCounts.overdue}</strong>
                <small>Bitiş zamanı geçmiş açık görev</small>
              </article>
              <article className="dashboard-risk-card risk-warning">
                <span>7 gün içinde bitecek</span>
                <strong>{summary.riskCounts.dueSoon}</strong>
                <small>Yakından takip edilmesi gereken</small>
              </article>
              <article className="dashboard-risk-card risk-neutral">
                <span>Tarihi belirlenmemiş</span>
                <strong>{summary.riskCounts.withoutDueDate}</strong>
                <small>Bitiş tarihi olmayan açık görev</small>
              </article>
            </div>
          </section>

          <section className="dashboard-section">
            <div className="section-heading-row dashboard-heading-with-note">
              <div>
                <h3>Dönem performansı</h3>
                <p>{periodLabel} içinde oluşturulan görevler temel alınır</p>
              </div>
            </div>

            <div className="dashboard-performance-grid">
              <article className="dashboard-performance-card">
                <span>Oluşturulan</span>
                <strong>{summary.performance.createdTasks}</strong>
              </article>
              <article className="dashboard-performance-card">
                <span>Tamamlanan</span>
                <strong>{summary.performance.completedTasks}</strong>
              </article>
              <article className="dashboard-performance-card">
                <span>Tamamlanma oranı</span>
                <strong>%{summary.performance.completionRate}</strong>
              </article>
              <article className="dashboard-performance-card">
                <span>Ortalama tamamlanma</span>
                <strong>{summary.performance.averageCompletionHours} sa.</strong>
              </article>
            </div>
          </section>

          <div className="dashboard-report-grid">
            <section className="dashboard-section dashboard-report-card">
              <div className="section-heading-row">
                <h3>Öncelik dağılımı</h3>
              </div>
              <BreakdownBars
                items={priorityItems}
                emptyText="Öncelik dağılımı bulunamadı."
              />
            </section>

            <section className="dashboard-section dashboard-report-card">
              <div className="section-heading-row">
                <h3>Görev tipi dağılımı</h3>
              </div>
              <BreakdownBars
                items={summary.typeBreakdown}
                emptyText="Açık görev tipi verisi bulunamadı."
              />
            </section>
          </div>

          <section className="dashboard-section">
            <div className="section-heading-row dashboard-heading-with-note">
              <div>
                <h3>Atama yükü</h3>
                <p>Görevlerin grup, bireysel ve atamasız dağılımı</p>
              </div>
            </div>

            {summary.assignmentBreakdown.length === 0 ? (
              <div className="dashboard-inline-empty">Atama dağılımı bulunamadı.</div>
            ) : (
              <div className="dashboard-assignment-list">
                {summary.assignmentBreakdown.map((item) => (
                  <article
                    className="dashboard-assignment-item"
                    key={`${item.kind || "assignment"}-${item.id ?? item.name}`}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind === "group"
                          ? "Grup ataması"
                          : item.kind === "user"
                            ? "Bireysel atama"
                            : "Henüz atanmamış"}
                      </small>
                    </div>
                    <div className="dashboard-assignment-counts">
                      <span>{toNumber(item.count)} açık</span>
                      <span className={toNumber(item.overdue) > 0 ? "has-overdue" : ""}>
                        {toNumber(item.overdue)} geciken
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading-row">
              <h3>Görev durumu</h3>
            </div>

            {statusItems.length === 0 ? (
              <div className="dashboard-inline-empty">Durum bazlı görev özeti bulunamadı.</div>
            ) : (
              <div className="status-summary-list">
                {statusItems.map(([status, count]) => (
                  <div key={status} className="status-summary-item">
                    <span className={statusBadgeClass(status)}>
                      {STATUS_LABELS[status] || status}
                    </span>
                    <strong>{toNumber(count)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="dashboard-section">
            <div className="section-heading-row dashboard-heading-with-note">
              <div>
                <h3>Öncelikli aktif görevler</h3>
                <p>Gecikenler ve son tarihi yaklaşanlar önce gösterilir</p>
              </div>
            </div>

            {summary.recentTasks.length === 0 ? (
              <div className="task-empty-state">Henüz gösterilecek açık görev yok.</div>
            ) : (
              <div className="recent-task-list">
                {summary.recentTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`task-card recent-task-card${task.overdue ? " recent-task-overdue" : ""}`}
                  >
                    <div className="recent-task-top">
                      <div className="recent-task-main">
                        <div className="recent-task-title-row">
                          <span className="task-number">Görev #{task.id}</span>
                          <div className="recent-task-badges">
                            {task.overdue && (
                              <span className="dashboard-overdue-badge">Gecikti</span>
                            )}
                            <span className={`priority-badge ${String(task.priority || "Orta").toLowerCase()}`}>
                              {PRIORITY_LABELS[task.priority] || task.priority || "-"}
                            </span>
                          </div>
                        </div>

                        <h4>{task.title}</h4>
                      </div>
                    </div>

                    <div className="recent-task-footer dashboard-task-footer">
                      <div>
                        <span className={statusBadgeClass(task.status)}>
                          {STATUS_LABELS[task.status] || task.status || "-"}
                        </span>
                        <span className="task-date">{formatDate(task.dueDate)}</span>
                      </div>
                      <button
                        type="button"
                        className="secondary-button dashboard-task-link"
                        onClick={() => onNavigate?.(`/tasks/${task.id}`)}
                      >
                        Görevi aç
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {summary.generatedAt && (
            <p className="dashboard-generated-at">
              Son güncelleme: {formatDate(summary.generatedAt, "-")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default DashboardPage;

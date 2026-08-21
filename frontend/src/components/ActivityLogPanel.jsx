import { useCallback, useEffect, useState } from "react";

import { readResponse } from "../api";

const ACTIVITY_LABELS = {
  GorevOlusturma: "Görev oluşturma",
  GorevAtama: "Görev atama",
  DurumDegisikligi: "Durum değişikliği",
  GorevArsivleme: "Görev arşivleme",
  GorevGeriYukleme: "Görev geri yükleme",
  GorevBilgileriDegisikligi: "Görev bilgileri değişikliği",
  BitisTarihiDegisikligi: "Bitiş tarihi değişikliği",
  KullaniciArsivleme: "Kullanıcı arşivleme",
  KullaniciGeriYukleme: "Kullanıcı geri yükleme",
  KullaniciGrupUyelikleriDegisikligi: "Kullanıcı üyelik değişikliği",
  GrupOlusturma: "Grup oluşturma",
  GrupGuncelleme: "Grup güncelleme",
  EkYukleme: "Ek yükleme",
  EkKaldirma: "Ek kaldırma",
  EkGeriYukleme: "Ek geri yükleme",
  YorumEkleme: "Yorum ekleme",
  YorumDuzenleme: "Yorum düzenleme",
  YorumArsivleme: "Yorum arşivleme",
  YorumGeriYukleme: "Yorum geri yükleme",
  EtiketOlusturma: "Etiket oluşturma",
  EtiketGuncelleme: "Etiket güncelleme",
  EtiketArsivleme: "Etiket arşivleme",
  EtiketGeriYukleme: "Etiket geri yükleme",
  GorevEtiketDegisikligi: "Görev etiketi değişikliği",
  AltGorevOlusturma: "Alt görev oluşturma",
  GorevTipiOlusturma: "Görev tipi oluşturma",
  GorevTipiGuncelleme: "Görev tipi güncelleme",
  GorevTipiArsivleme: "Görev tipi arşivleme",
  GorevTipiGeriYukleme: "Görev tipi geri yükleme",
};

const EMPTY_FILTERS = {
  actor: "",
  task: "",
  action: "",
  dateFrom: "",
  dateTo: "",
};

const EMPTY_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

const formatDate = (value) => {
  if (!value) {
    return "Belirtilmedi";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Belirtilmedi";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const localDateBoundary = (value, dayOffset = 0) => {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + dayOffset, 0, 0, 0, 0);

  return date.toISOString();
};

const buildActivityParams = (filters, page = null) => {
  const params = new URLSearchParams();

  if (filters.actor.trim()) {
    params.set("actor", filters.actor.trim());
  }

  if (filters.task.trim()) {
    params.set("task", filters.task.trim());
  }

  if (filters.action) {
    params.set("action", filters.action);
  }

  if (filters.dateFrom) {
    params.set("from", localDateBoundary(filters.dateFrom));
  }

  if (filters.dateTo) {
    params.set("to", localDateBoundary(filters.dateTo, 1));
  }

  if (page !== null) {
    params.set("page", String(page));
    params.set("limit", "20");
  }

  return params;
};

const downloadFilename = (response) => {
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);

  return match?.[1] || "lawdesk-denetim-izi.csv";
};

function ActivityLogPanel({ enabled, initialFilters }) {
  const startingFilters = { ...EMPTY_FILTERS, ...initialFilters };
  const [draftFilters, setDraftFilters] = useState(startingFilters);
  const [appliedFilters, setAppliedFilters] = useState(startingFilters);
  const [activity, setActivity] = useState([]);
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadActivity = useCallback(async (filters, page = 1) => {
    setLoading(true);
    setError("");

    try {
      const params = buildActivityParams(filters, page);
      const response = await fetch(`/api/tasks/activity?${params}`, {
        credentials: "include",
      });
      const data = await readResponse(response);

      setActivity(Array.isArray(data.activity) ? data.activity : []);
      setPagination({
        page: Number(data.pagination?.page) || page,
        limit: Number(data.pagination?.limit) || 20,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setActivity([]);
      setPagination({ ...EMPTY_PAGINATION });
      setError(
        requestError.message || "İşlem kayıtları yüklenemedi",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      loadActivity(startingFilters, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, loadActivity]);

  if (!enabled) {
    return null;
  }

  const updateDraft = (field, value) => {
    setDraftFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const applyFilters = async (event) => {
    event.preventDefault();

    if (
      draftFilters.dateFrom &&
      draftFilters.dateTo &&
      draftFilters.dateFrom > draftFilters.dateTo
    ) {
      setError("Bitiş tarihi başlangıç tarihinden önce olamaz");
      return;
    }

    const nextFilters = { ...draftFilters };
    setAppliedFilters(nextFilters);
    await loadActivity(nextFilters, 1);
  };

  const clearFilters = async () => {
    const emptyFilters = { ...EMPTY_FILTERS };
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    await loadActivity(emptyFilters, 1);
  };

  const exportCsv = async () => {
    setExporting(true);
    setError("");

    try {
      const params = buildActivityParams(appliedFilters);
      const query = params.toString();
      const response = await fetch(
        `/api/tasks/activity/export${query ? `?${query}` : ""}`,
        { credentials: "include" },
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "CSV dışa aktarılamadı");
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
      setError(requestError.message || "CSV dışa aktarılamadı");
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Object.values(appliedFilters).some(Boolean);

  return (
    <section
      className="activity-panel settings-activity-panel"
      aria-labelledby="activity-panel-title"
    >
      <div className="task-list-heading activity-panel-heading">
        <div>
          <p className="eyebrow">Denetim izi</p>
          <h3 id="activity-panel-title">İşlem kayıtları</h3>
          <p>
            Kullanıcı, görev, işlem türü ve tarih aralığına göre kayıtları
            inceleyebilirsiniz.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button refresh-button"
          onClick={() => loadActivity(appliedFilters, pagination.page)}
          disabled={loading || exporting}
        >
          Kayıtları yenile
        </button>
      </div>

      <form className="activity-filter-form" onSubmit={applyFilters}>
        <div className="activity-filter-grid">
          <label className="task-field">
            <span>Kullanıcı</span>
            <input
              type="search"
              value={draftFilters.actor}
              onChange={(event) => updateDraft("actor", event.target.value)}
              placeholder="Ad veya e-posta"
              maxLength={150}
            />
          </label>

          <label className="task-field">
            <span>Görev</span>
            <input
              type="search"
              value={draftFilters.task}
              onChange={(event) => updateDraft("task", event.target.value)}
              placeholder="Başlık veya görev no"
              maxLength={200}
            />
          </label>

          <label className="task-field">
            <span>İşlem türü</span>
            <select
              value={draftFilters.action}
              onChange={(event) => updateDraft("action", event.target.value)}
            >
              <option value="">Tümü</option>
              {Object.entries(ACTIVITY_LABELS)
                .sort(([, first], [, second]) =>
                  first.localeCompare(second, "tr"),
                )
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>

          <label className="task-field">
            <span>Başlangıç tarihi</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) => updateDraft("dateFrom", event.target.value)}
              max={draftFilters.dateTo || undefined}
            />
          </label>

          <label className="task-field">
            <span>Bitiş tarihi</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) => updateDraft("dateTo", event.target.value)}
              min={draftFilters.dateFrom || undefined}
            />
          </label>
        </div>

        <div className="activity-filter-actions">
          <button type="submit" disabled={loading || exporting}>
            Filtreleri uygula
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={clearFilters}
            disabled={loading || exporting}
          >
            Filtreleri temizle
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={exportCsv}
            disabled={loading || exporting || pagination.total === 0}
          >
            {exporting ? "CSV hazırlanıyor..." : "CSV olarak indir"}
          </button>
        </div>
      </form>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      <div className="activity-result-summary" aria-live="polite">
        <strong>{pagination.total}</strong> kayıt bulundu
        {hasFilters ? " (filtrelenmiş)" : ""}.
      </div>

      {loading ? (
        <p className="task-empty-state">İşlem kayıtları yükleniyor...</p>
      ) : activity.length === 0 ? (
        <p className="task-empty-state">
          {hasFilters
            ? "Filtrelere uygun işlem kaydı bulunamadı."
            : "Henüz işlem kaydı bulunmuyor."}
        </p>
      ) : (
        <>
          <ol className="activity-list">
            {activity.map((entry) => (
              <li key={entry.id}>
                <div className="activity-entry-heading">
                  <span>
                    {ACTIVITY_LABELS[entry.action] || entry.action}
                  </span>
                  <time dateTime={entry.createdAt}>
                    {formatDate(entry.createdAt)}
                  </time>
                </div>
                <p>{entry.detail}</p>
                <div className="activity-entry-meta">
                  <span>
                    Kullanıcı: {entry.actorName || "Sistem"}
                  </span>
                  {entry.taskId && (
                    <span>
                      Görev #{entry.taskId}
                      {entry.taskTitle ? ` — ${entry.taskTitle}` : ""}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="activity-pagination">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                loadActivity(appliedFilters, pagination.page - 1)
              }
              disabled={loading || pagination.page <= 1}
            >
              Önceki
            </button>
            <span>
              Sayfa {pagination.page} / {Math.max(pagination.totalPages, 1)}
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                loadActivity(appliedFilters, pagination.page + 1)
              }
              disabled={
                loading ||
                pagination.totalPages === 0 ||
                pagination.page >= pagination.totalPages
              }
            >
              Sonraki
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default ActivityLogPanel;

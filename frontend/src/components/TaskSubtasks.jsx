import { useEffect, useState } from "react";

import { readResponse } from "../api";

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

const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS);

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

const toDateTimeInputValue = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );

  return localTime.toISOString().slice(0, 16);
};

const createEmptyForm = (task) => ({
  title: "",
  description: "",
  typeId: "",
  priority: task?.priority || "Orta",
  dueDate: "",
});

const assignmentLabel = (task) => {
  if (task.assignedUserName) {
    return `Kullanıcı: ${task.assignedUserName}`;
  }

  if (task.assignedGroupName) {
    return `Grup: ${task.assignedGroupName}`;
  }

  return "Atamasız";
};

function TaskSubtasks({ task, types = [], onNavigate, onError, onSuccess }) {
  const [subtasks, setSubtasks] = useState([]);
  const [viewMode, setViewMode] = useState("active");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [canViewArchive, setCanViewArchive] = useState(false);
  const [maxSubtasks, setMaxSubtasks] = useState(50);
  const [form, setForm] = useState(() => createEmptyForm(task));

  const loadSubtasks = async (mode = viewMode) => {
    setLoading(true);

    try {
      const query = mode === "archived" ? "?archived=true" : "";
      const response = await fetch(`/api/tasks/${task.id}/subtasks${query}`, {
        credentials: "include",
      });
      const data = await readResponse(response);

      setSubtasks(Array.isArray(data.subtasks) ? data.subtasks : []);
      setCanCreate(data.canCreate === true);
      setCanViewArchive(data.canViewArchive === true);
      setMaxSubtasks(
        Number(data.limits?.maxSubtasksPerParent) || 50,
      );
    } catch (error) {
      onError?.(error.message || "Alt görevler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSubtasks([]);
    setViewMode("active");
    setCanCreate(false);
    setCanViewArchive(false);
    setForm(createEmptyForm(task));
    loadSubtasks("active");
  }, [task.id, task.status, task.archived]);

  const changeViewMode = async (mode) => {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setSubtasks([]);
    await loadSubtasks(mode);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const title = form.title.trim();

    if (!title) {
      onError?.("Alt görev başlığı zorunludur");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baslik: title,
          aciklama: form.description.trim(),
          tipId: form.typeId ? Number(form.typeId) : null,
          oncelik: form.priority,
          bitisTarihi: form.dueDate
            ? new Date(form.dueDate).toISOString()
            : null,
        }),
      });
      const data = await readResponse(response);

      setForm(createEmptyForm(task));
      setViewMode("active");
      await loadSubtasks("active");
      onSuccess?.(data.message || "Alt görev oluşturuldu");
    } catch (error) {
      onError?.(error.message || "Alt görev oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="task-subtasks" aria-labelledby="task-subtasks-title">
      <div className="task-subtasks-heading">
        <div>
          <p className="eyebrow">İş kırılımı</p>
          <h3 id="task-subtasks-title">Alt görevler</h3>
        </div>
        <span className="subtask-count">
          {viewMode === "active" ? `${subtasks.length}/${maxSubtasks}` : subtasks.length}
        </span>
      </div>

      <p className="subtask-guidance">
        Alt görevler ana görevin atamasını ve görünürlüğünü devralır. Ana görev
        kapatılmadan önce açık alt görevler tamamlanmalı veya iptal edilmelidir.
      </p>

      {canCreate && viewMode === "active" && (
        <form className="subtask-form" onSubmit={handleCreate}>
          <div className="subtask-form-grid">
            <label className="task-field task-field-wide">
              <span>Başlık</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={200}
                required
              />
            </label>

            <label className="task-field task-field-wide">
              <span>Açıklama</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={3}
                maxLength={5000}
              />
            </label>

            <label className="task-field">
              <span>Tip</span>
              <select
                value={form.typeId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    typeId: event.target.value,
                  }))
                }
              >
                <option value="">Ana görevden devral</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-field">
              <span>Öncelik</span>
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </label>

            <label className="task-field task-field-wide">
              <span>Bitiş tarihi</span>
              <input
                type="datetime-local"
                value={form.dueDate}
                min={toDateTimeInputValue(new Date())}
                max={toDateTimeInputValue(task.dueDate) || undefined}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: event.target.value,
                  }))
                }
              />
              {task.dueDate && (
                <small>
                  En geç ana görevin bitişi: {formatDate(task.dueDate)}
                </small>
              )}
            </label>
          </div>

          <div className="subtask-form-footer">
            <span>Atama: {assignmentLabel(task)}</span>
            <button type="submit" disabled={submitting}>
              {submitting ? "Oluşturuluyor..." : "Alt görev oluştur"}
            </button>
          </div>
        </form>
      )}

      {canViewArchive && (
        <div className="subtask-tabs" role="tablist" aria-label="Alt görev görünümü">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "active"}
            className={viewMode === "active" ? "active" : ""}
            onClick={() => changeViewMode("active")}
            disabled={loading}
          >
            Aktif
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "archived"}
            className={viewMode === "archived" ? "active" : ""}
            onClick={() => changeViewMode("archived")}
            disabled={loading}
          >
            Arşiv
          </button>
        </div>
      )}

      {loading ? (
        <p className="subtask-empty-state">Alt görevler yükleniyor...</p>
      ) : subtasks.length === 0 ? (
        <p className="subtask-empty-state">
          {viewMode === "archived"
            ? "Arşivlenmiş alt görev bulunmuyor."
            : "Henüz alt görev oluşturulmadı."}
        </p>
      ) : (
        <div className="subtask-list">
          {subtasks.map((subtask) => (
            <button
              key={subtask.id}
              type="button"
              className="subtask-card"
              onClick={() => onNavigate?.(`/tasks/${subtask.id}`)}
            >
              <div className="subtask-card-main">
                <span className="subtask-number">Alt görev #{subtask.id}</span>
                <strong>{subtask.title}</strong>
                {subtask.description && <p>{subtask.description}</p>}
              </div>
              <div className="subtask-card-meta">
                <span>{STATUS_LABELS[subtask.status] || subtask.status}</span>
                <span>{PRIORITY_LABELS[subtask.priority] || subtask.priority}</span>
                <span>{formatDate(subtask.dueDate)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default TaskSubtasks;

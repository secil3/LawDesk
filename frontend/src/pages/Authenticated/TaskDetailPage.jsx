import { useEffect, useState } from "react";

import { readResponse } from "../../api";
import TaskAttachments from "../../components/TaskAttachments";
import TaskComments from "../../components/TaskComments";
import TaskSubtasks from "../../components/TaskSubtasks";
import TaskTags from "../../components/TaskTags";

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

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);
const PRIORITY_OPTIONS = Object.keys(PRIORITY_LABELS);

const STATUS_CLASSNAMES = {
  "Yeni Atandi": "status-badge status-new",
  "Devam Ediyor": "status-badge status-progress",
  Beklemede: "status-badge status-pending",
  Tamamlandi: "status-badge status-done",
  "Iptal Edildi": "status-badge status-cancelled",
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

function TaskDetailPage({ taskId, onNavigate }) {
  const [task, setTask] = useState(null);
  const [options, setOptions] = useState({
    canAssign: false,
    canManageLifecycle: false,
    types: [],
    groups: [],
    users: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    typeId: "",
    priority: "Orta",
    dueDate: "",
  });
  const [statusDraft, setStatusDraft] = useState("");
  const [assignmentDraft, setAssignmentDraft] = useState("");
  const [dueDateDraft, setDueDateDraft] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let isMounted = true;

    const loadTaskDetails = async () => {
      setLoading(true);
      setError("");

      try {
        const [taskResponse, optionsResponse] = await Promise.all([
          fetch(`/api/tasks/${taskId}`, { credentials: "include" }),
          fetch("/api/tasks/options", { credentials: "include" }),
        ]);

        const taskData = await readResponse(taskResponse);
        const optionsData = await readResponse(optionsResponse);

        if (!isMounted) {
          return;
        }

        const loadedTask = taskData.task || null;
        const normalizedOptions = {
          canAssign: optionsData.canAssign === true,
          canManageLifecycle: optionsData.canManageLifecycle === true,
          types: Array.isArray(optionsData.types) ? optionsData.types : [],
          groups: Array.isArray(optionsData.groups) ? optionsData.groups : [],
          users: Array.isArray(optionsData.users) ? optionsData.users : [],
        };

        setTask(loadedTask);
        setOptions(normalizedOptions);
        setForm({
          title: loadedTask?.title || "",
          description: loadedTask?.description || "",
          typeId: loadedTask?.typeId ? String(loadedTask.typeId) : "",
          priority: loadedTask?.priority || "Orta",
          dueDate: toDateTimeInputValue(loadedTask?.dueDate),
        });
        setStatusDraft(loadedTask?.status || "");
        setAssignmentDraft(
          loadedTask?.assignedUserId
            ? `user:${loadedTask.assignedUserId}`
            : loadedTask?.assignedGroupId
              ? `group:${loadedTask.assignedGroupId}`
              : "",
        );
        setDueDateDraft(toDateTimeInputValue(loadedTask?.dueDate));

      } catch (requestError) {
        if (!isMounted) {
          return;
        }

        setError(
          requestError.message || "Görev bilgisi yüklenemedi",
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTaskDetails();

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  const saveBasicInfo = async (event) => {
    event.preventDefault();

    if (!task) {
      return;
    }

    const trimmedTitle = form.title.trim();

    if (!trimmedTitle) {
      setError("Görev başlığı zorunludur");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baslik: trimmedTitle,
          aciklama: form.description.trim(),
          tipId: form.typeId ? Number(form.typeId) : null,
          oncelik: form.priority,
          bitisTarihi: form.dueDate
            ? new Date(form.dueDate).toISOString()
            : null,
        }),
      });

      const data = await readResponse(response);
      setTask(data.task || task);
      setForm({
        title: data.task?.title || trimmedTitle,
        description: data.task?.description || form.description.trim(),
        typeId: data.task?.typeId ? String(data.task.typeId) : "",
        priority: data.task?.priority || form.priority,
        dueDate: toDateTimeInputValue(data.task?.dueDate),
      });
      showToast(data.message || "Görev bilgileri güncellendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Görev bilgileri güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignment = async () => {
    if (!task) {
      return;
    }

    const selectedValue = assignmentDraft || "";
    const [targetType, rawTargetId] = selectedValue.split(":");
    const targetId = Number(rawTargetId);

    if (
      !["user", "group"].includes(targetType) ||
      !Number.isInteger(targetId) ||
      targetId < 1
    ) {
      setError("Atama için bir kullanıcı veya grup seçiniz");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}/assignment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          atananKullaniciId:
            targetType === "user" ? targetId : null,
          atananGrupId:
            targetType === "group" ? targetId : null,
        }),
      });

      const data = await readResponse(response);
      setTask((current) => ({
        ...current,
        assignedUserId: targetType === "user" ? targetId : null,
        assignedUserName:
          targetType === "user"
            ? options.users.find(
                (user) => Number(user.id) === targetId,
              )?.name || null
            : null,
        assignedGroupId: targetType === "group" ? targetId : null,
        assignedGroupName:
          targetType === "group"
            ? options.groups.find(
                (group) => Number(group.id) === targetId,
              )?.name || null
            : null,
      }));
      showToast(data.message || "Görev ataması güncellendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Görev ataması güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async () => {
    if (!task || !statusDraft) {
      return;
    }

    if (statusDraft === task.status) {
      setError("Durumu değiştirmek için farklı bir seçim yapınız");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ durum: statusDraft }),
      });

      const data = await readResponse(response);
      setTask((current) => ({
        ...current,
        status: statusDraft,
      }));
      showToast(data.message || "Görev durumu güncellendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Görev durumu güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleDueDateUpdate = async () => {
    if (!task) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}/due-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bitisTarihi: dueDateDraft ? new Date(dueDateDraft).toISOString() : null,
        }),
      });

      const data = await readResponse(response);
      setTask((current) => ({
        ...current,
        dueDate: dueDateDraft ? new Date(dueDateDraft).toISOString() : null,
      }));
      setForm((current) => ({
        ...current,
        dueDate: dueDateDraft,
      }));
      showToast(data.message || "Bitiş tarihi güncellendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Bitiş tarihi güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!task) {
      return;
    }

    const confirmed = window.confirm(`"${task.title}" görevini arşivlemek istediğinizden emin misiniz?`);

    if (!confirmed) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await readResponse(response);
      setTask((current) => ({
        ...current,
        archived: true,
      }));
      showToast(data.message || "Görev arşivlendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Görev arşivlenemedi");
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!task) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/tasks/${task.id}/restore`, {
        method: "PATCH",
        credentials: "include",
      });

      const data = await readResponse(response);
      setTask((current) => ({
        ...current,
        archived: false,
      }));
      showToast(data.message || "Görev geri yüklendi", "success");
    } catch (requestError) {
      setError(requestError.message || "Görev geri yüklenemedi");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="page-shell">
        <p className="task-empty-state">Görev yükleniyor...</p>
      </section>
    );
  }

  if (error && !task) {
    return (
      <section className="page-shell">
        <div className="confirm-card">
          <p className="eyebrow">Görev</p>
          <h3>Görev bilgisi getirilemedi</h3>
          <p>{error}</p>
          <div className="confirm-actions">
            <button type="button" className="secondary-button" onClick={() => onNavigate && onNavigate("/tasks")}>
              Görev listesine dön
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!task) {
    return (
      <section className="page-shell">
        <div className="confirm-card">
          <p className="eyebrow">Görev</p>
          <h3>Görev bulunamadı</h3>
          <div className="confirm-actions">
            <button type="button" className="secondary-button" onClick={() => onNavigate && onNavigate("/tasks")}>
              Görev listesine dön
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-shell task-detail-page">
      <div className="task-detail-header">
        <div>
          <p className="eyebrow">
            {task.parentTaskId ? "Alt görev detay" : "Görev detay"}
          </p>
          <h2>
            #{task.id} {task.title}
          </h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onNavigate && onNavigate("/tasks")}
        >
          Geri dön
        </button>
      </div>

      {task.parentTaskId && (
        <button
          type="button"
          className="task-parent-link"
          onClick={() => onNavigate?.(`/tasks/${task.parentTaskId}`)}
        >
          <span>Bağlı olduğu ana görev</span>
          <strong>
            #{task.parentTaskId} {task.parentTaskTitle || "Ana görev"}
          </strong>
          <span aria-hidden="true">Ana göreve git →</span>
        </button>
      )}

      <div className="task-detail-card">
        <div className="task-detail-topbar">
          <div className="task-detail-badges">
            <span className={STATUS_CLASSNAMES[task.status] || "status-badge status-default"}>
              {STATUS_LABELS[task.status] || task.status}
            </span>
            <span className={`priority-badge priority-${String(task.priority || "Orta").toLowerCase()}`}>
              {PRIORITY_LABELS[task.priority] || task.priority}
            </span>
            {task.archived && <span className="archive-chip">Arşivlendi</span>}
          </div>

          <div className="task-detail-actions-inline">
            {task.canManageLifecycle && !task.archived && (
              <button type="button" className="danger-button" onClick={handleArchive} disabled={saving}>
                Arşivle
              </button>
            )}

            {task.canRestore && (
              <button type="button" className="secondary-button" onClick={handleRestore} disabled={saving}>
                Geri yükle
              </button>
            )}
          </div>
        </div>

        <dl className="task-meta task-detail-meta">
          <div>
            <dt>Tip</dt>
            <dd>{task.typeName || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>{task.parentTaskId ? "Görev sahibi" : "Oluşturan"}</dt>
            <dd>{task.creatorName || "Belirtilmedi"}</dd>
          </div>
          <div>
            <dt>Atama</dt>
            <dd>
              {task.assignedUserName
                ? `Kullanıcı: ${task.assignedUserName}`
                : task.assignedGroupName
                  ? `Grup: ${task.assignedGroupName}`
                  : "Henüz atanmadı"}
            </dd>
          </div>
          <div>
            <dt>Bitiş tarihi</dt>
            <dd>{formatDate(task.dueDate)}</dd>
          </div>
          <div>
            <dt>Oluşturulma</dt>
            <dd>{formatDate(task.createdAt)}</dd>
          </div>
        </dl>

        {task.description && (
          <div className="task-detail-description">
            <h3>Açıklama</h3>
            <p>{task.description}</p>
          </div>
        )}

        {!task.parentTaskId && (
          <TaskSubtasks
            task={task}
            types={options.types}
            onNavigate={onNavigate}
            onError={(message) => setError(message)}
            onSuccess={(message) => {
              setError("");
              showToast(message, "success");
            }}
          />
        )}

        <TaskTags
          task={task}
          onError={(message) => setError(message)}
          onSuccess={(message) => {
            setError("");
            showToast(message, "success");
          }}
        />

        <TaskAttachments
          task={task}
          onError={(message) => setError(message)}
          onSuccess={(message) => showToast(message, "success")}
        />

        <TaskComments
          task={task}
          onError={(message) => setError(message)}
          onSuccess={(message) => {
            setError("");
            showToast(message, "success");
          }}
        />
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="task-detail-stack">
        {task.canEditTask && (
          <form className="task-form detail-form" onSubmit={saveBasicInfo}>
            <h3>Görev bilgileri</h3>
            <div className="task-form-grid compact-task-form-grid">
              <label className="task-field task-field-wide">
                <span>Başlık</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  maxLength={200}
                  required
                />
              </label>

              <label className="task-field task-field-wide">
                <span>Açıklama</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={3}
                  maxLength={5000}
                />
              </label>

              <label className="task-field">
                <span>Tip</span>
                <select
                  value={form.typeId}
                  onChange={(event) => setForm((current) => ({ ...current, typeId: event.target.value }))}
                >
                  <option value="">Tip seçilmedi</option>
                  {options.types.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </label>

              <label className="task-field">
                <span>Öncelik</span>
                <select
                  value={form.priority}
                  onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>{PRIORITY_LABELS[priority] || priority}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="task-inline-actions">
              <button type="submit" disabled={saving}>
                {saving ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>
        )}

        {(task.canManageAssignment || task.canManageLifecycle || task.canEditDueDate) && (
          <section className="detail-panel task-operations-panel">
            <h3>Görev işlemleri</h3>

            <div className="task-operations-grid">
              {task.canManageAssignment && (
                <div className="task-operation-block">
                  <label>
                    <span>Atama</span>
                    <select
                      value={assignmentDraft}
                      onChange={(event) => setAssignmentDraft(event.target.value)}
                    >
                      <option value="">Kullanıcı veya grup seçiniz</option>
                      {options.users.map((user) => (
                        <option key={user.id} value={`user:${user.id}`}>
                          Kullanıcı: {user.name}
                        </option>
                      ))}
                      {options.groups.map((group) => (
                        <option key={`group-${group.id}`} value={`group:${group.id}`}>
                          Grup: {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="secondary-button" onClick={handleAssignment} disabled={saving}>
                    Güncelle
                  </button>
                </div>
              )}

              {task.canManageLifecycle && (
                <div className="task-operation-block">
                  <label>
                    <span>Durum</span>
                    <select
                      value={statusDraft}
                      onChange={(event) => setStatusDraft(event.target.value)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status] || status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="secondary-button" onClick={handleStatusChange} disabled={saving}>
                    Güncelle
                  </button>
                </div>
              )}

              {task.canEditDueDate && (
                <div className="task-operation-block">
                  <label>
                    <span>Bitiş tarihi</span>
                    <input
                      type="datetime-local"
                      value={dueDateDraft}
                      onChange={(event) => setDueDateDraft(event.target.value)}
                    />
                  </label>
                  <button type="button" className="secondary-button" onClick={handleDueDateUpdate} disabled={saving}>
                    Güncelle
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {toast && (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          <div className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        </div>
      )}
    </section>
  );
}

export default TaskDetailPage;

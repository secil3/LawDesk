import { useEffect, useState } from "react";

import { readResponse } from "../api";

const EMPTY_TASK_FORM = {
  baslik: "",
  aciklama: "",
  tipId: "",
  oncelik: "Orta",
  bitisTarihi: "",
  assignmentType: "none",
  assignmentId: "",
};

const STATUS_LABELS = {
  "Yeni Atandi": "Yeni Atandı",
  "Devam Ediyor": "Devam Ediyor",
  Beklemede: "Beklemede",
  Tamamlandi: "Tamamlandı",
  "Iptal Edildi": "İptal Edildi",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

const ACTIVITY_LABELS = {
  GorevOlusturma: "Görev oluşturma",
  GorevAtama: "Görev atama",
  DurumDegisikligi: "Durum değişikliği",
  GorevArsivleme: "Görev arşivleme",
  GorevGeriYukleme: "Görev geri yükleme",
  BitisTarihiDegisikligi: "Bitiş tarihi değişikliği",
  KullaniciArsivleme: "Kullanıcı arşivleme",
  KullaniciGeriYukleme: "Kullanıcı geri yükleme",
};

const PRIORITY_LABELS = {
  Kritik: "Kritik",
  Yuksek: "Yüksek",
  Orta: "Orta",
  Dusuk: "Düşük",
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

const minimumDueDate = () => {
  const nextMinute = new Date();
  nextMinute.setSeconds(0, 0);
  nextMinute.setMinutes(nextMinute.getMinutes() + 1);

  const localTime = new Date(
    nextMinute.getTime() - nextMinute.getTimezoneOffset() * 60_000,
  );

  return localTime.toISOString().slice(0, 16);
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

const assignmentLabel = (task) => {
  if (task.assignedUserName) {
    return `Kullanıcı: ${task.assignedUserName}`;
  }

  if (task.assignedGroupName) {
    return `Grup: ${task.assignedGroupName}`;
  }

  return "Henüz atanmadı";
};

function TaskPanel() {
  const [tasks, setTasks] = useState([]);
  const [options, setOptions] = useState({
    canAssign: false,
    canManageLifecycle: false,
    canViewActivity: false,
    types: [],
    groups: [],
    users: [],
  });
  const [activity, setActivity] = useState([]);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [statusDrafts, setStatusDrafts] = useState({});
  const [dueDateDrafts, setDueDateDrafts] = useState({});
  const [taskListMode, setTaskListMode] = useState("active");
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState(null);
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState(null);
  const [updatingDueDateTaskId, setUpdatingDueDateTaskId] = useState(null);
  const [archivingTaskId, setArchivingTaskId] = useState(null);
  const [restoringTaskId, setRestoringTaskId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadTasks = async (mode = taskListMode) => {
    const url =
      mode === "archived" ? "/api/tasks?archived=true" : "/api/tasks";
    const response = await fetch(url, {
      credentials: "include",
    });
    const data = await readResponse(response);
    setTasks(Array.isArray(data.tasks) ? data.tasks : []);
  };

  const loadOptions = async () => {
    const response = await fetch("/api/tasks/options", {
      credentials: "include",
    });
    const data = await readResponse(response);

    const normalizedOptions = {
      canAssign: data.canAssign === true,
      canManageLifecycle: data.canManageLifecycle === true,
      canViewActivity: data.canViewActivity === true,
      types: Array.isArray(data.types) ? data.types : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      users: Array.isArray(data.users) ? data.users : [],
    };

    setOptions(normalizedOptions);
    return normalizedOptions;
  };

  const loadActivity = async () => {
    setLoadingActivity(true);

    try {
      const response = await fetch("/api/tasks/activity?limit=50", {
        credentials: "include",
      });
      const data = await readResponse(response);
      setActivity(Array.isArray(data.activity) ? data.activity : []);
    } finally {
      setLoadingActivity(false);
    }
  };

  useEffect(() => {
    const loadTaskPanel = async () => {
      setLoading(true);
      setError("");

      try {
        const [, loadedOptions] = await Promise.all([
          loadTasks("active"),
          loadOptions(),
        ]);

        if (loadedOptions.canViewActivity) {
          await loadActivity();
        }
      } catch (requestError) {
        setError(
          requestError.message || "Görev bilgileri yüklenemedi",
        );
      } finally {
        setLoading(false);
      }
    };

    loadTaskPanel();
  }, []);

  const updateTaskForm = (field, value) => {
    setTaskForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "assignmentType"
        ? { assignmentId: "" }
        : {}),
    }));
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (
      taskForm.assignmentType !== "none" &&
      !taskForm.assignmentId
    ) {
      setError("Atama için bir kullanıcı veya grup seçiniz");
      return;
    }

    setCreating(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          baslik: taskForm.baslik.trim(),
          aciklama: taskForm.aciklama.trim(),
          tipId: taskForm.tipId
            ? Number(taskForm.tipId)
            : null,
          oncelik: taskForm.oncelik,
          bitisTarihi: taskForm.bitisTarihi
            ? new Date(taskForm.bitisTarihi).toISOString()
            : null,
          atananKullaniciId:
            taskForm.assignmentType === "user"
              ? Number(taskForm.assignmentId)
              : null,
          atananGrupId:
            taskForm.assignmentType === "group"
              ? Number(taskForm.assignmentId)
              : null,
        }),
      });

      const data = await readResponse(response);
      setMessage(data.message || "Görev oluşturuldu");
      setTaskForm(EMPTY_TASK_FORM);
      setTaskListMode("active");
      await loadTasks("active");

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(requestError.message || "Görev oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const handleAssignment = async (taskId) => {
    const selectedValue = assignmentDrafts[taskId] || "";
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

    setError("");
    setMessage("");
    setAssigningTaskId(taskId);

    try {
      const response = await fetch(
        `/api/tasks/${taskId}/assignment`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            atananKullaniciId:
              targetType === "user" ? targetId : null,
            atananGrupId:
              targetType === "group" ? targetId : null,
          }),
        },
      );

      const data = await readResponse(response);
      setMessage(data.message || "Görev ataması güncellendi");
      setAssignmentDrafts((current) => ({
        ...current,
        [taskId]: "",
      }));
      await loadTasks();

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(
        requestError.message || "Görev ataması güncellenemedi",
      );
    } finally {
      setAssigningTaskId(null);
    }
  };

  const handleStatusUpdate = async (task, overrideStatus = null) => {
    const nextStatus =
      overrideStatus || statusDrafts[task.id] || task.status;

    if (!STATUS_OPTIONS.includes(nextStatus)) {
      setError("Geçerli bir görev durumu seçiniz");
      return;
    }

    if (nextStatus === task.status) {
      setError("Durumu değiştirmek için farklı bir seçim yapınız");
      return;
    }

    setError("");
    setMessage("");
    setUpdatingStatusTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ durum: nextStatus }),
      });

      const data = await readResponse(response);
      setMessage(data.message || "Görev durumu güncellendi");
      setStatusDrafts((current) => ({
        ...current,
        [task.id]: "",
      }));
      await loadTasks();

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(
        requestError.message || "Görev durumu güncellenemedi",
      );
    } finally {
      setUpdatingStatusTaskId(null);
    }
  };

  const handleArchive = async (task) => {
    const confirmed = window.confirm(
      `"${task.title}" görevini arşivlemek istediğinizden emin misiniz?`,
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setMessage("");
    setArchivingTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await readResponse(response);
      setMessage(data.message || "Görev arşivlendi");
      setTaskListMode("archived");
      await loadTasks("archived");

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(requestError.message || "Görev arşivlenemedi");
    } finally {
      setArchivingTaskId(null);
    }
  };

  const handleDueDateUpdate = async (task) => {
    const draftValue = Object.prototype.hasOwnProperty.call(
      dueDateDrafts,
      task.id,
    )
      ? dueDateDrafts[task.id]
      : toDateTimeInputValue(task.dueDate);

    if (draftValue && new Date(draftValue).getTime() <= Date.now()) {
      setError("Bitiş tarihi geçmiş bir zaman olamaz");
      return;
    }

    setError("");
    setMessage("");
    setUpdatingDueDateTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/due-date`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          bitisTarihi: draftValue
            ? new Date(draftValue).toISOString()
            : null,
        }),
      });

      const data = await readResponse(response);
      setMessage(data.message || "Bitiş tarihi güncellendi");
      setDueDateDrafts((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      await loadTasks("active");

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(requestError.message || "Bitiş tarihi güncellenemedi");
    } finally {
      setUpdatingDueDateTaskId(null);
    }
  };

  const handleRestoreTask = async (task) => {
    setError("");
    setMessage("");
    setRestoringTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}/restore`, {
        method: "PATCH",
        credentials: "include",
      });

      const data = await readResponse(response);
      setMessage(data.message || "Görev geri yüklendi");
      await loadTasks("archived");

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(requestError.message || "Görev geri yüklenemedi");
    } finally {
      setRestoringTaskId(null);
    }
  };

  const changeTaskListMode = async (mode) => {
    if (mode === taskListMode) {
      return;
    }

    setTaskListMode(mode);
    setLoading(true);
    setError("");

    try {
      await loadTasks(mode);
    } catch (requestError) {
      setError(requestError.message || "Görev listesi yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="task-panel" aria-labelledby="task-panel-title">
      <div className="task-panel-heading">
        <div>
          <p className="eyebrow">Görev merkezi</p>
          <h2 id="task-panel-title">Görevler</h2>
        </div>
        <span className="task-count">
          {tasks.length} {taskListMode === "archived" ? "arşivlenmiş" : "aktif"} görev
        </span>
      </div>

      <form className="task-form" onSubmit={handleCreateTask}>
        <h3>Yeni görev oluştur</h3>
        <p className="form-hint">
          Her kullanıcı görev oluşturabilir. Atama alanları yalnızca grup
          yöneticisi, yönetici ve admin rollerinde açılır.
        </p>

        <div className="task-form-grid">
          <label className="task-field task-field-wide">
            <span>Başlık</span>
            <input
              value={taskForm.baslik}
              onChange={(event) =>
                updateTaskForm("baslik", event.target.value)
              }
              maxLength={200}
              required
            />
          </label>

          <label className="task-field task-field-wide">
            <span>Açıklama</span>
            <textarea
              value={taskForm.aciklama}
              onChange={(event) =>
                updateTaskForm("aciklama", event.target.value)
              }
              maxLength={5000}
              rows={4}
            />
          </label>

          <label className="task-field">
            <span>Görev tipi</span>
            <select
              value={taskForm.tipId}
              onChange={(event) =>
                updateTaskForm("tipId", event.target.value)
              }
            >
              <option value="">Tip seçilmedi</option>
              {options.types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>

          <label className="task-field">
            <span>Öncelik</span>
            <select
              value={taskForm.oncelik}
              onChange={(event) =>
                updateTaskForm("oncelik", event.target.value)
              }
            >
              <option value="Kritik">Kritik</option>
              <option value="Yuksek">Yüksek</option>
              <option value="Orta">Orta</option>
              <option value="Dusuk">Düşük</option>
            </select>
          </label>

          <label className="task-field">
            <span>Bitiş tarihi</span>
            <input
              type="datetime-local"
              min={minimumDueDate()}
              value={taskForm.bitisTarihi}
              onChange={(event) =>
                updateTaskForm("bitisTarihi", event.target.value)
              }
            />
          </label>

          {options.canAssign && (
            <>
              <label className="task-field">
                <span>Atama türü</span>
                <select
                  value={taskForm.assignmentType}
                  onChange={(event) =>
                    updateTaskForm(
                      "assignmentType",
                      event.target.value,
                    )
                  }
                >
                  <option value="none">Atamasız oluştur</option>
                  <option value="user">Kullanıcıya ata</option>
                  <option value="group">Gruba ata</option>
                </select>
              </label>

              {taskForm.assignmentType === "user" && (
                <label className="task-field">
                  <span>Atanacak kullanıcı</span>
                  <select
                    value={taskForm.assignmentId}
                    onChange={(event) =>
                      updateTaskForm(
                        "assignmentId",
                        event.target.value,
                      )
                    }
                    required
                  >
                    <option value="">Kullanıcı seçiniz</option>
                    {options.users.map((optionUser) => (
                      <option key={optionUser.id} value={optionUser.id}>
                        {optionUser.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {taskForm.assignmentType === "group" && (
                <label className="task-field">
                  <span>Atanacak grup</span>
                  <select
                    value={taskForm.assignmentId}
                    onChange={(event) =>
                      updateTaskForm(
                        "assignmentId",
                        event.target.value,
                      )
                    }
                    required
                  >
                    <option value="">Grup seçiniz</option>
                    {options.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>

        <button
          className="task-submit-button"
          type="submit"
          disabled={creating}
        >
          {creating ? "Görev oluşturuluyor..." : "Görev oluştur"}
        </button>
      </form>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}

      <div className="task-list-heading">
        <div>
          <h3>
            {taskListMode === "archived"
              ? "Arşivlenmiş görevler"
              : "Görebildiğiniz görevler"}
          </h3>
          {options.canManageLifecycle && (
            <div className="view-tabs" aria-label="Görev görünümü">
              <button
                type="button"
                className={taskListMode === "active" ? "active" : ""}
                onClick={() => changeTaskListMode("active")}
              >
                Aktif
              </button>
              <button
                type="button"
                className={taskListMode === "archived" ? "active" : ""}
                onClick={() => changeTaskListMode("archived")}
              >
                Arşiv
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="secondary-button refresh-button"
          onClick={async () => {
            setLoading(true);
            setError("");

            try {
              await loadTasks();
            } catch (requestError) {
              setError(
                requestError.message || "Görev listesi yenilenemedi",
              );
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          Yenile
        </button>
      </div>

      {loading ? (
        <p className="task-empty-state">Görevler yükleniyor...</p>
      ) : tasks.length === 0 ? (
        <p className="task-empty-state">
          {taskListMode === "archived"
            ? "Arşivlenmiş görev bulunmuyor."
            : "Henüz görünür bir görev yok."}
        </p>
      ) : (
        <div className="task-grid">
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <div className="task-card-header">
                <div>
                  <span className="task-number">Görev #{task.id}</span>
                  <h4>{task.title}</h4>
                </div>
                <span
                  className={`priority-badge priority-${String(
                    task.priority || "Orta",
                  ).toLowerCase()}`}
                >
                  {PRIORITY_LABELS[task.priority] || task.priority}
                </span>
              </div>

              {task.description && (
                <p className="task-description">{task.description}</p>
              )}

              <dl className="task-meta">
                <div>
                  <dt>Durum</dt>
                  <dd>{STATUS_LABELS[task.status] || task.status}</dd>
                </div>
                <div>
                  <dt>Tip</dt>
                  <dd>{task.typeName || "Belirtilmedi"}</dd>
                </div>
                <div>
                  <dt>Oluşturan</dt>
                  <dd>{task.creatorName}</dd>
                </div>
                <div>
                  <dt>Atama</dt>
                  <dd>{assignmentLabel(task)}</dd>
                </div>
                <div>
                  <dt>Bitiş</dt>
                  <dd>{formatDate(task.dueDate)}</dd>
                </div>
                <div>
                  <dt>Oluşturulma</dt>
                  <dd>{formatDate(task.createdAt)}</dd>
                </div>
                {task.archived && (
                  <div>
                    <dt>Arşivlenme</dt>
                    <dd>{formatDate(task.archivedAt)}</dd>
                  </div>
                )}
              </dl>

              {task.canEditDueDate && !task.archived && (
                <div className="task-due-date-editor">
                  <label htmlFor={`task-due-date-${task.id}`}>
                    Bitiş tarihini düzenle
                  </label>
                  <div className="due-date-controls">
                    <input
                      id={`task-due-date-${task.id}`}
                      type="datetime-local"
                      min={minimumDueDate()}
                      value={
                        Object.prototype.hasOwnProperty.call(
                          dueDateDrafts,
                          task.id,
                        )
                          ? dueDateDrafts[task.id]
                          : toDateTimeInputValue(task.dueDate)
                      }
                      onChange={(event) =>
                        setDueDateDrafts((current) => ({
                          ...current,
                          [task.id]: event.target.value,
                        }))
                      }
                      disabled={updatingDueDateTaskId === task.id}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => handleDueDateUpdate(task)}
                      disabled={updatingDueDateTaskId === task.id}
                    >
                      {updatingDueDateTaskId === task.id
                        ? "Kaydediliyor..."
                        : "Tarihi kaydet"}
                    </button>
                  </div>
                  <p className="editor-hint">
                    Tarihi tamamen kaldırmak için alanı boşaltıp kaydedin.
                  </p>
                </div>
              )}

              {task.canManageAssignment && options.canAssign && !task.archived && (
                <div className="task-assignment-editor">
                  <label htmlFor={`task-assignment-${task.id}`}>
                    Atamayı değiştir
                  </label>
                  <div className="assignment-controls">
                    <select
                      id={`task-assignment-${task.id}`}
                      value={assignmentDrafts[task.id] || ""}
                      onChange={(event) =>
                        setAssignmentDrafts((current) => ({
                          ...current,
                          [task.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Kullanıcı veya grup seçiniz</option>
                      {options.groups.length > 0 && (
                        <optgroup label="Gruplar">
                          {options.groups.map((group) => (
                            <option
                              key={`group-${group.id}`}
                              value={`group:${group.id}`}
                            >
                              {group.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {options.users.length > 0 && (
                        <optgroup label="Kullanıcılar">
                          {options.users.map((optionUser) => (
                            <option
                              key={`user-${optionUser.id}`}
                              value={`user:${optionUser.id}`}
                            >
                              {optionUser.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleAssignment(task.id)}
                      disabled={assigningTaskId === task.id}
                    >
                      {assigningTaskId === task.id
                        ? "Atanıyor..."
                        : "Ata"}
                    </button>
                  </div>
                </div>
              )}

              {task.canManageLifecycle &&
                options.canManageLifecycle && (
                  <div className="task-lifecycle-editor">
                    <label htmlFor={`task-status-${task.id}`}>
                      Durum bilgisi
                    </label>
                    <select
                      id={`task-status-${task.id}`}
                      value={statusDrafts[task.id] || task.status}
                      onChange={(event) =>
                        setStatusDrafts((current) => ({
                          ...current,
                          [task.id]: event.target.value,
                        }))
                      }
                      disabled={
                        updatingStatusTaskId === task.id ||
                        archivingTaskId === task.id
                      }
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>

                    <div className="task-action-buttons">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleStatusUpdate(task)}
                        disabled={
                          updatingStatusTaskId === task.id ||
                          archivingTaskId === task.id ||
                          (statusDrafts[task.id] || task.status) ===
                            task.status
                        }
                      >
                        {updatingStatusTaskId === task.id
                          ? "Güncelleniyor..."
                          : "Durumu güncelle"}
                      </button>

                      <button
                        type="button"
                        className="lifecycle-button"
                        onClick={() =>
                          handleStatusUpdate(
                            task,
                            ["Tamamlandi", "Iptal Edildi"].includes(
                              task.status,
                            )
                              ? "Devam Ediyor"
                              : "Tamamlandi",
                          )
                        }
                        disabled={
                          updatingStatusTaskId === task.id ||
                          archivingTaskId === task.id
                        }
                      >
                        {["Tamamlandi", "Iptal Edildi"].includes(
                          task.status,
                        )
                          ? "Yeniden aç"
                          : "Kapat"}
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => handleArchive(task)}
                        disabled={
                          archivingTaskId === task.id ||
                          updatingStatusTaskId === task.id
                        }
                      >
                        {archivingTaskId === task.id
                          ? "Arşivleniyor..."
                          : "Arşivle"}
                      </button>
                    </div>
                  </div>
                )}

              {task.canRestore && task.archived && (
                <div className="task-restore-editor">
                  <p>
                    Bu görev arşivde. Geri yüklendiğinde mevcut durumu ve
                    ataması korunur.
                  </p>
                  <button
                    type="button"
                    className="restore-button"
                    onClick={() => handleRestoreTask(task)}
                    disabled={restoringTaskId === task.id}
                  >
                    {restoringTaskId === task.id
                      ? "Geri yükleniyor..."
                      : "Görevi geri yükle"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {options.canViewActivity && (
        <section
          className="activity-panel"
          aria-labelledby="activity-panel-title"
        >
          <div className="task-list-heading">
            <div>
              <p className="eyebrow">Denetim izi</p>
              <h3 id="activity-panel-title">Son işlem kayıtları</h3>
            </div>
            <button
              type="button"
              className="secondary-button refresh-button"
              onClick={async () => {
                setError("");

                try {
                  await loadActivity();
                } catch (requestError) {
                  setError(
                    requestError.message ||
                      "İşlem kayıtları yenilenemedi",
                  );
                }
              }}
              disabled={loadingActivity}
            >
              Kayıtları yenile
            </button>
          </div>

          {loadingActivity ? (
            <p className="task-empty-state">
              İşlem kayıtları yükleniyor...
            </p>
          ) : activity.length === 0 ? (
            <p className="task-empty-state">
              Henüz işlem kaydı bulunmuyor.
            </p>
          ) : (
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
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </section>
  );
}

export default TaskPanel;

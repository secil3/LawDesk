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
  GorevBilgileriDegisikligi: "Görev bilgileri değişikliği",
  BitisTarihiDegisikligi: "Bitiş tarihi değişikliği",
  KullaniciArsivleme: "Kullanıcı arşivleme",
  KullaniciGeriYukleme: "Kullanıcı geri yükleme",
  KullaniciGrupUyelikleriDegisikligi: "Kullanıcı üyelik değişikliği",
  GrupOlusturma: "Grup oluşturma",
  GrupGuncelleme: "Grup güncelleme",
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

function TaskPanel({ refreshKey = 0 }) {
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
  const [taskEditor, setTaskEditor] = useState(null);
  const [taskListMode, setTaskListMode] = useState("active");
  const [searchInput, setSearchInput] = useState("");
  const [queryState, setQueryState] = useState({
    search: "",
    status: "",
    priority: "",
    taskType: "",
    sortBy: "due_date",
    sortOrder: "asc",
    page: 1,
    limit: 10,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigningTaskId, setAssigningTaskId] = useState(null);
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState(null);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [archivingTaskId, setArchivingTaskId] = useState(null);
  const [restoringTaskId, setRestoringTaskId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const buildTaskQueryString = (
    mode = taskListMode,
    state = queryState,
  ) => {
    const params = new URLSearchParams();

    if (mode === "archived") {
      params.set("archived", "true");
    }

    if (state.search && state.search.trim()) {
      params.set("search", state.search.trim());
    }

    if (state.status) {
      params.set("status", state.status);
    }

    if (state.priority) {
      params.set("priority", state.priority);
    }

    if (state.taskType) {
      params.set("taskType", state.taskType);
    }

    if (state.sortBy) {
      params.set("sortBy", state.sortBy);
    }

    if (state.sortOrder) {
      params.set("sortOrder", state.sortOrder);
    }

    params.set("page", String(state.page || 1));
    params.set("limit", String(state.limit || 10));

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };

  const loadTasks = async (
    mode = taskListMode,
    state = queryState,
  ) => {
    const response = await fetch(
      `/api/tasks${buildTaskQueryString(mode, state)}`,
      {
        credentials: "include",
      },
    );
    const data = await readResponse(response);
    const nextTasks = Array.isArray(data.tasks) ? data.tasks : [];
    const nextPagination = data.pagination || {
      page: Number(state.page || 1),
      limit: Number(state.limit || 10),
      total: nextTasks.length,
      totalPages: 1,
    };

    setTasks(nextTasks);
    setPagination({
      page: Number(nextPagination.page || state.page || 1),
      limit: Number(nextPagination.limit || state.limit || 10),
      total: Number(nextPagination.total || nextTasks.length || 0),
      totalPages: Number(
        nextPagination.totalPages ||
          Math.max(1, Math.ceil((nextPagination.total || nextTasks.length || 0) / (nextPagination.limit || state.limit || 10))),
      ),
    });
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
    setSearchInput(queryState.search);
  }, [queryState.search]);

  useEffect(() => {
    const loadTaskPanel = async () => {
      setLoading(true);
      setError("");

      try {
        const loadedOptions = await loadOptions();
        await loadTasks(taskListMode, queryState);

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
  }, [
    taskListMode,
    queryState.search,
    queryState.status,
    queryState.priority,
    queryState.taskType,
    queryState.sortBy,
    queryState.sortOrder,
    queryState.page,
    queryState.limit,
  ]);

  useEffect(() => {
    if (refreshKey === 0) {
      return;
    }

    const refreshTaskPanel = async () => {
      setLoading(true);
      setError("");

      try {
        const loadedOptions = await loadOptions();
        await loadTasks(taskListMode, queryState);

        if (loadedOptions.canViewActivity) {
          await loadActivity();
        }
      } catch (requestError) {
        setError(
          requestError.message || "Görev bilgileri yenilenemedi",
        );
      } finally {
        setLoading(false);
      }
    };

    refreshTaskPanel();
  }, [refreshKey]);

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

  const openTaskEditor = (task) => {
    setError("");
    setTaskEditor({
      task,
      form: {
        baslik: task.title || "",
        aciklama: task.description || "",
        tipId: task.typeId ? String(task.typeId) : "",
        oncelik: task.priority || "Orta",
        bitisTarihi: toDateTimeInputValue(task.dueDate),
      },
    });
  };

  const closeTaskEditor = () => {
    if (savingTaskId) {
      return;
    }

    setTaskEditor(null);
    setError("");
  };

  const updateTaskEditorForm = (field, value) => {
    setTaskEditor((current) =>
      current
        ? {
            ...current,
            form: {
              ...current.form,
              [field]: value,
            },
          }
        : current,
    );
  };

  const handleTaskUpdate = async (event) => {
    event.preventDefault();

    if (!taskEditor?.task) {
      return;
    }

    const { task, form } = taskEditor;
    const originalDueDate = toDateTimeInputValue(task.dueDate);

    if (
      form.bitisTarihi &&
      form.bitisTarihi !== originalDueDate &&
      new Date(form.bitisTarihi).getTime() <= Date.now()
    ) {
      setError("Bitiş tarihi geçmiş bir zaman olamaz");
      return;
    }

    setError("");
    setMessage("");
    setSavingTaskId(task.id);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          baslik: form.baslik.trim(),
          aciklama: form.aciklama.trim(),
          tipId: form.tipId ? Number(form.tipId) : null,
          oncelik: form.oncelik,
          bitisTarihi: form.bitisTarihi
            ? new Date(form.bitisTarihi).toISOString()
            : null,
        }),
      });

      const data = await readResponse(response);
      setMessage(data.message || "Görev bilgileri güncellendi");
      setTaskEditor(null);
      await loadTasks("active");

      if (options.canViewActivity) {
        await loadActivity();
      }
    } catch (requestError) {
      setError(requestError.message || "Görev bilgileri güncellenemedi");
    } finally {
      setSavingTaskId(null);
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
    setQueryState((current) => ({
      ...current,
      page: 1,
    }));
    setLoading(true);
    setError("");
  };

  const updateQueryState = (field, value) => {
    setQueryState((current) => ({
      ...current,
      [field]: value,
      ...(field === "search" || field === "status" || field === "priority" || field === "taskType" || field === "sortBy" || field === "sortOrder"
        ? { page: 1 }
        : {}),
    }));
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();

    const trimmedSearch = searchInput.trim();
    setQueryState((current) => ({
      ...current,
      search: trimmedSearch,
      page: 1,
    }));
  };

  const getVisiblePageNumbers = (currentPage, totalPages) => {
    if (totalPages <= 1) {
      return [1];
    }

    const pages = new Set([1, totalPages, currentPage]);
    const window = [currentPage - 1, currentPage, currentPage + 1];

    window.forEach((page) => {
      if (page > 1 && page < totalPages) {
        pages.add(page);
      }
    });

    const sortedPages = [...pages].sort((a, b) => a - b);
    const visiblePages = [];

    sortedPages.forEach((page, index) => {
      if (index > 0 && page - sortedPages[index - 1] > 1) {
        visiblePages.push("...");
      }

      visiblePages.push(page);
    });

    return visiblePages;
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
              await loadTasks(taskListMode, queryState);
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

      <form className="task-toolbar" onSubmit={handleSearchSubmit}>
        <label className="task-field task-field-wide">
          <span>Arama</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Görevlerde ara..."
          />
        </label>

        <label className="task-field">
          <span>Durum</span>
          <select
            value={queryState.status}
            onChange={(event) =>
              updateQueryState("status", event.target.value)
            }
          >
            <option value="">Tümü</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status] || status}
              </option>
            ))}
          </select>
        </label>

        <label className="task-field">
          <span>Öncelik</span>
          <select
            value={queryState.priority}
            onChange={(event) =>
              updateQueryState("priority", event.target.value)
            }
          >
            <option value="">Tümü</option>
            <option value="Kritik">Kritik</option>
            <option value="Yuksek">Yüksek</option>
            <option value="Orta">Orta</option>
            <option value="Dusuk">Düşük</option>
          </select>
        </label>

        <label className="task-field">
          <span>Görev tipi</span>
          <select
            value={queryState.taskType}
            onChange={(event) =>
              updateQueryState("taskType", event.target.value)
            }
          >
            <option value="">Tümü</option>
            {options.types.map((type) => (
              <option key={type.id} value={type.name}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <label className="task-field">
          <span>Sırala</span>
          <select
            value={queryState.sortBy}
            onChange={(event) =>
              updateQueryState("sortBy", event.target.value)
            }
          >
            <option value="due_date">Son tarih</option>
            <option value="priority">Öncelik</option>
            <option value="created_at">Oluşturulma</option>
            <option value="title">Başlık</option>
          </select>
        </label>

        <label className="task-field">
          <span>Yön</span>
          <select
            value={queryState.sortOrder}
            onChange={(event) =>
              updateQueryState("sortOrder", event.target.value)
            }
          >
            <option value="asc">Artan</option>
            <option value="desc">Azalan</option>
          </select>
        </label>
      </form>

      {pagination.totalPages > 1 && (
        <div className="task-pagination" aria-label="Görev sayfalama">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setQueryState((current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }))
            }
            disabled={queryState.page <= 1 || loading}
          >
            Önceki
          </button>

          {getVisiblePageNumbers(
            queryState.page,
            pagination.totalPages,
          ).map((page, index) => {
            if (page === "...") {
              return (
                <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                  ...
                </span>
              );
            }

            const pageNumber = Number(page);

            return (
              <button
                key={`page-${pageNumber}`}
                type="button"
                className={
                  pageNumber === queryState.page
                    ? "pagination-page active"
                    : "pagination-page"
                }
                onClick={() =>
                  setQueryState((current) => ({
                    ...current,
                    page: pageNumber,
                  }))
                }
                disabled={loading || pageNumber === queryState.page}
              >
                {pageNumber}
              </button>
            );
          })}

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setQueryState((current) => ({
                ...current,
                page: Math.min(
                  pagination.totalPages,
                  current.page + 1,
                ),
              }))
            }
            disabled={
              queryState.page >= pagination.totalPages || loading
            }
          >
            Sonraki
          </button>
        </div>
      )}

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

              {task.canEditTask && !task.archived && (
                <button
                  type="button"
                  className="secondary-button task-edit-button"
                  onClick={() => openTaskEditor(task)}
                >
                  Görev bilgilerini düzenle
                </button>
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

      {taskEditor && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-edit-dialog-title"
        >
          <form
            className="confirm-card task-edit-card"
            onSubmit={handleTaskUpdate}
            noValidate
          >
            <p className="eyebrow">Görev düzenleme</p>
            <h3 id="task-edit-dialog-title">
              Görev #{taskEditor.task.id}
            </h3>

            <div className="task-edit-grid">
              <label className="task-field task-field-wide">
                <span>Başlık</span>
                <input
                  value={taskEditor.form.baslik}
                  onChange={(event) =>
                    updateTaskEditorForm("baslik", event.target.value)
                  }
                  maxLength={200}
                  required
                />
              </label>

              <label className="task-field task-field-wide">
                <span>Açıklama</span>
                <textarea
                  value={taskEditor.form.aciklama}
                  onChange={(event) =>
                    updateTaskEditorForm("aciklama", event.target.value)
                  }
                  maxLength={5000}
                  rows={4}
                />
              </label>

              <label className="task-field">
                <span>Görev tipi</span>
                <select
                  value={taskEditor.form.tipId}
                  onChange={(event) =>
                    updateTaskEditorForm("tipId", event.target.value)
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
                  value={taskEditor.form.oncelik}
                  onChange={(event) =>
                    updateTaskEditorForm("oncelik", event.target.value)
                  }
                >
                  <option value="Kritik">Kritik</option>
                  <option value="Yuksek">Yüksek</option>
                  <option value="Orta">Orta</option>
                  <option value="Dusuk">Düşük</option>
                </select>
              </label>

              <label className="task-field task-field-wide">
                <span>Bitiş tarihi</span>
                <input
                  type="datetime-local"
                  min={minimumDueDate()}
                  value={taskEditor.form.bitisTarihi}
                  onChange={(event) =>
                    updateTaskEditorForm(
                      "bitisTarihi",
                      event.target.value,
                    )
                  }
                />
              </label>
            </div>

            <p className="editor-hint">
              Bitiş tarihini kaldırmak için tarih alanını boş bırakın.
            </p>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <div className="confirm-actions">
              <button
                type="submit"
                disabled={savingTaskId === taskEditor.task.id}
              >
                {savingTaskId === taskEditor.task.id
                  ? "Kaydediliyor..."
                  : "Değişiklikleri kaydet"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={closeTaskEditor}
                disabled={savingTaskId === taskEditor.task.id}
              >
                Vazgeç
              </button>
            </div>
          </form>
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

import { useEffect, useRef, useState } from "react";

import { readResponse } from "../api";
import PaginationControls from "./PaginationControls";
import TableSearch from "./TableSearch";
import TaskAttachments from "./TaskAttachments";

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
const TERMINAL_ARCHIVE_LABELS = {
  Tamamlandi: "Tamamlandı",
  "Iptal Edildi": "İptal edildi",
};

const PRIORITY_LABELS = {
  Kritik: "Kritik",
  Yuksek: "Yüksek",
  Orta: "Orta",
  Dusuk: "Düşük",
};

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

function TaskPanel({ refreshKey = 0, onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [options, setOptions] = useState({
    canAssign: false,
    canManageLifecycle: false,
    canViewActivity: false,
    types: [],
    tags: [],
    groups: [],
    users: [],
  });
  const [taskForm, setTaskForm] = useState(EMPTY_TASK_FORM);
  const [statusDrafts, setStatusDrafts] = useState({});
  const [taskEditor, setTaskEditor] = useState(null);
  const [taskListMode, setTaskListMode] = useState("active");
  const [searchInput, setSearchInput] = useState("");
  const [queryState, setQueryState] = useState({
    search: "",
    status: "",
    priority: "",
    taskType: "",
    tagId: "",
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
  const searchTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [updatingStatusTaskId, setUpdatingStatusTaskId] = useState(null);
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [restoringTaskId, setRestoringTaskId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedTaskType = options.types.find(
    (type) => Number(type.id) === Number(taskForm.tipId),
  );
  const selectedTaskTypeGroupId = Number(selectedTaskType?.groupId) || null;
  const assignableUsersForType = options.users.filter((user) =>
    Array.isArray(user.groupIds) &&
    user.groupIds.some(
      (groupId) => Number(groupId) === selectedTaskTypeGroupId,
    ),
  );

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

    if (state.tagId) {
      params.set("tagId", state.tagId);
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
    const [response, tagsResponse] = await Promise.all([
      fetch("/api/tasks/options", { credentials: "include" }),
      fetch("/api/tasks/tags", { credentials: "include" }),
    ]);
    const data = await readResponse(response);
    const tagsData = await readResponse(tagsResponse);

    const normalizedOptions = {
      canAssign: data.canAssign === true,
      canManageLifecycle: data.canManageLifecycle === true,
      canViewActivity: data.canViewActivity === true,
      types: Array.isArray(data.types) ? data.types : [],
      tags: Array.isArray(tagsData.tags) ? tagsData.tags : [],
      groups: Array.isArray(data.groups) ? data.groups : [],
      users: Array.isArray(data.users) ? data.users : [],
    };

    setOptions(normalizedOptions);
    return normalizedOptions;
  };

  useEffect(() => {
    setSearchInput(queryState.search);
  }, [queryState.search]);

  useEffect(() => () => {
    window.clearTimeout(searchTimerRef.current);
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  useEffect(() => {
    const loadTaskPanel = async () => {
      setLoading(true);
      setError("");

      try {
        await loadOptions();
        await loadTasks(taskListMode, queryState);
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
    queryState.tagId,
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
        await loadOptions();
        await loadTasks(taskListMode, queryState);
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
      ...(field === "tipId"
        ? { assignmentType: "none", assignmentId: "" }
        : {}),
    }));
  };

  const handleCreateTask = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!taskForm.tipId) {
      setError("Görev tipi seçimi zorunludur");
      return;
    }

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
          atananGrupId: null,
        }),
      });

      const data = await readResponse(response);
      const successMessage = data.message || "Görev başarıyla oluşturuldu";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setTaskForm(EMPTY_TASK_FORM);
      setTaskListMode("active");
      await loadTasks("active");
    } catch (requestError) {
      setError(requestError.message || "Görev oluşturulamadı");
    } finally {
      setCreating(false);
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
      const successMessage = data.message || "Görev durumu güncellendi";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setStatusDrafts((current) => ({
        ...current,
        [task.id]: "",
      }));
      await loadTasks();
    } catch (requestError) {
      setError(
        requestError.message || "Görev durumu güncellenemedi",
      );
    } finally {
      setUpdatingStatusTaskId(null);
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

    if (!form.tipId) {
      setError("Görev tipi seçimi zorunludur");
      return;
    }

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
      const successMessage = data.message || "Değişiklikler kaydedildi";
      setMessage(successMessage);
      showToast(successMessage, "success");
      setTaskEditor(null);
      await loadTasks("active");
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
      const successMessage = data.message || "Görev geri yüklendi";
      setMessage(successMessage);
      showToast(successMessage, "success");
      await loadTasks("archived");
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
      ...(field === "search" || field === "status" || field === "priority" || field === "taskType" || field === "tagId" || field === "sortBy" || field === "sortOrder"
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

  const handleSearchChange = (value) => {
    setSearchInput(value);
    window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      updateQueryState("search", value.trim());
    }, 250);
  };

  return (
    <section className="task-panel" aria-labelledby="task-panel-title">
      <div className="task-panel-heading">
        <div>
          <p className="eyebrow">Görev merkezi</p>
          <h2 id="task-panel-title">Görevler</h2>
        </div>
        <span className="task-count">
          {pagination.total} {taskListMode === "archived" ? "arşivlenmiş" : "aktif"} görev
        </span>
      </div>

      <form className="task-form" onSubmit={handleCreateTask}>
        <h3>Yeni görev oluştur</h3>
        <p className="form-hint">
          Görev, seçilen görev tipinin sorumlu grubuna otomatik yönlendirilir.
          Atama yetkisi olan kullanıcılar isterse doğrudan bu grubun bir
          üyesini seçebilir.
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
              required
            >
              <option value="">Görev tipi seçiniz</option>
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
                  <option value="none">
                    Görev tipi grubuna otomatik ata
                  </option>
                  <option value="user">Kullanıcıya ata</option>
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
                    {assignableUsersForType.map((optionUser) => (
                      <option key={optionUser.id} value={optionUser.id}>
                        {optionUser.name}
                      </option>
                    ))}
                  </select>
                  {selectedTaskType && assignableUsersForType.length === 0 && (
                    <small>
                      Bu görev tipi grubunda seçebileceğiniz kullanıcı yok.
                    </small>
                  )}
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
          {!creating && (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          )}
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
        <TableSearch
          value={searchInput}
          onChange={handleSearchChange}
          placeholder="Görevlerde ara..."
          label="Görevlerde ara"
          resultCount={pagination.total}
        />

        <div className="task-filter-row">
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
            <span>Etiket</span>
            <select
              value={queryState.tagId}
              onChange={(event) =>
                updateQueryState("tagId", event.target.value)
              }
            >
              <option value="">Tümü</option>
              {options.tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

          <div className="task-sort-box">
            <label className="task-field">
              <span>Sıralama</span>
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
          </div>
        </div>
      </form>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        disabled={loading}
        label="Görev sayfalama"
        onPageChange={(page) =>
          setQueryState((current) => ({ ...current, page }))
        }
      />

      {loading ? (
        <p className="task-empty-state">Görevler yükleniyor...</p>
      ) : tasks.length === 0 ? (
        <p className="task-empty-state">
          {taskListMode === "archived"
            ? "Arşivlenmiş görev bulunmuyor."
            : "Henüz görünür bir görev yok."}
        </p>
      ) : (
        <div className="task-table-wrapper task-table-compact">
          <table className="task-table">
            <thead>
              <tr>
                <th>Görev</th>
                <th>Bitiş</th>
                <th className="task-table-actions-heading">İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr
                  key={task.id}
                  className="task-table-row"
                  onClick={() => onNavigate && onNavigate(`/tasks/${task.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onNavigate && onNavigate(`/tasks/${task.id}`);
                    }
                  }}
                >
                  <td>
                    <div className="task-table-title-wrap">
                      <strong>#{task.id}</strong>
                      {task.parentTaskId && (
                        <small className="task-parent-reference">
                          Alt görev · Ana görev #{task.parentTaskId}
                          {task.parentTaskTitle
                            ? ` — ${task.parentTaskTitle}`
                            : ""}
                        </small>
                      )}
                      <span>{task.title}</span>
                      {taskListMode === "archived" &&
                        task.status === "Iptal Edildi" &&
                        task.cancellationReason && (
                          <small className="task-cancellation-reason">
                            İptal nedeni: {task.cancellationReason}
                          </small>
                        )}
                    </div>
                    {Array.isArray(task.tags) && task.tags.length > 0 && (
                      <div className="task-table-tags">
                        {task.tags.map((tag, index) => (
                          <span
                            key={tag.id}
                            className={`tag-chip tag-chip-small tag-color-${index % 6}${tag.active === false ? " tag-chip-archived" : ""}`}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {formatDate(task.dueDate)}
                    {taskListMode === "archived" &&
                    TERMINAL_ARCHIVE_LABELS[task.status]
                      ? ` (${TERMINAL_ARCHIVE_LABELS[task.status]})`
                      : ""}
                  </td>
                  <td className="task-table-actions">
                    <button
                      type="button"
                      className="secondary-button task-details-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigate && onNavigate(`/tasks/${task.id}`);
                      }}
                      aria-label={`${task.title} görev detaylarını aç`}
                    >
                      <span>Detaylar</span>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                  required
                >
                  <option value="">Görev tipi seçiniz</option>
                  {taskEditor.task.typeId &&
                    !options.types.some(
                      (type) =>
                        Number(type.id) ===
                        Number(taskEditor.task.typeId),
                    ) && (
                      <option value={taskEditor.task.typeId}>
                        {taskEditor.task.typeName || "Mevcut görev tipi"}{" "}
                        (arşivli)
                      </option>
                    )}
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

export default TaskPanel;

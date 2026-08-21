import { useEffect, useState } from "react";

import { readResponse } from "../api";

const EMPTY_FORM = {
  name: "",
  description: "",
  groupId: "",
};

function TaskTypeManagement({ enabled }) {
  const [taskTypes, setTaskTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [viewMode, setViewMode] = useState("active");
  const [newType, setNewType] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [limits, setLimits] = useState({
    maxNameLength: 100,
    maxDescriptionLength: 300,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(null);

  const loadTaskTypes = async (mode = viewMode) => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const query = mode === "archived" ? "?archived=true" : "";
      const response = await fetch(`/api/tasks/types${query}`, {
        credentials: "include",
      });
      const data = await readResponse(response);

      setTaskTypes(
        Array.isArray(data.taskTypes) ? data.taskTypes : [],
      );
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      setLimits({
        maxNameLength: Number(data.limits?.maxNameLength) || 100,
        maxDescriptionLength:
          Number(data.limits?.maxDescriptionLength) || 300,
      });
    } catch (requestError) {
      setError(requestError.message || "Görev tipleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTaskTypes("active");
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const changeMode = async (mode) => {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setEditing(null);
    setMessage("");
    await loadTaskTypes(mode);
  };

  const createTaskType = async (event) => {
    event.preventDefault();
    const name = newType.name.trim();

    if (!name) {
      setError("Görev tipi adı zorunludur");
      return;
    }

    if (!newType.groupId) {
      setError("Görev tipi için sorumlu grup seçilmelidir");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/tasks/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tipAdi: name,
          aciklama: newType.description.trim(),
          grupId: Number(newType.groupId),
        }),
      });
      const data = await readResponse(response);

      setNewType(EMPTY_FORM);
      setMessage(data.message || "Görev tipi oluşturuldu");
      await loadTaskTypes("active");
    } catch (requestError) {
      setError(requestError.message || "Görev tipi oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const saveTaskType = async () => {
    if (!editing) {
      return;
    }

    const name = editing.name.trim();

    if (!name) {
      setError("Görev tipi adı zorunludur");
      return;
    }

    if (!editing.groupId) {
      setError("Görev tipi için sorumlu grup seçilmelidir");
      return;
    }

    setBusyId(editing.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/tasks/types/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tipAdi: name,
          aciklama: editing.description.trim(),
          grupId: Number(editing.groupId),
        }),
      });
      const data = await readResponse(response);

      setEditing(null);
      setMessage(data.message || "Görev tipi güncellendi");
      await loadTaskTypes("active");
    } catch (requestError) {
      setError(requestError.message || "Görev tipi güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const requestArchiveTaskType = (taskType) => {
    setArchiveConfirm(taskType);
  };

  const cancelArchiveTaskType = () => {
    setArchiveConfirm(null);
  };

  const archiveTaskType = async (taskType) => {
    setArchiveConfirm(null);
    setBusyId(taskType.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/tasks/types/${taskType.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readResponse(response);

      setTaskTypes((current) =>
        current.filter((item) => item.id !== taskType.id),
      );
      setMessage(data.message || "Görev tipi arşivlendi");
    } catch (requestError) {
      setError(requestError.message || "Görev tipi arşivlenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const restoreTaskType = async (taskType) => {
    setBusyId(taskType.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/tasks/types/${taskType.id}/restore`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const data = await readResponse(response);

      setTaskTypes((current) =>
        current.filter((item) => item.id !== taskType.id),
      );
      setMessage(data.message || "Görev tipi geri yüklendi");
    } catch (requestError) {
      setError(requestError.message || "Görev tipi geri yüklenemedi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      className="task-type-management"
      aria-labelledby="task-type-management-title"
    >
      <div className="task-type-management-heading">
        <div>
          <p className="eyebrow">Görev sınıflandırması</p>
          <h3 id="task-type-management-title">Görev tipi yönetimi</h3>
        </div>
        <div className="view-tabs" aria-label="Görev tipi görünümü">
          <button
            type="button"
            className={viewMode === "active" ? "active" : ""}
            onClick={() => changeMode("active")}
            aria-pressed={viewMode === "active"}
          >
            Aktif
          </button>
          <button
            type="button"
            className={viewMode === "archived" ? "active" : ""}
            onClick={() => changeMode("archived")}
            aria-pressed={viewMode === "archived"}
          >
            Arşiv
          </button>
        </div>
      </div>

      <p className="task-type-guidance">
        Her görev tipi bir sorumlu gruba bağlanır. Atamasız oluşturulan görevler
        seçilen tipin grubuna otomatik yönlendirilir. Arşivlenen tiplerin mevcut
        görev kayıtları korunur.
      </p>

      {viewMode === "active" && (
        <form className="task-type-create-form" onSubmit={createTaskType}>
          <label>
            <span>Yeni görev tipi adı</span>
            <input
              value={newType.name}
              onChange={(event) =>
                setNewType((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              maxLength={limits.maxNameLength}
              placeholder="Örn. Dava Takibi"
              required
            />
          </label>
          <label>
            <span>Açıklama</span>
            <textarea
              value={newType.description}
              onChange={(event) =>
                setNewType((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              maxLength={limits.maxDescriptionLength}
              rows={2}
              placeholder="Bu görev tipinin kullanım amacını yazın"
            />
          </label>
          <label>
            <span>Sorumlu grup</span>
            <select
              value={newType.groupId}
              onChange={(event) =>
                setNewType((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
              required
            >
              <option value="">Grup seçiniz</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={
              creating || !newType.name.trim() || !newType.groupId
            }
          >
            {creating ? "Oluşturuluyor..." : "Görev tipi oluştur"}
          </button>
        </form>
      )}

      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      {loading ? (
        <p className="task-type-empty-state">Görev tipleri yükleniyor...</p>
      ) : taskTypes.length === 0 ? (
        <p className="task-type-empty-state">
          {viewMode === "archived"
            ? "Arşivlenmiş görev tipi bulunmuyor."
            : "Henüz aktif görev tipi bulunmuyor."}
        </p>
      ) : (
        <ul className="task-type-management-list">
          {taskTypes.map((taskType) => (
            <li key={taskType.id}>
              {editing?.id === taskType.id ? (
                <div className="task-type-edit-fields">
                  <label>
                    <span>Görev tipi adı</span>
                    <input
                      value={editing.name}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      maxLength={limits.maxNameLength}
                      aria-label="Görev tipi adı"
                    />
                  </label>
                  <label>
                    <span>Açıklama</span>
                    <textarea
                      value={editing.description}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      maxLength={limits.maxDescriptionLength}
                      rows={2}
                      aria-label="Görev tipi açıklaması"
                    />
                  </label>
                  <label>
                    <span>Sorumlu grup</span>
                    <select
                      value={editing.groupId}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          groupId: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Grup seçiniz</option>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div className="task-type-info">
                  <h4>{taskType.name}</h4>
                  <p>{taskType.description || "Açıklama eklenmedi."}</p>
                  <p>
                    <strong>Sorumlu grup:</strong>{" "}
                    {taskType.groupName || "Henüz atanmadı"}
                  </p>
                  <small>
                    {Number(taskType.taskCount) || 0} toplam görev ·{" "}
                    {Number(taskType.activeTaskCount) || 0} arşivlenmemiş görev
                  </small>
                </div>
              )}

              <div className="task-type-management-actions">
                {viewMode === "active" && editing?.id !== taskType.id && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setEditing({
                        id: taskType.id,
                        name: taskType.name,
                        description: taskType.description || "",
                        groupId: taskType.groupId
                          ? String(taskType.groupId)
                          : "",
                      })
                    }
                  >
                    Düzenle
                  </button>
                )}

                {viewMode === "active" && editing?.id === taskType.id && (
                  <>
                    <button
                      type="button"
                      onClick={saveTaskType}
                      disabled={
                        busyId === taskType.id ||
                        !editing.name.trim() ||
                        !editing.groupId
                      }
                    >
                      Kaydet
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setEditing(null)}
                      disabled={busyId === taskType.id}
                    >
                      Vazgeç
                    </button>
                  </>
                )}

                {viewMode === "active" && editing?.id !== taskType.id && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => requestArchiveTaskType(taskType)}
                    disabled={busyId === taskType.id}
                  >
                    {busyId === taskType.id ? "Arşivleniyor..." : "Arşivle"}
                  </button>
                )}

                {viewMode === "archived" && (
                  <button
                    type="button"
                    onClick={() => restoreTaskType(taskType)}
                    disabled={busyId === taskType.id}
                  >
                    {busyId === taskType.id ? "Yükleniyor..." : "Geri yükle"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {archiveConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="task-type-archive-dialog-title">
          <div className="confirm-card">
            <p className="eyebrow">Onay gerektiriyor</p>
            <h3 id="task-type-archive-dialog-title">Görev tipini arşivlemek üzeresiniz</h3>
            <p>
              <strong>{archiveConfirm.name}</strong> görev tipi arşivlenecek ve yeni görev atamalarında seçilemeyecektir.
              {Number(archiveConfirm.taskCount) > 0 && (
                <> Bu tipi kullanan {archiveConfirm.taskCount} mevcut görev korunacaktır.</>
              )}
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="danger-button"
                onClick={() => archiveTaskType(archiveConfirm)}
                disabled={busyId === archiveConfirm.id}
              >
                Arşivle
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={cancelArchiveTaskType}
                disabled={busyId === archiveConfirm.id}
              >
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default TaskTypeManagement;

import { useEffect, useState } from "react";

import { readResponse } from "../api";

function TagManagement({ enabled }) {
  const [tags, setTags] = useState([]);
  const [viewMode, setViewMode] = useState("active");
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [maxNameLength, setMaxNameLength] = useState(50);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadTags = async (mode = viewMode) => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const query = mode === "archived" ? "?archived=true" : "";
      const response = await fetch(`/api/tasks/tags${query}`, {
        credentials: "include",
      });
      const data = await readResponse(response);

      setTags(Array.isArray(data.tags) ? data.tags : []);
      setMaxNameLength(Number(data.limits?.maxNameLength) || 50);
    } catch (requestError) {
      setError(requestError.message || "Etiketler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTags("active");
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const changeMode = async (mode) => {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setEditingId(null);
    setMessage("");
    await loadTags(mode);
  };

  const createTag = async (event) => {
    event.preventDefault();
    const name = newName.trim();

    if (!name) {
      setError("Etiket adı zorunludur");
      return;
    }

    setCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/tasks/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ etiketAdi: name }),
      });
      const data = await readResponse(response);

      setNewName("");
      setMessage(data.message || "Etiket oluşturuldu");
      await loadTags("active");
    } catch (requestError) {
      setError(requestError.message || "Etiket oluşturulamadı");
    } finally {
      setCreating(false);
    }
  };

  const saveTag = async (tagId) => {
    const name = editingName.trim();

    if (!name) {
      setError("Etiket adı zorunludur");
      return;
    }

    setBusyId(tagId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/tasks/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ etiketAdi: name }),
      });
      const data = await readResponse(response);

      setEditingId(null);
      setEditingName("");
      setMessage(data.message || "Etiket güncellendi");
      await loadTags("active");
    } catch (requestError) {
      setError(requestError.message || "Etiket güncellenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const archiveTag = async (tag) => {
    if (!window.confirm(`"${tag.name}" etiketini arşivlemek istiyor musunuz?`)) {
      return;
    }

    setBusyId(tag.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/tasks/tags/${tag.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readResponse(response);

      setMessage(data.message || "Etiket arşivlendi");
      setTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(requestError.message || "Etiket arşivlenemedi");
    } finally {
      setBusyId(null);
    }
  };

  const restoreTag = async (tag) => {
    setBusyId(tag.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/tasks/tags/${tag.id}/restore`, {
        method: "PATCH",
        credentials: "include",
      });
      const data = await readResponse(response);

      setMessage(data.message || "Etiket geri yüklendi");
      setTags((current) => current.filter((item) => item.id !== tag.id));
    } catch (requestError) {
      setError(requestError.message || "Etiket geri yüklenemedi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="tag-management" aria-labelledby="tag-management-title">
      <div className="tag-management-heading">
        <div>
          <p className="eyebrow">Sistem sınıflandırması</p>
          <h3 id="tag-management-title">Etiket yönetimi</h3>
        </div>
        <div className="view-tabs" aria-label="Etiket görünümü">
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

      {viewMode === "active" && (
        <form className="tag-create-form" onSubmit={createTag}>
          <label>
            <span>Yeni etiket adı</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={maxNameLength}
              placeholder="Örn. Acil"
              required
            />
          </label>
          <button type="submit" disabled={creating || !newName.trim()}>
            {creating ? "Oluşturuluyor..." : "Etiket oluştur"}
          </button>
        </form>
      )}

      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      {loading ? (
        <p className="tag-empty-state">Etiketler yükleniyor...</p>
      ) : tags.length === 0 ? (
        <p className="tag-empty-state">
          {viewMode === "archived"
            ? "Arşivlenmiş etiket bulunmuyor."
            : "Henüz aktif etiket bulunmuyor."}
        </p>
      ) : (
        <ul className="tag-management-list">
          {tags.map((tag, index) => (
            <li key={tag.id}>
              {editingId === tag.id ? (
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  maxLength={maxNameLength}
                  aria-label="Etiket adı"
                />
              ) : (
                <span className={`tag-chip tag-color-${index % 6}`}>
                  {tag.name}
                </span>
              )}

              <div className="tag-management-actions">
                {viewMode === "active" && editingId !== tag.id && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditingName(tag.name);
                    }}
                  >
                    Düzenle
                  </button>
                )}

                {viewMode === "active" && editingId === tag.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => saveTag(tag.id)}
                      disabled={busyId === tag.id || !editingName.trim()}
                    >
                      Kaydet
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(null);
                        setEditingName("");
                      }}
                      disabled={busyId === tag.id}
                    >
                      Vazgeç
                    </button>
                  </>
                )}

                {viewMode === "active" && editingId !== tag.id && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => archiveTag(tag)}
                    disabled={busyId === tag.id}
                  >
                    {busyId === tag.id ? "Arşivleniyor..." : "Arşivle"}
                  </button>
                )}

                {viewMode === "archived" && (
                  <button
                    type="button"
                    onClick={() => restoreTag(tag)}
                    disabled={busyId === tag.id}
                  >
                    {busyId === tag.id ? "Yükleniyor..." : "Geri yükle"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default TagManagement;

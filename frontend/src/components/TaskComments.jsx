import { useEffect, useState } from "react";

import { readResponse } from "../api";

const DEFAULT_LIMITS = {
  maxCommentLength: 4000,
};

const TERMINAL_STATUSES = new Set(["Tamamlandi", "Iptal Edildi"]);

const formatDate = (value) => {
  if (!value) {
    return "Tarih bilinmiyor";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Tarih bilinmiyor";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

function TaskComments({ task, onError, onSuccess }) {
  const [comments, setComments] = useState([]);
  const [viewMode, setViewMode] = useState("active");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [archivingId, setArchivingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [editingVersion, setEditingVersion] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState([]);
  const [historyByComment, setHistoryByComment] = useState({});
  const [loadingHistoryId, setLoadingHistoryId] = useState(null);
  const [canComment, setCanComment] = useState(
    !task.archived && !TERMINAL_STATUSES.has(task.status),
  );
  const [limits, setLimits] = useState(DEFAULT_LIMITS);

  const reportError = (error, fallbackMessage) => {
    onError?.(error?.message || fallbackMessage);
  };

  const loadComments = async (mode = viewMode) => {
    setLoading(true);

    try {
      const query = mode === "archived" ? "?archived=true" : "";
      const response = await fetch(
        `/api/tasks/${task.id}/comments${query}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setComments(Array.isArray(data.comments) ? data.comments : []);
      setCanComment(data.canComment === true);
      setLimits({
        ...DEFAULT_LIMITS,
        ...(data.limits || {}),
      });
    } catch (error) {
      reportError(error, "Görev yorumları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setComments([]);
    setViewMode("active");
    setDraft("");
    setEditingId(null);
    setEditingText("");
    setEditingVersion(null);
    setExpandedHistoryIds([]);
    setHistoryByComment({});
    setCanComment(
      !task.archived && !TERMINAL_STATUSES.has(task.status),
    );
    loadComments("active");
  }, [task.id]);

  useEffect(() => {
    setCanComment(
      !task.archived && !TERMINAL_STATUSES.has(task.status),
    );
  }, [task.archived, task.status]);

  const changeViewMode = async (mode) => {
    if (mode === viewMode) {
      return;
    }

    setViewMode(mode);
    setComments([]);
    setEditingId(null);
    setExpandedHistoryIds([]);
    await loadComments(mode);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const text = draft.trim();

    if (!text) {
      onError?.("Yorum metni zorunludur");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ yorumMetni: text }),
      });
      const data = await readResponse(response);

      if (data.comment) {
        setComments((current) => [...current, data.comment]);
      }

      setDraft("");
      onSuccess?.(data.message || "Yorum eklendi");
    } catch (error) {
      reportError(error, "Yorum eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (comment) => {
    setEditingId(comment.id);
    setEditingText(comment.text || "");
    setEditingVersion(Number(comment.version));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingText("");
    setEditingVersion(null);
  };

  const handleEdit = async (comment) => {
    const text = editingText.trim();

    if (!text) {
      onError?.("Yorum metni zorunludur");
      return;
    }

    setSavingEdit(true);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/comments/${comment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            yorumMetni: text,
            version: editingVersion,
          }),
        },
      );
      const data = await readResponse(response);

      setComments((current) =>
        current.map((item) =>
          item.id === comment.id ? data.comment : item,
        ),
      );
      setHistoryByComment((current) => {
        const next = { ...current };
        delete next[comment.id];
        return next;
      });
      setExpandedHistoryIds((current) =>
        current.filter((id) => id !== comment.id),
      );
      cancelEditing();
      onSuccess?.(data.message || "Yorum güncellendi");
    } catch (error) {
      reportError(error, "Yorum güncellenemedi");
      await loadComments(viewMode);
      cancelEditing();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleArchive = async (comment) => {
    const confirmed = window.confirm(
      "Bu yorumu arşivlemek istediğinizden emin misiniz?",
    );

    if (!confirmed) {
      return;
    }

    setArchivingId(comment.id);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/comments/${comment.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await readResponse(response);

      setComments((current) =>
        current.filter((item) => item.id !== comment.id),
      );
      onSuccess?.(data.message || "Yorum arşivlendi");
    } catch (error) {
      reportError(error, "Yorum arşivlenemedi");
    } finally {
      setArchivingId(null);
    }
  };

  const handleRestore = async (comment) => {
    setRestoringId(comment.id);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/comments/${comment.id}/restore`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const data = await readResponse(response);

      setComments((current) =>
        current.filter((item) => item.id !== comment.id),
      );
      onSuccess?.(data.message || "Yorum geri yüklendi");
    } catch (error) {
      reportError(error, "Yorum geri yüklenemedi");
    } finally {
      setRestoringId(null);
    }
  };

  const toggleHistory = async (comment) => {
    const expanded = expandedHistoryIds.includes(comment.id);

    if (expanded) {
      setExpandedHistoryIds((current) =>
        current.filter((id) => id !== comment.id),
      );
      return;
    }

    setExpandedHistoryIds((current) => [...current, comment.id]);

    if (historyByComment[comment.id]) {
      return;
    }

    setLoadingHistoryId(comment.id);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/comments/${comment.id}/history`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setHistoryByComment((current) => ({
        ...current,
        [comment.id]: Array.isArray(data.history) ? data.history : [],
      }));
    } catch (error) {
      setExpandedHistoryIds((current) =>
        current.filter((id) => id !== comment.id),
      );
      reportError(error, "Yorum geçmişi yüklenemedi");
    } finally {
      setLoadingHistoryId(null);
    }
  };

  return (
    <section className="task-comments" aria-labelledby="task-comments-title">
      <div className="comment-section-heading">
        <div>
          <p className="eyebrow">Ekip iletişimi</p>
          <h3 id="task-comments-title">Yorumlar</h3>
        </div>

        <div className="view-tabs comment-view-tabs" aria-label="Yorum görünümü">
          <button
            type="button"
            className={viewMode === "active" ? "active" : ""}
            onClick={() => changeViewMode("active")}
            disabled={loading}
            aria-pressed={viewMode === "active"}
          >
            Aktif
          </button>
          <button
            type="button"
            className={viewMode === "archived" ? "active" : ""}
            onClick={() => changeViewMode("archived")}
            disabled={loading}
            aria-pressed={viewMode === "archived"}
          >
            Arşiv
          </button>
        </div>
      </div>

      {canComment && viewMode === "active" && (
        <form className="comment-create-form" onSubmit={handleCreate}>
          <label htmlFor={`task-comment-${task.id}`}>Yeni yorum</label>
          <textarea
            id={`task-comment-${task.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={limits.maxCommentLength}
            placeholder="Görevle ilgili notunuzu yazın..."
            required
          />
          <div className="comment-form-footer">
            <small>
              {draft.length}/{limits.maxCommentLength}
            </small>
            <button type="submit" disabled={submitting || !draft.trim()}>
              {submitting ? "Ekleniyor..." : "Yorum ekle"}
            </button>
          </div>
        </form>
      )}

      {!canComment && viewMode === "active" && (
        <p className="comment-readonly-note">
          Arşivlenmiş, tamamlanmış veya iptal edilmiş görevlerde yorumlar salt okunurdur.
        </p>
      )}

      {loading ? (
        <p className="comment-empty-state">Yorumlar yükleniyor...</p>
      ) : comments.length === 0 ? (
        <p className="comment-empty-state">
          {viewMode === "archived"
            ? "Arşivlenmiş yorum bulunmuyor."
            : "Bu göreve henüz yorum eklenmedi."}
        </p>
      ) : (
        <ol className="comment-list">
          {comments.map((comment) => {
            const historyExpanded = expandedHistoryIds.includes(comment.id);
            const history = historyByComment[comment.id] || [];

            return (
              <li key={comment.id} className="comment-card">
                <div className="comment-card-heading">
                  <div>
                    <strong>{comment.authorName}</strong>
                    <span>
                      {formatDate(comment.createdAt)}
                      {comment.edited ? " · Düzenlendi" : ""}
                      {viewMode === "archived" && comment.archivedAt
                        ? ` · Arşivlenme: ${formatDate(comment.archivedAt)}`
                        : ""}
                    </span>
                  </div>
                  <span className="comment-version-chip">
                    Sürüm {comment.version}
                  </span>
                </div>

                {editingId === comment.id ? (
                  <div className="comment-edit-form">
                    <textarea
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      rows={3}
                      maxLength={limits.maxCommentLength}
                    />
                    <div className="comment-action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={cancelEditing}
                        disabled={savingEdit}
                      >
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(comment)}
                        disabled={savingEdit || !editingText.trim()}
                      >
                        {savingEdit ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="comment-text">{comment.text}</p>
                )}

                <div className="comment-action-row">
                  {comment.canEdit && editingId !== comment.id && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => startEditing(comment)}
                    >
                      Düzenle
                    </button>
                  )}

                  {comment.canViewHistory && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => toggleHistory(comment)}
                      disabled={loadingHistoryId === comment.id}
                    >
                      {loadingHistoryId === comment.id
                        ? "Geçmiş yükleniyor..."
                        : historyExpanded
                          ? "Geçmişi kapat"
                          : "Düzenleme geçmişi"}
                    </button>
                  )}

                  {comment.canArchive && (
                    <button
                      type="button"
                      className="comment-archive-button"
                      onClick={() => handleArchive(comment)}
                      disabled={archivingId === comment.id}
                    >
                      {archivingId === comment.id
                        ? "Arşivleniyor..."
                        : "Arşivle"}
                    </button>
                  )}

                  {comment.canRestore && (
                    <button
                      type="button"
                      className="comment-restore-button"
                      onClick={() => handleRestore(comment)}
                      disabled={restoringId === comment.id}
                    >
                      {restoringId === comment.id
                        ? "Geri yükleniyor..."
                        : "Geri yükle"}
                    </button>
                  )}
                </div>

                {historyExpanded && (
                  <div className="comment-history">
                    <h4>Önceki sürümler</h4>
                    {history.length === 0 ? (
                      <p>Önceki sürüm kaydı bulunmuyor.</p>
                    ) : (
                      <ol>
                        {history.map((entry) => (
                          <li key={entry.id}>
                            <div>
                              <strong>Sürüm {entry.version}</strong>
                              <span>
                                {formatDate(entry.changedAt)}
                                {entry.editorName
                                  ? ` · ${entry.editorName}`
                                  : ""}
                              </span>
                            </div>
                            <p>{entry.text}</p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default TaskComments;

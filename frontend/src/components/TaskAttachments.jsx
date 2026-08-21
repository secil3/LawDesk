import { useEffect, useRef, useState } from "react";

import { readResponse } from "../api";

const DEFAULT_LIMITS = {
  allowedExtensions: [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".jpg",
    ".jpeg",
    ".png",
  ],
  maxFileSizeMb: 25,
  maxFilesPerTask: 10,
};

const formatFileSize = (value) => {
  const bytes = Number(value);

  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Boyut bilinmiyor";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatUploadDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Tarih bilinmiyor";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const getFileExtensionLabel = (fileName) => {
  const extension = String(fileName || "").split(".").pop();

  return extension ? extension.slice(0, 4).toUpperCase() : "DOSYA";
};

function TaskAttachments({ task, onError, onSuccess }) {
  const fileInputRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [viewMode, setViewMode] = useState("active");
  const [canUpload, setCanUpload] = useState(
    !task.archived &&
      !["Tamamlandi", "Iptal Edildi"].includes(task.status),
  );
  const [limits, setLimits] = useState(DEFAULT_LIMITS);

  useEffect(() => {
    setCanUpload(
      !task.archived &&
        !["Tamamlandi", "Iptal Edildi"].includes(task.status),
    );
  }, [task.archived, task.status]);

  useEffect(() => {
    setExpanded(false);
    setLoaded(false);
    setAttachments([]);
    setViewMode("active");
  }, [task.id]);

  const reportError = (error, fallbackMessage) => {
    onError?.(error?.message || fallbackMessage);
  };

  const loadAttachments = async (mode = viewMode) => {
    setLoading(true);

    try {
      const query = mode === "removed" ? "?removed=true" : "";
      const response = await fetch(
        `/api/tasks/${task.id}/attachments${query}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setAttachments(
        Array.isArray(data.attachments) ? data.attachments : [],
      );
      setCanUpload(data.canUpload === true);
      setLimits({
        ...DEFAULT_LIMITS,
        ...(data.limits || {}),
      });
      setLoaded(true);
    } catch (error) {
      reportError(error, "Görev ekleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const changeViewMode = async (mode) => {
    if (mode === viewMode && loaded) {
      return;
    }

    setViewMode(mode);
    setLoaded(false);
    setAttachments([]);
    await loadAttachments(mode);
  };

  const toggleExpanded = async () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);

    if (nextExpanded && !loaded) {
      await loadAttachments();
    }
  };

  const handleFileSelection = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

    if (!limits.allowedExtensions.includes(extension)) {
      onError?.("Yalnızca PDF, Word, Excel, JPG ve PNG dosyaları yüklenebilir");
      return;
    }

    if (file.size > Number(limits.maxFileSizeMb) * 1024 * 1024) {
      onError?.(
        `Dosya boyutu en fazla ${limits.maxFileSizeMb} MB olabilir`,
      );
      return;
    }

    if (attachments.length >= Number(limits.maxFilesPerTask)) {
      onError?.(
        `Bir görevde en fazla ${limits.maxFilesPerTask} aktif ek bulunabilir`,
      );
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setUploading(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/attachments`, {
        method: "POST",
        credentials: "include",
        body,
      });
      const data = await readResponse(response);

      if (data.attachment) {
        setAttachments((current) => [data.attachment, ...current]);
      }

      onSuccess?.(data.message || "Dosya göreve eklendi");
    } catch (error) {
      reportError(error, "Dosya göreve eklenemedi");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (attachment) => {
    const confirmed = window.confirm(
      `"${attachment.fileName}" ekini görevden kaldırmak istediğinizden emin misiniz?`,
    );

    if (!confirmed) {
      return;
    }

    setRemovingId(attachment.id);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/attachments/${attachment.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await readResponse(response);

      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      onSuccess?.(data.message || "Ek görevden kaldırıldı");
    } catch (error) {
      reportError(error, "Ek görevden kaldırılamadı");
    } finally {
      setRemovingId(null);
    }
  };

  const handleRestore = async (attachment) => {
    setRestoringId(attachment.id);

    try {
      const response = await fetch(
        `/api/tasks/${task.id}/attachments/${attachment.id}/restore`,
        {
          method: "PATCH",
          credentials: "include",
        },
      );
      const data = await readResponse(response);

      setAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      );
      onSuccess?.(data.message || "Ek göreve geri yüklendi");
    } catch (error) {
      reportError(error, "Ek göreve geri yüklenemedi");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section className="task-attachments">
      <button
        type="button"
        className="attachment-toggle-button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <span>Dosyalar / Ekler{loaded ? ` (${attachments.length})` : ""}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="attachment-content">
          <div className="view-tabs attachment-view-tabs" aria-label="Ek görünümü">
            <button
              type="button"
              className={viewMode === "active" ? "active" : ""}
              onClick={() => changeViewMode("active")}
              disabled={loading}
            >
              Aktif ekler
            </button>
            <button
              type="button"
              className={viewMode === "removed" ? "active" : ""}
              onClick={() => changeViewMode("removed")}
              disabled={loading}
            >
              Kaldırılanlar
            </button>
          </div>

          {loading ? (
            <div className="attachment-loading">
              <span className="spinner spinner-sm" aria-hidden="true" />
              <span>Ekler yükleniyor...</span>
            </div>
          ) : attachments.length === 0 ? (
            <div className="attachment-empty-state">
              <p className="attachment-empty">
                {viewMode === "removed"
                  ? "Bu görevde kaldırılmış ek bulunmuyor."
                  : "Bu göreve henüz dosya eklenmedi."}
              </p>
            </div>
          ) : (
            <ul className="attachment-list">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="attachment-item">
                  <div className="attachment-file-icon" aria-hidden="true">
                    {getFileExtensionLabel(attachment.fileName)}
                  </div>

                  <div className="attachment-info">
                    <strong>{attachment.fileName}</strong>
                    <span className="attachment-meta">
                      <span className="attachment-size-pill">{formatFileSize(attachment.size)}</span>
                      <span>{attachment.uploaderName}</span>
                      <span>{formatUploadDate(attachment.uploadedAt)}</span>
                      {viewMode === "removed" && attachment.removedAt && (
                        <span>Kaldırılma: {formatUploadDate(attachment.removedAt)}</span>
                      )}
                    </span>
                  </div>

                  <div className="attachment-actions">
                    {viewMode === "active" && (
                      <a
                        className="attachment-download-link"
                        href={`/api/tasks/${task.id}/attachments/${attachment.id}/download`}
                        download={attachment.fileName}
                      >
                        İndir
                      </a>
                    )}

                    {attachment.canDelete && canUpload && (
                      <button
                        type="button"
                        className="attachment-remove-button"
                        onClick={() => handleRemove(attachment)}
                        disabled={removingId === attachment.id}
                      >
                        {removingId === attachment.id
                          ? "Kaldırılıyor..."
                          : "Kaldır"}
                      </button>
                    )}

                    {attachment.canRestore && (
                      <button
                        type="button"
                        className="secondary-button attachment-restore-button"
                        onClick={() => handleRestore(attachment)}
                        disabled={restoringId === attachment.id}
                      >
                        {restoringId === attachment.id
                          ? "Geri yükleniyor..."
                          : "Geri yükle"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canUpload && viewMode === "active" && (
            <div className="attachment-upload-zone">
              <input
                ref={fileInputRef}
                type="file"
                accept={limits.allowedExtensions.join(",")}
                onChange={handleFileSelection}
                hidden
              />

              <div className="attachment-upload-zone-icon" aria-hidden="true">↑</div>

              <div className="attachment-upload-zone-text">
                <strong>Dosya ekleyin</strong>
                <span>
                  {limits.allowedExtensions.join(", ")} · en fazla {limits.maxFileSizeMb} MB
                </span>
              </div>

              <button
                type="button"
                className="btn-primary attachment-upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  uploading ||
                  attachments.length >= Number(limits.maxFilesPerTask)
                }
              >
                {uploading ? "Yükleniyor..." : "Dosya Seç"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default TaskAttachments;

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

function TaskAttachments({ task, onError, onSuccess }) {
  const fileInputRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [attachments, setAttachments] = useState([]);
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

  const reportError = (error, fallbackMessage) => {
    onError?.(error?.message || fallbackMessage);
  };

  const loadAttachments = async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/attachments`, {
        credentials: "include",
      });
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

  return (
    <section className="task-attachments">
      <button
        type="button"
        className="attachment-toggle-button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <span>Ekler{loaded ? ` (${attachments.length})` : ""}</span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>

      {expanded && (
        <div className="attachment-content">
          {loading ? (
            <p className="attachment-empty">Ekler yükleniyor...</p>
          ) : attachments.length === 0 ? (
            <p className="attachment-empty">Bu göreve henüz dosya eklenmedi.</p>
          ) : (
            <ul className="attachment-list">
              {attachments.map((attachment) => (
                <li key={attachment.id} className="attachment-item">
                  <div className="attachment-info">
                    <strong>{attachment.fileName}</strong>
                    <span>
                      {formatFileSize(attachment.size)} · {attachment.uploaderName}
                      {" · "}
                      {formatUploadDate(attachment.uploadedAt)}
                    </span>
                  </div>

                  <div className="attachment-actions">
                    <a
                      className="attachment-download-link"
                      href={`/api/tasks/${task.id}/attachments/${attachment.id}/download`}
                      download={attachment.fileName}
                    >
                      İndir
                    </a>

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
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canUpload && (
            <div className="attachment-upload-row">
              <input
                ref={fileInputRef}
                type="file"
                accept={limits.allowedExtensions.join(",")}
                onChange={handleFileSelection}
                hidden
              />
              <button
                type="button"
                className="secondary-button attachment-upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={
                  uploading ||
                  attachments.length >= Number(limits.maxFilesPerTask)
                }
              >
                {uploading ? "Yükleniyor..." : "Dosya ekle"}
              </button>
              <small>
                En fazla {limits.maxFileSizeMb} MB · PDF, Word, Excel, JPG, PNG
              </small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default TaskAttachments;

import { useEffect, useMemo, useState } from "react";

import { readResponse } from "../api";

const DEFAULT_MAX_TAGS = 10;

const normalizedIds = (values) =>
  [...values]
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right);

function TaskTags({ task, onError, onSuccess }) {
  const [tags, setTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [maxTags, setMaxTags] = useState(DEFAULT_MAX_TAGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeAssignedIds = useMemo(
    () => normalizedIds(
      tags.filter((tag) => tag.active !== false).map((tag) => tag.id),
    ),
    [tags],
  );

  const selectedIdsNormalized = useMemo(
    () => normalizedIds(selectedIds),
    [selectedIds],
  );

  const hasChanges =
    activeAssignedIds.length !== selectedIdsNormalized.length ||
    activeAssignedIds.some(
      (tagId, index) => tagId !== selectedIdsNormalized[index],
    );

  const loadTags = async () => {
    setLoading(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/tags`, {
        credentials: "include",
      });
      const data = await readResponse(response);
      const nextTags = Array.isArray(data.tags) ? data.tags : [];
      const nextAvailableTags = Array.isArray(data.availableTags)
        ? data.availableTags
        : [];

      setTags(nextTags);
      setAvailableTags(nextAvailableTags);
      setSelectedIds(
        normalizedIds(
          nextTags
            .filter((tag) => tag.active !== false)
            .map((tag) => tag.id),
        ),
      );
      setCanManage(data.canManage === true);
      setMaxTags(
        Number(data.limits?.maxTagsPerTask) || DEFAULT_MAX_TAGS,
      );
    } catch (error) {
      onError?.(error.message || "Görev etiketleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setTags([]);
    setAvailableTags([]);
    setSelectedIds([]);
    setCanManage(false);
    loadTags();
  }, [task.id, task.status, task.archived]);

  const toggleTag = (tagId) => {
    const numericId = Number(tagId);

    setSelectedIds((current) => {
      if (current.includes(numericId)) {
        return current.filter((id) => id !== numericId);
      }

      if (current.length >= maxTags) {
        onError?.(`Bir göreve en fazla ${maxTags} etiket eklenebilir`);
        return current;
      }

      return [...current, numericId];
    });
  };

  const saveTags = async () => {
    if (!hasChanges) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/tasks/${task.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ etiketIds: selectedIdsNormalized }),
      });
      const data = await readResponse(response);
      const nextTags = Array.isArray(data.tags) ? data.tags : [];

      setTags(nextTags);
      setSelectedIds(
        normalizedIds(
          nextTags
            .filter((tag) => tag.active !== false)
            .map((tag) => tag.id),
        ),
      );
      setCanManage(data.canManage === true);
      onSuccess?.(data.message || "Görev etiketleri güncellendi");
    } catch (error) {
      onError?.(error.message || "Görev etiketleri güncellenemedi");
      await loadTags();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="task-tags" aria-labelledby="task-tags-title">
      <div className="task-tags-heading">
        <div>
          <p className="eyebrow">Sınıflandırma</p>
          <h3 id="task-tags-title">Etiketler</h3>
        </div>
        <span className="tag-count">
          {activeAssignedIds.length}/{maxTags}
        </span>
      </div>

      {loading ? (
        <p className="tag-empty-state">Etiketler yükleniyor...</p>
      ) : (
        <>
          <div className="tag-chip-list" aria-label="Görev etiketleri">
            {tags.length === 0 ? (
              <span className="tag-empty-state">Etiket eklenmedi.</span>
            ) : (
              tags.map((tag, index) => (
                <span
                  key={tag.id}
                  className={`tag-chip tag-color-${index % 6}${tag.active === false ? " tag-chip-archived" : ""}`}
                >
                  {tag.name}
                  {tag.active === false ? " (arşivli)" : ""}
                </span>
              ))
            )}
          </div>

          {canManage && (
            <div className="task-tag-editor">
              <p>Görevde kullanılacak etiketleri seçin.</p>

              {availableTags.length === 0 ? (
                <p className="tag-empty-state">
                  Aktif etiket bulunmuyor. Admin veya yönetici Ayarlar ekranından etiket oluşturabilir.
                </p>
              ) : (
                <div className="tag-checkbox-grid">
                  {availableTags.map((tag) => (
                    <label key={tag.id} className="tag-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(Number(tag.id))}
                        onChange={() => toggleTag(tag.id)}
                        disabled={saving}
                      />
                      <span>{tag.name}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="tag-editor-actions">
                <small>
                  {selectedIds.length} etiket seçildi
                </small>
                <button
                  type="button"
                  onClick={saveTags}
                  disabled={saving || !hasChanges}
                >
                  {saving ? "Kaydediliyor..." : "Etiketleri kaydet"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default TaskTags;

import { Fragment, useState } from "react";
import { EmptyState, LoadingState } from "./ui/StateDisplay";
import TableSearch from "./TableSearch";

function GroupTable({
  groups,
  loading,
  emptyMessage,
  canManage,
  drafts,
  assignmentDrafts,
  users,
  savingGroupId,
  searchTerm,
  onSearchChange,
  onDraftChange,
  onUpdateGroup,
  onAssignmentChange,
  onAssignUser,
}) {
  const [expandedGroupId, setExpandedGroupId] = useState(null);

  if (loading) {
    return <LoadingState>Gruplar yükleniyor...</LoadingState>;
  }

  if (groups.length === 0 && !searchTerm) {
    return <EmptyState>{emptyMessage}</EmptyState>;
  }

  return (
    <div className="table-list-with-search">
      <TableSearch
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Gruplarda ara..."
        label="Gruplarda ara"
        resultCount={groups.length}
      />
      {groups.length === 0 ? (
        <EmptyState>Aramanızla eşleşen grup bulunamadı.</EmptyState>
      ) : (
      <div className="group-table-shell">
      <table className="group-table">
        <thead>
          <tr>
            <th scope="col">Grup adı</th>
            <th scope="col">Açıklama</th>
            <th scope="col" className="group-table-number">Üye sayısı</th>
            <th scope="col" className="group-table-number">Grup yöneticisi</th>
            <th scope="col" className="group-table-actions-heading">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isExpanded = expandedGroupId === group.id;
            const draft = drafts[group.id] || {
              name: group.name || "",
              description: group.description || "",
            };
            const assignmentDraft = assignmentDrafts[group.id] || {
              userId: "",
              role: "grup_uyesi",
            };
            const unchanged =
              draft.name.trim() === group.name &&
              draft.description.trim() === (group.description || "");

            return (
              <Fragment key={group.id}>
                <tr className={isExpanded ? "group-table-row expanded" : "group-table-row"}>
                  <td data-label="Grup adı">
                    <div className="group-name-cell">
                      <span className="group-avatar" aria-hidden="true">
                        {(group.name || "G").charAt(0).toLocaleUpperCase("tr-TR")}
                      </span>
                      <strong>{group.name}</strong>
                    </div>
                  </td>
                  <td data-label="Açıklama">
                    <span className={group.description?.trim() ? "group-description-cell" : "group-description-cell muted"}>
                      {group.description?.trim() || "Açıklama eklenmemiş"}
                    </span>
                  </td>
                  <td data-label="Üye sayısı" className="group-table-number">
                    <span className="group-count-badge">{group.memberCount || 0}</span>
                  </td>
                  <td data-label="Grup yöneticisi" className="group-table-number">
                    <span className="group-count-badge manager">{group.managerCount || 0}</span>
                  </td>
                  <td data-label="İşlemler" className="group-table-actions">
                    {canManage ? (
                      <button
                        type="button"
                        className="group-manage-button"
                        onClick={() => setExpandedGroupId(isExpanded ? null : group.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`group-editor-${group.id}`}
                      >
                        {isExpanded ? "Kapat" : "Yönet"}
                      </button>
                    ) : (
                      <span className="group-no-action" aria-label="Kullanılabilir işlem yok">—</span>
                    )}
                  </td>
                </tr>

                {canManage && isExpanded && (
                  <tr className="group-editor-row">
                    <td colSpan="5">
                      <div className="group-inline-editor" id={`group-editor-${group.id}`}>
                        <section className="group-editor-section">
                          <div className="group-editor-heading">
                            <div>
                              <p className="eyebrow">Grup bilgileri</p>
                              <h4>{group.name} grubunu düzenle</h4>
                            </div>
                            <span className="group-editor-summary">
                              {group.memberCount || 0} üye · {group.managerCount || 0} yönetici
                            </span>
                          </div>

                          <div className="group-editor-fields">
                            <label>
                              <span>Grup adı</span>
                              <input
                                value={draft.name}
                                onChange={(event) =>
                                  onDraftChange(group.id, { ...draft, name: event.target.value })
                                }
                                maxLength={100}
                              />
                            </label>
                            <label>
                              <span>Açıklama</span>
                              <input
                                value={draft.description}
                                onChange={(event) =>
                                  onDraftChange(group.id, { ...draft, description: event.target.value })
                                }
                                maxLength={500}
                              />
                            </label>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => onUpdateGroup(group.id)}
                              disabled={unchanged || !draft.name.trim() || savingGroupId === group.id}
                            >
                              {savingGroupId === group.id ? "Kaydediliyor..." : "Değişiklikleri kaydet"}
                            </button>
                          </div>
                        </section>

                        <section className="group-editor-section group-member-editor">
                          <div>
                            <p className="eyebrow">Üye yönetimi</p>
                            <h4>Gruba kullanıcı ekle</h4>
                          </div>
                          <div className="group-member-fields">
                            <label>
                              <span>Kullanıcı</span>
                              <select
                                value={assignmentDraft.userId}
                                onChange={(event) => onAssignmentChange(group.id, { userId: event.target.value })}
                              >
                                <option value="">Kullanıcı seçiniz</option>
                                {users.map((userItem) => (
                                  <option key={userItem.id} value={userItem.id}>
                                    {userItem.adSoyad}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Rol</span>
                              <select
                                value={assignmentDraft.role}
                                onChange={(event) => onAssignmentChange(group.id, { role: event.target.value })}
                              >
                                <option value="grup_uyesi">Grup üyesi</option>
                                <option value="grup_yoneticisi">Grup yöneticisi</option>
                              </select>
                            </label>
                            <button
                              type="button"
                              className="group-add-member-button"
                              onClick={() => onAssignUser(group.id)}
                              disabled={!assignmentDraft.userId}
                            >
                              Gruba ekle
                            </button>
                          </div>
                        </section>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

export default GroupTable;

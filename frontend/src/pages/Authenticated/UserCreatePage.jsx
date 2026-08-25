import PaginationControls from "../../components/PaginationControls";
import UserTable from "../../components/UserTable";

function UserCreatePage({
  groupOptions,
  onNavigate,
  users,
  loadingUsers,
  userPagination,
  onUserPageChange,
  openMembershipEditor,
  handleToggleActive,
  membershipEditor,
  closeMembershipEditor,
  toggleMembership,
  updateMembershipRole,
  handleSaveMemberships,
  savingMemberships,
  error,
  creationMessage,
}) {
  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Kullanıcı erişimi</p>
          <h2>Kullanıcılar</h2>
        </div>
      </div>

      <div className="panel-shell">
        <div className="admin-form">
          <div className="form-header-row">
            <div>
              <p className="eyebrow">Güvenli hesap açılışı</p>
              <h3>Kullanıcılar kayıt talebiyle oluşturulur</h3>
              <p className="form-hint">
                Yönetici kullanıcı adına parola belirlemez. Başvuruyu inceleyip
                rol ve grup üyeliklerini seçtikten sonra 24 saatlik aktivasyon
                bağlantısını kullanıcının gerçek e-posta adresine gönderir.
              </p>
            </div>
          </div>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          {creationMessage && (
            <p className="success-message" role="status">
              {creationMessage}
            </p>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigate("/registration-requests")}
            >
              Kayıt taleplerini aç
            </button>
          </div>
        </div>
      </div>

      <div className="panel-shell">
        <div className="list-heading-with-tabs">
          <div>
            <p className="eyebrow">Yönetim</p>
            <h3>Kullanıcı listesi</h3>
            <p className="user-list-description">
              Kullanıcı durumunu değiştirmek için Aktif veya Pasif etiketine tıklayın.
            </p>
          </div>
          <span className="info-chip">{Number(userPagination?.total) || 0} kullanıcı</span>
        </div>

        <UserTable
          users={users}
          loading={loadingUsers}
          onToggleActive={handleToggleActive}
          onEditMemberships={openMembershipEditor}
        />

        <PaginationControls
          page={userPagination?.page}
          totalPages={userPagination?.totalPages}
          total={userPagination?.total}
          disabled={loadingUsers}
          label="Kullanıcı sayfalama"
          onPageChange={onUserPageChange}
        />
      </div>

      {membershipEditor.open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="membership-dialog-title">
          <form className="confirm-card membership-card" onSubmit={handleSaveMemberships}>
            <p className="eyebrow">Üyelik yönetimi</p>
            <h3 id="membership-dialog-title">{membershipEditor.userName} için gruplar</h3>
            <p>
              Kullanıcının dahil olacağı grupları ve her gruptaki rolünü seçin. Bütün seçimleri kaldırmak da mümkündür.
            </p>

            <div className="membership-list">
              {groupOptions.length === 0 ? (
                <p>Önce en az bir grup oluşturmalısınız.</p>
              ) : (
                groupOptions.map((group) => {
                  const membership = membershipEditor.memberships.find(
                    (item) => Number(item.grupId) === Number(group.id),
                  );

                  return (
                    <div className="membership-row" key={group.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(membership)}
                          onChange={() => toggleMembership(group.id)}
                        />
                        <span>{group.name}</span>
                      </label>
                      <select
                        aria-label={`${group.name} grup rolü`}
                        value={membership?.grupRolu || "grup_uyesi"}
                        onChange={(event) => updateMembershipRole(group.id, event.target.value)}
                        disabled={!membership}
                      >
                        <option value="grup_uyesi">Grup üyesi</option>
                        <option value="grup_yoneticisi">Grup yöneticisi</option>
                      </select>
                    </div>
                  );
                })
              )}
            </div>

            <div className="confirm-actions">
              <button type="submit" className="btn-primary" disabled={savingMemberships}>
                {savingMemberships ? "Kaydediliyor..." : "Üyelikleri kaydet"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={closeMembershipEditor}
                disabled={savingMemberships}
              >
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

export default UserCreatePage;

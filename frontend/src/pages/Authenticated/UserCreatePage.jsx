import PaginationControls from "../../components/PaginationControls";

function UserCreatePage({
  user,
  userForm,
  setUserForm,
  groupOptions,
  toggleGroupSelection,
  creatingUser,
  handleCreateUser,
  users,
  archivedUsers,
  loadingUsers,
  loadingArchivedUsers,
  userPagination,
  archivedUserPagination,
  onUserPageChange,
  onArchivedUserPageChange,
  userListMode,
  setUserListMode,
  openMembershipEditor,
  handleToggleActive,
  openDeleteConfirmation,
  handleRestoreUser,
  restoringUserId,
  deleteConfirmation,
  closeDeleteConfirmation,
  confirmDeleteUser,
  membershipEditor,
  closeMembershipEditor,
  toggleMembership,
  updateMembershipRole,
  handleSaveMemberships,
  savingMemberships,
  error,
  creationMessage,
}) {
  const displayedUsers = userListMode === "archived" ? archivedUsers : users;
  const isUserListLoading = userListMode === "archived" ? loadingArchivedUsers : loadingUsers;
  const displayedPagination = userListMode === "archived"
    ? archivedUserPagination
    : userPagination;
  const changeDisplayedPage = userListMode === "archived"
    ? onArchivedUserPageChange
    : onUserPageChange;

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Kullanıcı erişimi</p>
          <h2>Kullanıcılar</h2>
        </div>
      </div>

      <div className="panel-shell">
        <form className="admin-form" onSubmit={handleCreateUser}>
          <div className="form-header-row">
            <div>
              <p className="eyebrow">Yönetici</p>
              <h3>Yeni kullanıcı ekle</h3>
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

          <div className="form-grid two-column">
            <label className="field-block">
              <span>Ad soyad</span>
              <input
                value={userForm.adSoyad}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    adSoyad: event.target.value,
                  }))
                }
                maxLength={150}
                required
              />
            </label>

            <label className="field-block">
              <span>E-posta</span>
              <input
                type="email"
                value={userForm.email}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                maxLength={150}
                required
              />
            </label>

            <label className="field-block full-width">
              <span>Şifre</span>
              <input
                type="password"
                value={userForm.password}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                minLength={8}
                maxLength={256}
                required
              />
            </label>

            <label className="field-block">
              <span>Kayıt tipi</span>
              <select
                value={userForm.roleMode}
                onChange={(event) =>
                  setUserForm((current) => ({
                    ...current,
                    roleMode: event.target.value,
                  }))
                }
              >
                <option value="kullanici">Standart kullanıcı</option>
                <option value="grup_uyesi">Grup üyesi</option>
                <option value="grup_yoneticisi">Grup yöneticisi</option>
                <option value="yonetici">Yönetici</option>
              </select>
            </label>
          </div>

          {(userForm.roleMode === "grup_uyesi" || userForm.roleMode === "grup_yoneticisi") && (
            <div className="field-block full-width">
              <span>Grup seçimi</span>
              <div className="group-toggle" role="group" aria-label="Grup seçimi">
                {groupOptions.map((group) => {
                  const isSelected = Array.isArray(userForm.grupIds)
                    ? userForm.grupIds.map(String).includes(String(group.id))
                    : false;

                  return (
                    <label
                      key={group.id}
                      className={`group-chip ${isSelected ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        value={group.id}
                        checked={isSelected}
                        onChange={() => toggleGroupSelection(group.id)}
                      />
                      <span>{group.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="form-hint">
                Birden fazla grup seçebilirsiniz. Kullanıcıya hangi gruplar üzerinden erişim verileceğini buradan belirleyin.
              </p>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={creatingUser}>
              {creatingUser ? "Oluşturuluyor..." : "Kullanıcı oluştur"}
            </button>
          </div>
        </form>
      </div>

      <div className="panel-shell">
        <div className="list-heading-with-tabs">
          <div>
            <p className="eyebrow">Yönetim</p>
            <h3>Kullanıcı listesi</h3>
          </div>

          <div className="view-tabs" aria-label="Kullanıcı görünümü">
            <button
              type="button"
              className={userListMode === "active" ? "active" : ""}
              onClick={() => setUserListMode("active")}
            >
              Aktif ({Number(userPagination?.total) || 0})
            </button>
            <button
              type="button"
              className={userListMode === "archived" ? "active" : ""}
              onClick={() => setUserListMode("archived")}
            >
              Arşiv ({Number(archivedUserPagination?.total) || 0})
            </button>
          </div>
        </div>

        {userListMode === "archived" && (
          <p className="form-hint">
            Geri yüklenen kullanıcı güvenlik için pasif açılır. Aktif sekmesinden ayrıca aktifleştirebilirsiniz.
          </p>
        )}

        {isUserListLoading ? (
          <p className="task-empty-state">Yükleniyor...</p>
        ) : displayedUsers.length === 0 ? (
          <p className="task-empty-state">
            {userListMode === "archived"
              ? "Arşivlenmiş kullanıcı bulunmuyor."
              : "Henüz kullanıcı oluşturulmadı."}
          </p>
        ) : (
          <div className="user-card-grid">
            {displayedUsers.map((item) => (
              <article key={item.id} className="user-card-mini">
                <div className="user-card-top">
                  <div>
                    <h4>{item.adSoyad}</h4>
                    <p>{item.email}</p>
                  </div>

                  <div className="user-meta-inline">
                    <span className="soft-pill">
                      {item.rol === "yonetici"
                        ? "Yönetici"
                        : item.rol === "kullanici"
                          ? "Kullanıcı"
                          : item.rol}
                    </span>
                  </div>
                </div>

                <div className="user-badge-row">
                  {item.groups && item.groups.length > 0 ? (
                    item.groups.map((group, index) => (
                      <span key={`${group.grupId ?? index}`} className="soft-badge">
                        {group.grupAdi} ({group.grupRolu})
                      </span>
                    ))
                  ) : (
                    <span className="soft-muted">Grup ataması yok</span>
                  )}

                  {userListMode === "archived" && (
                    <span className="archive-chip">
                      Arşiv: {new Date(item.archivedAt).toLocaleString("tr-TR")}
                    </span>
                  )}
                </div>

                <div className="user-card-actions">
                  {userListMode === "active" ? (
                    <>
                      <button
                        type="button"
                        className={item.aktifMi ? "state-button active" : "state-button inactive"}
                        onClick={() => handleToggleActive(item.id, !item.aktifMi)}
                        aria-pressed={item.aktifMi}
                        title={item.aktifMi ? "Kullanıcı aktif - tıklayarak pasifleştir" : "Kullanıcı pasif - tıklayarak aktifleştir"}
                      >
                        {item.aktifMi ? "Aktif" : "Pasif"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openMembershipEditor(item)}
                      >
                        Grupları düzenle
                      </button>

                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => openDeleteConfirmation(item.id, item.adSoyad)}
                      >
                        Arşivle
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="restore-button"
                      onClick={() => handleRestoreUser(item.id)}
                      disabled={restoringUserId === item.id}
                    >
                      {restoringUserId === item.id ? "Geri yükleniyor..." : "Geri yükle"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        <PaginationControls
          page={displayedPagination?.page}
          totalPages={displayedPagination?.totalPages}
          total={displayedPagination?.total}
          disabled={isUserListLoading}
          label={`${userListMode === "archived" ? "Arşivlenmiş" : "Aktif"} kullanıcı sayfalama`}
          onPageChange={changeDisplayedPage}
        />
      </div>

      {deleteConfirmation.open && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="confirm-card">
            <p className="eyebrow">Onay gerektiriyor</p>
            <h3 id="delete-dialog-title">Kullanıcıyı arşivlemek üzeresiniz</h3>
            <p>
              <strong>{deleteConfirmation.userName}</strong> adlı kullanıcıyı arşivlemek istediğinizden emin misiniz? Geçmiş kayıtları korunacaktır.
            </p>
            <div className="confirm-actions">
              <button type="button" className="danger-button" onClick={confirmDeleteUser}>Evet, arşivle</button>
              <button type="button" className="secondary-button" onClick={closeDeleteConfirmation}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}

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

import { EmptyState, LoadingState } from "./ui/StateDisplay";
import TableSearch from "./TableSearch";

const roleLabel = (role) => {
  if (role === "admin") return "Admin";
  if (role === "yonetici") return "Yönetici";
  return "Kullanıcı";
};

const groupRoleLabel = (role) =>
  role === "grup_yoneticisi" ? "Yönetici" : "Üye";

function UserTable({ users, loading, searchTerm, onSearchChange, onToggleActive, onEditMemberships }) {
  if (loading) {
    return <LoadingState>Kullanıcılar yükleniyor...</LoadingState>;
  }

  if (users.length === 0 && !searchTerm) {
    return <EmptyState>Henüz kullanıcı oluşturulmadı.</EmptyState>;
  }

  return (
    <div className="table-list-with-search">
      <TableSearch
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Kullanıcılarda ara..."
        label="Kullanıcılarda ara"
        resultCount={users.length}
      />
      {users.length === 0 ? (
        <EmptyState>Aramanızla eşleşen kullanıcı bulunamadı.</EmptyState>
      ) : (
      <div className="user-table-shell">
      <table className="user-table">
        <thead>
          <tr>
            <th scope="col">Kullanıcı adı</th>
            <th scope="col">E-posta</th>
            <th scope="col">Sistem rolü</th>
            <th scope="col">Grup / gruplar</th>
            <th scope="col">Durum</th>
            <th scope="col" className="user-table-actions-heading">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {users.map((item) => {
            const activationPending = Boolean(item.aktivasyonBekliyorMu);
            const statusLabel = activationPending
              ? "Aktivasyon bekliyor"
              : item.aktifMi
                ? "Aktif"
                : "Pasif";

            return (
              <tr key={item.id}>
                <td data-label="Kullanıcı adı">
                  <div className="user-name-cell">
                    <span className="user-avatar" aria-hidden="true">
                      {(item.adSoyad || "K").charAt(0).toLocaleUpperCase("tr-TR")}
                    </span>
                    <strong>{item.adSoyad}</strong>
                  </div>
                </td>
                <td data-label="E-posta">
                  <span className="user-email-cell">{item.email}</span>
                </td>
                <td data-label="Sistem rolü">
                  <span className={`user-role-badge role-${item.rol || "kullanici"}`}>
                    {roleLabel(item.rol)}
                  </span>
                </td>
                <td data-label="Grup / gruplar">
                  <div className="user-group-list">
                    {item.groups?.length > 0 ? (
                      item.groups.map((group, index) => (
                        <span className="user-group-badge" key={group.grupId ?? `${item.id}-${index}`}>
                          {group.grupAdi}
                          <small>{groupRoleLabel(group.grupRolu)}</small>
                        </span>
                      ))
                    ) : (
                      <span className="user-no-group">Grup ataması yok</span>
                    )}
                  </div>
                </td>
                <td data-label="Durum">
                  <button
                    type="button"
                    className={`user-status-badge ${
                      activationPending ? "pending" : item.aktifMi ? "active" : "inactive"
                    }`}
                    onClick={() => onToggleActive(item.id, !item.aktifMi)}
                    disabled={activationPending}
                    aria-pressed={item.aktifMi}
                    title={
                      activationPending
                        ? "Aktivasyon tamamlanmadan durum değiştirilemez"
                        : item.aktifMi
                          ? "Pasife geçirmek için tıklayın"
                          : "Aktife geçirmek için tıklayın"
                    }
                  >
                    <span aria-hidden="true" />
                    {statusLabel}
                  </button>
                </td>
                <td data-label="İşlemler" className="user-table-actions">
                  <button
                    type="button"
                    className="user-membership-action"
                    onClick={() => onEditMemberships(item)}
                  >
                    Grupları düzenle
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

export default UserTable;

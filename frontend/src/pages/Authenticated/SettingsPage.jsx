import ActivityLogPanel from "../../components/ActivityLogPanel";
import TagManagement from "../../components/TagManagement";
import TaskTypeManagement from "../../components/TaskTypeManagement";

const SYSTEM_ROLE_LABELS = {
  admin: "Admin",
  yonetici: "Yönetici",
  kullanici: "Kullanıcı",
};

const GROUP_ROLE_LABELS = {
  grup_yoneticisi: "Grup yöneticisi",
  grup_uyesi: "Grup üyesi",
  yonetici: "Grup yöneticisi",
  uye: "Grup üyesi",
};

function SettingsPage({ user }) {
  const groups = Array.isArray(user?.groups)
    ? user.groups
    : [];
  const canViewActivity = ["admin", "yonetici"].includes(user?.rol);

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h2>Hesap ayarları</h2>
        </div>
      </div>

      <div className="feature-card">
        <p>
          <strong>Kullanıcı:</strong>{" "}
          {user?.adSoyad || user?.email || "Kullanıcı"}
        </p>

        <p>
          <strong>Sistem rolü:</strong>{" "}
          {SYSTEM_ROLE_LABELS[user?.rol] ||
            user?.rol ||
            "Belirtilmedi"}
        </p>

        <div>
          <strong>Grup rolleri:</strong>

          {groups.length === 0 ? (
            <p>Grup üyeliği bulunmuyor.</p>
          ) : (
            <ul>
              {groups.map((group) => (
                <li key={group.grupId}>
                  {group.grupAdi} —{" "}
                  {GROUP_ROLE_LABELS[group.grupRolu] ||
                    group.grupRolu}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p>
          Parola değiştirme, profil düzenleme ve güvenlik
          tercihleri daha sonraki geliştirme aşamasında
          eklenecektir.
        </p>
      </div>

      <TaskTypeManagement
        enabled={["admin", "yonetici"].includes(user?.rol)}
      />

      <TagManagement
        enabled={["admin", "yonetici"].includes(user?.rol)}
      />

      <ActivityLogPanel enabled={canViewActivity} />
    </section>
  );
}

export default SettingsPage;

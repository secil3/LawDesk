import ActivityLogPanel from "../../components/ActivityLogPanel";

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

function SettingsPage({ user, theme, onThemeChange }) {
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

      <section className="settings-theme-card" aria-labelledby="theme-settings-title">
        <div className="settings-theme-copy">
          <p className="eyebrow">Görünüm</p>
          <h3 id="theme-settings-title">Tema tercihi</h3>
          <p>
            Uygulamanın görünümünü çalışma ortamınıza göre ayarlayın. Tercihiniz
            bu tarayıcıda saklanır.
          </p>
        </div>

        <div className="theme-choice-group" role="group" aria-label="Tema seçimi">
          <button
            type="button"
            className={theme === "light" ? "theme-choice active" : "theme-choice"}
            onClick={() => onThemeChange("light")}
            aria-pressed={theme === "light"}
          >
            <span className="theme-preview light" aria-hidden="true">
              <span />
              <span />
            </span>
            <span>
              <strong>Açık tema</strong>
              <small>Aydınlık çalışma alanı</small>
            </span>
          </button>

          <button
            type="button"
            className={theme === "dark" ? "theme-choice active" : "theme-choice"}
            onClick={() => onThemeChange("dark")}
            aria-pressed={theme === "dark"}
          >
            <span className="theme-preview dark" aria-hidden="true">
              <span />
              <span />
            </span>
            <span>
              <strong>Koyu tema</strong>
              <small>Düşük ışık için koyu görünüm</small>
            </span>
          </button>
        </div>
      </section>

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

      <ActivityLogPanel enabled={canViewActivity} />
    </section>
  );
}

export default SettingsPage;

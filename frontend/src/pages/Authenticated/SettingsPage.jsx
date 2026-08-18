function SettingsPage({ user }) {
  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h2>Hesap ayarları</h2>
        </div>
      </div>

      <div className="feature-card settings-card">
        <p><strong>Kullanıcı:</strong> {user?.adSoyad || user?.email || "Kullanıcı"}</p>
        <p><strong>Rol:</strong> {user?.rol || "-"}</p>
        <p>
          Sistem ayarları geliştirme aşamasında. Bu bölüm daha sonra şifre
          değiştirme, profil düzenleme ve güvenlik tercihi alanlarını taşıyacaktır.
        </p>
      </div>
    </section>
  );
}

export default SettingsPage;

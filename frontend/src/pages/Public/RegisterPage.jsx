function RegisterPage({ onNavigate }) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <div>
            <p className="brand-name">LawDesk</p>
            <p className="brand-subtitle">Yeni hesap oluştur</p>
          </div>
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Kayıt ol</p>
          <h1 id="register-title">Hesabınızı oluşturun</h1>
          <p>Yeni kullanıcı kaydı için sistem yöneticisiyle iletişime geçebilirsiniz.</p>
        </div>

        <div className="feature-card register-card">
          <p>
            Bu uygulama için kayıt işlemi mevcut sistem yöneticisi tarafından yönetilir.
            Lütfen giriş ekranından mevcut hesabınızla devam edin.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => onNavigate("/login")}>Giriş Sayfasına Dön</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("/")}>Ana Sayfa</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;

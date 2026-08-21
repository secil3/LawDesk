function LoginPage({
  email,
  setEmail,
  password,
  setPassword,
  error,
  submitting,
  onLogin,
  onNavigate,
}) {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <div>
            <p className="brand-name">LawDesk</p>
            <p className="brand-subtitle">Görev Yönetim Sistemi</p>
          </div>
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Güvenli giriş</p>
          <h1 id="login-title">Hesabınıza giriş yapın</h1>
          <p>Devam etmek için hesabınızı kullanın.</p>
        </div>

        <form className="login-form" onSubmit={onLogin}>
          <label htmlFor="email">E-posta</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={150}
            required
          />

          <label htmlFor="password">Şifre</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={256}
            required
          />

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Giriş yapılıyor..." : "Giriş yap"}
          </button>
        </form>

        <div className="auth-footer-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate("/")}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;

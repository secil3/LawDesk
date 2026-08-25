import { useState } from "react";

import AuthScreen from "../../components/AuthScreen";

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
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <AuthScreen
      eyebrow="Güvenli giriş"
      title="Hesabınıza giriş yapın"
      description="LawDesk çalışma alanınıza güvenli şekilde devam edin."
      contextTitle="Operasyonunuz tek, kontrollü bir çalışma alanında."
      contextText="Görevlerinize, ekiplerinize ve güncel kayıtlara yetkiniz kapsamında erişin."
      titleId="login-title"
      footer={
        <>
          <span>Henüz hesabınız yok mu?</span>
          <button type="button" onClick={() => onNavigate("/register")}>Kayıt talebi oluştur</button>
          <button type="button" className="auth-home-link" onClick={() => onNavigate("/")}>Ana sayfa</button>
        </>
      }
    >
      <form className="auth-modern-form" onSubmit={onLogin}>
        <label className="auth-field" htmlFor="email">
          <span>E-posta</span>
          <div className="auth-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ornek@sirket.com"
              maxLength={150}
              required
            />
          </div>
        </label>

        <label className="auth-field" htmlFor="password">
          <span>Şifre</span>
          <div className="auth-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <input
              id="password"
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Şifrenizi girin"
              maxLength={256}
              required
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setPasswordVisible((current) => !current)}
              aria-label={passwordVisible ? "Şifreyi gizle" : "Şifreyi göster"}
              aria-pressed={passwordVisible}
              title={passwordVisible ? "Şifreyi gizle" : "Şifreyi göster"}
            >
              {passwordVisible ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                  <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.5 0 9 8 9 8a16.8 16.8 0 0 1-2.1 3.2" />
                  <path d="M6.6 6.6C4.3 8.1 3 12 3 12s3.5 8 9 8a9.8 9.8 0 0 0 4.1-.9" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12s3.5-8 9-8 9 8 9 8-3.5 8-9 8-9-8-9-8" />
                  <circle cx="12" cy="12" r="2.5" />
                </svg>
              )}
            </button>
          </div>
        </label>

        {error && (
          <p className="auth-feedback error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </p>
        )}

        <button className="auth-submit-button" type="submit" disabled={submitting}>
          {submitting ? "Giriş yapılıyor..." : "Giriş yap"}
          {!submitting && <span aria-hidden="true">→</span>}
        </button>
      </form>
    </AuthScreen>
  );
}

export default LoginPage;

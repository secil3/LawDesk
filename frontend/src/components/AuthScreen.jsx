function AuthScreen({
  eyebrow,
  title,
  description,
  contextTitle,
  contextText,
  children,
  footer,
  titleId,
}) {
  return (
    <main className="auth-page auth-experience">
      <section className="auth-shell" aria-labelledby={titleId}>
        <aside className="auth-context-panel">
          <div className="auth-context-brand">
            <span className="brand-mark" aria-hidden="true">L</span>
            <div>
              <strong>LawDesk</strong>
              <small>Görev Yönetim Sistemi</small>
            </div>
          </div>

          <div className="auth-context-copy">
            <span className="auth-context-kicker">Güvenli çalışma alanı</span>
            <h2>{contextTitle}</h2>
            <p>{contextText}</p>
          </div>

          <div className="auth-context-points">
            <span><i aria-hidden="true">✓</i> Rol bazlı erişim</span>
            <span><i aria-hidden="true">✓</i> İzlenebilir görev akışı</span>
            <span><i aria-hidden="true">✓</i> Merkezi ekip yönetimi</span>
          </div>

          <div className="auth-context-status">
            <span aria-hidden="true" />
            <div>
              <strong>LawDesk çalışma alanı</strong>
              <small>Kimlik doğrulamalı güvenli erişim</small>
            </div>
          </div>
        </aside>

        <div className="auth-form-panel">
          <header className="auth-modern-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id={titleId}>{title}</h1>
            <p>{description}</p>
          </header>

          {children}

          <footer className="auth-modern-footer">{footer}</footer>
        </div>
      </section>
    </main>
  );
}

export default AuthScreen;

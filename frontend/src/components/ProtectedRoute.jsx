function ProtectedRoute({ user, checkingSession, children, onNavigate, redirectTo = "/login" }) {
  if (checkingSession) {
    return (
      <main className="auth-page">
        <section className="auth-card status-card">
          <div className="spinner" aria-hidden="true" />
          <p>Oturum kontrol ediliyor...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    if (typeof onNavigate === "function") {
      onNavigate(redirectTo);
    }
    return null;
  }

  return children;
}

export default ProtectedRoute;

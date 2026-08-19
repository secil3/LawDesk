function ProtectedRoute({ user, checkingSession, children }) {
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
    return null;
  }

  return children;
}

export default ProtectedRoute;
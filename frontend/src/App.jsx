import { useEffect, useState } from "react";

const readResponse = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "İşlem tamamlanamadı");
  }

  return data;
};

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isActive = true;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });

        if (response.status === 401) {
          return;
        }

        const data = await readResponse(response);

        if (isActive) {
          setUser(data.user);
        }
      } catch (requestError) {
        if (isActive) {
          setError(
            requestError.message || "Sunucuya bağlanılamadı",
          );
        }
      } finally {
        if (isActive) {
          setCheckingSession(false);
        }
      }
    };

    checkSession();

    return () => {
      isActive = false;
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await readResponse(response);

      setUser(data.user);
      setPassword("");
    } catch (requestError) {
      setError(
        requestError.message || "Giriş işlemi tamamlanamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      await readResponse(response);

      setUser(null);
      setEmail("");
      setPassword("");
    } catch (requestError) {
      setError(
        requestError.message || "Çıkış işlemi tamamlanamadı",
      );
    } finally {
      setSubmitting(false);
    }
  };

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

  if (user) {
    return (
      <main className="auth-page">
        <section className="auth-card user-card">
          <p className="eyebrow success">Oturum açık</p>
          <h1>Hoş geldiniz, {user.adSoyad}</h1>
          <p>LawDesk giriş sistemi başarıyla çalışıyor.</p>

          <dl className="user-details">
            <div>
              <dt>E-posta</dt>
              <dd>{user.email}</dd>
            </div>

            <div>
              <dt>Sistem rolü</dt>
              <dd>{user.rol}</dd>
            </div>
          </dl>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={submitting}
          >
            {submitting
              ? "Çıkış yapılıyor..."
              : "Çıkış yap"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section
        className="auth-card"
        aria-labelledby="login-title"
      >
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>

          <div>
            <p className="brand-name">LawDesk</p>
            <p className="brand-subtitle">
              Görev Yönetim Sistemi
            </p>
          </div>
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Güvenli giriş</p>
          <h1 id="login-title">
            Hesabınıza giriş yapın
          </h1>
          <p>
            Devam etmek için kurum hesabınızı kullanın.
          </p>
        </div>

        <form
          className="login-form"
          onSubmit={handleLogin}
        >
          <label htmlFor="email">E-posta</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
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
            onChange={(event) =>
              setPassword(event.target.value)
            }
            maxLength={256}
            required
          />

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting
              ? "Giriş yapılıyor..."
              : "Giriş yap"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
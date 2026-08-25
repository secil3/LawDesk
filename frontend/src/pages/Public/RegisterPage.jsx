import { useState } from "react";

import { readResponse } from "../../api";

function RegisterPage({ onNavigate }) {
  const [form, setForm] = useState({ adSoyad: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submitRegistration = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/registration-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adSoyad: form.adSoyad.trim(),
          email: form.email.trim(),
        }),
      });
      const data = await readResponse(response);

      setMessage(
        data.message ||
          "Başvurunuz alınmıştır. İnceleme sonucunda e-posta gönderilecektir.",
      );
      setForm({ adSoyad: "", email: "" });
    } catch (requestError) {
      setError(
        requestError.message ||
          "Başvuru şu anda alınamadı. Lütfen daha sonra tekrar deneyin.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true">L</span>
          <div>
            <p className="brand-name">LawDesk</p>
            <p className="brand-subtitle">Kayıt talebi</p>
          </div>
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Kayıt ol</p>
          <h1 id="register-title">Hesap başvurusu oluşturun</h1>
          <p>
            Gerçek adınızı ve erişebildiğiniz e-posta adresinizi girin.
            Hesabınız yetkili onayından sonra aktifleştirilecektir.
          </p>
        </div>

        <form className="login-form" onSubmit={submitRegistration}>
          <label htmlFor="registration-name">Ad soyad</label>
          <input
            id="registration-name"
            autoComplete="name"
            value={form.adSoyad}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                adSoyad: event.target.value,
              }))
            }
            minLength={2}
            maxLength={150}
            required
          />

          <label htmlFor="registration-email">E-posta</label>
          <input
            id="registration-email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                email: event.target.value,
              }))
            }
            maxLength={150}
            required
          />

          {message && (
            <p className="success-message" role="status">{message}</p>
          )}
          {error && (
            <p className="error-message" role="alert">{error}</p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Başvuru gönderiliyor..." : "Başvuruyu gönder"}
          </button>
        </form>

        <div className="auth-footer-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate("/login")}
          >
            Giriş Sayfasına Dön
          </button>
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;

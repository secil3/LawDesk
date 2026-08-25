import { useState } from "react";

import { readResponse } from "../../api";
import AuthScreen from "../../components/AuthScreen";

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
    <AuthScreen
      eyebrow="Hesap başvurusu"
      title="LawDesk'e kayıt talebi oluşturun"
      description="Yetkili incelemesi için iletişim bilgilerinizi paylaşın."
      contextTitle="Doğrulanmış kullanıcılarla güvenli ekip erişimi."
      contextText="Başvurunuz incelendikten sonra hesabınızı güvenli aktivasyon bağlantısıyla tamamlayın."
      titleId="register-title"
      footer={
        <>
          <span>Zaten hesabınız var mı?</span>
          <button type="button" onClick={() => onNavigate("/login")}>Giriş yap</button>
          <button type="button" className="auth-home-link" onClick={() => onNavigate("/")}>Ana sayfa</button>
        </>
      }
    >
      <form className="auth-modern-form" onSubmit={submitRegistration}>
        <label className="auth-field" htmlFor="registration-name">
          <span>Ad soyad</span>
          <div className="auth-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0 1 16 0" />
            </svg>
            <input
              id="registration-name"
              autoComplete="name"
              value={form.adSoyad}
              onChange={(event) =>
                setForm((current) => ({ ...current, adSoyad: event.target.value }))
              }
              placeholder="Adınız ve soyadınız"
              minLength={2}
              maxLength={150}
              required
            />
          </div>
        </label>

        <label className="auth-field" htmlFor="registration-email">
          <span>E-posta</span>
          <div className="auth-input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4z" />
              <path d="m4 7 8 6 8-6" />
            </svg>
            <input
              id="registration-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="ornek@sirket.com"
              maxLength={150}
              required
            />
          </div>
        </label>

        <p className="auth-form-note">
          Başvurunuz onaylandığında aktivasyon bağlantısı bu adrese gönderilir.
        </p>

        {message && (
          <p className="auth-feedback success" role="status">
            <span aria-hidden="true">✓</span>
            {message}
          </p>
        )}
        {error && (
          <p className="auth-feedback error" role="alert">
            <span aria-hidden="true">!</span>
            {error}
          </p>
        )}

        <button className="auth-submit-button" type="submit" disabled={submitting}>
          {submitting ? "Başvuru gönderiliyor..." : "Başvuruyu gönder"}
          {!submitting && <span aria-hidden="true">→</span>}
        </button>
      </form>
    </AuthScreen>
  );
}

export default RegisterPage;

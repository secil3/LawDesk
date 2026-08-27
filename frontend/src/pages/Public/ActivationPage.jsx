import { useEffect, useState } from "react";

import { readResponse } from "../../api";
import BrandLogo from "../../components/BrandLogo";

function ActivationPage({ onNavigate }) {
  const [token] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("token") || "";
  });
  const [validation, setValidation] = useState({
    loading: true,
    valid: false,
    email: "",
  });
  const [form, setForm] = useState({
    password: "",
    passwordConfirmation: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState({}, "", "/activate");
    }

    const validate = async () => {
      if (!token) {
        setValidation({ loading: false, valid: false, email: "" });
        setError("Aktivasyon bağlantısı geçersiz veya süresi dolmuş");
        return;
      }

      try {
        const response = await fetch(
          "/api/registration-requests/activation/validate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          },
        );
        const data = await readResponse(response);

        if (active) {
          setValidation({
            loading: false,
            valid: Boolean(data.valid),
            email: data.email || "",
          });
        }
      } catch (requestError) {
        if (active) {
          setValidation({ loading: false, valid: false, email: "" });
          setError(
            requestError.message ||
              "Aktivasyon bağlantısı geçersiz veya süresi dolmuş",
          );
        }
      }
    };

    validate();
    return () => {
      active = false;
    };
  }, [token]);

  const activate = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (form.password !== form.passwordConfirmation) {
      setError("Parolalar eşleşmiyor");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/registration-requests/activation/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, ...form }),
        },
      );
      const data = await readResponse(response);

      setMessage(data.message || "Hesabınız aktifleştirildi");
      setValidation((current) => ({ ...current, valid: false }));
      setForm({ password: "", passwordConfirmation: "" });
    } catch (requestError) {
      setError(requestError.message || "Hesap aktifleştirilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="activation-title">
        <header className="brand">
          <BrandLogo subtitle="Hesap aktivasyonu" />
        </header>

        <div className="auth-heading">
          <p className="eyebrow">Aktivasyon</p>
          <h1 id="activation-title">Parolanızı belirleyin</h1>
          {validation.email && <p>{validation.email} adresi doğrulanacak.</p>}
        </div>

        {validation.loading ? (
          <div className="status-card">
            <div className="spinner" aria-hidden="true" />
            <p>Aktivasyon bağlantısı doğrulanıyor...</p>
          </div>
        ) : validation.valid ? (
          <form className="login-form" onSubmit={activate}>
            <label htmlFor="activation-password">Parola</label>
            <input
              id="activation-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              minLength={12}
              maxLength={256}
              required
            />

            <label htmlFor="activation-password-confirmation">
              Parola tekrar
            </label>
            <input
              id="activation-password-confirmation"
              type="password"
              autoComplete="new-password"
              value={form.passwordConfirmation}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  passwordConfirmation: event.target.value,
                }))
              }
              minLength={12}
              maxLength={256}
              required
            />

            {error && <p className="error-message" role="alert">{error}</p>}

            <button type="submit" disabled={submitting}>
              {submitting
                ? "Hesap aktifleştiriliyor..."
                : "Parolayı kaydet ve aktifleştir"}
            </button>
          </form>
        ) : (
          <div className="feature-card register-card">
            {message ? (
              <p className="success-message" role="status">{message}</p>
            ) : (
              <p className="error-message" role="alert">
                {error || "Aktivasyon bağlantısı kullanılamıyor"}
              </p>
            )}
          </div>
        )}

        <div className="auth-footer-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate("/login")}
          >
            Giriş Sayfasına Git
          </button>
        </div>
      </section>
    </main>
  );
}

export default ActivationPage;

function HomePage({ onNavigate }) {
  const features = [
    { title: "Görev Takibi", text: "Görevleri oluşturun, atayın ve takip edin." },
    { title: "Grup Yönetimi", text: "Ekipler oluşturun ve yetkileri grup bazında yönetin." },
    { title: "Öncelik & Durum", text: "Net öncelik ve durum takibi ile iş akışını hızlandırın." },
    { title: "Güvenli Oturum", text: "Güçlü oturum kontrolü ve yetkilendirme." },
  ];

  const steps = [
    { title: "Hesap yönetin", desc: "Erişimleri ve ekibinizi tek bir panelden yönetin." },
    { title: "Görev oluştur & yönet", desc: "Görevler oluşturun, atayın ve önceliklendirin." },
    { title: "Süreci takip et", desc: "Görevlerin ilerleyişini izleyin ve iş akışınızı yönetin." },
  ];

  return (
    <section className="landing-page page-shell">
      <header className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">HUKUKİ SÜREÇLER İÇİN GÜVENLİ İŞ AKIŞI</p>
          <h1>Hukuki süreçlerinizi daha düzenli yönetin.</h1>
          <p>
            Görevlerinizi, ekiplerinizi ve iş akışınızı tek bir platformdan kolayca yönetin.
          </p>

          <div className="hero-actions">
            <button type="button" onClick={() => onNavigate("/login")}>Giriş Yap</button>
          </div>
        </div>

        <div className="hero-mockup" aria-hidden="true">
          <div className="mockup-card">
            <div className="mockup-header">
              <div className="mockup-dot" />
              <div className="mockup-dot" />
              <div className="mockup-dot" />
            </div>
            <div className="mockup-body">
              <div className="mockup-row">
                <div className="mockup-block" />
                <div className="mockup-block small" />
              </div>
              <div className="mockup-graph" />
              <div className="mockup-list">
                <div className="mockup-item" />
                <div className="mockup-item" />
                <div className="mockup-item" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="feature-section">
        <div className="section-header">
          <p className="eyebrow">Özellikler</p>
          <h2>LawDesk'in temel yetenekleri</h2>
        </div>
        <div className="feature-grid">
          {features.map((f) => (
            <article key={f.title} className="feature-card">
              <div className="feature-icon" />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section">
        <div className="section-header">
          <p className="eyebrow">Nasıl çalışır</p>
          <h2>Üç kolay adımda kullanmaya başlayın</h2>
        </div>
        <div className="steps-grid">
          {steps.map((s, idx) => (
            <article key={s.title} className="step-card">
              <div className="step-number">{idx + 1}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h3>LawDesk ile iş akışınızı daha düzenli hale getirin.</h3>
        <div className="hero-actions">
          <button type="button" onClick={() => onNavigate("/login")}>Giriş Yap</button>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <strong>LawDesk</strong>
            <p>Görevlerinizi ve ekiplerinizi tek bir yerden yönetin.</p>
          </div>

          <nav className="footer-nav">
            <button type="button" onClick={() => onNavigate("/")}>Ana Sayfa</button>
            <button type="button" onClick={() => onNavigate("/features")}>Özellikler</button>
            <button type="button" onClick={() => onNavigate("/login")}>Giriş Yap</button>
          </nav>
        </div>
      </footer>
    </section>
  );
}

export default HomePage;

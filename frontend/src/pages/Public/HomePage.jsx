import BrandLogo from "../../components/BrandLogo";

function HomePage({ onNavigate }) {
  return (
    <section className="product-landing">
      <header className="product-hero">
        <div className="product-hero-copy">
          <BrandLogo compact className="product-hero-signature" />
          <span className="product-kicker">
            <span aria-hidden="true" />
            Hukuk ve uyum operasyonları
          </span>
          <h1>İşlerinizi görünür, kontrollü ve izlenebilir yönetin.</h1>
          <p>
            LawDesk; görevleri, ekipleri ve operasyonel kayıtları güvenli bir
            çalışma alanında birleştirir.
          </p>

          <div className="product-hero-actions">
            <button type="button" className="product-primary-cta" onClick={() => onNavigate("/login")}>
              Giriş Yap
              <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="product-secondary-cta" onClick={() => onNavigate("/register")}>
              Kayıt Ol
            </button>
          </div>

          <button type="button" className="product-text-link" onClick={() => onNavigate("/features")}>
            Platformu incele
            <span aria-hidden="true">↗</span>
          </button>

          <div className="product-trust-row" aria-label="Öne çıkan ürün nitelikleri">
            <span>Rol bazlı erişim</span>
            <span>Denetlenebilir süreç</span>
            <span>Merkezi görev akışı</span>
          </div>
        </div>

        <div className="product-preview" aria-label="LawDesk arayüz önizlemesi">
          <div className="product-preview-window">
            <div className="product-preview-topbar">
              <div className="product-preview-brand">
                <BrandLogo compact />
              </div>
              <div className="product-preview-search">Görevlerde ara...</div>
              <span className="product-preview-avatar">SK</span>
            </div>

            <div className="product-preview-body">
              <aside className="product-preview-sidebar">
                <span className="active">Genel bakış</span>
                <span>Görevler</span>
                <span>Gruplar</span>
                <span>Raporlar</span>
              </aside>

              <div className="product-preview-content">
                <div className="product-preview-heading">
                  <div>
                    <small>Operasyon özeti</small>
                    <strong>Görev görünümü</strong>
                  </div>
                  <span>Bugün</span>
                </div>

                <div className="product-preview-metrics">
                  <div><small>Açık görev</small><strong>24</strong></div>
                  <div><small>Yaklaşan</small><strong>8</strong></div>
                  <div><small>Tamamlanan</small><strong>16</strong></div>
                </div>

                <div className="product-preview-list">
                  <div className="product-preview-list-head">
                    <span>Son görevler</span>
                    <span>Durum</span>
                  </div>
                  <div><span><i />Sözleşme kontrolü</span><b>Devam ediyor</b></div>
                  <div><span><i />Uyum değerlendirmesi</span><b className="warning">Yaklaşıyor</b></div>
                  <div><span><i />Politika güncellemesi</span><b className="complete">Tamamlandı</b></div>
                </div>
              </div>
            </div>
          </div>
          <div className="product-preview-note">
            <span aria-hidden="true">✓</span>
            <div><strong>Yetki kontrollü</strong><small>Her kullanıcı yalnızca kendi kapsamını görür.</small></div>
          </div>
        </div>
      </header>

      <section className="product-capabilities-section">
        <div className="product-section-heading product-platform-teaser">
          <div>
            <p className="eyebrow">LawDesk platformu</p>
            <h2>Tüm yetenekleri tek bir yerde keşfedin.</h2>
            <p>
              Görev yönetiminden raporlamaya, yetkilendirmeden ekip
              çalışmasına kadar LawDesk’in sunduğu araçları inceleyin.
            </p>
          </div>
          <button
            type="button"
            className="product-primary-cta product-platform-cta"
            onClick={() => onNavigate("/features")}
          >
            Platformu Keşfet
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>

      <section className="product-closing-cta">
        <div>
          <p className="eyebrow">LawDesk</p>
          <h2>Daha düzenli bir operasyon için hazır.</h2>
        </div>
        <div className="product-hero-actions">
          <button type="button" className="product-primary-cta" onClick={() => onNavigate("/login")}>Giriş Yap</button>
          <button type="button" className="product-secondary-cta" onClick={() => onNavigate("/register")}>Kayıt Ol</button>
        </div>
      </section>

      <footer className="product-footer">
        <BrandLogo subtitle="Görev Yönetim Sistemi" />
        <nav aria-label="Alt menü">
          <button type="button" onClick={() => onNavigate("/")}>Ana Sayfa</button>
          <button type="button" onClick={() => onNavigate("/features")}>Platform</button>
          <button type="button" onClick={() => onNavigate("/login")}>Giriş Yap</button>
          <button type="button" onClick={() => onNavigate("/register")}>Kayıt Ol</button>
        </nav>
      </footer>
    </section>
  );
}

export default HomePage;

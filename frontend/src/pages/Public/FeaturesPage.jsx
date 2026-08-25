import ProductCapabilities from "../../components/ProductCapabilities";

function FeaturesPage({ onNavigate }) {
  return (
    <section className="product-page page-shell">
      <header className="product-page-header">
        <p className="eyebrow">LawDesk platformu</p>
        <h1>Kontrollü iş akışı için tek çalışma alanı.</h1>
        <p>LawDesk’in temel operasyon kabiliyetlerini sade ve güvenli bir yapıda kullanın.</p>
      </header>

      <ProductCapabilities />

      <section className="product-closing-cta product-page-cta">
        <div>
          <p className="eyebrow">Başlayın</p>
          <h2>LawDesk çalışma alanınıza erişin.</h2>
        </div>
        <div className="product-hero-actions">
          <button type="button" className="product-primary-cta" onClick={() => onNavigate("/login")}>Giriş Yap</button>
          <button type="button" className="product-secondary-cta" onClick={() => onNavigate("/register")}>Kayıt Ol</button>
        </div>
      </section>
    </section>
  );
}

export default FeaturesPage;

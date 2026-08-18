function FeaturesPage({ onNavigate }) {
  const featureList = [
    { title: "Görev Yönetimi", text: "Görevleri oluşturun, takip edin, önceliklendirin ve arşivleyin." },
    { title: "Arama, Filtreleme, Sıralama", text: "Görev listesinde güçlü arama ve filtreleme seçenekleri." },
    { title: "Grup Bazlı Erişim", text: "Gruplar ve roller üzerinden erişim kontrolü." },
    { title: "Öncelik & Durum", text: "Esnek öncelik ve durum takibi." },
    { title: "Güvenli Oturum", text: "HTTP-only cookie tabanlı güvenli oturum yönetimi." },
    { title: "Pagination", text: "Büyük görev listeleri için sayfalama desteği." },
  ];

  return (
    <section className="page-shell">
      <div className="section-header">
        <p className="eyebrow">Özellikler</p>
        <h2>Gerçekleşmiş ve desteklenen özellikler</h2>
      </div>

      <div className="feature-grid">
        {featureList.map((item) => (
          <article key={item.title} className="feature-card">
            <div className="feature-icon" />
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>

      <div className="cta-box">
        <h3>Hızlı başlamak için giriş yapın.</h3>
        <button type="button" onClick={() => onNavigate("/login")}>Giriş Yap</button>
      </div>
    </section>
  );
}

export default FeaturesPage;

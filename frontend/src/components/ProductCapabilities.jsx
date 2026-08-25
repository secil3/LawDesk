const capabilities = [
  {
    key: "tasks",
    title: "Görev yönetimi",
    text: "Atama, öncelik ve yaşam döngüsü tek akışta.",
  },
  {
    key: "teams",
    title: "Grup ve kullanıcılar",
    text: "Ekip yapısı ve üyelikler merkezi olarak yönetilir.",
  },
  {
    key: "access",
    title: "Yetkilendirme",
    text: "Rol ve grup kapsamına göre kontrollü erişim.",
  },
  {
    key: "notifications",
    title: "Bildirimler",
    text: "Kritik görev hareketleri anında görünür.",
  },
  {
    key: "reports",
    title: "Raporlama",
    text: "İş yükü, risk ve performans tek panelde.",
  },
  {
    key: "search",
    title: "Global arama",
    text: "Yetki kapsamındaki kayıtlara hızla ulaşın.",
  },
  {
    key: "activity",
    title: "İşlem kayıtları",
    text: "Sistem hareketleri filtrelenebilir ve izlenebilir.",
  },
  {
    key: "collaboration",
    title: "Zengin görev içeriği",
    text: "Alt görev, yorum ve dosya ekleri bir arada.",
  },
];

const iconPaths = {
  tasks: ["M7 7h10", "M7 12h10", "M7 17h6", "M4 7h.01", "M4 12h.01", "M4 17h.01"],
  teams: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  access: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10", "M9 12l2 2 4-4"],
  notifications: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M13.73 21a2 2 0 0 1-3.46 0"],
  reports: ["M4 19V9", "M10 19V5", "M16 19v-7", "M22 19H2"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "M21 21l-4.35-4.35"],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  collaboration: ["M4 4h16v12H7l-3 3V4", "M8 8h8", "M8 12h5"],
};

function CapabilityIcon({ type }) {
  return (
    <span className="product-capability-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {(iconPaths[type] || iconPaths.tasks).map((path) => (
          <path d={path} key={path} />
        ))}
      </svg>
    </span>
  );
}

function ProductCapabilities({ compact = false }) {
  return (
    <div className={compact ? "product-capability-grid compact" : "product-capability-grid"}>
      {capabilities.map((item) => (
        <article className="product-capability-card" key={item.key}>
          <CapabilityIcon type={item.key} />
          <div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export default ProductCapabilities;

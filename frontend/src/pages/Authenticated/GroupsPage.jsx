function GroupsPage({ children }) {
  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Erişim yapısı</p>
          <h2>Gruplar</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export default GroupsPage;

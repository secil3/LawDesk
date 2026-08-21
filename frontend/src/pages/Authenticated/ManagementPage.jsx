import TagManagement from "../../components/TagManagement";
import TaskTypeManagement from "../../components/TaskTypeManagement";

function ManagementPage({ user }) {
  const enabled = ["admin", "yonetici"].includes(user?.rol);

  return (
    <section className="page-shell management-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Sistem yönetimi</p>
          <h2>Yönetim</h2>
          <p className="form-hint">
            Görev sınıflandırmalarını tek bir alandan yönetin.
          </p>
        </div>
      </div>

      <TaskTypeManagement enabled={enabled} />
      <TagManagement enabled={enabled} />
    </section>
  );
}

export default ManagementPage;

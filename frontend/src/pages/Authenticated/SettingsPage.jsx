import { useEffect, useState } from "react";

import { readResponse } from "../../api";

const SYSTEM_ROLE_LABELS = {
  admin: "Admin",
  yonetici: "Yönetici",
  kullanici: "Kullanıcı",
};

const GROUP_ROLE_LABELS = {
  grup_yoneticisi: "Grup yöneticisi",
  grup_uyesi: "Grup üyesi",
  yonetici: "Grup yöneticisi",
  uye: "Grup üyesi",
};

const ACTIVITY_LABELS = {
  GorevOlusturma: "Görev oluşturma",
  GorevAtama: "Görev atama",
  DurumDegisikligi: "Durum değişikliği",
  GorevArsivleme: "Görev arşivleme",
  GorevGeriYukleme: "Görev geri yükleme",
  GorevBilgileriDegisikligi: "Görev bilgileri değişikliği",
  BitisTarihiDegisikligi: "Bitiş tarihi değişikliği",
  KullaniciArsivleme: "Kullanıcı arşivleme",
  KullaniciGeriYukleme: "Kullanıcı geri yükleme",
  KullaniciGrupUyelikleriDegisikligi: "Kullanıcı üyelik değişikliği",
  GrupOlusturma: "Grup oluşturma",
  GrupGuncelleme: "Grup güncelleme",
  EkYukleme: "Ek yükleme",
  EkKaldirma: "Ek kaldırma",
  EkGeriYukleme: "Ek geri yükleme",
};

const formatDate = (value) => {
  if (!value) {
    return "Belirtilmedi";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Belirtilmedi";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function SettingsPage({ user }) {
  const groups = Array.isArray(user?.groups)
    ? user.groups
    : [];
  const [activity, setActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityLimit, setActivityLimit] = useState(5);
  const [canViewActivity, setCanViewActivity] = useState(false);

  useEffect(() => {
    const loadActivity = async () => {
      setLoadingActivity(true);

      try {
        const optionsResponse = await fetch("/api/tasks/options", {
          credentials: "include",
        });
        const optionsData = await readResponse(optionsResponse);
        const canAccessActivity = optionsData.canViewActivity === true;
        setCanViewActivity(canAccessActivity);

        if (!canAccessActivity) {
          setActivity([]);
          return;
        }

        const activityResponse = await fetch(
          "/api/tasks/activity?limit=50",
          { credentials: "include" },
        );
        const activityData = await readResponse(activityResponse);
        setActivity(
          Array.isArray(activityData.activity) ? activityData.activity : [],
        );
      } catch (error) {
        setCanViewActivity(false);
        setActivity([]);
      } finally {
        setLoadingActivity(false);
      }
    };

    loadActivity();
  }, []);

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h2>Hesap ayarları</h2>
        </div>
      </div>

      <div className="feature-card">
        <p>
          <strong>Kullanıcı:</strong>{" "}
          {user?.adSoyad || user?.email || "Kullanıcı"}
        </p>

        <p>
          <strong>Sistem rolü:</strong>{" "}
          {SYSTEM_ROLE_LABELS[user?.rol] ||
            user?.rol ||
            "Belirtilmedi"}
        </p>

        <div>
          <strong>Grup rolleri:</strong>

          {groups.length === 0 ? (
            <p>Grup üyeliği bulunmuyor.</p>
          ) : (
            <ul>
              {groups.map((group) => (
                <li key={group.grupId}>
                  {group.grupAdi} —{" "}
                  {GROUP_ROLE_LABELS[group.grupRolu] ||
                    group.grupRolu}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p>
          Parola değiştirme, profil düzenleme ve güvenlik
          tercihleri daha sonraki geliştirme aşamasında
          eklenecektir.
        </p>
      </div>

      {canViewActivity && (
        <section
          className="activity-panel settings-activity-panel"
          aria-labelledby="activity-panel-title"
        >
          <div className="task-list-heading">
            <div>
              <p className="eyebrow">Denetim izi</p>
              <h3 id="activity-panel-title">Son işlem kayıtları</h3>
            </div>
            <button
              type="button"
              className="secondary-button refresh-button"
              onClick={async () => {
                setLoadingActivity(true);

                try {
                  const response = await fetch(
                    "/api/tasks/activity?limit=50",
                    { credentials: "include" },
                  );
                  const data = await readResponse(response);
                  setActivity(
                    Array.isArray(data.activity) ? data.activity : [],
                  );
                  setActivityLimit(5);
                } finally {
                  setLoadingActivity(false);
                }
              }}
              disabled={loadingActivity}
            >
              Kayıtları yenile
            </button>
          </div>

          {loadingActivity ? (
            <p className="task-empty-state">
              İşlem kayıtları yükleniyor...
            </p>
          ) : activity.length === 0 ? (
            <p className="task-empty-state">
              Henüz işlem kaydı bulunmuyor.
            </p>
          ) : (
            <>
              <ol className="activity-list">
                {activity.slice(0, activityLimit).map((entry) => (
                  <li key={entry.id}>
                    <div className="activity-entry-heading">
                      <span>
                        {ACTIVITY_LABELS[entry.action] || entry.action}
                      </span>
                      <time dateTime={entry.createdAt}>
                        {formatDate(entry.createdAt)}
                      </time>
                    </div>
                    <p>{entry.detail}</p>
                  </li>
                ))}
              </ol>

              {activity.length > activityLimit && (
                <div className="activity-show-more-wrap">
                  <button
                    type="button"
                    className="secondary-button activity-show-more"
                    onClick={() => setActivityLimit((current) => current + 5)}
                  >
                    Daha Fazlasını Göster
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

export default SettingsPage;

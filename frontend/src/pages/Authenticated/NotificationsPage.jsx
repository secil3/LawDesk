import { useEffect, useState } from "react";

import { readResponse } from "../../api";
import PaginationControls from "../../components/PaginationControls";

const TYPE_LABELS = {
  Atama: "Görev ataması",
  Guncelleme: "Güncelleme",
  Kapanis: "Görev tamamlandı",
  HatirlatmaOrta: "Hatırlatma",
  HatirlatmaSon: "Son hatırlatma",
};

const formatDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Tarih bilinmiyor";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function NotificationsPage({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = async (page = 1) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/notifications?page=${page}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setNotifications(
        Array.isArray(data.notifications) ? data.notifications : [],
      );
      setPagination({
        page: Number(data.pagination?.page) || page,
        limit: Number(data.pagination?.limit) || 20,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setError(requestError.message || "Bildirimler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications(1);
  }, []);

  const markAsRead = async (notification) => {
    if (notification.read) {
      return;
    }

    try {
      const response = await fetch(
        `/api/notifications/${notification.id}/read`,
        { method: "PATCH", credentials: "include" },
      );
      await readResponse(response);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read: true } : item,
        ),
      );
    } catch (requestError) {
      setError(requestError.message || "Bildirim güncellenemedi");
    }
  };

  const openNotification = async (notification) => {
    await markAsRead(notification);

    if (notification.taskId) {
      onNavigate?.(`/tasks/${notification.taskId}`);
    }
  };

  return (
    <section className="page-shell">
      <div className="section-header">
        <div>
          <p className="eyebrow">Bildirimler</p>
          <h2>Bildirimleriniz</h2>
        </div>
      </div>

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="task-empty-state">Bildirimler yükleniyor...</p>
      ) : notifications.length === 0 ? (
        <div className="empty-state-box">Henüz bildirim yok.</div>
      ) : (
        <ul className="notification-list">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={
                notification.read
                  ? "notification-item"
                  : "notification-item notification-item-unread"
              }
            >
              <button
                type="button"
                className="notification-item-button"
                onClick={() => openNotification(notification)}
              >
                <span className="notification-item-icon" aria-hidden="true" />

                <span className="notification-item-body">
                  <span className="notification-item-heading">
                    <span className="notification-item-type">
                      {TYPE_LABELS[notification.type] || notification.type}
                    </span>
                    <time dateTime={notification.createdAt}>
                      {formatDate(notification.createdAt)}
                    </time>
                  </span>

                  <span className="notification-item-message">
                    {notification.message}
                  </span>

                  {notification.taskId && (
                    <span className="notification-item-task">
                      Görev #{notification.taskId}
                      {notification.taskTitle
                        ? ` — ${notification.taskTitle}`
                        : ""}
                    </span>
                  )}
                </span>

                {!notification.read && (
                  <span className="notification-item-dot" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        disabled={loading}
        label="Bildirim sayfalama"
        onPageChange={loadNotifications}
      />
    </section>
  );
}

export default NotificationsPage;

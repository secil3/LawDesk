import { useEffect, useState } from "react";

import { readResponse } from "../../api";
import PaginationControls from "../../components/PaginationControls";

const STATUS_OPTIONS = [
  { value: "Bekliyor", label: "Bekleyenler" },
  { value: "Onaylandi", label: "Onaylananlar" },
  { value: "Reddedildi", label: "Reddedilenler" },
];

const formatDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function RegistrationRequestsPage({ initialRequestId = null }) {
  const [status, setStatus] = useState("Bekliyor");
  const [requests, setRequests] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const [approval, setApproval] = useState({
    systemRole: "kullanici",
    memberships: [],
  });
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRequest = async (requestId) => {
    if (!requestId) {
      setSelected(null);
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/registration-requests/${requestId}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setSelected(data.request || null);
      setApproval({
        systemRole: data.request?.approvedRole || "kullanici",
        memberships: Array.isArray(data.request?.memberships)
          ? data.request.memberships.map((membership) => ({
              grupId: Number(membership.grupId),
              grupRolu: membership.grupRolu,
            }))
          : [],
      });
      setRejectionReason(data.request?.rejectionReason || "");
    } catch (requestError) {
      setError(requestError.message || "Kayıt talebi getirilemedi");
    }
  };

  const loadRequests = async (page = 1, nextStatus = status) => {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        status: nextStatus,
        page: String(page),
        limit: "20",
      });
      const response = await fetch(
        `/api/admin/registration-requests?${params}`,
        { credentials: "include" },
      );
      const data = await readResponse(response);

      setRequests(Array.isArray(data.requests) ? data.requests : []);
      setPagination({
        page: Number(data.pagination?.page) || 1,
        limit: Number(data.pagination?.limit) || 20,
        total: Number(data.pagination?.total) || 0,
        totalPages: Number(data.pagination?.totalPages) || 0,
      });
    } catch (requestError) {
      setRequests([]);
      setError(requestError.message || "Kayıt talepleri getirilemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const groupsResponse = await fetch(
          "/api/admin/groups?page=1&limit=100",
          { credentials: "include" },
        );
        const groupsData = await readResponse(groupsResponse);
        setGroups(Array.isArray(groupsData.groups) ? groupsData.groups : []);
      } catch (requestError) {
        setError(requestError.message || "Gruplar getirilemedi");
      }

      await loadRequests(1, "Bekliyor");

      if (initialRequestId) {
        await loadRequest(initialRequestId);
      }
    };

    loadInitialData();
  }, [initialRequestId]);

  const changeStatus = async (nextStatus) => {
    setStatus(nextStatus);
    setSelected(null);
    setMessage("");
    await loadRequests(1, nextStatus);
  };

  const toggleGroup = (groupId) => {
    setApproval((current) => {
      const exists = current.memberships.some(
        (membership) => Number(membership.grupId) === Number(groupId),
      );

      return {
        ...current,
        memberships: exists
          ? current.memberships.filter(
              (membership) =>
                Number(membership.grupId) !== Number(groupId),
            )
          : [
              ...current.memberships,
              { grupId: Number(groupId), grupRolu: "grup_uyesi" },
            ],
      };
    });
  };

  const updateGroupRole = (groupId, grupRolu) => {
    setApproval((current) => ({
      ...current,
      memberships: current.memberships.map((membership) =>
        Number(membership.grupId) === Number(groupId)
          ? { ...membership, grupRolu }
          : membership,
      ),
    }));
  };

  const approve = async () => {
    if (!selected?.id) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/registration-requests/${selected.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(approval),
        },
      );
      const data = await readResponse(response);
      setMessage(data.message || "Kayıt talebi onaylandı");
      await loadRequest(selected.id);
      await loadRequests(pagination.page, status);
    } catch (requestError) {
      setError(requestError.message || "Kayıt talebi onaylanamadı");
      await loadRequest(selected.id);
      await loadRequests(pagination.page, status);
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!selected?.id) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/registration-requests/${selected.id}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ reason: rejectionReason.trim() }),
        },
      );
      const data = await readResponse(response);
      setMessage(data.message || "Kayıt talebi reddedildi");
      setSelected(null);
      await loadRequests(pagination.page, status);
    } catch (requestError) {
      setError(requestError.message || "Kayıt talebi reddedilemedi");
    } finally {
      setSaving(false);
    }
  };

  const resendActivation = async () => {
    if (!selected?.id) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/registration-requests/${selected.id}/resend-activation`,
        { method: "POST", credentials: "include" },
      );
      const data = await readResponse(response);
      setMessage(data.message || "Aktivasyon e-postası gönderildi");
      await loadRequest(selected.id);
    } catch (requestError) {
      setError(requestError.message || "Aktivasyon e-postası gönderilemedi");
      await loadRequest(selected.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page-shell registration-admin-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Erişim yönetimi</p>
          <h2>Kayıt talepleri</h2>
          <p>Başvuruları inceleyin, rol ve grup üyeliklerini belirleyin.</p>
        </div>
        <span className="info-chip">{pagination.total} talep</span>
      </div>

      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}

      <div className="list-heading-with-tabs registration-status-tabs">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? "active" : ""}
            onClick={() => changeStatus(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="registration-admin-grid">
        <section className="registration-request-list" aria-label="Kayıt talepleri">
          {loading ? (
            <p className="task-empty-state">Kayıt talepleri yükleniyor...</p>
          ) : requests.length === 0 ? (
            <div className="empty-state-box">Bu durumda kayıt talebi yok.</div>
          ) : (
            requests.map((requestItem) => (
              <button
                key={requestItem.id}
                type="button"
                className={
                  selected?.id === requestItem.id
                    ? "registration-request-card selected"
                    : "registration-request-card"
                }
                onClick={() => loadRequest(requestItem.id)}
              >
                <strong>{requestItem.adSoyad}</strong>
                <span>{requestItem.email}</span>
                <small>{formatDate(requestItem.createdAt)}</small>
              </button>
            ))
          )}

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            disabled={loading}
            label="Kayıt talebi sayfalama"
            onPageChange={(page) => loadRequests(page, status)}
          />
        </section>

        <section className="registration-review-panel">
          {!selected ? (
            <div className="empty-state-box">
              Ayrıntılarını görmek için bir kayıt talebi seçin.
            </div>
          ) : (
            <>
              <div className="registration-review-heading">
                <div>
                  <p className="eyebrow">Talep #{selected.id}</p>
                  <h3>{selected.adSoyad}</h3>
                  <p>{selected.email}</p>
                </div>
                <span className="info-chip">{selected.status}</span>
              </div>

              {selected.status === "Bekliyor" && (
                <div className="registration-approval-form">
                  <label className="field-block">
                    <span>Sistem rolü</span>
                    <select
                      value={approval.systemRole}
                      onChange={(event) =>
                        setApproval((current) => ({
                          ...current,
                          systemRole: event.target.value,
                        }))
                      }
                    >
                      <option value="kullanici">Kullanıcı</option>
                      <option value="yonetici">Yönetici</option>
                    </select>
                  </label>

                  <div className="field-block">
                    <span>Grup ve grup rolü (isteğe bağlı)</span>
                    <div className="registration-group-options">
                      {groups.map((group) => {
                        const membership = approval.memberships.find(
                          (item) => Number(item.grupId) === Number(group.id),
                        );

                        return (
                          <div className="registration-group-option" key={group.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={Boolean(membership)}
                                onChange={() => toggleGroup(group.id)}
                              />
                              <span>{group.name}</span>
                            </label>
                            {membership && (
                              <select
                                value={membership.grupRolu}
                                onChange={(event) =>
                                  updateGroupRole(group.id, event.target.value)
                                }
                              >
                                <option value="grup_uyesi">Grup üyesi</option>
                                <option value="grup_yoneticisi">Grup yöneticisi</option>
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button type="button" onClick={approve} disabled={saving}>
                    {saving
                      ? "İşlem yapılıyor..."
                      : "Onayla ve aktivasyon e-postası gönder"}
                  </button>

                  <label className="field-block">
                    <span>Red nedeni (isteğe bağlı)</span>
                    <textarea
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={reject}
                    disabled={saving}
                  >
                    Talebi reddet
                  </button>
                </div>
              )}

              {selected.status === "Onaylandi" && (
                <div className="registration-result-card">
                  <p><strong>Sistem rolü:</strong> {selected.approvedRole}</p>
                  <p>
                    <strong>İnceleyen:</strong> {selected.reviewerName || "—"}
                  </p>
                  <p><strong>İnceleme:</strong> {formatDate(selected.reviewedAt)}</p>
                  <p>
                    <strong>Aktivasyon:</strong>{" "}
                    {selected.activationPending ? "Bekleniyor" : "Tamamlandı"}
                  </p>
                  <p>
                    <strong>Son e-posta:</strong> {formatDate(selected.emailSentAt)}
                  </p>
                  {selected.emailError && (
                    <p className="error-message">{selected.emailError}</p>
                  )}
                  {selected.activationPending && (
                    <button
                      type="button"
                      onClick={resendActivation}
                      disabled={saving}
                    >
                      Yeni aktivasyon bağlantısı gönder
                    </button>
                  )}
                </div>
              )}

              {selected.status === "Reddedildi" && (
                <div className="registration-result-card">
                  <p>
                    <strong>İnceleyen:</strong> {selected.reviewerName || "—"}
                  </p>
                  <p><strong>İnceleme:</strong> {formatDate(selected.reviewedAt)}</p>
                  <p>
                    <strong>Red nedeni:</strong>{" "}
                    {selected.rejectionReason || "Belirtilmedi"}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </section>
  );
}

export default RegistrationRequestsPage;

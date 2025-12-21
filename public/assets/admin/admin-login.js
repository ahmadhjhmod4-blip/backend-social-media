// ===== إعدادات السيرفر / API =====
const SERVER_BASE = "http://localhost:5000";
const API_BASE = SERVER_BASE + "/api";

// هيلبرز
function getToken() {
  try {
    return localStorage.getItem("token") || "";
  } catch {
    return "";
  }
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

// عناصر DOM
const reportsContainer = document.getElementById("reportsContainer");
const filterAllBtn = document.getElementById("filterAll");
const filterPendingBtn = document.getElementById("filterPending");
const filterAcceptedBtn = document.getElementById("filterAccepted");
const filterRejectedBtn = document.getElementById("filterRejected");
const adminNameSpan = document.getElementById("adminName");

let allReports = [];
let currentFilter = "all";

// عرض اسم المشرف
(function showAdminName() {
  const u = getUser();
  if (u && adminNameSpan) {
    adminNameSpan.textContent = u.username || u.name || u.email || "مشرف";
  }
})();

// جلب البلاغات من السيرفر
async function fetchReports() {
  const token = getToken();
  if (!token) {
    console.warn("لا يوجد توكن، لن يتم جلب البلاغات");
    return;
  }

  try {
    const res = await fetch(API_BASE + "/admin/reports", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("خطأ في جلب البلاغات:", data);
      return;
    }

    allReports = Array.isArray(data) ? data : [];
    renderReports();
  } catch (err) {
    console.error("Error fetching reports:", err);
  }
}

function formatDate(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return d.toLocaleString("ar-EG");
}

// بناء كرت لمعلومات الهدف (منشور أو ستوري)
function renderTargetInfo(report) {
  const isPost = report.targetType === "post" && report.post;
  const isStory = report.targetType === "story" && report.story;

  if (isPost) {
    const p = report.post;
    const text = p.text || "(بدون نص)";
    const createdAt = formatDate(p.createdAt);

    let mediaHtml = "";
    if (p.imageUrl) {
      mediaHtml = `<div class="admin-target-media"><img src="${p.imageUrl}" alt="post image" /></div>`;
    } else if (p.videoUrl) {
      mediaHtml = `<div class="admin-target-media"><video src="${p.videoUrl}" controls></video></div>`;
    }

    return `
      <div class="admin-target-header">معلومات المنشور</div>
      <div class="admin-target-text">${text}</div>
      ${mediaHtml}
      <div class="admin-target-meta">تاريخ إنشاء المنشور: ${createdAt}</div>
    `;
  }

  if (isStory) {
    const s = report.story;
    const text = s.text || "(بدون نص)";
    const createdAt = formatDate(s.createdAt);
    const typeLabel = s.mediaType === "video" ? "فيديو" : "صورة";

    let mediaHtml = "";
    if (s.mediaUrl) {
      if (s.mediaType === "video") {
        mediaHtml = `<div class="admin-target-media"><video src="${s.mediaUrl}" controls></video></div>`;
      } else {
        mediaHtml = `<div class="admin-target-media"><img src="${s.mediaUrl}" alt="story media" /></div>`;
      }
    }

    return `
      <div class="admin-target-header">معلومات الستوري (${typeLabel})</div>
      <div class="admin-target-text">${text}</div>
      ${mediaHtml}
      <div class="admin-target-meta">تاريخ إنشاء الستوري: ${createdAt}</div>
    `;
  }

  return `
    <div class="admin-target-header">لا يوجد محتوى مرتبط</div>
  `;
}

// رسم البلاغات في الواجهة
function renderReports() {
  if (!reportsContainer) return;

  reportsContainer.innerHTML = "";

  const filtered = allReports.filter((r) => {
    if (currentFilter === "pending") return r.status === "pending";
    if (currentFilter === "accepted") return r.status === "accepted";
    if (currentFilter === "rejected") return r.status === "rejected";
    return true; // all
  });

  if (!filtered.length) {
    reportsContainer.innerHTML =
      '<div class="admin-empty">لا يوجد بلاغات في هذا القسم</div>';
    return;
  }

  filtered.forEach((r) => {
    const typeLabel =
      r.targetType === "post"
        ? "بلاغ على منشور"
        : r.targetType === "story"
        ? "بلاغ على ستوري"
        : "بلاغ";

    const statusLabel =
      r.status === "pending"
        ? "قيد المراجعة"
        : r.status === "accepted"
        ? "مقبول"
        : "مرفوض";

    const statusClass =
      r.status === "pending"
        ? "status-pending"
        : r.status === "accepted"
        ? "status-accepted"
        : "status-rejected";

    const reason = r.reason || "بدون سبب";
    const details = r.details || "";
    const reporterName =
      (r.reporter && (r.reporter.username || r.reporter.email)) ||
      "مستخدم";
    const createdAt = formatDate(r.createdAt);

    const targetHtml = renderTargetInfo(r);

    const card = document.createElement("div");
    card.className = "report-card glass";

    card.innerHTML = `
      <div class="report-header">
        <span class="report-type-badge">${typeLabel}</span>
        <span class="report-status-badge ${statusClass}">${statusLabel}</span>
      </div>

      <div class="report-body">
        <div class="report-reason">
          <span class="label">سبب البلاغ:</span>
          <span>${reason}</span>
        </div>
        ${
          details
            ? `<div class="report-details">
                 <span class="label">تفاصيل إضافية:</span>
                 <span>${details}</span>
               </div>`
            : ""
        }

        <div class="report-meta">
          <div>المبلِّغ: ${reporterName}</div>
          <div>تاريخ البلاغ: ${createdAt}</div>
        </div>

        <div class="report-target-box">
          ${targetHtml}
        </div>
      </div>

      <div class="report-actions">
        ${
          r.status === "pending"
            ? `
          <button class="btn-accept" data-id="${r._id}">قبول البلاغ ومعالجة المحتوى</button>
          <button class="btn-reject" data-id="${r._id}">رفض البلاغ</button>
        `
            : `
          <div class="report-info-note">تمت معالجة هذا البلاغ (${statusLabel})</div>
        `
        }
      </div>
    `;

    // أزرار قبول / رفض
    const acceptBtn = card.querySelector(".btn-accept");
    const rejectBtn = card.querySelector(".btn-reject");

    if (acceptBtn) {
      acceptBtn.addEventListener("click", () => {
        handleAcceptReport(r._id);
      });
    }
    if (rejectBtn) {
      rejectBtn.addEventListener("click", () => {
        handleRejectReport(r._id);
      });
    }

    reportsContainer.appendChild(card);
  });
}

// قبول البلاغ
async function handleAcceptReport(reportId) {
  const token = getToken();
  if (!token) return;

  const ok = window.confirm(
    "سيتم قبول البلاغ وحذف المحتوى المخالف، هل أنت متأكد؟"
  );
  if (!ok) return;

  try {
    const res = await fetch(
      API_BASE + `/admin/reports/${encodeURIComponent(reportId)}/accept`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      alert(data.msg || "حدث خطأ أثناء قبول البلاغ");
      return;
    }

    alert(data.msg || "تم قبول البلاغ");
    await fetchReports();
  } catch (err) {
    console.error("Error accept report:", err);
    alert("حدث خطأ في الخادم");
  }
}

// رفض البلاغ
async function handleRejectReport(reportId) {
  const token = getToken();
  if (!token) return;

  const ok = window.confirm("هل تريد رفض هذا البلاغ؟");
  if (!ok) return;

  try {
    const res = await fetch(
      API_BASE + `/admin/reports/${encodeURIComponent(reportId)}/reject`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      alert(data.msg || "حدث خطأ أثناء رفض البلاغ");
      return;
    }

    alert(data.msg || "تم رفض البلاغ");
    await fetchReports();
  } catch (err) {
    console.error("Error reject report:", err);
    alert("حدث خطأ في الخادم");
  }
}

// فلاتر الحالة
function setFilter(filter) {
  currentFilter = filter;
  renderReports();
}

// ربط أزرار الفلترة (لو موجودة في HTML)
if (filterAllBtn) {
  filterAllBtn.addEventListener("click", () => setFilter("all"));
}
if (filterPendingBtn) {
  filterPendingBtn.addEventListener("click", () => setFilter("pending"));
}
if (filterAcceptedBtn) {
  filterAcceptedBtn.addEventListener("click", () => setFilter("accepted"));
}
if (filterRejectedBtn) {
  filterRejectedBtn.addEventListener("click", () => setFilter("rejected"));
}

// عند تحميل الصفحة
document.addEventListener("DOMContentLoaded", () => {
  fetchReports();
});

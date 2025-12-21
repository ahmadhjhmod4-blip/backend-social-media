// public/assets/admin/admin-dashboard.js
console.log("[AdminDashboard] ملف admin-dashboard.js تم تحميله ✅");

// ===== إعدادات السيرفر / API =====
// نحاول نستخدم نفس أصل الصفحة (للرندر أو الدومين الحقيقي)
const SERVER_BASE =
  window.location.origin.includes("localhost") ||
  window.location.origin.includes("127.0.0.1")
    ? "http://localhost:5000"
    : window.location.origin;

const API_BASE = SERVER_BASE + "/api";

function getToken() {
  return localStorage.getItem("token") || "";
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

// عناصر من الـ DOM
const adminUserInfo = document.getElementById("adminUserInfo");
const btnGoHome = document.getElementById("btnGoHome");
const btnLogout = document.getElementById("btnLogout");

const adminDashMsg = document.getElementById("adminDashMsg");
const reportsListEl = document.getElementById("reportsList");
const emptyStateEl = document.getElementById("emptyState");

const filterButtons = document.querySelectorAll(".filter-pill");

// إدارة المستخدمين
const userSearchInput = document.getElementById("userSearchInput");
const usersListEl = document.getElementById("usersList");
const usersEmptyStateEl = document.getElementById("usersEmptyState");

let allReports = [];
let currentFilter = "all";
let allUsers = [];
let currentUserId = null;

// ===== دوال مساعدة بسيطة =====
function showError(msg) {
  if (!adminDashMsg) return;
  adminDashMsg.textContent = msg || "حدث خطأ غير متوقع";
  adminDashMsg.style.display = "block";
}

function clearError() {
  if (!adminDashMsg) return;
  adminDashMsg.textContent = "";
  adminDashMsg.style.display = "none";
}

function buildAvatarCircle(nameOrEmail = "") {
  const txt = (nameOrEmail || "").trim();
  if (!txt) return "SA";
  const parts = txt.split(" ");
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (
    (parts[0][0] || "").toUpperCase() +
    (parts[1][0] || "").toUpperCase()
  );
}

// ===== تحضير هيدر المشرف =====
async function loadCurrentAdmin() {
  const token = getToken();
  if (!token) {
    window.location.href = "/admin/login.html";
    return;
  }

  try {
    const res = await fetch(API_BASE + "/profile", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (!res.ok) {
      console.warn("GET /api/profile status:", res.status);
      throw new Error("فشل جلب بيانات البروفايل");
    }

    const data = await res.json();
    currentUserId = data._id;

    if (!data.isAdmin && data.isAdmin !== true) {
      console.warn("⚠️ المستخدم الحالي قد لا يكون مشرفاً حسب isAdmin");
    }

    if (adminUserInfo) {
      adminUserInfo.innerHTML = `<span>مرحباً، ${data.username || "مشرف"}</span>`;
    }
  } catch (err) {
    console.error("loadCurrentAdmin error:", err);
    showError("تعذر تحميل بيانات المشرف، يرجى إعادة تسجيل الدخول");
    setTimeout(() => {
      window.location.href = "/admin/login.html";
    }, 2000);
  }
}

// ===== جلب البلاغات من الـ API =====
async function fetchReports() {
  clearError();
  const token = getToken();
  if (!token) {
    showError("يرجى تسجيل الدخول أولاً");
    return;
  }

  try {
    const res = await fetch(API_BASE + "/admin/reports", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    console.log("GET /admin/reports status:", res.status);

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      console.warn("GET /admin/reports error body:", data);
      throw new Error((data && data.msg) || "فشل جلب البلاغات");
    }

    allReports = Array.isArray(data) ? data : [];
    console.log("🔎 عدد البلاغات المستلمة:", allReports.length);
    console.log("عينة من البلاغات:", allReports.slice(0, 3));

    renderReports();
  } catch (err) {
    console.error("fetchReports error:", err);
    showError("حدث خطأ أثناء جلب البلاغات");
  }
}

// ===== رسم البلاغات على الشاشة =====
function renderReports() {
  if (!reportsListEl || !emptyStateEl) return;

  reportsListEl.innerHTML = "";

  let filtered = allReports;
  if (currentFilter !== "all") {
    filtered = allReports.filter((r) => r.status === currentFilter);
  }

  if (!filtered.length) {
    emptyStateEl.style.display = "block";
    return;
  } else {
    emptyStateEl.style.display = "none";
  }

  filtered.forEach((report) => {
    const card = document.createElement("div");
    card.className = "report-card";

    // نوع البلاغ: منشور أو قصة
    const isPost = report.targetType === "post";
    const isStory = report.targetType === "story";

    // بيانات الهدف
    const post = report.post || null;
    const story = report.story || null;

    let targetTitle = "";
    let targetDetails = "";
    let targetMeta = "";

    if (isPost && post) {
      targetTitle = "بلاغ على منشور";
      const text = (post.text || "").trim();
      if (text) {
        targetDetails = text.length > 90 ? text.slice(0, 90) + "..." : text;
      } else if (post.imageUrl && post.videoUrl) {
        targetDetails = "منشور يحتوي صورة وفيديو";
      } else if (post.imageUrl) {
        targetDetails = "منشور يحتوي صورة";
      } else if (post.videoUrl) {
        targetDetails = "منشور يحتوي فيديو";
      } else if (post.link) {
        targetDetails = `منشور يحتوي رابط: ${post.link}`;
      } else {
        targetDetails = "منشور بدون نص واضح.";
      }

      const created = post.createdAt
        ? new Date(post.createdAt).toLocaleString("ar-SY")
        : "...";
      targetMeta = `تاريخ إنشاء المنشور: ${created}`;
    } else if (isStory && story) {
      targetTitle = "بلاغ على قصة (Story)";
      const text = (story.text || "").trim();
      if (text) {
        targetDetails = text.length > 90 ? text.slice(0, 90) + "..." : text;
      } else if (story.mediaType === "video") {
        targetDetails = "قصة تحتوي فيديو";
      } else {
        targetDetails = "قصة تحتوي صورة / وسائط";
      }

      const created = story.createdAt
        ? new Date(story.createdAt).toLocaleString("ar-SY")
        : "...";
      targetMeta = `تاريخ إنشاء القصة: ${created}`;
    } else if (isStory && !story) {
      // لو بلاغ ستوري لكن الـ populate ما رجع القصة
      targetTitle = "بلاغ على قصة (Story)";
      targetDetails = "لم يتم جلب بيانات القصة (قد تكون محذوفة).";
      targetMeta = "";
    } else {
      targetTitle = "بلاغ بدون هدف محدد";
      targetDetails = "لا توجد بيانات عن المنشور أو القصة.";
    }

    // حالة البلاغ
    let statusClass = "badge-pending";
    let statusText = "قيد المراجعة";
    if (report.status === "accepted") {
      statusClass = "badge-accepted";
      statusText = "مقبولة";
    } else if (report.status === "rejected") {
      statusClass = "badge-rejected";
      statusText = "مرفوضة";
    }

    // بيانات المبلغ
    const reporterName =
      (report.reporter && report.reporter.username) ||
      (report.reporter && report.reporter.email) ||
      "مستخدم مجهول";
    const reporterEmail =
      (report.reporter && report.reporter.email) || "";

    const createdAt = report.createdAt
      ? new Date(report.createdAt).toLocaleString("ar-SY")
      : "...";

    // HTML الكارت
    card.innerHTML = `
      <div class="report-header">
        <div>
          <div class="report-section-title">${targetTitle}</div>
          <div class="report-post-text">${targetDetails}</div>
          ${
            targetMeta
              ? `<div class="report-small" style="margin-top:2px;">${targetMeta}</div>`
              : ""
          }
        </div>
        <div style="text-align:right;">
          <span class="report-badge ${statusClass}">${statusText}</span>
          <div class="report-small" style="margin-top:4px; opacity:0.7;">
            نوع البلاغ: ${report.targetType || "غير محدد"}
          </div>
        </div>
      </div>

      <div class="report-small">
        <div><strong>سبب البلاغ:</strong> ${report.reason || "غير مذكور"}</div>
        ${
          report.details
            ? `<div><strong>تفاصيل إضافية:</strong> ${report.details}</div>`
            : ""
        }
      </div>

      <div class="report-small" style="margin-top:4px;">
        <div><strong>المبلغ:</strong> ${reporterName}</div>
        ${
          reporterEmail
            ? `<div><strong>البريد:</strong> ${reporterEmail}</div>`
            : ""
        }
        <div><strong>تاريخ البلاغ:</strong> ${createdAt}</div>
      </div>
    `;

    // أزرار الإجراءات
    const actions = document.createElement("div");
    actions.className = "report-actions";

    const btnAccept = document.createElement("button");
    btnAccept.className = "admin-btn-small btn-accept";
    btnAccept.textContent = "قبول البلاغ وحذف المحتوى";

    const btnReject = document.createElement("button");
    btnReject.className = "admin-btn-small btn-reject";
    btnReject.textContent = "رفض البلاغ";

    if (report.status !== "pending") {
      btnAccept.disabled = true;
      btnReject.disabled = true;
      btnAccept.style.opacity = 0.6;
      btnReject.style.opacity = 0.6;
    }

    btnAccept.addEventListener("click", () => {
      handleReportAction(report._id, "accept");
    });

    btnReject.addEventListener("click", () => {
      handleReportAction(report._id, "reject");
    });

    actions.appendChild(btnAccept);
    actions.appendChild(btnReject);
    card.appendChild(actions);

    reportsListEl.appendChild(card);
  });
}

// ===== تنفيذ قبول / رفض البلاغ =====
async function handleReportAction(reportId, action) {
  const token = getToken();
  if (!token) {
    alert("انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى");
    return;
  }

  let url = API_BASE + "/admin/reports/" + reportId;
  if (action === "accept") url += "/accept";
  else url += "/reject";

  console.log(
    "[handleReportAction] action=",
    action,
    " reportId=",
    reportId,
    " url=",
    url
  );

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => null);
    console.log("[handleReportAction] status:", res.status, "body:", data);

    if (!res.ok) {
      alert((data && data.msg) || "فشل تنفيذ العملية على البلاغ");
      return;
    }

    alert((data && data.msg) || "تمت العملية بنجاح");
    await fetchReports(); // إعادة تحميل البلاغات
  } catch (err) {
    console.error("handleReportAction error:", err);
    alert("حدث خطأ أثناء معالجة البلاغ");
  }
}

// ===== فلتر الأزرار =====
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const status = btn.getAttribute("data-status") || "all";
    currentFilter = status;

    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    renderReports();
  });
});

// ===== إدارة المستخدمين / المشرفين =====
async function fetchUsers() {
  const token = getToken();
  if (!token) return;

  try {
    const res = await fetch(API_BASE + "/admin/users", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    console.log("GET /admin/users status:", res.status);

    if (!res.ok) throw new Error("فشل جلب المستخدمين");

    allUsers = await res.json();
    renderUsers();
  } catch (err) {
    console.error("fetchUsers error:", err);
    showError("حدث خطأ أثناء جلب المستخدمين");
  }
}

function renderUsers() {
  if (!usersListEl || !usersEmptyStateEl) return;

  usersListEl.innerHTML = "";

  const q = (userSearchInput.value || "").trim().toLowerCase();
  let filtered = allUsers;

  if (q) {
    filtered = allUsers.filter((u) => {
      const name = (u.username || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }

  if (!filtered.length) {
    usersEmptyStateEl.style.display = "block";
    return;
  } else {
    usersEmptyStateEl.style.display = "none";
  }

  filtered.forEach((u) => {
    const card = document.createElement("div");
    card.className = "user-card";

    const main = document.createElement("div");
    main.className = "user-main";

    const nameLine = document.createElement("div");
    nameLine.className = "user-name-line";

    const nameSpan = document.createElement("span");
    nameSpan.className = "user-name";
    nameSpan.textContent = u.username || "مستخدم بدون اسم";

    const badge = document.createElement("span");
    let badgeClass = "badge-normal";
    let badgeText = "مستخدم عادي";

    if (u.isAdmin) {
      badgeClass = "badge-admin";
      badgeText = "مشرف";
    }
    if (currentUserId && String(u._id) === String(currentUserId)) {
      badgeClass = "badge-self";
      badgeText = "أنت";
    }

    badge.className = badgeClass;
    badge.textContent = badgeText;

    nameLine.appendChild(nameSpan);
    nameLine.appendChild(badge);

    const emailSpan = document.createElement("span");
    emailSpan.className = "user-email";
    emailSpan.textContent = u.email || "";

    main.appendChild(nameLine);
    main.appendChild(emailSpan);

    const actions = document.createElement("div");
    actions.className = "user-actions";

    // زر جعل مشرف / إزالة مشرف
    if (String(u._id) !== String(currentUserId)) {
      const btnToggle = document.createElement("button");
      btnToggle.className =
        "admin-btn-small " + (u.isAdmin ? "btn-remove-admin" : "btn-make-admin");
      btnToggle.textContent = u.isAdmin ? "إزالة المشرف" : "جعل مشرف";

      btnToggle.addEventListener("click", () => {
        toggleAdmin(u._id, !!u.isAdmin);
      });

      actions.appendChild(btnToggle);
    }

    card.appendChild(main);
    card.appendChild(actions);

    usersListEl.appendChild(card);
  });
}

async function toggleAdmin(userId, isCurrentlyAdmin) {
  const token = getToken();
  if (!token) return;

  const endpoint = isCurrentlyAdmin
    ? "/admin/users/" + userId + "/remove-admin"
    : "/admin/users/" + userId + "/make-admin";

  try {
    const res = await fetch(API_BASE + endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json().catch(() => null);
    console.log("[toggleAdmin] status:", res.status, "body:", data);

    if (!res.ok) {
      alert((data && data.msg) || "فشل تعديل صلاحيات المستخدم");
      return;
    }

    alert((data && data.msg) || "تم التعديل بنجاح");
    await fetchUsers();
  } catch (err) {
    console.error("toggleAdmin error:", err);
    alert("حدث خطأ أثناء تعديل صلاحيات المستخدم");
  }
}

// ===== أحداث عامة =====
if (btnGoHome) {
  btnGoHome.addEventListener("click", () => {
    window.location.href = "/";
  });
}

if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/admin/login.html";
  });
}

if (userSearchInput) {
  userSearchInput.addEventListener("input", () => {
    renderUsers();
  });
}

// ===== تهيئة الصفحة =====
(async function initAdminDashboard() {
  await loadCurrentAdmin();
  await fetchReports();
  await fetchUsers();
})();

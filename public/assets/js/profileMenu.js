// ===============================
// ملف: assets/js/profileMenu.js
// ===============================

console.log("[ProfileMenu] ملف profileMenu.js تم تحميله ✅");

// عناصر الـ DOM
const pmBtn = document.getElementById("profileMenuBtn");
const pmOverlay = document.getElementById("profileMenuOverlay");
const pmCloseBtn = document.getElementById("profileMenuCloseBtn");

// أزرار داخل المودال
const pmTogglePrivacyBtn = document.getElementById("togglePrivacyBtn");
const pmTogglePrivacyLabel = document.getElementById("togglePrivacyLabel");
const pmGroupsBtn = document.getElementById("groupsBtn");
const pmMessageBtn = document.getElementById("messageBtn");
const pmCopyProfileBtn = document.getElementById("copyProfileLinkBtn");
const pmReportUserBtn = document.getElementById("reportUserBtn"); // زر الحظر
const pmLogoutBtn = document.getElementById("logoutBtn");

// ======================
// دوال مساعدة
// ======================

function pmGetUser() {
  try {
    if (typeof getUser === "function") return getUser();
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

function pmGetToken() {
  try {
    if (typeof getToken === "function") return getToken();
  } catch {}
  return localStorage.getItem("token") || "";
}

// ⭐ توست داخلي بسيط (بدون alert المتصفح)
let pmToastTimeout = null;
function pmNotify(msg, type = "info") {
  if (typeof showToast === "function") {
    showToast(msg, type);
    return;
  }

  let toast = document.getElementById("pm-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "pm-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "10px 18px";
    toast.style.borderRadius = "999px";
    toast.style.background = "rgba(15,23,42,0.97)";
    toast.style.color = "#fff";
    toast.style.fontSize = "14px";
    toast.style.zIndex = "9999";
    toast.style.boxShadow = "0 12px 30px rgba(0,0,0,0.45)";
    toast.style.transition = "opacity 0.25s ease";
    toast.style.opacity = "0";
    toast.style.display = "flex";
    toast.style.alignItems = "center";
    toast.style.gap = "8px";
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.opacity = "1";

  if (pmToastTimeout) clearTimeout(pmToastTimeout);
  pmToastTimeout = setTimeout(() => {
    toast.style.opacity = "0";
  }, 2600);
}

// API_BASE من السكربت العام
const PM_API_BASE = typeof API_BASE !== "undefined" ? API_BASE : null;

// ======================
// معلومات المستخدم
// ======================

const pmUser = pmGetUser();

const pmUserId =
  pmUser && (pmUser.id || pmUser._id)
    ? pmUser.id || pmUser._id
    : null;

const urlParams = new URLSearchParams(window.location.search);

// نفس profile.js → userId
const pmProfileUserId =
  urlParams.get("userId") ||
  (pmUser && (pmUser._id || pmUser.id));

const pmIsOwnProfile =
  pmUserId &&
  pmProfileUserId &&
  String(pmUserId) === String(pmProfileUserId);

// حالة الخصوصية لحسابك
let pmProfilePrivate = false;

// حالة الحظر
let pmIsBlockedByMe = false;
let pmHasBlockedMe = false;

// ======================
// فتح / إغلاق المودال
// ======================

function pmOpenMenu() {
  if (!pmOverlay) return;
  pmOverlay.classList.add("show");
}

function pmCloseMenu() {
  if (!pmOverlay) return;
  pmOverlay.classList.remove("show");
}

if (pmBtn) pmBtn.addEventListener("click", pmOpenMenu);
if (pmCloseBtn) pmCloseBtn.addEventListener("click", pmCloseMenu);

if (pmOverlay) {
  pmOverlay.addEventListener("click", (e) => {
    if (e.target === pmOverlay) pmCloseMenu();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") pmCloseMenu();
});

// ======================
// تحديث شكل زر الحظر
// ======================

function pmUpdateBlockButtonUI() {
  if (!pmReportUserBtn) return;

  const span = pmReportUserBtn.querySelector("span");
  const icon = pmReportUserBtn.querySelector("i");

  if (pmIsBlockedByMe) {
    if (span) span.textContent = "إلغاء حظر هذا الحساب";
    if (icon) icon.className = "fa-solid fa-user-check";
  } else {
    if (span) span.textContent = "حظر هذا الحساب";
    if (icon) icon.className = "fa-solid fa-user-slash";
  }

  if (pmHasBlockedMe) {
    pmReportUserBtn.title = "هذا الحساب قام بحظرك";
  } else {
    pmReportUserBtn.removeAttribute("title");
  }
}

// ======================
// إظهار / إخفاء أزرار حسب نوع البروفايل
// ======================

function pmSetupVisibility() {
  if (pmIsOwnProfile) {
    // بروفايلي أنا
    if (pmTogglePrivacyBtn) pmTogglePrivacyBtn.style.display = "flex";
    if (pmGroupsBtn) pmGroupsBtn.style.display = "flex";
    if (pmMessageBtn) pmMessageBtn.style.display = "none"; // ما في داعي
    if (pmCopyProfileBtn) pmCopyProfileBtn.style.display = "flex";
    if (pmReportUserBtn) pmReportUserBtn.style.display = "none";
    if (pmLogoutBtn) pmLogoutBtn.style.display = "flex";
  } else {
    // بروفايل شخص آخر
    if (pmTogglePrivacyBtn) pmTogglePrivacyBtn.style.display = "none";
    if (pmGroupsBtn) pmGroupsBtn.style.display = "none"; // كروباتك بتوصلها من مكان آخر
    if (pmMessageBtn) pmMessageBtn.style.display = "flex";
    if (pmCopyProfileBtn) pmCopyProfileBtn.style.display = "flex";
    if (pmReportUserBtn) pmReportUserBtn.style.display = "flex";
    if (pmLogoutBtn) pmLogoutBtn.style.display = "none";

    pmUpdateBlockButtonUI();
  }
}

pmSetupVisibility();

// ======================
// نص زر الخصوصية
// ======================

function pmUpdatePrivacyText() {
  if (!pmTogglePrivacyBtn || !pmTogglePrivacyLabel) return;

  if (pmProfilePrivate) {
    pmTogglePrivacyLabel.textContent = "جعل الحساب عام";
    const icon = pmTogglePrivacyBtn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-lock";
  } else {
    pmTogglePrivacyLabel.textContent = "جعل الحساب خاص";
    const icon = pmTogglePrivacyBtn.querySelector("i");
    if (icon) icon.className = "fa-solid fa-lock-open";
  }
}

// ======================
// جلب الخصوصية
// ======================

async function pmInitPrivacy() {
  if (!pmIsOwnProfile) return;
  if (!pmTogglePrivacyBtn || !pmTogglePrivacyLabel) return;

  if (!PM_API_BASE) {
    console.warn("[ProfileMenu] API_BASE غير معرّف");
    pmProfilePrivate = false;
    pmUpdatePrivacyText();
    return;
  }

  const token = pmGetToken();
  if (!token) {
    console.warn("[ProfileMenu] لا يوجد توكن");
    pmProfilePrivate = false;
    pmUpdatePrivacyText();
    return;
  }

  try {
    const res = await fetch(`${PM_API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      console.warn("[ProfileMenu] فشل جلب البروفايل:", data);
      pmProfilePrivate = false;
    } else {
      pmProfilePrivate = !!data.isPrivate;
    }
  } catch (err) {
    console.error("[ProfileMenu] خطأ جلب الخصوصية:", err);
    pmProfilePrivate = false;
  }

  pmUpdatePrivacyText();
}

// ======================
// جلب حالة الحظر من الـ API (لو مفعّل في السيرفر)
// ======================

async function pmInitBlockState() {
  if (!PM_API_BASE) return;
  if (!pmProfileUserId) return;
  if (!pmUserId) return;
  if (pmIsOwnProfile) return;

  const token = pmGetToken();
  if (!token) return;

  try {
    const res = await fetch(`${PM_API_BASE}/users/${pmProfileUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      console.warn("[ProfileMenu] فشل جلب معلومات الحظر:", data);
      return;
    }

    if (typeof data.isBlockedByMe !== "undefined") {
      pmIsBlockedByMe = !!data.isBlockedByMe;
    }
    if (typeof data.hasBlockedMe !== "undefined") {
      pmHasBlockedMe = !!data.hasBlockedMe;
    }

    pmUpdateBlockButtonUI();
  } catch (err) {
    console.error("[ProfileMenu] خطأ جلب حالة الحظر:", err);
  }
}

// تشغيل التهيئة
pmInitPrivacy();
pmInitBlockState();

// ======================
// أحداث الأزرار
// ======================

// 1) تغيير الخصوصية
async function pmHandlePrivacyClick() {
  if (!pmIsOwnProfile) return;
  if (!pmTogglePrivacyBtn || !pmTogglePrivacyLabel) return;

  if (!PM_API_BASE) {
    pmNotify("API_BASE غير معرّف في الصفحة", "error");
    return;
  }

  const token = pmGetToken();
  if (!token) {
    pmNotify("يجب تسجيل الدخول أولاً لتعديل خصوصية الحساب", "error");
    return;
  }

  const newValue = !pmProfilePrivate;

  try {
    const res = await fetch(`${PM_API_BASE}/users/me/privacy`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isPrivate: newValue }),
    });

    const data = await res.json();

    if (!res.ok) {
      pmNotify(data.msg || "تعذّر تحديث خصوصية الحساب", "error");
      return;
    }

    pmProfilePrivate =
      typeof data.isPrivate !== "undefined" ? !!data.isPrivate : newValue;

    pmUpdatePrivacyText();

    pmNotify(
      data.msg ||
        (pmProfilePrivate
          ? "تم ضبط الحساب كحساب خاص ✅"
          : "تم ضبط الحساب كحساب عام ✅"),
      "success"
    );
  } catch (err) {
    console.error("[ProfileMenu] خطأ أثناء تحديث الخصوصية:", err);
    pmNotify("حدث خطأ أثناء تحديث خصوصية الحساب", "error");
  }
}

if (pmTogglePrivacyBtn) {
  pmTogglePrivacyBtn.addEventListener("click", pmHandlePrivacyClick);
}

// 2) الكروبات
if (pmGroupsBtn) {
  pmGroupsBtn.addEventListener("click", () => {
    window.location.href = "groups.html";
  });
}

// 3) المراسلة
if (pmMessageBtn) {
  pmMessageBtn.addEventListener("click", () => {
    if (pmIsOwnProfile) {
      pmNotify("لا يمكنك مراسلة نفسك", "info");
      return;
    }

    if (!pmProfileUserId) {
      pmNotify("لا يمكن تحديد هذا المستخدم للمراسلة", "error");
      return;
    }

    if (pmHasBlockedMe) {
      pmNotify("لا يمكنك مراسلة هذا الحساب لأنه قام بحظرك", "error");
      return;
    }

    if (pmIsBlockedByMe) {
      pmNotify(
        "لا يمكنك مراسلة حساب قمت بحظره، ألغِ الحظر أولاً",
        "error"
      );
      return;
    }

    window.location.href = `chat.html?user=${pmProfileUserId}`;
  });
}

// 4) نسخ رابط البروفايل
if (pmCopyProfileBtn) {
  pmCopyProfileBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      pmNotify("تم نسخ رابط البروفايل ✔", "success");
    } catch {
      pmNotify("تعذر نسخ الرابط ❌", "error");
    }
  });
}

// 5) حظر / إلغاء حظر
async function pmHandleBlockClick() {
  if (pmIsOwnProfile) return;

  if (!PM_API_BASE) {
    pmNotify("API_BASE غير معرّف في الصفحة", "error");
    return;
  }

  if (!pmProfileUserId) {
    pmNotify("لا يمكن تحديد هذا المستخدم للحظر", "error");
    return;
  }

  const token = pmGetToken();
  if (!token) {
    pmNotify("يجب تسجيل الدخول لاستخدام الحظر", "error");
    return;
  }

  try {
    const res = await fetch(
      `${PM_API_BASE}/users/${pmProfileUserId}/block-toggle`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();

    if (!res.ok) {
      pmNotify(data.msg || "تعذّر تحديث الحظر", "error");
      return;
    }

    if (typeof data.blocked !== "undefined") {
      pmIsBlockedByMe = !!data.blocked;
    }

    pmUpdateBlockButtonUI();

    pmNotify(
      data.msg ||
        (pmIsBlockedByMe
          ? "تم حظر هذا الحساب ✅"
          : "تم إلغاء حظر هذا الحساب ✅"),
      "success"
    );
  } catch (err) {
    console.error("[ProfileMenu] خطأ أثناء الحظر/إلغاء الحظر:", err);
    pmNotify("حدث خطأ أثناء تعديل حالة الحظر", "error");
  }
}

if (pmReportUserBtn) {
  pmReportUserBtn.addEventListener("click", pmHandleBlockClick);
}

// 6) تسجيل الخروج
if (pmLogoutBtn) {
  pmLogoutBtn.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    pmNotify("تم تسجيل الخروج ✔", "success");
    window.location.href = "login.html";
  });
}

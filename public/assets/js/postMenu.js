// assets/js/postMenu.js
console.log("[PostMenu] ملف postMenu.js تم تحميله ✅");

// ===== عناصر القائمة الأساسية =====
const postMenuOverlay = document.getElementById("postMenuOverlay");
const postMenuCloseBtn = document.getElementById("postMenuCloseBtn");

// ===== عناصر مودال الحذف =====
const postDeleteOverlay = document.getElementById("postDeleteOverlay");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

// ===== عناصر مودال التعديل =====
const postEditOverlay = document.getElementById("postEditOverlay");
const postEditCloseBtn = document.getElementById("postEditCloseBtn");
const postEditForm = document.getElementById("postEditForm");
const postEditText = document.getElementById("postEditText");
const postEditMediaInput = document.getElementById("postEditMediaInput");
const postEditSaving = document.getElementById("postEditSaving");
const postEditPrivacySelect = document.getElementById("postEditPrivacy");

// ===== عناصر مودال الإبلاغ =====
const reportOverlay = document.getElementById("reportOverlay");
const reportCloseBtn = document.getElementById("reportCloseBtn");
const reportCancelBtn = document.getElementById("reportCancelBtn");
const reportSubmitBtn = document.getElementById("reportSubmitBtn");
const reportReasonSelect = document.getElementById("reportReasonSelect");
const reportOtherWrapper = document.getElementById("reportOtherWrapper");
const reportOtherTextarea = document.getElementById("reportDetailsTextarea");

// ===== متغيّرات حالة =====
let currentPost = null;
let postToDelete = null;
let editingPostId = null;
let editPrivacy = "public";

let reportingPostId = null;
let reportingMenuItem = null;

// ===== Toast مساعد =====
function pmNotify(msg, type = "info") {
  if (typeof showToast === "function") {
    showToast(msg, type);
  } else {
    console.log("[PostMenu Toast]", type, msg);
  }
}

// ===================== فتح / إغلاق قائمة الـ 3 نقاط =====================

function openPostMenuFor(postElement) {
  currentPost = postElement;
  if (!postMenuOverlay || !currentPost) return;

  // تحديد هل المستخدم مالك المنشور
  let isOwner = false;
  if (
    currentPost.dataset.owner === "true" ||
    currentPost.dataset.isOwner === "true"
  ) {
    isOwner = true;
  } else {
    const trigger = currentPost.querySelector(".post-menu-trigger");
    if (
      trigger &&
      (trigger.dataset.isOwner === "1" || trigger.dataset.isOwner === "true")
    ) {
      isOwner = true;
    }
  }

  // هل يوجد ميديا
  let hasMedia = false;
  if (currentPost.dataset.hasMedia === "true") {
    hasMedia = true;
  } else if (currentPost.querySelector(".post-media img, .post-media video")) {
    hasMedia = true;
  }

  const ownerOnlyItems = postMenuOverlay.querySelectorAll(".owner-only");
  const notOwnerItems = postMenuOverlay.querySelectorAll(".not-owner-only");
  const hasMediaItems = postMenuOverlay.querySelectorAll(".has-media");

  ownerOnlyItems.forEach((el) => {
    el.style.display = isOwner ? "flex" : "none";
  });
  notOwnerItems.forEach((el) => {
    el.style.display = isOwner ? "none" : "flex";
  });
  hasMediaItems.forEach((el) => {
    el.style.display = hasMedia ? "flex" : "none";
  });

  postMenuOverlay.classList.add("active");
}

function closePostMenu() {
  if (!postMenuOverlay) return;
  postMenuOverlay.classList.remove("active");
}

// ===================== مودال الحذف =====================

function openDeleteModalFor(postElement) {
  postToDelete = postElement;
  if (!postDeleteOverlay || !postToDelete) return;
  postDeleteOverlay.classList.add("active");
}

function closeDeleteModal() {
  if (!postDeleteOverlay) return;
  postDeleteOverlay.classList.remove("active");
  postToDelete = null;
}

// ===================== مودال التعديل =====================

function openEditModalFor(postElement) {
  if (!postEditOverlay || !postEditForm) {
    pmNotify("مودال تعديل المنشور غير متوفر في هذه الصفحة", "error");
    return;
  }
  if (!postElement) return;

  currentPost = postElement;
  const postId = currentPost.dataset.postId;
  editingPostId = postId;

  const textEl = currentPost.querySelector(".post-text");
  const text = textEl ? textEl.textContent.trim() : "";
  if (postEditText) postEditText.value = text;

  const currentPrivacy =
    currentPost.dataset.privacy === "private" ? "private" : "public";
  editPrivacy = currentPrivacy;
  if (postEditPrivacySelect) postEditPrivacySelect.value = editPrivacy;

  if (postEditMediaInput) postEditMediaInput.value = "";

  postEditOverlay.classList.add("active");
}

function closeEditModal() {
  if (!postEditOverlay) return;
  postEditOverlay.classList.remove("active");
  editingPostId = null;
  if (postEditSaving) postEditSaving.style.display = "none";
}

// تغيير الخصوصية من الـ select
if (postEditPrivacySelect) {
  postEditPrivacySelect.addEventListener("change", () => {
    const val = postEditPrivacySelect.value;
    editPrivacy = val === "private" ? "private" : "public";
  });
}

// إغلاق مودال التعديل
if (postEditCloseBtn) {
  postEditCloseBtn.addEventListener("click", closeEditModal);
}
if (postEditOverlay) {
  postEditOverlay.addEventListener("click", (e) => {
    if (e.target === postEditOverlay) closeEditModal();
  });
}

// ===================== مودال الإبلاغ =====================

function resetReportModalFields() {
  if (reportReasonSelect) reportReasonSelect.value = "";
  if (reportOtherWrapper) reportOtherWrapper.classList.add("hidden");
  if (reportOtherTextarea) reportOtherTextarea.value = "";
  if (reportSubmitBtn) {
    reportSubmitBtn.classList.remove("disabled");
    reportSubmitBtn.textContent = "إرسال البلاغ";
  }
}

function openReportModalFor(postElement, menuItem) {
  if (!reportOverlay || !reportReasonSelect || !reportSubmitBtn) {
    pmNotify("نظام الإبلاغ غير متوفر حالياً", "error");
    return;
  }

  currentPost = postElement;
  reportingPostId = currentPost ? currentPost.dataset.postId : null;
  reportingMenuItem = menuItem || null;

  if (!reportingPostId) {
    pmNotify("تعذر تحديد المنشور للإبلاغ", "error");
    return;
  }

  resetReportModalFields();
  reportOverlay.classList.remove("hidden");
  void reportOverlay.offsetWidth;
  reportOverlay.classList.add("show");
}

function closeReportModal() {
  if (!reportOverlay) return;
  reportOverlay.classList.remove("show");
  setTimeout(() => {
    reportOverlay.classList.add("hidden");
  }, 200);

  reportingPostId = null;
  reportingMenuItem = null;
  resetReportModalFields();
}

// حقل "سبب آخر"
if (reportReasonSelect) {
  reportReasonSelect.addEventListener("change", () => {
    if (!reportOtherWrapper) return;
    if (reportReasonSelect.value === "other") {
      reportOtherWrapper.classList.remove("hidden");
    } else {
      reportOtherWrapper.classList.add("hidden");
    }
  });
}

// أزرار إغلاق الإبلاغ
if (reportCloseBtn) reportCloseBtn.addEventListener("click", closeReportModal);
if (reportCancelBtn) reportCancelBtn.addEventListener("click", closeReportModal);
if (reportOverlay) {
  reportOverlay.addEventListener("click", (e) => {
    if (e.target === reportOverlay) closeReportModal();
  });
}

// إرسال البلاغ
if (reportSubmitBtn) {
  reportSubmitBtn.addEventListener("click", async () => {
    if (!reportingPostId) {
      pmNotify("لا يوجد منشور مُحدد للإبلاغ", "error");
      return;
    }

    const token = typeof getToken === "function" ? getToken() : null;
    if (!token) {
      pmNotify("يجب تسجيل الدخول للإبلاغ عن منشور", "error");
      return;
    }

    const reason = reportReasonSelect ? reportReasonSelect.value : "";
    const details = reportOtherTextarea
      ? reportOtherTextarea.value.trim()
      : "";

    if (!reason) {
      pmNotify("يرجى اختيار سبب الإبلاغ", "error");
      return;
    }

    try {
      reportSubmitBtn.classList.add("disabled");
      reportSubmitBtn.textContent = "جارٍ إرسال البلاغ...";

      const res = await fetch(`${API_BASE}/posts/report/${reportingPostId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ reason, details }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || "تعذر إرسال البلاغ");

      pmNotify(
        data.msg || "تم استلام بلاغك، سيتم مراجعته ✅",
        "success"
      );

      if (reportingMenuItem) {
        reportingMenuItem.classList.add("disabled");
        const span = reportingMenuItem.querySelector("span");
        if (span) span.textContent = "تم الإبلاغ عن المنشور";
      }

      closeReportModal();
    } catch (err) {
      console.error("[PostMenu] report error", err);
      pmNotify(err.message || "تعذر إرسال البلاغ", "error");
      reportSubmitBtn.classList.remove("disabled");
      reportSubmitBtn.textContent = "إرسال البلاغ";
    }
  });
}

// ===================== ربط زر 3 نقاط بالكروت =====================

function attachPostMenuListener(container) {
  if (!container) return;
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".post-menu-trigger");
    if (!btn) return;

    const card = btn.closest(".post-card[data-post-id]");
    if (!card) return;

    const postId = card.dataset.postId;
    console.log("[PostMenu] open menu for post:", postId);

    openPostMenuFor(card);
  });
}

const homePostsContainer = document.getElementById("posts");
const profilePostsContainerForMenu = document.getElementById("profilePosts");

attachPostMenuListener(homePostsContainer);
attachPostMenuListener(profilePostsContainerForMenu);

// ===================== إغلاق قائمة 3 نقاط =====================

if (postMenuCloseBtn) {
  postMenuCloseBtn.addEventListener("click", closePostMenu);
}
if (postMenuOverlay) {
  postMenuOverlay.addEventListener("click", (e) => {
    if (e.target === postMenuOverlay) closePostMenu();
  });
}

// ===================== أزرار داخل القائمة =====================

if (postMenuOverlay) {
  postMenuOverlay.addEventListener("click", async (e) => {
    const item = e.target.closest(".post-menu-item");
    if (!item || !currentPost) return;

    const action = item.dataset.action;
    const postId = currentPost.dataset.postId;
    const token = typeof getToken === "function" ? getToken() : null;

    try {
      switch (action) {
        case "edit":
          closePostMenu();
          openEditModalFor(currentPost);
          break;

        case "delete":
          closePostMenu();
          openDeleteModalFor(currentPost);
          break;

        case "save":
          // ⭐ حالياً مجرد رسالة، ما في API حقيقي للحفظ
          pmNotify("ميزة حفظ المنشورات قيد التطوير في Saepel 🔧", "info");
          break;

        case "downloadMedia":
        case "download-media": {
          const mediaUrl = currentPost.dataset.mediaUrl;
          if (!mediaUrl) {
            pmNotify("لا يوجد صورة أو فيديو في هذا المنشور", "error");
            return;
          }
          const a = document.createElement("a");
          a.href = mediaUrl;
          a.download = "";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          pmNotify("جارِ تنزيل الوسائط 📥", "info");
          break;
        }

        case "copyLink":
        case "copy-link": {
          const url = `${window.location.origin}/post/${postId}`;
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            pmNotify("تم نسخ رابط المنشور ✅", "success");
          } else {
            pmNotify("رابط المنشور: " + url, "info");
          }
          break;
        }

        case "copyText":
        case "copy-text": {
          const textEl = currentPost.querySelector(".post-text");
          const text = textEl ? textEl.textContent.trim() : "";
          if (!text) {
            pmNotify("لا يوجد نص لنسخه في هذا المنشور", "error");
            return;
          }
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
            pmNotify("تم نسخ نص المنشور ✅", "success");
          } else {
            pmNotify("نص المنشور:\n" + text, "info");
          }
          break;
        }

        case "report":
          if (!token) {
            pmNotify("يجب تسجيل الدخول للإبلاغ عن منشور", "error");
            return;
          }
          closePostMenu();
          openReportModalFor(currentPost, item);
          break;

        case "hidePost":
          currentPost.style.display = "none";
          pmNotify("تم إخفاء المنشور من صفحتك 👌", "success");
          closePostMenu();
          break;

        case "unfollowUser":
          pmNotify("ميزة إلغاء المتابعة قيد التطوير في Saepel 🔧", "info");
          break;

        default:
          pmNotify("هذه الميزة قيد التطوير في Saepel 🔧", "info");
          break;
      }
    } catch (err) {
      console.error("[PostMenu] action error", err);
      pmNotify(err.message || "حدث خطأ أثناء تنفيذ العملية", "error");
    }
  });
}

// ===================== حذف المنشور فعلياً =====================

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener("click", closeDeleteModal);
}
if (postDeleteOverlay) {
  postDeleteOverlay.addEventListener("click", (e) => {
    if (e.target === postDeleteOverlay) closeDeleteModal();
  });
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener("click", async () => {
    if (!postToDelete) return;

    const postId = postToDelete.dataset.postId;
    const token = typeof getToken === "function" ? getToken() : null;

    if (!token) {
      pmNotify("يجب تسجيل الدخول لحذف المنشور", "error");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/posts/${postId}`, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || "تعذر حذف المنشور");

      if (postToDelete && postToDelete.parentNode) {
        postToDelete.parentNode.removeChild(postToDelete);
      }

      pmNotify("تم حذف المنشور بنجاح ✅", "success");
      closeDeleteModal();

      if (typeof refreshFeed === "function") {
        await refreshFeed();
      }
    } catch (err) {
      console.error("[PostMenu] delete error", err);
      pmNotify(err.message || "تعذر حذف المنشور", "error");
    }
  });
}

// ===================== حفظ التعديل =====================

if (postEditForm) {
  postEditForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingPostId) return;

    const token = typeof getToken === "function" ? getToken() : null;
    if (!token) {
      pmNotify("يجب تسجيل الدخول لتعديل المنشور", "error");
      return;
    }

    const newText = postEditText ? postEditText.value.trim() : "";
    const privacyValue = editPrivacy || "public";

    const mediaFile =
      postEditMediaInput && postEditMediaInput.files
        ? postEditMediaInput.files[0]
        : null;

    const formData = new FormData();
    formData.append("text", newText);
    formData.append("privacy", privacyValue);
    if (mediaFile) formData.append("media", mediaFile);

    try {
      if (postEditSaving) postEditSaving.style.display = "inline-block";

      const res = await fetch(`${API_BASE}/posts/${editingPostId}`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.msg || "تعذر تعديل المنشور");

      pmNotify("تم حفظ التعديلات بنجاح ✅", "success");
      closeEditModal();

      if (currentPost) currentPost.dataset.privacy = privacyValue;

      if (typeof refreshFeed === "function") {
        await refreshFeed();
      }
    } catch (err) {
      console.error("[PostMenu] edit error", err);
      pmNotify(err.message || "تعذر تعديل المنشور", "error");
      if (postEditSaving) postEditSaving.style.display = "none";
    }
  });
}

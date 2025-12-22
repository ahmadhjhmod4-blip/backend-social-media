// ===== إعدادات السيرفر / API =====
// ملاحظة: على Render لا تستخدم localhost.
// - إذا كنت فاتح الواجهة من نفس دومين Render (نفس السيرفر)، نخليها نفس الأصل: ""
// - إذا كنت على localhost نخليها localhost
// - غير هيك (مثلاً Frontend على دومين ثاني) نخليها دومين Render الافتراضي
const LOCAL_BASE = "http://localhost:5000";
const RENDER_BASE = "https://backend-social-media-1ininin.onrender.com";

// يمكن override من الـHTML قبل تحميل app.js:
// <script>window.SERVER_BASE="https://...";</script>
const SERVER_BASE =
  window.SERVER_BASE ||
  window.API_BASE ||
  (location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? LOCAL_BASE
    : location.hostname.endsWith("onrender.com")
    ? ""
    : RENDER_BASE);
const API_BASE = SERVER_BASE + "/api";

// ===== دوال مساعدة =====
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

// المستخدم الحالي من التخزين
const currentUser = getUser();
const currentUserId =
  currentUser && (currentUser.id || currentUser._id)
    ? currentUser.id || currentUser._id
    : null;

// ✅ قائمة IDs المنشورات المحفوظة للمستخدم الحالي
let savedPostIds = new Set();

// ===== تأمين النص =====
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str = "") {
  return String(str).replace(/"/g, "&quot;");
}

// بناء رابط أفاتار من الـ backend
function buildAvatarUrl(avatar) {
  if (!avatar) return "";
  let raw = String(avatar).trim();
  if (!raw) return "";

  raw = raw.replace(/\\/g, "/");

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  if (!raw.startsWith("/")) {
    raw = "/" + raw;
  }

  return SERVER_BASE + raw;
}

// ترسيم أفاتار (مع صورة لو موجودة)
function renderAvatar(userObj, sizeClass = "avatar-lg", fallbackChar = "م") {
  const ch = fallbackChar || "م";
  const avatarUrl =
    userObj && userObj.avatar ? buildAvatarUrl(userObj.avatar) : "";

  if (avatarUrl) {
    return `
      <div class="${sizeClass} avatar-img">
        <img src="${escapeAttr(avatarUrl)}" alt="avatar">
      </div>
    `;
  }

  return `
    <div class="${sizeClass}">
      ${ch}
    </div>
  `;
}

// ===== عناصر من الـ DOM =====
const topNav = document.querySelector(".top-nav");
const bottomNav = document.querySelector(".bottom-nav");
const postsDiv = document.getElementById("posts");
const createMsg = document.getElementById("createMsg");

const welcomeUserAvatar = document.getElementById("welcomeUser");
const currentUserAvatar = document.getElementById("currentUserAvatar");
const modalUserAvatar = document.getElementById("modalUserAvatar");
const modalUserName = document.getElementById("modalUserName");
const createPlaceholder = document.getElementById("createPlaceholder");

const modalOverlay = document.getElementById("createPostModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const postText = document.getElementById("postText");
const publishBtn = document.getElementById("publishBtn");

// 🔹 عناصر خاصة بالميديا/الرابط داخل المودال
const modalAddMediaBtn = document.getElementById("modalAddMediaBtn");
const modalAddLinkBtn = document.getElementById("modalAddLinkBtn");
const postMediaInput = document.getElementById("postMediaInput"); // <input type="file">
const postLinkInput = document.getElementById("postLinkInput"); // <input type="url">
const postMediaPreview = document.getElementById("postMediaPreview"); // حاوية للمعاينة

// 🔹 عنصر الخصوصية (عام / خاص)
const privacyToggle = document.getElementById("privacyToggle");

// حالة المودال الحالية
let selectedMediaFile = null; // ملف صورة/فيديو
let currentLinkUrl = ""; // رابط مرفق
let currentPrivacy = "public"; // "public" أو "private"

// ✅ Toast أنيق بدل alert
const toastEl = document.getElementById("saeToast");

function showToast(message, type = "info") {
  if (!toastEl) {
    console.log("Toast:", type, message);
    return;
  }

  toastEl.textContent = message;
  toastEl.classList.remove("success", "error");

  if (type === "success") {
    toastEl.classList.add("success");
  } else if (type === "error") {
    toastEl.classList.add("error");
  }

  toastEl.classList.add("visible");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () {
    toastEl.classList.remove("visible");
  }, 2600);
}

// ✅ تحديث الـ UI الخاص بزر الخصوصية
function updatePrivacyUI() {
  if (!privacyToggle) return;
  const isPublic = currentPrivacy === "public";

  privacyToggle.innerHTML = `
    <i class="fa-solid ${isPublic ? "fa-earth-asia" : "fa-lock"}"></i>
    ${isPublic ? "عام" : "خاص"}
  `;
  privacyToggle.classList.toggle("pill-private", !isPublic);
}

const openTriggers = [
  document.getElementById("openCreateModal"),
  document.getElementById("fabOpen"),
  document.getElementById("cpMedia"),
  document.getElementById("bottomAdd"),
  document.getElementById("storyAdd"),
].filter(Boolean);

// 🔹 تحديث حالة زر النشر (يتفعّل لو في نص أو ميديا أو رابط)
function updatePublishButtonState() {
  if (!publishBtn) return;
  const hasText = postText && postText.value.trim().length > 0;
  const hasMedia = !!selectedMediaFile;
  const hasLink = !!currentLinkUrl;
  publishBtn.disabled = !(hasText || hasMedia || hasLink);
}

// ===== تهيئة واجهة المستخدم باسم المستخدم =====
(function initUserUI() {
  const user = getUser();
  if (!user) return;

  const name = user.name || user.username || user.email || "مستخدم";
  const firstChar = name.trim()[0] ? name.trim()[0].toUpperCase() : "م";

  if (welcomeUserAvatar) welcomeUserAvatar.textContent = firstChar;
  if (currentUserAvatar) currentUserAvatar.textContent = firstChar;
  if (modalUserAvatar) modalUserAvatar.textContent = firstChar;
  if (modalUserName) modalUserName.textContent = name;

  if (createPlaceholder) {
    const firstName = name.split(" ")[0] || name;
    createPlaceholder.textContent =
      "شو حابب تشارك اليوم يا " + firstName + "؟";
  }
})();

// ===== فتح / إغلاق المودال =====
function resetCreateModal() {
  if (postText) postText.value = "";
  selectedMediaFile = null;
  currentLinkUrl = "";
  currentPrivacy = "public"; // رجوع للوضع العام
  updatePrivacyUI();

  if (postMediaInput) postMediaInput.value = "";
  if (postLinkInput) postLinkInput.value = "";
  if (postMediaPreview) postMediaPreview.innerHTML = "";

  if (createMsg) {
    createMsg.textContent = "";
    createMsg.style.color = "";
  }

  updatePublishButtonState();
}

function openModal() {
  if (!modalOverlay) return;
  resetCreateModal();
  modalOverlay.classList.add("active");
}

function closeModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove("active");
}

openTriggers.forEach(function (el) {
  if (el) el.addEventListener("click", openModal);
});

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", closeModal);
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", function (e) {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });
}

if (postText && publishBtn) {
  postText.addEventListener("input", updatePublishButtonState);
}

// 🔹 كليك على زر الخصوصية (يبدّل بين عام / خاص)
if (privacyToggle) {
  privacyToggle.style.cursor = "pointer";
  privacyToggle.addEventListener("click", function () {
    currentPrivacy = currentPrivacy === "public" ? "private" : "public";
    updatePrivacyUI();
  });
  updatePrivacyUI();
}

// ========== تهيئة فيديو واحد (مع شريط تقدّم) ==========
function initSingleVideoWrapper(wrapper) {
  if (!wrapper) return;
  const video = wrapper.querySelector("video");
  if (!video) return;

  // سرعة افتراضية
  wrapper.dataset.speedIndex = "0";
  video.playbackRate = 1;

  const progressEl = wrapper.querySelector("[data-video-progress]");
  const barEl = progressEl
    ? progressEl.querySelector(".sae-video-progress-bar")
    : null;

  function updateProgress() {
    if (!progressEl || !barEl) return;
    const dur = video.duration;
    if (!dur || isNaN(dur) || !isFinite(dur)) {
      barEl.style.width = "0%";
      return;
    }
    const percent = (video.currentTime / dur) * 100;
    barEl.style.width = percent + "%";
  }

  video.addEventListener("timeupdate", updateProgress);
  video.addEventListener("loadedmetadata", updateProgress);
  video.addEventListener("seeking", updateProgress);

  if (progressEl) {
    progressEl.addEventListener("click", function (e) {
      const rect = progressEl.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      const dur = video.duration;
      if (!dur || isNaN(dur) || !isFinite(dur)) return;
      const newTime = Math.min(Math.max(ratio, 0), 1) * dur;
      video.currentTime = newTime;
      updateProgress();
    });
  }

  video.addEventListener("ended", function () {
    wrapper.classList.remove("is-playing");
    updateProgress();
  });

  video.addEventListener("pause", function () {
    wrapper.classList.remove("is-playing");
  });
}

// ===== مشغّل الفيديو: تهيئة بعد رسم البوستات =====
function initVideoPlayers() {
  if (!postsDiv) return;
  const wrappers = postsDiv.querySelectorAll(".sae-video-shell");
  wrappers.forEach(function (wrapper) {
    initSingleVideoWrapper(wrapper);
  });
}

// 🔹 أحداث الميديا والرابط داخل المودال
if (modalAddMediaBtn && postMediaInput) {
  modalAddMediaBtn.addEventListener("click", function () {
    postMediaInput.click();
  });
}

if (postMediaInput) {
  postMediaInput.addEventListener("change", function () {
    const file =
      postMediaInput.files && postMediaInput.files[0]
        ? postMediaInput.files[0]
        : null;
    selectedMediaFile = file;

    if (postMediaPreview) {
      postMediaPreview.innerHTML = "";
      if (selectedMediaFile) {
        const url = URL.createObjectURL(selectedMediaFile);
        if (selectedMediaFile.type.indexOf("image/") === 0) {
          postMediaPreview.innerHTML = `
            <div class="post-media">
              <img src="${escapeAttr(url)}" alt="preview" />
            </div>
          `;
        } else if (selectedMediaFile.type.indexOf("video/") === 0) {
          postMediaPreview.innerHTML = `
            <div class="post-media sae-video-shell" data-video-wrapper>
              <video
                class="sae-video"
                src="${escapeAttr(url)}"
                preload="metadata"
              ></video>

              <!-- شريط التقدم -->
              <div class="sae-video-progress" data-video-progress>
                <div class="sae-video-progress-bar"></div>
              </div>

              <button class="sae-video-play" type="button" aria-label="تشغيل الفيديو">
                <i class="fa-solid fa-play"></i>
              </button>
              <button
                class="sae-video-ctrl sae-video-ctrl--back"
                type="button"
                data-video-ctrl="back"
                title="رجوع 10 ثواني"
              >
                <i class="fa-solid fa-rotate-left"></i>
                <span>10s</span>
              </button>
              <button
                class="sae-video-ctrl sae-video-ctrl--forward"
                type="button"
                data-video-ctrl="forward"
                title="تقديم 10 ثواني"
              >
                <i class="fa-solid fa-rotate-right"></i>
                <span>10s</span>
              </button>
              <button
                class="sae-video-ctrl sae-video-ctrl--speed"
                type="button"
                data-video-ctrl="speed"
                title="سرعة التشغيل"
              >
                1x
              </button>
              <button
                class="sae-video-ctrl sae-video-ctrl--fullscreen"
                type="button"
                data-video-ctrl="fullscreen"
                title="ملء الشاشة"
              >
                <i class="fa-solid fa-expand"></i>
              </button>
            </div>
          `;

          // تهيئة فيديو المعاينة مع شريط التقدّم
          const previewWrapper =
            postMediaPreview.querySelector(".sae-video-shell");
          if (previewWrapper) {
            initSingleVideoWrapper(previewWrapper);
          }
        } else {
          postMediaPreview.textContent =
            "تم اختيار ملف، لكن نوعه غير مدعوم للمعاينة.";
        }
      }
    }

    updatePublishButtonState();
  });
}

if (modalAddLinkBtn && postLinkInput) {
  modalAddLinkBtn.addEventListener("click", function () {
    postLinkInput.focus();
    postLinkInput.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

if (postLinkInput) {
  postLinkInput.addEventListener("input", function () {
    currentLinkUrl = postLinkInput.value.trim();
    updatePublishButtonState();
  });
}

// ✅ تحميل IDs المنشورات المحفوظة من السيرفر
async function fetchSavedPostIds() {
  const token = getToken();
  if (!token) {
    savedPostIds = new Set();
    return;
  }

  try {
    const res = await fetch(API_BASE + "/saved", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    if (!res.ok) {
      savedPostIds = new Set();
      return;
    }

    const data = await res.json();
    if (Array.isArray(data)) {
      savedPostIds = new Set(
        data
          .map(function (p) {
            return p && p._id;
          })
          .filter(Boolean)
      );
    } else {
      savedPostIds = new Set();
    }
  } catch (err) {
    console.error("ERROR fetchSavedPostIds:", err);
    savedPostIds = new Set();
  }
}

// 🔹 هل يسمح للمستخدم الحالي بمشاهدة هذا المنشور؟
function canViewPost(post) {
  const privacy = post.privacy === "private" ? "private" : "public";
  if (privacy === "public") return true;

  const postUser = post.user || null;
  const postUserId =
    postUser && (postUser._id || postUser.id || postUser.userId)
      ? postUser._id || postUser.id || postUser.userId
      : "";

  if (!currentUserId) return false;
  return String(currentUserId) === String(postUserId);
}

// ===== تحويل قيمة الميديا إلى رابط جاهز للعرض =====
function buildMediaUrl(raw) {
  if (!raw) return "";

  raw = String(raw).trim();
  if (!raw) return "";

  raw = raw.replace(/\\/g, "/");

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  if (raw.startsWith("/")) {
    return SERVER_BASE + raw;
  }

  if (raw.indexOf("uploads") === -1) {
    raw = "/uploads/" + raw;
  } else if (!raw.startsWith("/")) {
    raw = "/" + raw;
  }

  return SERVER_BASE + raw;
}

// 🔗 تطبيع رابط (إضافة https لو ناقص)
function normalizeLinkUrl(url) {
  if (!url) return "";
  let u = String(url).trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }
  return u;
}

// تنسيق وقت بسيط
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===== كارت البوست =====
function renderPostCard(post) {
  const postUser = post.user || null;
  const userName =
    (postUser && (postUser.username || postUser.name)) ||
    post.authorName ||
    "مستخدم";

  const firstChar = userName.trim()[0]
    ? userName.trim()[0].toUpperCase()
    : "م";

  const text = escapeHtml(post.text || "");

  const createdAtRaw = post.createdAt || post.created_at;
  const updatedAtRaw = post.updatedAt || post.updated_at;
  const createdAt = formatTime(createdAtRaw);

  let isEdited = false;
  if (createdAtRaw && updatedAtRaw) {
    const cTime = new Date(createdAtRaw).getTime();
    const uTime = new Date(updatedAtRaw).getTime();
    if (!Number.isNaN(cTime) && !Number.isNaN(uTime) && uTime !== cTime) {
      isEdited = true;
    }
  }

  const commentsArray = Array.isArray(post.comments) ? post.comments : [];
  const likesArray = Array.isArray(post.likes) ? post.likes : [];

  const likesCount = likesArray.length;
  const commentsCount = commentsArray.length;

  const imageUrl = buildMediaUrl(post.imageUrl);
  const videoUrl = buildMediaUrl(post.videoUrl);

  // 🔗 رابط المنشور إن وجد
  const rawLink = (post.link || "").trim();
  const normalizedLink = normalizeLinkUrl(rawLink);

  const mainMediaUrl = videoUrl || imageUrl || ""; // فقط للصورة/الفيديو (للتحميل من قائمة 3 نقاط)

  const postId = post._id || "";
  const isSaved = savedPostIds.has(postId);

  const postUserId =
    postUser && (postUser._id || postUser.id || postUser.userId)
      ? postUser._id || postUser.id || postUser.userId
      : "";

  const isOwner =
    currentUserId && postUserId
      ? String(currentUserId) === String(postUserId)
      : false;

  const privacy = post.privacy === "private" ? "private" : "public";
  const privacyLabel = privacy === "public" ? "عام" : "خاص";
  const privacyIconClass =
    privacy === "public" ? "fa-earth-asia" : "fa-lock";
  const privacyHtml =
    '<i class="fa-solid ' + privacyIconClass + '"></i> ' + privacyLabel;

  const metaLine =
    (createdAt || "") +
    (isEdited ? " · تم التعديل" : "") +
    (createdAt ? " · " : "") +
    privacyHtml;

  // 🔍 نوع البوست
  let postTypeClass = "post--text";
  if (videoUrl) {
    postTypeClass = "post--video";
  } else if (imageUrl) {
    postTypeClass = "post--image";
  } else if (rawLink) {
    postTypeClass = "post--link";
  }

  // 🖼️ الميديا
  let mediaHtml = "";
  if (imageUrl) {
    mediaHtml += `
      <div class="post-media">
        <img src="${escapeAttr(imageUrl)}" alt="post image" />
      </div>
    `;
  }
  if (videoUrl) {
    mediaHtml += `
      <div class="post-media sae-video-shell" data-video-wrapper>
        <video
          class="sae-video"
          src="${escapeAttr(videoUrl)}"
          preload="metadata"
        ></video>

        <!-- شريط التقدم -->
        <div class="sae-video-progress" data-video-progress>
          <div class="sae-video-progress-bar"></div>
        </div>

        <button class="sae-video-play" type="button" aria-label="تشغيل الفيديو">
          <i class="fa-solid fa-play"></i>
        </button>
        <button
          class="sae-video-ctrl sae-video-ctrl--back"
          type="button"
          data-video-ctrl="back"
          title="رجوع 10 ثواني"
        >
          <i class="fa-solid fa-rotate-left"></i>
          <span>10s</span>
        </button>
        <button
          class="sae-video-ctrl sae-video-ctrl--forward"
          type="button"
          data-video-ctrl="forward"
          title="تقديم 10 ثواني"
        >
          <i class="fa-solid fa-rotate-right"></i>
          <span>10s</span>
        </button>
        <button
          class="sae-video-ctrl sae-video-ctrl--speed"
          type="button"
          data-video-ctrl="speed"
          title="سرعة التشغيل"
        >
          1x
        </button>
        <button
          class="sae-video-ctrl sae-video-ctrl--fullscreen"
          type="button"
          data-video-ctrl="fullscreen"
          title="ملء الشاشة"
        >
          <i class="fa-solid fa-expand"></i>
        </button>
      </div>
    `;
  }

  // 🎯 كارت الرابط
  if (rawLink) {
    const shortUrl =
      rawLink.length > 60 ? rawLink.slice(0, 57) + "..." : rawLink;
    mediaHtml += `
      <div class="post-media">
        <a
          href="${escapeAttr(normalizedLink)}"
          target="_blank"
          rel="noopener noreferrer"
          class="post-link-card"
        >
          <div class="post-link-title">رابط مرفق</div>
          <div class="post-link-url">${escapeHtml(shortUrl)}</div>
        </a>
      </div>
    `;
  }

  const commentsHtml =
    commentsArray.length > 0
      ? commentsArray
          .map(function (c) {
            const cuObj = c.user || null;
            const cu =
              (cuObj && (cuObj.username || cuObj.name)) || "مستخدم";
            const cf = cu.trim()[0] ? cu.trim()[0].toUpperCase() : "م";
            const ctext = escapeHtml(c.text || "");

            const cuId = cuObj && cuObj._id ? cuObj._id : "";
            const postOwnerId =
              postUser && postUser._id ? postUser._id : null;

            const isCommentOwner =
              currentUserId && cuId && String(cuId) === String(currentUserId);
            const canDelete =
              currentUserId &&
              (isCommentOwner ||
                (postOwnerId && String(postOwnerId) === String(currentUserId)));

            return `
              <div class="comment-item glass-sub" data-comment-id="${
                c._id || ""
              }">
                ${renderAvatar(cuObj, "avatar-sm", cf)}
                <div class="comment-body">
                  <div class="comment-header-row">
                    <span class="comment-user user-link" data-user-id="${
                      cuId || ""
                    }">${escapeHtml(cu)}</span>
                    <div class="comment-actions">
                      ${
                        isCommentOwner
                          ? '<button type="button" class="comment-edit-btn" title="تعديل التعليق"><i class="fa-solid fa-pen"></i></button>'
                          : ""
                      }
                      ${
                        canDelete
                          ? '<button type="button" class="comment-delete-btn" title="حذف التعليق"><i class="fa-solid fa-trash"></i></button>'
                          : ""
                      }
                    </div>
                  </div>
                  <div class="comment-text">${ctext}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : '<div class="empty-state">لا توجد تعليقات بعد</div>';

  const likesHtml =
    likesArray.length > 0
      ? likesArray
          .map(function (u) {
            if (!u || typeof u === "string") {
              return `
                <div class="like-item glass-sub">
                  ${renderAvatar(null, "avatar-sm", "م")}
                  <div class="like-user">مستخدم</div>
                </div>
              `;
            }
            const ln = u.username || u.name || "مستخدم";
            const lf = ln.trim()[0] ? ln.trim()[0].toUpperCase() : "م";
            const uId = u._id || "";
            return `
              <div class="like-item glass-sub">
                ${renderAvatar(u, "avatar-sm", lf)}
                <div class="like-user user-link" data-user-id="${uId}">
                  ${escapeHtml(ln)}
                </div>
              </div>
            `;
          })
          .join("")
      : '<div class="empty-state">لا إعجابات بعد</div>';

  return `
    <article
      class="post-card glass ${postTypeClass}"
      data-post-id="${postId}"
      data-media-url="${escapeAttr(mainMediaUrl)}"
      data-owner="${isOwner ? "true" : "false"}"
      data-is-owner="${isOwner ? "true" : "false"}"
      data-has-media="${mainMediaUrl ? "true" : "false"}"
      data-privacy="${privacy}"
    >
      <header class="post-header">
        <div class="post-user user-link" data-user-id="${postUserId}">
          ${renderAvatar(postUser, "avatar-lg", firstChar)}
          <div class="post-user-info">
            <span>${escapeHtml(userName)}</span>
            <span>${metaLine}</span>
          </div>
        </div>

        <button class="post-menu-btn post-menu-trigger" type="button" aria-label="خيارات المنشور">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </header>

      <div class="post-text">${text}</div>

      ${mediaHtml}

      <footer class="post-footer">
        <div class="post-stats">
          <span class="likes-count clickable">❤️ ${likesCount} إعجاب</span>
          <span class="comments-count clickable">${commentsCount} تعليق</span>
        </div>
        <div class="post-actions-row">
          <button class="post-action-btn" data-action="like">
            <i class="fa-regular fa-heart"></i>
            <span>إعجاب</span>
          </button>
          <button class="post-action-btn" data-action="comment">
            <i class="fa-regular fa-comment"></i>
            <span>تعليق</span>
          </button>
          <button class="post-action-btn" data-action="share">
            <i class="fa-solid fa-share"></i>
            <span>مشاركة</span>
          </button>
          <button class="post-action-btn ${
            isSaved ? "saved" : ""
          }" data-action="save">
            <i class="${isSaved ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
            <span>${isSaved ? "محفوظ" : "حفظ"}</span>
          </button>
        </div>

        <div class="post-extra">
          <div class="comments-box" data-open="0" style="display:none;">
            <div class="comments-list">
              ${commentsHtml}
            </div>
            <div class="comment-input-row">
              <textarea
                class="comment-input"
                rows="1"
                placeholder="اكتب تعليقك..."
              ></textarea>
              <button class="comment-send-btn">إرسال</button>
            </div>
          </div>

          <div class="likes-box" data-open="0" style="display:none;">
            <div class="likes-list">
              ${likesHtml}
            </div>
          </div>
        </div>
      </footer>
    </article>
  `;
}

// ===== تحميل المنشورات من السيرفر (الهوم) =====
async function loadPosts() {
  if (!postsDiv) return;

  postsDiv.innerHTML =
    '<div style="text-align:center;font-size:13px;opacity:.8;margin-top:10px;">جاري تحميل المنشورات...</div>';

  try {
    const res = await fetch(API_BASE + "/posts", {
      headers: {
        Authorization: "Bearer " + getToken(),
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.msg || "تعذر تحميل المنشورات");
    }

    const postsArray = Array.isArray(data) ? data : data.posts;
    if (!Array.isArray(postsArray)) {
      throw new Error("تنسيق البيانات غير صحيح");
    }

    const visiblePosts = postsArray.filter(canViewPost);

    if (visiblePosts.length === 0) {
      postsDiv.innerHTML =
        '<div class="glass post-card" style="text-align:center;font-size:13px;">لسا ما في منشورات، جرّب تكتب أول منشور 🎉</div>';
      return;
    }

    visiblePosts.sort(function (a, b) {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });

    postsDiv.innerHTML = visiblePosts.map(renderPostCard).join("");
    initVideoPlayers();
  } catch (err) {
    console.error(err);
    postsDiv.innerHTML =
      '<div class="glass post-card" style="color:#ffb3b3;font-size:13px;">' +
      (err.message || "حدث خطأ أثناء تحميل المنشورات") +
      "</div>";
  }
}

// ✅ تحميل المنشورات المحفوظة (Saved)
async function loadSavedPosts() {
  if (!postsDiv) return;

  postsDiv.innerHTML =
    '<div style="text-align:center;font-size:13px;opacity:.8;margin-top:10px;">جاري تحميل العناصر المحفوظة...</div>';

  const token = getToken();
  if (!token) {
    postsDiv.innerHTML =
      '<div class="glass post-card" style="text-align:center;font-size:13px;">يجب تسجيل الدخول لعرض محفوظاتك 📌</div>';
    return;
  }

  try {
    const res = await fetch(API_BASE + "/saved", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || "تعذر تحميل المحفوظات");
    }

    const postsArray = Array.isArray(data) ? data : [];
    const visiblePosts = postsArray.filter(canViewPost);

    if (visiblePosts.length === 0) {
      postsDiv.innerHTML =
        '<div class="glass post-card" style="text-align:center;font-size:13px;">ما عندك أي منشورات محفوظة لسه 📚</div>';
      return;
    }

    visiblePosts.sort(function (a, b) {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });

    postsDiv.innerHTML = visiblePosts.map(renderPostCard).join("");
    initVideoPlayers();
  } catch (err) {
    console.error("ERROR loadSavedPosts:", err);
    postsDiv.innerHTML =
      '<div class="glass post-card" style="color:#ffb3b3;font-size:13px;">' +
      (err.message || "حدث خطأ أثناء تحميل المحفوظات") +
      "</div>";
  }
}

// 🚀 دالة تحديث الفيد
async function refreshFeed() {
  if (!postsDiv) {
    await loadPosts();
    return;
  }
  postsDiv.classList.add("refreshing");
  try {
    await loadPosts();
    showToast("تم تحديث المنشورات 🔄", "success");
  } catch (e) {
    console.error(e);
  } finally {
    postsDiv.classList.remove("refreshing");
  }
}

// ===== إنشاء منشور جديد (نص + ميديا + رابط + خصوصية) =====
async function createPostOnServer(text, mediaFile, linkUrl) {
  const token = getToken();
  if (!token) {
    throw new Error("يجب تسجيل الدخول أولاً");
  }

  const formData = new FormData();
  formData.append("text", text || "");
  formData.append("privacy", currentPrivacy || "public");

  if (mediaFile) {
    formData.append("media", mediaFile);
  }
  if (linkUrl) {
    formData.append("link", linkUrl);
  }

  const res = await fetch(API_BASE + "/posts", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "حدث خطأ أثناء إنشاء المنشور");
  }

  return data;
}

if (publishBtn && postText && createMsg) {
  publishBtn.addEventListener("click", async function () {
    const text = postText.value.trim();
    const mediaFile = selectedMediaFile;
    const linkUrl = currentLinkUrl;

    if (!text && !mediaFile && !linkUrl) {
      showToast("أضف نصاً أو صورة/فيديو أو رابط قبل النشر", "error");
      return;
    }

    publishBtn.disabled = true;
    createMsg.textContent = "";
    try {
      await createPostOnServer(text, mediaFile, linkUrl);
      resetCreateModal();
      createMsg.style.color = "#b4ffb4";
      createMsg.textContent = "تم نشر المنشور بنجاح ✅";
      closeModal();
      await loadPosts();
      showToast("تم نشر المنشور بنجاح ✅", "success");
    } catch (err) {
      createMsg.style.color = "#ffb3b3";
      createMsg.textContent =
        err.message || "حدث خطأ أثناء إنشاء المنشور";
      showToast(
        err.message || "حدث خطأ أثناء إنشاء المنشور",
        "error"
      );
      updatePublishButtonState();
    }
  });
}

// ===== توغيل صناديق التعليقات واللايكات =====
function toggleBox(box) {
  if (!box) return;
  const isOpen = box.dataset.open === "1";
  if (isOpen) {
    box.dataset.open = "0";
    box.style.display = "none";
  } else {
    box.dataset.open = "1";
    box.style.display = "block";
  }
}

function focusCommentInput(postEl) {
  const box = postEl.querySelector(".comments-box");
  if (!box) return;
  box.dataset.open = "1";
  box.style.display = "block";
  const ta = box.querySelector(".comment-input");
  if (ta) {
    ta.focus();
  }
}

// ===== تحكم الفيديو (زر التشغيل + 10 ثواني + السرعة + ملء الشاشة) =====
function handleGlobalVideoClick(e) {
  const playBtn = e.target.closest(".sae-video-play");
  const ctrlBtn = e.target.closest(".sae-video-ctrl");
  const videoClicked = e.target.closest(".sae-video-shell video");

  if (!playBtn && !ctrlBtn && !videoClicked) return;

  const wrapper = (playBtn || ctrlBtn || videoClicked).closest(
    ".sae-video-shell"
  );
  if (!wrapper) return;

  const video = wrapper.querySelector("video");
  if (!video) return;

  // أزرار السرعة/التقديم/الترجيع/الفل سكرين
  if (ctrlBtn) {
    const type = ctrlBtn.dataset.videoCtrl;
    if (type === "back") {
      video.currentTime = Math.max(0, video.currentTime - 10);
    } else if (type === "forward") {
      const dur = isNaN(video.duration) ? null : video.duration;
      if (dur !== null) {
        video.currentTime = Math.min(dur, video.currentTime + 10);
      } else {
        video.currentTime = video.currentTime + 10;
      }
    } else if (type === "speed") {
      const speeds = [1, 1.5, 2];
      let idx = parseInt(wrapper.dataset.speedIndex || "0", 10);
      idx = (idx + 1) % speeds.length;
      wrapper.dataset.speedIndex = String(idx);
      video.playbackRate = speeds[idx];
      ctrlBtn.textContent = speeds[idx] + "x";
    } else if (type === "fullscreen") {
      // ملء الشاشة على عنصر الفيديو مباشرة
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (wrapper.requestFullscreen) {
        wrapper.requestFullscreen();
      }
    }
    return;
  }

  // زر التشغيل أو الضغط على الفيديو نفسه
  if (playBtn || videoClicked) {
    if (video.paused) {
      video.play();
      wrapper.classList.add("is-playing");
    } else {
      video.pause();
      wrapper.classList.remove("is-playing");
    }
  }
}

document.addEventListener("click", handleGlobalVideoClick);

// 🔄 ضبط الـ CSS للفيديو عند الدخول/الخروج من ملء الشاشة لتفادي قصّ الفيديو
document.addEventListener("fullscreenchange", function () {
  const fsEl = document.fullscreenElement;
  const videos = document.querySelectorAll(".sae-video-shell .sae-video");

  videos.forEach(function (v) {
    if (fsEl === v) {
      // في وضع ملء الشاشة
      v.style.maxHeight = "none";
      v.style.width = "100%";
      v.style.height = "100vh";
      v.style.objectFit = "contain";
    } else {
      // عادي
      v.style.maxHeight = "";
      v.style.width = "";
      v.style.height = "";
      v.style.objectFit = "";
    }
  });
});

// ===== تعامل أزرار الإعجاب / التعليق / المشاركة / الحفظ + العداد + البروفايل + التعليقات =====
if (postsDiv) {
  postsDiv.addEventListener("click", async function (e) {
    const postEl = e.target.closest("[data-post-id]");
    if (!postEl) return;
    const postId = postEl.dataset.postId;

    const btn = e.target.closest(".post-action-btn");
    if (btn) {
      const action = btn.dataset.action;
      try {
        if (action === "like") {
          await handleLike(postId, postEl, btn);
        } else if (action === "comment") {
          focusCommentInput(postEl);
        } else if (action === "share") {
          await handleShare(postId);
        } else if (action === "save") {
          await handleSave(postId, postEl, btn);
        }
      } catch (err) {
        console.error(err);
        showToast(
          err.message || "حدث خطأ أثناء تنفيذ العملية",
          "error"
        );
      }
      return;
    }

    const likesCountSpan = e.target.closest(".likes-count");
    if (likesCountSpan) {
      const likesBox = postEl.querySelector(".likes-box");
      toggleBox(likesBox);
      return;
    }

    const commentsCountSpan = e.target.closest(".comments-count");
    if (commentsCountSpan) {
      const commentsBox = postEl.querySelector(".comments-box");
      toggleBox(commentsBox);
      return;
    }

    const userLink = e.target.closest(".user-link");
    if (userLink) {
      const userId = userLink.dataset.userId;
      if (userId) {
        window.location.href =
          "/profile.html?userId=" + encodeURIComponent(userId);
      }
      return;
    }

    const sendBtn = e.target.closest(".comment-send-btn");
    if (sendBtn) {
      try {
        await submitCommentFromBox(postId, postEl);
      } catch (err) {
        console.error(err);
        showToast(err.message || "تعذر إضافة التعليق", "error");
      }
      return;
    }

    const deleteBtn = e.target.closest(".comment-delete-btn");
    if (deleteBtn) {
      const commentEl = deleteBtn.closest(".comment-item");
      const commentId = commentEl && commentEl.dataset.commentId;
      if (!commentId) return;

      try {
        await deleteComment(postId, commentId, postEl, commentEl);
      } catch (err) {
        console.error(err);
        showToast(err.message || "تعذر حذف التعليق", "error");
      }
      return;
    }

    const editBtn = e.target.closest(".comment-edit-btn");
    if (editBtn) {
      const commentEl = editBtn.closest(".comment-item");
      startEditComment(commentEl);
      return;
    }

    const saveEditBtn = e.target.closest(".comment-edit-save-btn");
    if (saveEditBtn) {
      const commentEl = saveEditBtn.closest(".comment-item");
      try {
        await saveEditedComment(postId, commentEl);
      } catch (err) {
        console.error(err);
        showToast(err.message || "تعذر تعديل التعليق", "error");
      }
      return;
    }

    const cancelEditBtn = e.target.closest(".comment-edit-cancel-btn");
    if (cancelEditBtn) {
      const commentEl = cancelEditBtn.closest(".comment-item");
      cancelEditComment(commentEl);
      return;
    }
  });
}

// ===== دوال الإعجاب / الحفظ / التعليق / المشاركة / حذف التعليق / تعديل التعليق =====
async function handleLike(postId, postEl, btn) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const res = await fetch(API_BASE + "/posts/" + postId + "/like", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر تنفيذ الإعجاب");
  }

  const likesSpan = postEl.querySelector(".likes-count");
  if (likesSpan && typeof data.likesCount === "number") {
    likesSpan.textContent = "❤️ " + data.likesCount + " إعجاب";
  }

  const icon = btn.querySelector("i");

  if (data.liked) {
    btn.classList.add("liked");
    if (icon) {
      icon.classList.remove("fa-regular");
      icon.classList.add("fa-solid");
    }
  } else {
    btn.classList.remove("liked");
    if (icon) {
      icon.classList.remove("fa-solid");
      icon.classList.add("fa-regular");
    }
  }
}

// ✅ دالة حفظ / إلغاء حفظ منشور
async function handleSave(postId, postEl, btn) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const res = await fetch(API_BASE + "/posts/" + postId + "/save", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر حفظ المنشور");
  }

  const saved = !!data.saved;

  if (saved) {
    savedPostIds.add(postId);
  } else {
    savedPostIds.delete(postId);
  }

  btn.classList.toggle("saved", saved);
  const icon = btn.querySelector("i");
  const span = btn.querySelector("span");

  if (icon) {
    icon.classList.remove("fa-regular", "fa-solid");
    icon.classList.add(saved ? "fa-solid" : "fa-regular", "fa-bookmark");
  }
  if (span) {
    span.textContent = saved ? "محفوظ" : "حفظ";
  }
}

// ✅ إضافة تعليق بدون إعادة تحميل الكل
async function submitCommentFromBox(postId, postEl) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const textarea = postEl.querySelector(".comment-input");
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) return;

  const res = await fetch(API_BASE + "/posts/" + postId + "/comment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ text: text }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر إرسال التعليق");
  }

  textarea.value = "";

  const commentsList = postEl.querySelector(".comments-list");
  if (commentsList && data.comment) {
    const c = data.comment;
    const cu = c.user || {};
    const cuName = cu.username || cu.name || "مستخدم";
    const cuId = cu._id || "";
    const cf = cuName.trim()[0] ? cuName.trim()[0].toUpperCase() : "م";

    const isCommentOwner =
      currentUserId && cuId && String(cuId) === String(currentUserId);

    const headerUserEl = postEl.querySelector(".post-user");
    const postOwnerId =
      headerUserEl && headerUserEl.dataset.userId
        ? headerUserEl.dataset.userId
        : null;

    const isPostOwner =
      currentUserId &&
      postOwnerId &&
      String(postOwnerId) === String(currentUserId);

    const canDelete = isCommentOwner || isPostOwner;

    const commentHtml = `
      <div class="comment-item glass-sub" data-comment-id="${c._id || ""}">
        ${renderAvatar(cu, "avatar-sm", cf)}
        <div class="comment-body">
          <div class="comment-header-row">
            <span class="comment-user user-link" data-user-id="${cuId}">
              ${escapeHtml(cuName)}
            </span>
            <div class="comment-actions">
              ${
                isCommentOwner
                  ? '<button type="button" class="comment-edit-btn" title="تعديل التعليق"><i class="fa-solid fa-pen"></i></button>'
                  : ""
              }
              ${
                canDelete
                  ? '<button type="button" class="comment-delete-btn" title="حذف التعليق"><i class="fa-solid fa-trash"></i></button>'
                  : ""
              }
            </div>
          </div>
          <div class="comment-text">${escapeHtml(c.text || "")}</div>
        </div>
      </div>
    `;

    commentsList.insertAdjacentHTML("beforeend", commentHtml);
  }

  const commentsSpan = postEl.querySelector(".comments-count");
  if (commentsSpan) {
    const match = commentsSpan.textContent.match(/(\d+)/);
    const oldCount = match ? parseInt(match[1], 10) : 0;
    const newCount = oldCount + 1;
    commentsSpan.textContent = newCount + " تعليق";
  }

  showToast("تم إضافة التعليق ✅", "success");
}

async function deleteComment(postId, commentId, postEl, commentEl) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const res = await fetch(
    API_BASE + "/posts/" + postId + "/comments/" + commentId,
    {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
      },
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر حذف التعليق");
  }

  if (commentEl && commentEl.parentNode) {
    commentEl.parentNode.removeChild(commentEl);
  }

  const commentsSpan = postEl.querySelector(".comments-count");
  if (commentsSpan && typeof data.commentsCount === "number") {
    commentsSpan.textContent = data.commentsCount + " تعليق";
  }
}

async function handleShare(postId) {
  const url = window.location.origin + "/post/" + postId;

  if (navigator.share) {
    await navigator.share({
      title: "منشور على Saepel",
      text: "شوف هذا المنشور على Saepel 👀",
      url: url,
    });
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(url);
    showToast("تم نسخ رابط المنشور ✅", "success");
  } else {
    showToast("رابط المنشور: " + url);
  }
}

// ===== دوال تعديل التعليق (UI + API) =====
function startEditComment(commentEl) {
  if (!commentEl) return;
  if (commentEl.dataset.editing === "1") return;

  const textDiv = commentEl.querySelector(".comment-text");
  if (!textDiv) return;

  const original = textDiv.textContent || "";
  commentEl.dataset.originalText = original;
  commentEl.dataset.editing = "1";

  textDiv.innerHTML =
    '<textarea class="comment-edit-input">' +
    escapeHtml(original) +
    '</textarea>' +
    '<div class="comment-edit-actions">' +
    '<button type="button" class="comment-edit-save-btn">حفظ</button>' +
    '<button type="button" class="comment-edit-cancel-btn">إلغاء</button>' +
    "</div>";
}

function cancelEditComment(commentEl) {
  if (!commentEl) return;
  const original = commentEl.dataset.originalText || "";
  const textDiv = commentEl.querySelector(".comment-text");
  if (textDiv) {
    textDiv.textContent = original;
  }
  commentEl.dataset.editing = "0";
  delete commentEl.dataset.originalText;
}

async function saveEditedComment(postId, commentEl) {
  if (!commentEl) return;

  const textarea = commentEl.querySelector(".comment-edit-input");
  if (!textarea) return;

  const newText = textarea.value.trim();
  if (!newText) {
    cancelEditComment(commentEl);
    return;
  }

  const commentId = commentEl.dataset.commentId;
  if (!commentId) return;

  const token = getToken();
  if (!token) {
    showToast("يجب تسجيل الدخول أولاً", "error");
    return;
  }

  const res = await fetch(
    API_BASE + "/posts/" + postId + "/comments/" + commentId,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ text: newText }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر تعديل التعليق");
  }

  const textDiv = commentEl.querySelector(".comment-text");
  if (textDiv) {
    const serverComment =
      data.comment && typeof data.comment.text === "string"
        ? data.comment.text
        : newText;
    textDiv.textContent = serverComment;
  }

  commentEl.dataset.editing = "0";
  delete commentEl.dataset.originalText;
}

// ⭐⭐⭐ كائن مساعد عام لقائمة الثلاث نقاط وأي سكربت خارجي (مثل صفحة البروفايل)
window.saepelFeedHelpers = {
  SERVER_BASE,
  API_BASE,
  getToken,
  getUser,
  currentUserId,
  buildMediaUrl,
  normalizeLinkUrl,
  canViewPost,
  renderPostCard,
  loadPosts,
  loadSavedPosts,
  refreshFeed,
  handleShare,
  handleSave,
};

// ===== إخفاء/إظهار الشريطين حسب السكروول =====
let lastScrollY = window.scrollY;

window.addEventListener("scroll", function () {
  const current = window.scrollY;
  const diff = current - lastScrollY;

  if (current > 40 && diff > 4) {
    if (topNav) topNav.classList.add("hide-nav");
    if (bottomNav) bottomNav.classList.add("hide-nav");
  } else if (diff < -4) {
    if (topNav) topNav.classList.remove("hide-nav");
    if (bottomNav) bottomNav.classList.remove("hide-nav");
  }

  lastScrollY = current <= 0 ? 0 : current;
});

// ✅ سحب الفيد لتحت (Pull to refresh على الجوال)
let pullStartY = null;
let pullDeltaY = 0;
let isPulling = false;
const PULL_THRESHOLD = 80;

function handlePullStart(e) {
  if (window.scrollY > 0) {
    isPulling = false;
    return;
  }
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  pullStartY = touch.clientY;
  pullDeltaY = 0;
  isPulling = true;
}

function handlePullMove(e) {
  if (!isPulling || pullStartY === null) return;
  const touch = e.touches && e.touches[0];
  if (!touch) return;
  pullDeltaY = touch.clientY - pullStartY;
  if (pullDeltaY < 0) {
    isPulling = false;
  }
}

async function handlePullEnd() {
  if (isPulling && pullDeltaY > PULL_THRESHOLD) {
    await refreshFeed();
  }
  isPulling = false;
  pullStartY = null;
  pullDeltaY = 0;
}

window.addEventListener("touchstart", handlePullStart, { passive: true });
window.addEventListener("touchmove", handlePullMove, { passive: true });
window.addEventListener("touchend", handlePullEnd);
window.addEventListener("touchcancel", handlePullEnd);

// ===== فتح صفحة البروفايل =====
function goToMyProfile() {
  const user = getUser();
  if (!user) {
    showToast("سجّل دخول أولاً حتى تفتح صفحة البروفايل", "error");
    return;
  }
  window.location.href = "/profile.html";
}

// ===== تحميل المنشورات عند فتح الصفحة + تفعيل أزرار البروفايل / المحفوظات / البيت =====
document.addEventListener("DOMContentLoaded", function () {
  (async function () {
    await fetchSavedPostIds();
    await loadPosts();
  })();

  const bottomProfileBtn = document.getElementById("bottomProfile");
  if (bottomProfileBtn) {
    bottomProfileBtn.style.cursor = "pointer";
    bottomProfileBtn.addEventListener("click", goToMyProfile);
  }

  [welcomeUserAvatar, currentUserAvatar].forEach(function (el) {
    if (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", goToMyProfile);
    }
  });

  const menuSaved = document.getElementById("menuSaved");
  if (menuSaved) {
    menuSaved.style.cursor = "pointer";
    menuSaved.addEventListener("click", async function () {
      await fetchSavedPostIds();
      await loadSavedPosts();
    });
  }

  const bottomHomeBtn =
    document.querySelector(".bottom-nav .bottom-nav-btn[data-nav='home']") ||
    document.querySelector(".bottom-nav .bottom-nav-btn");
  if (bottomHomeBtn) {
    bottomHomeBtn.style.cursor = "pointer";
    bottomHomeBtn.addEventListener("click", async function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      await refreshFeed();
    });
  }

  const logoArea = document.querySelector(".top-nav .logo-area");
  if (logoArea) {
    logoArea.style.cursor = "pointer";
    logoArea.addEventListener("click", async function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      await refreshFeed();
    });
  }

  updatePublishButtonState();
});

// ===== إعدادات السيرفر / API =====
const SERVER_BASE = "http://localhost:5000";
const API_BASE = SERVER_BASE + "/api";

// ===== دوال مساعدة بسيطة =====
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

  if (!raw.includes("uploads")) {
    raw = "/uploads/" + raw;
  } else if (!raw.startsWith("/")) {
    raw = "/" + raw;
  }

  return SERVER_BASE + raw;
}

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

// وقت بسيط
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===== متغيرات DOM =====
const savedListDiv = document.getElementById("savedList");
const savedEmptyDiv = document.getElementById("savedEmpty");
const tabsContainer = document.getElementById("savedTabs");

let allSavedPosts = [];
let currentFilter = "all";

// تحديد نوع المنشور (للفلاتر)
function detectPostType(post) {
  if (post.videoUrl) return "video";
  if (post.imageUrl) return "image";
  if (post.link) return "link";
  return "text";
}

// رسم كارت منشور محفوظ
function renderSavedCard(post) {
  const postUser = post.user || null;
  const userName =
    (postUser && (postUser.username || postUser.name)) ||
    post.authorName ||
    "مستخدم";
  const firstChar = userName.trim()[0]
    ? userName.trim()[0].toUpperCase()
    : "م";

  const text = escapeHtml(post.text || "");
  const createdAt = formatTime(post.createdAt);
  const imageUrl = buildMediaUrl(post.imageUrl);
  const videoUrl = buildMediaUrl(post.videoUrl);
  const link = post.link || "";

  const postId = post._id || "";
  const type = detectPostType(post);

  let mediaHtml = "";
  let tagText = "منشور";
  let tagIcon = '<i class="fa-regular fa-note-sticky"></i>';

  if (type === "image") {
    tagText = "منشور صورة";
    tagIcon = '<i class="fa-regular fa-image"></i>';
    if (imageUrl) {
      mediaHtml += `
        <div class="post-media">
          <img src="${escapeAttr(imageUrl)}" alt="saved image" />
        </div>
      `;
    }
  } else if (type === "video") {
    tagText = "منشور فيديو";
    tagIcon = '<i class="fa-regular fa-circle-play"></i>';
    if (videoUrl) {
      mediaHtml += `
        <div class="post-media">
          <video src="${escapeAttr(
            videoUrl
          )}" controls style="width:100%;max-height:420px;"></video>
        </div>
      `;
    }
  } else if (type === "link") {
    tagText = "منشور رابط";
    tagIcon = '<i class="fa-solid fa-link"></i>';
    if (link) {
      mediaHtml += `
        <div class="post-media">
          <a href="${escapeAttr(
            link
          )}" target="_blank" rel="noopener" class="saved-link glass-sub" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
            <span>${escapeHtml(link)}</span>
          </a>
        </div>
      `;
    }
  } else {
    tagText = "منشور نصي";
    tagIcon = '<i class="fa-regular fa-note-sticky"></i>';
  }

  return `
    <article class="post-card glass" data-post-id="${postId}">
      <header class="post-header">
        <div class="post-user">
          ${renderAvatar(postUser, "avatar-lg", firstChar)}
          <div class="post-user-info">
            <span>${escapeHtml(userName)}</span>
            <span>${createdAt}</span>
          </div>
        </div>
        <div class="saved-tag">
          ${tagIcon}
          <span>${tagText}</span>
        </div>
      </header>

      ${
        text
          ? `<div class="post-text" style="margin-bottom:6px;">${text}</div>`
          : ""
      }

      ${mediaHtml}

      <footer class="post-footer">
        <button
          class="saved-remove-btn"
          type="button"
          data-post-id="${postId}"
        >
          <i class="fa-solid fa-bookmark-slash"></i>
          <span>إزالة من المحفوظات</span>
        </button>
      </footer>
    </article>
  `;
}

// فلترة حسب التاب
function getFilteredPosts() {
  if (currentFilter === "all") return allSavedPosts;

  return allSavedPosts.filter((p) => {
    const t = detectPostType(p);
    if (currentFilter === "posts") return t === "text";
    if (currentFilter === "images") return t === "image";
    if (currentFilter === "videos") return t === "video";
    if (currentFilter === "links") return t === "link";
    return true;
  });
}

// رسم القائمة
function renderSavedList() {
  const arr = getFilteredPosts();

  if (!arr.length) {
    savedListDiv.innerHTML = "";
    savedEmptyDiv.style.display = "block";
    return;
  }

  savedEmptyDiv.style.display = "none";
  savedListDiv.innerHTML = arr.map(renderSavedCard).join("");
}

// جلب المحفوظات من الـ API
async function fetchSavedPosts() {
  const token = getToken();
  if (!token) {
    savedEmptyDiv.style.display = "block";
    savedEmptyDiv.innerHTML = `
      <i class="fa-regular fa-circle-xmark"></i>
      تحتاج لتسجيل الدخول حتى تشاهد المحفوظات.
    `;
    return;
  }

  try {
    savedEmptyDiv.style.display = "block";
    savedEmptyDiv.innerHTML = `
      <i class="fa-regular fa-clock"></i>
      جاري تحميل المحفوظات...
    `;

    const res = await fetch(API_BASE + "/saved", {
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.msg || "تعذر تحميل المحفوظات");
    }

    if (!Array.isArray(data) || data.length === 0) {
      allSavedPosts = [];
      renderSavedList();
      return;
    }

    allSavedPosts = data;
    renderSavedList();
  } catch (err) {
    console.error("ERROR fetchSavedPosts:", err);
    savedEmptyDiv.style.display = "block";
    savedEmptyDiv.innerHTML = `
      <i class="fa-regular fa-circle-xmark"></i>
      ${escapeHtml(err.message || "حدث خطأ أثناء تحميل المحفوظات")}
    `;
  }
}

// إزالة منشور من المحفوظات
async function removeSaved(postId) {
  const token = getToken();
  if (!token) {
    alert("يجب تسجيل الدخول أولاً");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/posts/${postId}/save`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || "تعذر تعديل حالة الحفظ");
    }

    // إذا تم الإلغاء، نشيل المنشور من الأrray ونرسم
    if (!data.saved) {
      allSavedPosts = allSavedPosts.filter((p) => p._id !== postId);
      renderSavedList();
    }
  } catch (err) {
    console.error("ERROR removeSaved:", err);
    alert(err.message || "حدث خطأ أثناء إزالة المنشور من المحفوظات");
  }
}

// ===== الأحداث =====
document.addEventListener("DOMContentLoaded", () => {
  // تحميل المحفوظات
  fetchSavedPosts();

  // تبديل التابات
  if (tabsContainer) {
    tabsContainer.addEventListener("click", (e) => {
      const tab = e.target.closest(".saved-tab");
      if (!tab) return;

      const filter = tab.dataset.filter || "all";
      currentFilter = filter;

      // فعّل التاب
      [...tabsContainer.querySelectorAll(".saved-tab")].forEach((t) =>
        t.classList.toggle("active", t === tab)
      );

      // أعد الرسم
      renderSavedList();
    });
  }

  // حدث إزالة من المحفوظات (ديلجيت على القائمة)
  if (savedListDiv) {
    savedListDiv.addEventListener("click", (e) => {
      const btn = e.target.closest(".saved-remove-btn");
      if (!btn) return;

      const postId = btn.dataset.postId;
      if (!postId) return;

      removeSaved(postId);
    });
  }
});

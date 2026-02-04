// ================== إعدادات السيرفر / API ==================
// ✅ على Render لا تستخدم localhost. الأفضل نخليها relative لما تكون الواجهة من نفس السيرفر.
// تقدر تعمل override من HTML قبل تحميل الملف:  window.API_BASE_URL="https://your-backend.com";
const SERVER_BASE_STORIES = (window.API_BASE_URL || window.SERVER_BASE || window.API_BASE || "").toString().trim();
const API_BASE_STORIES = (SERVER_BASE_STORIES ? SERVER_BASE_STORIES : "") + "/api";

// دوال مساعدة بسيطة
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

// ================== عناصر الـ DOM الخاصة بالستوري ==================
const storyAddBtn = document.getElementById("storyAdd");
const storiesList = document.getElementById("storiesList");

// عارض القصص
const storyViewerOverlay = document.getElementById("storyViewerOverlay");
const storyViewerAvatar = document.getElementById("storyViewerAvatar");
const storyViewerName = document.getElementById("storyViewerName");
const storyViewerTime = document.getElementById("storyViewerTime");
const storyViewerViews = document.getElementById("storyViewerViews");
const storyViewerMedia = document.getElementById("storyViewerMedia");
const storyProgressBar = document.getElementById("storyProgressBar");

const storyCloseBtn = document.getElementById("storyCloseBtn");
const storyPrevBtn = document.getElementById("storyPrevBtn");
const storyNextBtn = document.getElementById("storyNextBtn");
const storyReplyInput = document.getElementById("storyReplyInput");
const storyReplySendBtn = document.getElementById("storyReplySendBtn");
const storyMuteBtn = document.getElementById("storyMuteBtn");
// ⭐ زر الإبلاغ في الهيدر
const storyReportBtn = document.getElementById("storyReportBtn");

// أزرار الريآكشن
const reactionButtons = document.querySelectorAll(".reaction-btn");

// ⭐ أزرار وإليمنتات الأكشن الجديدة
const sfViewsBtn = document.getElementById("sfViewsBtn");
const sfViewsCount = document.getElementById("sfViewsCount");
const sfViewsPanel = document.getElementById("sfViewsPanel");
const sfViewsClose = document.getElementById("sfViewsClose");
const sfViewsList = document.getElementById("sfViewsList");
const sfDeleteBtn = document.getElementById("sfDeleteBtn");
const sfReportBtn = document.getElementById("sfReportBtn");
const sfMuteUserBtn = document.getElementById("sfMuteBtn");

// ================== حالة (State) القصص ==================
let storiesFeed = []; // القصص القادمة من الـ backend
let currentStoryIndex = 0;
let storyTimer = null;
const STORY_DURATION = 7000; // مدة القصة 7 ثواني

// mute للمستخدمين (كتم قصصهم)
const MUTED_KEY = "saepelStoryMutedUsers";
let mutedStoryUserIds = new Set();

(function loadMutedUsers() {
  try {
    const raw = localStorage.getItem(MUTED_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      mutedStoryUserIds = new Set(arr.map(String));
    }
  } catch (e) {
    console.warn("cannot load muted story users", e);
  }
})();

function saveMutedUsers() {
  try {
    localStorage.setItem(
      MUTED_KEY,
      JSON.stringify(Array.from(mutedStoryUserIds))
    );
  } catch (e) {
    console.warn("cannot save muted story users", e);
  }
}

function isUserMuted(userId) {
  if (!userId) return false;
  return mutedStoryUserIds.has(String(userId));
}

// ================== Toast مساعد ==================
function storyToast(msg, type = "info") {
  if (typeof showToast === "function") {
    showToast(msg, type);
  } else {
    console.log("[Story]", type, msg);
  }
}

// ================== دوال مساعدة ==================

function timeAgo(dateStr) {
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffH = Math.floor(diffMin / 60);

    if (diffH > 0) return `منذ ${diffH} ساعة`;
    if (diffMin > 0) return `منذ ${diffMin} دقيقة`;
    return "قبل لحظات";
  } catch {
    return "";
  }
}

function buildAvatarLetter(name) {
  if (!name) return "S";
  const trim = String(name).trim();
  if (!trim) return "S";
  return trim[0].toUpperCase();
}

// ================== رفع قصة جديدة ==================

async function handleAddStory() {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول لإضافة قصة ⚠️", "error");
    return;
  }

  // فتح مودال إنشاء ستوري لو حاب، حالياً نستخدم input مباشر
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,video/*";

  input.onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const text = prompt("نص قصير للقصة (اختياري):", "") || "";

    const formData = new FormData();
    formData.append("media", file);
    formData.append("text", text);

    try {
      const res = await fetch(API_BASE_STORIES + "/stories", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        storyToast(data.msg || "فشل إنشاء القصة", "error");
        return;
      }

      storyToast("تم نشر القصة ✅", "success");
      await fetchStoriesFeed();
    } catch (err) {
      console.error("Error creating story:", err);
      storyToast("حدث خطأ أثناء إنشاء القصة", "error");
    }
  };

  input.click();
}

// ================== جلب القصص من الـ backend ==================

async function fetchStoriesFeed() {
  try {
    const token = getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const res = await fetch(API_BASE_STORIES + "/stories/feed", {
      method: "GET",
      headers,
    });

    if (!res.ok) {
      console.error("Failed to fetch stories", res.status);
      return;
    }

    const data = await res.json();

    // نضمن شكل موحد للقصص
    let mapped = (Array.isArray(data) ? data : []).map((s) => ({
      id: s.id || s._id,
      userId:
        s.userId ||
        (s.user && (s.user._id || s.user.id)) ||
        null,
      userName:
        (s.user && (s.user.fullName || s.user.name || s.user.username)) ||
        s.userName ||
        "مستخدم Saepel",
      avatar: s.avatar || (s.user && s.user.avatar) || "",
      mediaUrl: s.mediaUrl || s.media || "",
      mediaType: s.mediaType || s.type || "image",
      text: s.text || "",
      createdAt: s.createdAt,
      viewsCount:
        s.viewsCount ||
        (Array.isArray(s.views) ? s.views.length : 0) ||
        0,
      viewed: !!s.viewed,
    }));

    // فلترة المستخدمين المكتومين
    mapped = mapped.filter((s) => !isUserMuted(s.userId));

    storiesFeed = mapped;
    renderStoriesRow();
  } catch (err) {
    console.error("Error fetching stories:", err);
  }
}

// رسم عناصر الستوري في الشريط
function renderStoriesRow() {
  if (!storiesList) return;
  storiesList.innerHTML = "";

  if (!storiesFeed.length) {
    // لا قصص → نترك فقط كرت "إضافة قصة"
    return;
  }

  storiesFeed.forEach((story, index) => {
    const card = document.createElement("div");
    card.className = "story-card glass";
    if (story.viewed) {
      card.classList.add("viewed");
    } else {
      card.classList.add("unviewed");
    }
    card.dataset.index = index.toString();

    card.innerHTML = `
      <div class="story-inner">
        <div class="story-avatar">
          ${
            story.mediaUrl
              ? `<img src="${story.mediaUrl}" alt="story" />`
              : `<span>${buildAvatarLetter(story.userName)}</span>`
          }
        </div>
        <div class="story-label">${story.userName || "مستخدم Saepel"}</div>
      </div>
    `;

    card.addEventListener("click", () => {
      openStoryViewer(index);
    });

    storiesList.appendChild(card);
  });
}

// ================== عارض القصص ==================

function resetStoryTimer() {
  if (storyTimer) {
    clearInterval(storyTimer);
    storyTimer = null;
  }
}

async function recordStoryView(storyId) {
  const token = getToken();
  if (!token || !storyId) return;

  try {
    const res = await fetch(
      API_BASE_STORIES + `/stories/${encodeURIComponent(storyId)}/view`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({}),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.warn("View not recorded:", data);
      return;
    }

    // تحديث العداد في الواجهة لو رجع من السيرفر
    const s = storiesFeed[currentStoryIndex];
    if (s && typeof data.viewsCount === "number") {
      s.viewsCount = data.viewsCount;
      if (storyViewerViews) {
        storyViewerViews.textContent = `👁‍🗨 ${data.viewsCount}`;
      }
      if (sfViewsCount) {
        sfViewsCount.textContent = String(data.viewsCount);
      }
    }
  } catch (err) {
    console.error("Error recording view:", err);
  }
}

function openStoryViewer(index) {
  if (!storiesFeed.length) return;
  if (index < 0 || index >= storiesFeed.length) return;
  if (!storyViewerOverlay || !storyViewerMedia) return;

  currentStoryIndex = index;
  const s = storiesFeed[index];

  // صاحب القصة؟
  const cu = getUser();
  const myId =
    cu && (cu.id || cu._id) ? String(cu.id || cu._id) : null;
  const ownerId = s.userId ? String(s.userId) : null;
  const isOwner = myId && ownerId && myId === ownerId;

  // تعبئة البيانات
  if (storyViewerAvatar) {
    storyViewerAvatar.textContent = buildAvatarLetter(s.userName);
  }
  if (storyViewerName) {
    storyViewerName.textContent = s.userName || "مستخدم Saepel";
  }
  if (storyViewerTime) {
    storyViewerTime.textContent = timeAgo(s.createdAt);
  }
  const viewsCount = s.viewsCount || 0;
  if (storyViewerViews) {
    storyViewerViews.textContent = `👁‍🗨 ${viewsCount}`;
  }
  if (sfViewsCount) {
    sfViewsCount.textContent = String(viewsCount);
  }

  // إظهار/إخفاء الأزرار حسب المالك (شريط أسفل + زر الهيدر)
  if (sfViewsBtn) {
    sfViewsBtn.style.display = isOwner ? "inline-flex" : "none";
  }
  if (sfDeleteBtn) {
    sfDeleteBtn.style.display = isOwner ? "inline-flex" : "none";
  }
  if (sfReportBtn) {
    sfReportBtn.style.display = isOwner ? "none" : "inline-flex";
  }
  if (sfMuteUserBtn) {
    sfMuteUserBtn.style.display = isOwner ? "none" : "inline-flex";
  }
  if (storyReportBtn) {
    storyReportBtn.style.display = isOwner ? "none" : "inline-flex";
  }

  // عرض الميديا
  storyViewerMedia.innerHTML = "";
  let mediaEl;
  if (s.mediaType === "video") {
    mediaEl = document.createElement("video");
    mediaEl.src = s.mediaUrl;
    mediaEl.autoplay = true;
    mediaEl.playsInline = true;
    mediaEl.muted = true; // يبدأ على كتم
    mediaEl.loop = false;
    mediaEl.controls = false;
  } else {
    mediaEl = document.createElement("img");
    mediaEl.src = s.mediaUrl;
    mediaEl.alt = "story";
  }
  storyViewerMedia.appendChild(mediaEl);

  // إخفاء لوحة المشاهدات لو كانت مفتوحة
  if (sfViewsPanel) {
    sfViewsPanel.classList.remove("open");
  }

  // إعادة تعيين شريط التقدم
  if (storyProgressBar) {
    storyProgressBar.style.width = "0%";
  }

  // إظهار العارض
  storyViewerOverlay.classList.add("active");

  // تسجيل مشاهدة
  recordStoryView(s.id);

  // تشغيل التايمر
  resetStoryTimer();
  const start = Date.now();
  storyTimer = setInterval(() => {
    const elapsed = Date.now() - start;
    const progress = Math.min(100, (elapsed / STORY_DURATION) * 100);
    if (storyProgressBar) {
      storyProgressBar.style.width = progress + "%";
    }
    if (elapsed >= STORY_DURATION) {
      resetStoryTimer();
      goToNextStory();
    }
  }, 80);
}

function closeStoryViewer() {
  resetStoryTimer();
  if (storyViewerOverlay) {
    storyViewerOverlay.classList.remove("active");
  }
}

// التنقل
function goToNextStory() {
  const next = currentStoryIndex + 1;
  if (next >= storiesFeed.length) {
    closeStoryViewer();
  } else {
    openStoryViewer(next);
  }
}

function goToPrevStory() {
  const prev = currentStoryIndex - 1;
  if (prev < 0) {
    closeStoryViewer();
  } else {
    openStoryViewer(prev);
  }
}

// ================== الريأكشن والرد ==================

async function sendStoryReaction(emoji) {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول لإرسال رد فعل", "error");
    return;
  }

  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.id) return;

  try {
    const res = await fetch(
      API_BASE_STORIES + `/stories/${encodeURIComponent(s.id)}/react`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ emoji }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      storyToast(data.msg || "فشل إرسال رد الفعل", "error");
      return;
    }

    storyToast("تم إرسال رد الفعل 💬", "success");
  } catch (err) {
    console.error("Error sending reaction:", err);
    storyToast("حدث خطأ أثناء إرسال رد الفعل", "error");
  }
}

async function sendStoryReply() {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول لإرسال رسالة", "error");
    return;
  }

  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.id) return;

  const msg = (storyReplyInput?.value || "").trim();
  if (!msg) return;

  try {
    const res = await fetch(
      API_BASE_STORIES + `/stories/${encodeURIComponent(s.id)}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ message: msg }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      storyToast(data.msg || "فشل إرسال الرسالة", "error");
      return;
    }

    if (storyReplyInput) {
      storyReplyInput.value = "";
    }
    storyToast("تم إرسال الرسالة لصاحب القصة ✅", "success");
  } catch (err) {
    console.error("Error sending reply:", err);
    storyToast("حدث خطأ أثناء إرسال الرسالة", "error");
  }
}

// كتم / تشغيل الصوت للفيديو
function toggleStoryMute() {
  if (!storyViewerMedia || !storyMuteBtn) return;
  const video = storyViewerMedia.querySelector("video");
  if (!video) return;

  video.muted = !video.muted;
  if (video.muted) {
    storyMuteBtn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i>`;
    storyMuteBtn.title = "إلغاء كتم الصوت";
  } else {
    storyMuteBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
    storyMuteBtn.title = "كتم الصوت";
  }
}

// ================== الأزرار الجديدة: مشاهدات / حذف / إبلاغ / كتم مستخدم ==================

// جلب المشاهدين وعرضهم في اللوحة
async function openViewsPanel() {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول لعرض المشاهدات", "error");
    return;
  }

  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.id) return;

  if (!sfViewsPanel || !sfViewsList) return;

  try {
    const res = await fetch(
      API_BASE_STORIES +
        `/stories/${encodeURIComponent(s.id)}/viewers`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      storyToast(data.msg || "تعذر جلب المشاهدات", "error");
      return;
    }

    const viewers = Array.isArray(data.viewers) ? data.viewers : [];
    sfViewsList.innerHTML = "";

    if (!viewers.length) {
      sfViewsList.innerHTML =
        '<div class="sf-view-empty">لا يوجد مشاهدات حتى الآن</div>';
    } else {
      viewers.forEach((v) => {
        const item = document.createElement("div");
        item.className = "sf-view-item";
        const letter = buildAvatarLetter(v.username);
        const when = timeAgo(v.viewedAt);

        item.innerHTML = `
          <div class="sf-view-avatar">
            ${
              v.avatar
                ? `<img src="${v.avatar}" alt="${v.username}" />`
                : `<span>${letter}</span>`
            }
          </div>
          <div class="sf-view-meta">
            <div class="sf-view-name">${v.username}</div>
            <div class="sf-view-time">${when}</div>
          </div>
        `;
        sfViewsList.appendChild(item);
      });
    }

    sfViewsPanel.classList.add("open");
  } catch (err) {
    console.error("Error fetching story viewers:", err);
    storyToast("حدث خطأ أثناء جلب المشاهدات", "error");
  }
}

// حذف القصة الحالية
async function deleteCurrentStory() {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول لحذف القصة", "error");
    return;
  }

  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.id) return;

  const ok = window.confirm("هل أنت متأكد من حذف هذه القصة؟");
  if (!ok) return;

  try {
    const res = await fetch(
      API_BASE_STORIES + `/stories/${encodeURIComponent(s.id)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );

    const data = await res.json();
    if (!res.ok) {
      storyToast(data.msg || "تعذر حذف القصة", "error");
      return;
    }

    storyToast("تم حذف القصة ✅", "success");
    closeStoryViewer();
    await fetchStoriesFeed();
  } catch (err) {
    console.error("Error deleting story:", err);
    storyToast("حدث خطأ أثناء حذف القصة", "error");
  }
}

// الإبلاغ عن القصة
async function reportCurrentStory() {
  const token = getToken();
  if (!token) {
    storyToast("يلزم تسجيل الدخول للإبلاغ", "error");
    return;
  }

  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.id) return;

  const reason =
    prompt("اذكر سبب الإبلاغ (اختياري):", "") || "";

  try {
    const res = await fetch(
      API_BASE_STORIES + `/stories/${encodeURIComponent(s.id)}/report`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ reason }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      storyToast(data.msg || "تعذر إرسال البلاغ", "error");
      return;
    }

    storyToast(data.msg || "تم إرسال البلاغ ✅", "success");
  } catch (err) {
    console.error("Error reporting story:", err);
    storyToast("حدث خطأ أثناء إرسال البلاغ", "error");
  }
}

// كتم مستخدم هذه القصة (عدم عرض قصصه مستقبلاً)
function muteCurrentStoryUser() {
  const s = storiesFeed[currentStoryIndex];
  if (!s || !s.userId) {
    storyToast("لا يمكن كتم هذا المستخدم", "error");
    return;
  }

  const userIdStr = String(s.userId);
  const confirmMute = window.confirm(
    `سيتم إخفاء كل قصص ${s.userName} من الفيد، هل أنت متأكد؟`
  );
  if (!confirmMute) return;

  mutedStoryUserIds.add(userIdStr);
  saveMutedUsers();
  storyToast(`تم كتم قصص ${s.userName} ✅`, "success");

  closeStoryViewer();
  fetchStoriesFeed();
}

// ================== ربط الأحداث (Event Listeners) ==================

if (storyAddBtn) {
  storyAddBtn.addEventListener("click", handleAddStory);
}

if (storyCloseBtn && storyViewerOverlay) {
  storyCloseBtn.addEventListener("click", closeStoryViewer);
  storyViewerOverlay.addEventListener("click", (e) => {
    if (e.target === storyViewerOverlay) {
      closeStoryViewer();
    }
  });
}

if (storyNextBtn) {
  storyNextBtn.addEventListener("click", () => {
    resetStoryTimer();
    goToNextStory();
  });
}

if (storyPrevBtn) {
  storyPrevBtn.addEventListener("click", () => {
    resetStoryTimer();
    goToPrevStory();
  });
}

if (storyReplySendBtn) {
  storyReplySendBtn.addEventListener("click", sendStoryReply);
}

if (storyReplyInput) {
  storyReplyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendStoryReply();
    }
  });
}

if (storyMuteBtn) {
  storyMuteBtn.addEventListener("click", toggleStoryMute);
}

// ⭐ ربط زر الإبلاغ في الهيدر
if (storyReportBtn) {
  storyReportBtn.addEventListener("click", reportCurrentStory);
}

// أزرار الريأكشن
reactionButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const emoji = btn.dataset.reaction;
    if (emoji) {
      sendStoryReaction(emoji);
    }
  });
});

// أزرار المشاهدات / حذف / إبلاغ / كتم مستخدم
if (sfViewsBtn && sfViewsPanel) {
  sfViewsBtn.addEventListener("click", openViewsPanel);
}
if (sfViewsClose && sfViewsPanel) {
  sfViewsClose.addEventListener("click", () => {
    sfViewsPanel.classList.remove("open");
  });
}

if (sfDeleteBtn) {
  sfDeleteBtn.addEventListener("click", deleteCurrentStory);
}

if (sfReportBtn) {
  sfReportBtn.addEventListener("click", reportCurrentStory);
}

if (sfMuteUserBtn) {
  sfMuteUserBtn.addEventListener("click", muteCurrentStoryUser);
}

// ================== عند تحميل الصفحة ==================
document.addEventListener("DOMContentLoaded", () => {
  fetchStoriesFeed();
});

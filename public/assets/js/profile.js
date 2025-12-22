// ===== إعدادات السيرفر / API =====
// ✅ مهم للنشر على Render: لا تتركه localhost
// يعتمد على نفس الدومين الذي فتحت منه الصفحة (localhost أثناء التطوير، و onrender أثناء النشر)
const SERVER_BASE = window.SERVER_BASE || window.location.origin;
const API_BASE = SERVER_BASE + "/api";

// ===== دوال مساعدة عامة =====
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

// المستخدم الحالي
const currentUser = getUser();
const currentUserId =
  currentUser && (currentUser.id || currentUser._id)
    ? currentUser.id || currentUser._id
    : null;

// قراءة userId من الرابط ?userId=...
const params = new URLSearchParams(window.location.search);
const urlUserId = params.get("userId") || null;

// لو ما في userId بالرابط → هذا بروفايلي أنا
const isMe =
  !urlUserId ||
  (currentUserId &&
    (urlUserId === currentUserId || urlUserId === String(currentUserId)));

let viewedProfileId = null; // ID المستخدم الذي نعرض بروفايله
let viewedProfileData = null;
let allProfilePosts = [];
let isCurrentlyFollowing = false; // حالة المتابعة

// 🔐 حالة خاصة بالحساب الخاص
let viewedProfileIsPrivate = false; // هل الحساب اللي عم نزوره خاص؟
let isBlockedPrivateView = false; // هل الزائر ممنوع يشوف منشورات الحساب الخاص؟

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

// ترسيم أفاتار (صورة لو موجودة، أو حرف)
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

// تحويل رابط ميديا
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

// تأمين النص
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

// تنسيق وقت بسيط
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// تنسيق وقت للمنشورات (ساعة ودقيقة فقط)
function formatPostTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===== عناصر DOM =====
const backHomeBtn = document.getElementById("backHomeBtn");
const profileTitleMain = document.getElementById("profileTitleMain");
const profileTitleSub = document.getElementById("profileTitleSub");

const profileAvatarEl = document.getElementById("profileAvatar");
const profileNameEl = document.getElementById("profileName");
const profileHandleEl = document.getElementById("profileHandle");
const profileMetaEl = document.getElementById("profileMeta");

// عناصر البروفايل الجديدة
const profileBioEl = document.getElementById("profileBio");
const profileLocationEl = document.getElementById("profileLocation");
const profileWebsiteEl = document.getElementById("profileWebsite");
const verifiedBadgeEl = document.getElementById("verifiedBadge");

const profilePostsCountEl = document.getElementById("profilePostsCount");
const profileFollowersCountEl = document.getElementById("profileFollowersCount");
const profileFollowingCountEl = document.getElementById("profileFollowingCount");
const profileLikesCountEl = document.getElementById("profileLikesCount");
const profilePostsContainer = document.getElementById("profilePosts");

const profileTabs = document.querySelectorAll(".profile-tab");

const editProfileBtn = document.getElementById("editProfileBtn");
const followBtn = document.getElementById("followBtn");
const followBtnText = document.getElementById("followBtnText");
const profileMessageBtn = document.getElementById("profileMessageBtn");

// إحصائيات قابلة للضغط
const profileFollowersStatEl = document.getElementById("profileFollowersStat");
const profileFollowingStatEl = document.getElementById("profileFollowingStat");
const profileLikesStatEl = document.getElementById("profileLikesStat");

// مودال تعديل البروفايل
const editProfileModal = document.getElementById("editProfileModal");
const closeEditProfileModalBtn = document.getElementById(
  "closeEditProfileModal"
);
const editUsernameInput = document.getElementById("editUsernameInput");
const editBioInput = document.getElementById("editBioInput");
const editLocationInput = document.getElementById("editLocationInput");
const editWebsiteInput = document.getElementById("editWebsiteInput");
const editAvatarInput = document.getElementById("editAvatarInput");
const editAvatarFileLabel = document.getElementById("editAvatarFileLabel");
const editProfileMsg = document.getElementById("editProfileMsg");
const saveProfileBtn = document.getElementById("saveProfileBtn");

// مودال صورة الأفاتار
const avatarPreviewModal = document.getElementById("avatarPreviewModal");
const avatarPreviewImage = document.getElementById("avatarPreviewImage");
const closeAvatarModalBtn = document.getElementById("closeAvatarModal");

// مودالات قوائم المتابعين / تتابِع / الإعجابات
const followersModal = document.getElementById("followersModal");
const followingModal = document.getElementById("followingModal");
const likesModal = document.getElementById("likesModal");

const closeFollowersModalBtn = document.getElementById("closeFollowersModal");
const closeFollowingModalBtn = document.getElementById("closeFollowingModal");
const closeLikesModalBtn = document.getElementById("closeLikesModal");

const followersListEl = document.getElementById("followersList");
const followingListEl = document.getElementById("followingList");
const likesListEl = document.getElementById("likesList");

let currentAvatarUrl = "";

// ⭐ عناصر قائمة البروفايل (المودال)
const profileMenuTogglePrivacyBtn = document.getElementById("togglePrivacyBtn");
const profileMenuGroupsBtn = document.getElementById("groupsBtn");
const profileMenuMessageBtn = document.getElementById("messageBtn");
const profileMenuCopyLinkBtn = document.getElementById("copyProfileLinkBtn");
const profileMenuReportUserBtn = document.getElementById("reportUserBtn");
const profileMenuLogoutBtn = document.getElementById("logoutBtn");

// ✅ تحديث ظهور عناصر القائمة + أزرار الأفعال حسب إذا البروفايل إلي أو لحدا تاني
function updateProfileMenuVisibility() {
  // أزرار داخل البروفايل
  if (isMe) {
    if (editProfileBtn) editProfileBtn.style.display = "inline-flex";
    if (followBtn) followBtn.style.display = "none";
    if (profileMessageBtn) profileMessageBtn.style.display = "none";
  } else {
    if (editProfileBtn) editProfileBtn.style.display = "none";
    if (followBtn) followBtn.style.display = "inline-flex";
    if (profileMessageBtn) profileMessageBtn.style.display = "inline-flex";
  }

  // عناصر المودال
  if (isMe) {
    // داخل على حسابي
    if (profileMenuTogglePrivacyBtn)
      profileMenuTogglePrivacyBtn.style.display = "flex";
    if (profileMenuGroupsBtn) profileMenuGroupsBtn.style.display = "flex";
    if (profileMenuCopyLinkBtn) profileMenuCopyLinkBtn.style.display = "flex";
    if (profileMenuLogoutBtn) profileMenuLogoutBtn.style.display = "flex";

    if (profileMenuMessageBtn) profileMenuMessageBtn.style.display = "none";
    if (profileMenuReportUserBtn)
      profileMenuReportUserBtn.style.display = "none";
  } else {
    // داخل على حساب شخص آخر
    if (profileMenuTogglePrivacyBtn)
      profileMenuTogglePrivacyBtn.style.display = "none";
    if (profileMenuGroupsBtn) profileMenuGroupsBtn.style.display = "none";
    if (profileMenuLogoutBtn) profileMenuLogoutBtn.style.display = "none";

    if (profileMenuCopyLinkBtn) profileMenuCopyLinkBtn.style.display = "flex";
    if (profileMenuMessageBtn) profileMenuMessageBtn.style.display = "flex";
    if (profileMenuReportUserBtn)
      profileMenuReportUserBtn.style.display = "flex";
  }
}

// ===== رجوع للصفحة الرئيسية =====
if (backHomeBtn) {
  backHomeBtn.addEventListener("click", () => {
    window.location.href = "/";
  });
}

// ===== دالة سكلتون للمنشورات =====
function buildPostsSkeleton() {
  let html = "";
  for (let i = 0; i < 3; i++) {
    html += `
      <div class="profile-skeleton-card">
        <div class="profile-skeleton-header">
          <div class="profile-skeleton-avatar"></div>
          <div class="profile-skeleton-lines">
            <div class="profile-skeleton-line w-60"></div>
            <div class="profile-skeleton-line w-40"></div>
          </div>
        </div>
        <div class="profile-skeleton-line w-80"></div>
        <div class="profile-skeleton-line w-60"></div>
        <div class="profile-skeleton-media"></div>
      </div>
    `;
  }
  return html;
}

// 🔐 رسالة كبيرة لحساب خاص لزائر آخر
function showPrivateProfileBanner() {
  if (!profilePostsContainer) return;
  profilePostsContainer.innerHTML = `
    <div class="glass post-card" style="padding:32px 20px;text-align:center;line-height:1.7;">
      <div style="font-size:20px;font-weight:700;margin-bottom:10px;color:#ffffff;">
        هذا الحساب خاص
      </div>
      <div style="font-size:13px;color:#c3c7ff;">
        لا يمكنك مشاهدة منشورات هذا الحساب لأن مالكه قام بضبط الخصوصية على <strong>خاص</strong>.<br/>
        فقط صاحب الحساب يمكنه مشاهدة منشوراته حالياً.
      </div>
    </div>
  `;
}

// ===== جلب بيانات البروفايل =====
async function fetchProfileData() {
  try {
    let url;
    let opts = {};

    if (isMe) {
      url = API_BASE + "/profile";
      const token = getToken();
      if (!token) {
        throw new Error("يجب تسجيل الدخول أولاً");
      }
      opts.headers = {
        Authorization: "Bearer " + token,
      };
    } else {
      if (!urlUserId) throw new Error("معرف المستخدم غير محدد");
      url = API_BASE + "/users/" + encodeURIComponent(urlUserId);
      const token = getToken();
      if (token) {
        opts.headers = {
          Authorization: "Bearer " + token,
        };
      }
    }

    const res = await fetch(url, opts);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.msg || "تعذر تحميل بيانات البروفايل");
    }

    viewedProfileData = data;
    viewedProfileId = data._id || urlUserId || currentUserId;

    // 🔐 تحديث حالة الحساب الخاص
    viewedProfileIsPrivate = !!data.isPrivate;
    isBlockedPrivateView = viewedProfileIsPrivate && !isMe;

    // بعد ما عرفنا إذا الحساب إلي أو لا
    updateProfileMenuVisibility();

    renderProfileHeader(data);

    if (isBlockedPrivateView) {
      showPrivateProfileBanner();
    }
  } catch (err) {
    console.error(err);
    if (profilePostsContainer) {
      profilePostsContainer.innerHTML = `
        <div class="glass post-card" style="color:#ffb3b3;font-size:13px;">
          ${escapeHtml(err.message || "حدث خطأ أثناء تحميل البروفايل")}
        </div>
      `;
    }
  }
}

// ===== تحديث زر المتابعة حسب الحالة =====
function updateFollowButtonUI() {
  if (!followBtn || !followBtnText) return;
  if (isCurrentlyFollowing) {
    followBtn.classList.add("btn-outline");
    followBtn.classList.remove("btn-primary");
    followBtnText.textContent = "إلغاء المتابعة";
    const icon = followBtn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-user-plus");
      icon.classList.add("fa-user-check");
    }
  } else {
    followBtn.classList.remove("btn-outline");
    followBtn.classList.add("btn-primary");
    followBtnText.textContent = "متابعة";
    const icon = followBtn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-user-check");
      icon.classList.add("fa-user-plus");
    }
  }
}

// ===== دالة فتح المراسلة مع هذا المستخدم (من الزر العلوي أو من القائمة) =====
function openMessageWithUser() {
  if (!currentUserId) {
    alert("يجب تسجيل الدخول أولاً");
    return;
  }
  if (!viewedProfileId || isMe) {
    return;
  }

  // حالياً فقط ننتقل لصفحة الرسائل مع تمرير userId
  const targetId = encodeURIComponent(viewedProfileId);
  window.location.href = `/inbox.html?userId=${targetId}`;
}

// ربط زر الرسالة العلوي
if (profileMessageBtn && !isMe) {
  profileMessageBtn.addEventListener("click", openMessageWithUser);
}

// ربط زر الرسالة من داخل قائمة البروفايل (المودال)
if (profileMenuMessageBtn && !isMe) {
  profileMenuMessageBtn.addEventListener("click", openMessageWithUser);
}

// ===== رسم هيدر البروفايل =====
function renderProfileHeader(user) {
  const username = user.username || user.name || "مستخدم";
  const handle = "@" + (user.username || "user");
  const joined = user.createdAt ? formatTime(user.createdAt) : "";

  const firstChar = username.trim()[0]
    ? username.trim()[0].toUpperCase()
    : "م";

  profileNameEl.textContent = username;
  profileHandleEl.textContent = handle;

  let metaText = joined ? `انضم في ${joined}` : "";
  if (user.isPrivate) {
    metaText = metaText ? `${metaText} · حساب خاص` : "حساب خاص";
  }
  profileMetaEl.textContent = metaText;

  profileTitleMain.textContent = "Saepel";
  profileTitleSub.textContent = handle;

  profilePostsCountEl.textContent =
    typeof user.postsCount === "number" ? user.postsCount : "0";

  const followersCount = Array.isArray(user.followers)
    ? user.followers.length
    : typeof user.followersCount === "number"
    ? user.followersCount
    : 0;

  const followingCount = Array.isArray(user.following)
    ? user.following.length
    : typeof user.followingCount === "number"
    ? user.followingCount
    : 0;

  if (profileFollowersCountEl) {
    profileFollowersCountEl.textContent = followersCount;
  }
  if (profileFollowingCountEl) {
    profileFollowingCountEl.textContent = followingCount;
  }

  // أفاتار
  profileAvatarEl.innerHTML = renderAvatar(user, "avatar-lg", firstChar);
  currentAvatarUrl = user.avatar ? buildAvatarUrl(user.avatar) : "";

  // نبذة
  if (profileBioEl) {
    const bio = user.bio || "";
    if (bio.trim()) {
      profileBioEl.style.display = "block";
      profileBioEl.textContent = bio;
    } else {
      profileBioEl.style.display = "none";
      profileBioEl.textContent = "";
    }
  }

  // موقع
  if (profileLocationEl) {
    const locSpan = profileLocationEl.querySelector("span");
    const location = user.location || "";
    if (location.trim()) {
      profileLocationEl.style.display = "inline-flex";
      if (locSpan) locSpan.textContent = location;
    } else {
      profileLocationEl.style.display = "none";
      if (locSpan) locSpan.textContent = "";
    }
  }

  // رابط
  if (profileWebsiteEl) {
    const wSpan = profileWebsiteEl.querySelector("span");
    let website = user.website || user.link || "";
    if (website.trim()) {
      if (!/^https?:\/\//i.test(website)) {
        website = "https://" + website;
      }
      profileWebsiteEl.style.display = "inline-flex";
      profileWebsiteEl.href = website;
      if (wSpan) wSpan.textContent = website;
    } else {
      profileWebsiteEl.style.display = "none";
      profileWebsiteEl.href = "#";
      if (wSpan) wSpan.textContent = "";
    }
  }

  // بادج موثّق
  if (verifiedBadgeEl) {
    if (user.isVerified) {
      verifiedBadgeEl.style.display = "inline-flex";
    } else {
      verifiedBadgeEl.style.display = "none";
    }
  }

  // حالة المتابعة مبدئياً عندما نزور حساب شخص آخر
  if (!isMe && followBtn) {
    let initialFollowing = false;

    if (typeof user.isFollowing === "boolean") {
      initialFollowing = user.isFollowing;
    } else if (Array.isArray(user.followers) && currentUserId) {
      initialFollowing = user.followers.some((f) => {
        if (!f) return false;
        if (typeof f === "string") return f === String(currentUserId);
        return (f._id || f.id) === String(currentUserId);
      });
    }

    isCurrentlyFollowing = initialFollowing;
    updateFollowButtonUI();
  }
}

// ===== جلب منشورات المستخدم =====
async function fetchProfilePosts() {
  if (!profilePostsContainer) return;

  if (isBlockedPrivateView) {
    showPrivateProfileBanner();
    return;
  }

  profilePostsContainer.innerHTML = buildPostsSkeleton();

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
      throw new Error("تنسيق بيانات المنشورات غير صحيح");
    }

    if (!viewedProfileId) {
      viewedProfileId = currentUserId;
    }

    const vId = String(viewedProfileId || "");

    allProfilePosts = postsArray.filter((p) => {
      if (!p.user) return false;
      if (typeof p.user === "string") {
        return String(p.user) === vId;
      }
      const uId = p.user._id || p.user.id;
      return String(uId || "") === vId;
    });

    allProfilePosts.sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });

    updateProfileLikesCountFromPosts();

    renderProfilePosts("all");
  } catch (err) {
    console.error(err);
    profilePostsContainer.innerHTML = `
      <div class="glass post-card" style="color:#ffb3b3;font-size:13px;">
        ${escapeHtml(err.message || "حدث خطأ أثناء تحميل المنشورات")}
      </div>
    `;
  }
}

// ===== تحديث عدّاد الإعجابات في البروفايل من المنشورات =====
function updateProfileLikesCountFromPosts() {
  if (!profileLikesCountEl) return;
  if (!Array.isArray(allProfilePosts) || !allProfilePosts.length) {
    profileLikesCountEl.textContent = "0";
    return;
  }
  let totalLikes = 0;
  allProfilePosts.forEach((p) => {
    if (Array.isArray(p.likes)) {
      totalLikes += p.likes.length;
    }
  });
  profileLikesCountEl.textContent = totalLikes;
}

// ===== رسم كروت المنشورات =====
function renderProfilePosts(mode) {
  if (!profilePostsContainer) return;

  let list = allProfilePosts.slice();

  if (mode === "media") {
    list = list.filter((p) => p.imageUrl || p.videoUrl);
  }

  if (!list.length) {
    profilePostsContainer.innerHTML = `
      <div class="glass post-card profile-empty-state">
        ${
          mode === "media"
            ? "لا توجد صور أو فيديوهات بعد"
            : "لا توجد منشورات لهذا المستخدم بعد"
        }
      </div>
    `;
    return;
  }

  profilePostsContainer.innerHTML = list.map(renderPostCard).join("");
}

// ===== رسم كارت منشور =====
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
  const createdAt = formatPostTime(post.createdAt);

  const commentsArray = Array.isArray(post.comments) ? post.comments : [];
  const likesArray = Array.isArray(post.likes) ? post.likes : [];

  const likesCount = likesArray.length;
  const commentsCount = commentsArray.length;

  const imageUrl = buildMediaUrl(post.imageUrl);
  const videoUrl = buildMediaUrl(post.videoUrl);

  const privacy = post.privacy === "private" ? "private" : "public";
  const privacyLabel = privacy === "public" ? "عام" : "خاص";
  const privacyIconClass =
    privacy === "public" ? "fa-earth-asia" : "fa-lock";

  const mainMediaUrl = videoUrl || imageUrl || "";

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
      <div class="post-media">
        <video src="${escapeAttr(
          videoUrl
        )}" controls style="width:100%;max-height:420px;"></video>
      </div>
    `;
  }

  const commentsHtml =
    commentsArray.length > 0
      ? commentsArray
          .map((c) => {
            const cuObj = c.user || null;
            const cu =
              (cuObj && (cuObj.username || cuObj.name)) || "مستخدم";
            const cf = cu.trim()[0] ? cu.trim()[0].toUpperCase() : "م";
            const ctext = escapeHtml(c.text || "");

            const cuId = cuObj && cuObj._id ? cuObj._id : "";
            const postOwnerId =
              postUser && postUser._id ? postUser._id : null;

            const canDelete =
              currentUserId &&
              ((cuId && String(cuId) === String(currentUserId)) ||
                (postOwnerId &&
                  String(postOwnerId) === String(currentUserId)));

            return `
              <div class="comment-item glass-sub" data-comment-id="${
                c._id || ""
              }">
                ${renderAvatar(cuObj, "avatar-sm", cf)}
                <div class="comment-body">
                  <div class="comment-header-row">
                    <span class="comment-user user-link" data-user-id="${
                      cuId || ""
                    }">
                      ${escapeHtml(cu)}
                    </span>
                    ${
                      canDelete
                        ? `<button class="comment-delete-btn" title="حذف التعليق">
                             <i class="fa-solid fa-trash"></i>
                           </button>`
                        : ""
                    }
                  </div>
                  <div class="comment-text">${ctext}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty-state">لا توجد تعليقات بعد</div>`;

  const likesHtml =
    likesArray.length > 0
      ? likesArray
          .map((u) => {
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
      : `<div class="empty-state">لا إعجابات بعد</div>`;

  const postUserId = postUser && postUser._id ? postUser._id : "";
  const isOwner =
    currentUserId && postUserId
      ? String(currentUserId) === String(postUserId)
      : false;

  return `
    <article
      class="post-card glass"
      data-post-id="${post._id || ""}"
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
            <span>
              ${createdAt}
              ·
              <i class="fa-solid ${privacyIconClass}"></i>
              ${privacyLabel}
            </span>
          </div>
        </div>
        <div class="post-menu">
          <button
            class="post-menu-btn post-menu-trigger"
            type="button"
            aria-label="خيارات المنشور"
            data-is-owner="${isOwner ? "1" : "0"}"
          >
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
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

// ===== توغيل صناديق التعليقات و اللايكات =====
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
  if (ta) ta.focus();
}

// ===== أحداث المنشورات داخل صفحة البروفايل =====
if (profilePostsContainer) {
  profilePostsContainer.addEventListener("click", async (e) => {
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
        }
      } catch (err) {
        console.error(err);
        alert(err.message || "حدث خطأ أثناء تنفيذ العملية");
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
        window.location.href = `/profile.html?userId=${encodeURIComponent(
          userId
        )}`;
      }
      return;
    }

    const sendBtn = e.target.closest(".comment-send-btn");
    if (sendBtn) {
      try {
        await submitCommentFromBox(postId, postEl);
      } catch (err) {
        console.error(err);
        alert(err.message || "تعذر إضافة التعليق");
      }
      return;
    }

    const deleteBtn = e.target.closest(".comment-delete-btn");
    if (deleteBtn) {
      const commentEl = deleteBtn.closest(".comment-item");
      const commentId = commentEl && commentEl.dataset.commentId;
      if (!commentId) return;

      if (!confirm("هل أنت متأكد أنك تريد حذف هذا التعليق؟")) return;

      try {
        await deleteComment(postId, commentId, postEl, commentEl);
      } catch (err) {
        console.error(err);
        alert(err.message || "تعذر حذف التعليق");
      }
      return;
    }
  });
}

// ===== دوال الإعجاب / التعليق / المشاركة / حذف التعليق =====
async function handleLike(postId, postEl, btn) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
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
    likesSpan.textContent = `❤️ ${data.likesCount} إعجاب`;
  }

  if (data.liked) {
    btn.classList.add("liked");
    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-regular");
      icon.classList.add("fa-solid");
    }
  } else {
    btn.classList.remove("liked");
    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.remove("fa-solid");
      icon.classList.add("fa-regular");
    }
  }

  await fetchProfilePosts();
}

async function submitCommentFromBox(postId, postEl) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const textarea = postEl.querySelector(".comment-input");
  if (!textarea) return;

  const text = textarea.value.trim();
  if (!text) return;

  const res = await fetch(`${API_BASE}/posts/${postId}/comment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ text }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.msg || "تعذر إرسال التعليق");
  }

  textarea.value = "";

  await fetchProfilePosts();
}

async function deleteComment(postId, commentId, postEl, commentEl) {
  const token = getToken();
  if (!token) throw new Error("يجب تسجيل الدخول أولاً");

  const res = await fetch(
    `${API_BASE}/posts/${postId}/comments/${commentId}`,
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
    commentsSpan.textContent = `${data.commentsCount} تعليق`;
  }
}

async function handleShare(postId) {
  const url = `${window.location.origin}/post/${postId}`;

  if (navigator.share) {
    await navigator.share({
      title: "منشور على Saepel",
      text: "شوف هذا المنشور على Saepel 👀",
      url,
    });
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    alert("تم نسخ رابط المنشور ✅");
  } else {
    alert(url);
  }
}

// ===== Tabs =====
profileTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    profileTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const mode = tab.dataset.tab || "all";
    renderProfilePosts(mode);
  });
});

// ===== مودال صورة البروفايل =====
if (profileAvatarEl && avatarPreviewModal && avatarPreviewImage) {
  profileAvatarEl.addEventListener("click", () => {
    if (!currentAvatarUrl) return;
    avatarPreviewImage.src = currentAvatarUrl;
    avatarPreviewModal.classList.add("active");
  });

  if (closeAvatarModalBtn) {
    closeAvatarModalBtn.addEventListener("click", () => {
      avatarPreviewModal.classList.remove("active");
    });
  }

  avatarPreviewModal.addEventListener("click", (e) => {
    if (e.target === avatarPreviewModal) {
      avatarPreviewModal.classList.remove("active");
    }
  });
}

// ===== مودال تعديل البروفايل =====
function openEditProfileModal() {
  if (!isMe) return;
  if (!viewedProfileData) return;

  editUsernameInput.value = viewedProfileData.username || "";
  if (editBioInput) editBioInput.value = viewedProfileData.bio || "";
  if (editLocationInput)
    editLocationInput.value = viewedProfileData.location || "";
  if (editWebsiteInput)
    editWebsiteInput.value =
      viewedProfileData.website || viewedProfileData.link || "";

  if (editAvatarInput) editAvatarInput.value = "";
  if (editAvatarFileLabel)
    editAvatarFileLabel.textContent = "اختر صورة من جهازك";
  if (editProfileMsg) {
    editProfileMsg.textContent = "";
    editProfileMsg.style.color = "#fff";
  }

  editProfileModal.classList.add("active");
}

function closeEditProfileModal() {
  editProfileModal.classList.remove("active");
}

if (editProfileBtn && editProfileModal && isMe) {
  editProfileBtn.addEventListener("click", openEditProfileModal);
}

if (closeEditProfileModalBtn) {
  closeEditProfileModalBtn.addEventListener("click", closeEditProfileModal);
}

if (editProfileModal) {
  editProfileModal.addEventListener("click", (e) => {
    if (e.target === editProfileModal) {
      closeEditProfileModal();
    }
  });
}

if (editAvatarInput && editAvatarFileLabel) {
  editAvatarInput.addEventListener("change", () => {
    const file = editAvatarInput.files && editAvatarInput.files[0];
    if (!file) {
      editAvatarFileLabel.textContent = "اختر صورة من جهازك";
      return;
    }
    editAvatarFileLabel.textContent = file.name;
  });
}

if (saveProfileBtn) {
  saveProfileBtn.addEventListener("click", async () => {
    try {
      const token = getToken();
      if (!token) throw new Error("يجب تسجيل الدخول أولاً");

      const formData = new FormData();
      const username = editUsernameInput.value.trim();
      const bio = editBioInput ? editBioInput.value.trim() : "";
      const location = editLocationInput
        ? editLocationInput.value.trim()
        : "";
      const website = editWebsiteInput
        ? editWebsiteInput.value.trim()
        : "";

      if (username) formData.append("username", username);
      if (bio) formData.append("bio", bio);
      if (location) formData.append("location", location);
      if (website) formData.append("website", website);

      const file = editAvatarInput.files && editAvatarInput.files[0];
      if (file) {
        formData.append("avatar", file);
      }

      saveProfileBtn.disabled = true;
      editProfileMsg.style.color = "#fff";
      editProfileMsg.textContent = "جارٍ الحفظ...";

      const res = await fetch(API_BASE + "/profile", {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || "تعذر تحديث البروفايل");
      }

      const stored = getUser() || {};
      const apiUser = data.user || {};

      const merged = {
        ...stored,
        ...apiUser,
        id: apiUser._id || stored.id,
        _id: apiUser._id || stored._id,
        name: apiUser.username || stored.name,
        username: apiUser.username || stored.username,
        avatar: apiUser.avatar || "",
        bio: apiUser.bio || "",
        location: apiUser.location || "",
        website: apiUser.website || apiUser.link || "",
      };

      localStorage.setItem("user", JSON.stringify(merged));

      editProfileMsg.style.color = "#b4ffb4";
      editProfileMsg.textContent = "تم التحديث بنجاح ✅";

      await fetchProfileData();
      await fetchProfilePosts();

      setTimeout(() => {
        closeEditProfileModal();
      }, 800);
    } catch (err) {
      console.error(err);
      editProfileMsg.style.color = "#ffb3b3";
      editProfileMsg.textContent =
        err.message || "حدث خطأ أثناء تحديث البروفايل";
    } finally {
      saveProfileBtn.disabled = false;
    }
  });
}

// ===== زر المتابعة / إلغاء المتابعة =====
if (followBtn && !isMe) {
  followBtn.addEventListener("click", async () => {
    try {
      const token = getToken();
      if (!token) {
        alert("يجب تسجيل الدخول أولاً");
        return;
      }
      if (!viewedProfileId) {
        alert("معرف المستخدم غير معروف");
        return;
      }

      followBtn.disabled = true;
      followBtnText.textContent = "جارٍ المعالجة...";

      const res = await fetch(
        `${API_BASE}/users/${encodeURIComponent(viewedProfileId)}/follow`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || "تعذر تنفيذ العملية");
      }

      isCurrentlyFollowing = !!data.following;
      updateFollowButtonUI();

      if (
        profileFollowersCountEl &&
        typeof data.followersCount === "number"
      ) {
        profileFollowersCountEl.textContent = data.followersCount;
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "حدث خطأ أثناء تنفيذ العملية");
    } finally {
      followBtn.disabled = false;
      updateFollowButtonUI();
    }
  });
}

/* ============================= */
/* مودالات المتابعين / تتابِع / الإعجابات */
/* ============================= */

function closeOverlay(modalOverlay) {
  if (!modalOverlay) return;
  modalOverlay.classList.remove("active");
}

function attachListModalDrag(modalOverlay) {
  if (!modalOverlay || modalOverlay.dataset.dragInit === "1") return;
  const panel = modalOverlay.querySelector(".list-modal");
  if (!panel) return;

  modalOverlay.dataset.dragInit = "1";

  let startY = 0;
  let currentY = 0;
  let dragging = false;

  panel.addEventListener(
    "touchstart",
    (e) => {
      if (!e.touches || !e.touches.length) return;
      startY = e.touches[0].clientY;
      currentY = startY;
      dragging = true;
      panel.classList.add("dragging");
    },
    { passive: true }
  );

  panel.addEventListener(
    "touchmove",
    (e) => {
      if (!dragging || !e.touches || !e.touches.length) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        panel.style.transform = `translateY(${diff}px)`;
        panel.style.opacity = Math.max(0.4, 1 - diff / 300);
      }
    },
    { passive: true }
  );

  panel.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    const diff = currentY - startY;

    panel.classList.remove("dragging");
    panel.style.transform = "";
    panel.style.opacity = "";

    if (diff > 90) {
      closeOverlay(modalOverlay);
    }
  });
}

function buildListUserElement(user, options = {}) {
  const { canRemove = false } = options;

  const item = document.createElement("div");
  item.className = "list-user-item";

  const uObj = typeof user === "object" && user !== null ? user : {};
  const userId = uObj._id || uObj.id || (typeof user === "string" ? user : "");
  const userName = uObj.username || uObj.name || "مستخدم";
  const handle =
    (uObj.username && "@" + uObj.username) ||
    (uObj.email ? uObj.email : "") ||
    "";
  const firstChar = userName.trim()[0]
    ? userName.trim()[0].toUpperCase()
    : "م";

  item.dataset.userId = userId || "";

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "list-user-avatar";
  avatarWrap.innerHTML = renderAvatar(uObj, "avatar-sm", firstChar);

  const infoWrap = document.createElement("div");
  infoWrap.className = "list-user-info";

  const nameSpan = document.createElement("div");
  nameSpan.className = "list-user-name";
  nameSpan.textContent = userName;

  const handleSpan = document.createElement("div");
  handleSpan.className = "list-user-handle";
  handleSpan.textContent = handle;

  infoWrap.appendChild(nameSpan);
  if (handle) infoWrap.appendChild(handleSpan);

  item.appendChild(avatarWrap);
  item.appendChild(infoWrap);

  if (canRemove && userId) {
    const removeBtn = document.createElement("button");
    removeBtn.className = "list-user-remove-btn";
    removeBtn.dataset.userId = userId;
    removeBtn.innerHTML = `<i class="fa-solid fa-user-xmark"></i><span>إزالة</span>`;
    item.appendChild(removeBtn);
  }

  item.addEventListener("click", (e) => {
    if (e.target.closest(".list-user-remove-btn")) return;
    if (!userId) return;
    window.location.href = `/profile.html?userId=${encodeURIComponent(
      userId
    )}`;
  });

  return item;
}

// ==== المتابعون ====
async function openFollowersModal() {
  if (!followersModal || !followersListEl || !viewedProfileId) return;
  followersModal.classList.add("active");
  attachListModalDrag(followersModal);
  await loadFollowersList();
}

async function loadFollowersList() {
  followersListEl.innerHTML =
    '<div class="list-modal-empty">جارٍ تحميل المتابعين...</div>';

  try {
    let followersData = null;

    if (
      viewedProfileData &&
      Array.isArray(viewedProfileData.followers) &&
      viewedProfileData.followers.length &&
      typeof viewedProfileData.followers[0] === "object"
    ) {
      followersData = viewedProfileData.followers;
    } else {
      const token = getToken();
      const headers = token ? { Authorization: "Bearer " + token } : undefined;

      const res = await fetch(
        `${API_BASE}/users/${encodeURIComponent(viewedProfileId)}/followers`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || "تعذر تحميل المتابعين");
      }
      followersData = Array.isArray(data) ? data : data.followers || [];
    }

    followersListEl.innerHTML = "";

    if (!followersData || !followersData.length) {
      followersListEl.innerHTML =
        '<div class="list-modal-empty">لا يوجد متابعون حتى الآن</div>';
      return;
    }

    followersData.forEach((u) => {
      const el = buildListUserElement(u, { canRemove: isMe });
      followersListEl.appendChild(el);
    });
  } catch (err) {
    console.error(err);
    followersListEl.innerHTML = `<div class="list-modal-empty" style="color:#fecaca;">
      ${escapeHtml(err.message || "حدث خطأ أثناء تحميل المتابعين")}
    </div>`;
  }
}

if (closeFollowersModalBtn && followersModal) {
  closeFollowersModalBtn.addEventListener("click", () =>
    closeOverlay(followersModal)
  );
}
if (followersModal) {
  followersModal.addEventListener("click", (e) => {
    if (e.target === followersModal) closeOverlay(followersModal);
  });
}

if (followersListEl && isMe) {
  followersListEl.addEventListener("click", async (e) => {
    const removeBtn = e.target.closest(".list-user-remove-btn");
    if (!removeBtn) return;

    const targetUserId = removeBtn.dataset.userId;
    if (!targetUserId) return;

    if (!confirm("إزالة هذا المستخدم من متابعيك؟")) return;

    try {
      const token = getToken();
      if (!token) {
        alert("يجب تسجيل الدخول أولاً");
        return;
      }

      const res = await fetch(
        `${API_BASE}/users/${encodeURIComponent(
          viewedProfileId
        )}/followers/${encodeURIComponent(targetUserId)}`,
        {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + token,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || "تعذر إزالة المتابع");
      }

      const parentItem = removeBtn.closest(".list-user-item");
      if (parentItem && parentItem.parentNode) {
        parentItem.parentNode.removeChild(parentItem);
      }

      if (
        profileFollowersCountEl &&
        typeof data.followersCount === "number"
      ) {
        profileFollowersCountEl.textContent = data.followersCount;
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "حدث خطأ أثناء إزالة المتابع");
    }
  });
}

// ==== تتابِع ====
async function openFollowingModal() {
  if (!followingModal || !followingListEl || !viewedProfileId) return;
  followingModal.classList.add("active");
  attachListModalDrag(followingModal);
  await loadFollowingList();
}

async function loadFollowingList() {
  followingListEl.innerHTML =
    '<div class="list-modal-empty">جارٍ تحميل الحسابات التي تتابعها...</div>';

  try {
    let followingData = null;

    if (
      viewedProfileData &&
      Array.isArray(viewedProfileData.following) &&
      viewedProfileData.following.length &&
      typeof viewedProfileData.following[0] === "object"
    ) {
      followingData = viewedProfileData.following;
    } else {
      const token = getToken();
      const headers = token ? { Authorization: "Bearer " + token } : undefined;

      const res = await fetch(
        `${API_BASE}/users/${encodeURIComponent(viewedProfileId)}/following`,
        { headers }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.msg || "تعذر تحميل قائمة تتابِع");
      }
      followingData = Array.isArray(data) ? data : data.following || [];
    }

    followingListEl.innerHTML = "";

    if (!followingData || !followingData.length) {
      followingListEl.innerHTML =
        '<div class="list-modal-empty">لا تتابع أي حساب بعد</div>';
      return;
    }

    followingData.forEach((u) => {
      const el = buildListUserElement(u, { canRemove: false });
      followingListEl.appendChild(el);
    });
  } catch (err) {
    console.error(err);
    followingListEl.innerHTML = `<div class="list-modal-empty" style="color:#fecaca;">
      ${escapeHtml(err.message || "حدث خطأ أثناء تحميل قائمة تتابِع")}
    </div>`;
  }
}

if (closeFollowingModalBtn && followingModal) {
  closeFollowingModalBtn.addEventListener("click", () =>
    closeOverlay(followingModal)
  );
}
if (followingModal) {
  followingModal.addEventListener("click", (e) => {
    if (e.target === followingModal) closeOverlay(followingModal);
  });
}

// ==== الإعجابات ====
async function openLikesModal() {
  if (!likesModal || !likesListEl) return;
  likesModal.classList.add("active");
  attachListModalDrag(likesModal);
  loadLikesFromPosts();
}

function loadLikesFromPosts() {
  likesListEl.innerHTML =
    '<div class="list-modal-empty">جارٍ جمع بيانات الإعجابات...</div>';

  if (!Array.isArray(allProfilePosts) || !allProfilePosts.length) {
    likesListEl.innerHTML =
      '<div class="list-modal-empty">لا توجد إعجابات بعد</div>';
    return;
  }

  const mapByUser = new Map();

  allProfilePosts.forEach((post) => {
    if (!Array.isArray(post.likes)) return;
    post.likes.forEach((u) => {
      if (!u || typeof u !== "object") return;
      const id = u._id || u.id;
      if (!id) return;
      const key = String(id);
      const prev = mapByUser.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        mapByUser.set(key, { user: u, count: 1 });
      }
    });
  });

  const arr = Array.from(mapByUser.values());
  if (!arr.length) {
    likesListEl.innerHTML =
      '<div class="list-modal-empty">لا توجد إعجابات بعد</div>';
    return;
  }

  arr.sort((a, b) => b.count - a.count);

  likesListEl.innerHTML = "";
  arr.forEach((entry) => {
    const el = buildListUserElement(entry.user, { canRemove: false });

    const handleEl = el.querySelector(".list-user-handle");
    if (handleEl) {
      handleEl.textContent = `${entry.count} إعجاب على منشورات هذا الحساب`;
    } else {
      const info = el.querySelector(".list-user-info");
      if (info) {
        const extra = document.createElement("div");
        extra.className = "list-user-handle";
        extra.textContent = `${entry.count} إعجاب على منشورات هذا الحساب`;
        info.appendChild(extra);
      }
    }

    likesListEl.appendChild(el);
  });
}

if (closeLikesModalBtn && likesModal) {
  closeLikesModalBtn.addEventListener("click", () =>
    closeOverlay(likesModal)
  );
}
if (likesModal) {
  likesModal.addEventListener("click", (e) => {
    if (e.target === likesModal) closeOverlay(likesModal);
  });
}

// ربط الإحصائيات مع فتح المودالات
if (profileFollowersStatEl && followersModal) {
  profileFollowersStatEl.addEventListener("click", openFollowersModal);
}
if (profileFollowingStatEl && followingModal) {
  profileFollowingStatEl.addEventListener("click", openFollowingModal);
}
if (profileLikesStatEl && likesModal) {
  profileLikesStatEl.addEventListener("click", openLikesModal);
}

// ===== تشغيل الصفحة =====
document.addEventListener("DOMContentLoaded", async () => {
  await fetchProfileData();
  await fetchProfilePosts();
});

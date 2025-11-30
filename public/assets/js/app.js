const SERVER_BASE = "http://localhost:5000";
const API_BASE = SERVER_BASE + "/api";

const postsDiv = document.getElementById("posts");
const createMsg = document.getElementById("createMsg");
const welcomeUserSpan = document.getElementById("welcomeUser");

/* --------- توكن + المستخدم المخزَّن --------- */
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

/* --------- هيلبر بسيط لتأمين النص --------- */
function escapeHtml(str = "") {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* --- عرض اسم المستخدم (من localStorage كإضافة للبروفايل) --- */
(function () {
  const user = getUser();
  if (welcomeUserSpan) {
    welcomeUserSpan.textContent = user?.name
      ? "مرحباً " + user.name + " 👋"
      : "مرحباً 👋";
  }
})();

/* --- تسجيل خروج --- */
function logout() {
  localStorage.clear();
  window.location.href = "login.html";
}

/* --- تحويل مسار الصور إلى رابط صحيح --- */
function buildMediaUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return SERVER_BASE + path;
  return SERVER_BASE + "/" + path;
}

/* --- فتح بروفايل المستخدم (لاحقاً نعمل صفحة لكل يونزر) --- */
function openUserProfile(userId) {
  // حالياً كل الضغط يفتح بروفايلك إنت
  window.location.href = "profile.html";
}

/* --- جلب المنشورات (تنسيق نظيف يعتمد على CSS) --- */
async function loadPosts() {
  if (!postsDiv) return;

  postsDiv.innerHTML = "<p>جارِ تحميل المنشورات...</p>";

  try {
    const res = await fetch(API_BASE + "/posts");
    if (!res.ok) {
      postsDiv.innerHTML = "<p>حدث خطأ أثناء تحميل المنشورات.</p>";
      return;
    }

    const data = await res.json();
    postsDiv.innerHTML = "";

    if (!data.length) {
      postsDiv.innerHTML = "<p>لا توجد منشورات بعد.</p>";
      return;
    }

    data.forEach((post) => {
      const div = document.createElement("div");
      div.className = "post-card";

      const userObj = post.user || {};
      const userName = userObj.username || userObj.name || "مستخدم";
      const userAvatar = userObj.avatar ? buildMediaUrl(userObj.avatar) : null;
      const userInitial = userName.charAt(0).toUpperCase();

      const createdAt = post.createdAt
        ? new Date(post.createdAt).toLocaleString("ar-EG", {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "";

      // هيدر البوست (الصورة + الاسم + الوقت)
      let html = `
        <div class="post-header">
          <button class="post-user-btn" onclick="openUserProfile('${
            userObj._id || ""
          }')">
            <div class="post-avatar">
      `;

      if (userAvatar) {
        html += `<img src="${userAvatar}" alt="avatar">`;
      } else {
        html += `<span>${escapeHtml(userInitial)}</span>`;
      }

      html += `
            </div>
            <div class="post-user-meta">
              <span class="post-user-name">${escapeHtml(userName)}</span>
              <span class="post-time">${escapeHtml(createdAt)}</span>
            </div>
          </button>
        </div>
      `;

      // نص المنشور
      const postText = post.text
        ? escapeHtml(post.text).replace(/\n/g, "<br>")
        : "";
      if (postText) {
        html += `<div class="post-text">${postText}</div>`;
      }

      // صورة
      if (post.imageUrl) {
        html += `
          <div class="post-media">
            <img src="${buildMediaUrl(post.imageUrl)}">
          </div>
        `;
      }

      // فيديو
      if (post.videoUrl) {
        html += `
          <div class="post-media">
            <video controls>
              <source src="${buildMediaUrl(post.videoUrl)}">
            </video>
          </div>
        `;
      }

      // رابط خارجي
      if (post.link) {
        const safeLink = escapeHtml(post.link);
        html += `
          <div class="post-link">
            <a href="${safeLink}" target="_blank">
              <i class="fa-solid fa-link"></i> ${safeLink}
            </a>
          </div>
        `;
      }

      // شريط التفاعل (لايك + عدد التعليقات)
      const likes = post.likes?.length || 0;
      const commentsCount = post.comments?.length || 0;

      html += `
        <div class="post-actions">
          <button class="post-like-btn" onclick="toggleLike('${post._id}')">
            <i class="fa-regular fa-thumbs-up"></i>
            <span>إعجاب (${likes})</span>
          </button>
          <div class="post-comments-count">
            <i class="fa-regular fa-comment"></i>
            <span>${commentsCount} تعليق</span>
          </div>
        </div>
      `;

      // التعليقات
      html += `<div class="comments">`;
      html += `<h4>التعليقات</h4>`;

      if (post.comments?.length) {
        post.comments.forEach((c) => {
          const cUserName = c.user?.username || c.user?.name || "مستخدم";
          html += `
            <p>
              <b>${escapeHtml(cUserName)}:</b>
              ${escapeHtml(c.text || "")}
            </p>
          `;
        });
      } else {
        html += `<p class="empty">لا توجد تعليقات</p>`;
      }

      // إضافة تعليق
      html += `
        <div class="add-comment">
          <input
            class="comment-input"
            id="comment-${post._id}"
            placeholder="أضف تعليقاً..."
          >
          <button class="comment-send-btn" onclick="addComment('${post._id}')">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      </div>
      `;

      div.innerHTML = html;
      postsDiv.appendChild(div);
    });
  } catch (err) {
    console.error("Error loading posts:", err);
    postsDiv.innerHTML = "<p>حدث خطأ أثناء تحميل المنشورات.</p>";
  }
}

/* --- إنشاء منشور --- */
async function createPost() {
  if (!createMsg) return;
  createMsg.textContent = "";
  createMsg.className = "msg";

  const token = getToken();

  if (!token) {
    createMsg.textContent = "يجب تسجيل الدخول.";
    createMsg.className = "msg error";
    return;
  }

  const textInput = document.getElementById("text");
  const linkInput = document.getElementById("link");
  const mediaInput = document.getElementById("media");

  const text = textInput ? textInput.value : "";
  const link = linkInput ? linkInput.value : "";
  const file = mediaInput?.files?.[0];

  const form = new FormData();
  form.append("text", text);
  form.append("link", link);
  if (file) form.append("media", file);

  try {
    const res = await fetch(API_BASE + "/posts", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
    });

    const data = await res.json();

    if (!res.ok) {
      createMsg.textContent = data.msg || "فشل إنشاء المنشور";
      createMsg.className = "msg error";
      return;
    }

    createMsg.textContent = data.msg || "تم إنشاء المنشور بنجاح";
    createMsg.className = "msg success";

    if (textInput) textInput.value = "";
    if (linkInput) linkInput.value = "";
    if (mediaInput) mediaInput.value = "";

    loadPosts();
  } catch (err) {
    console.error("Error creating post:", err);
    createMsg.textContent = "حدث خطأ أثناء إنشاء المنشور.";
    createMsg.className = "msg error";
  }
}

/* --- إعجاب --- */
async function toggleLike(id) {
  const token = getToken();
  if (!token) return;

  try {
    await fetch(API_BASE + `/posts/${id}/like`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });

    loadPosts();
  } catch (err) {
    console.error("Error toggling like:", err);
  }
}

/* --- إضافة تعليق --- */
async function addComment(id) {
  const token = getToken();
  if (!token) return;

  const input = document.getElementById("comment-" + id);
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  try {
    await fetch(API_BASE + `/posts/${id}/comment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ text }),
    });

    input.value = "";
    loadPosts();
  } catch (err) {
    console.error("Error adding comment:", err);
  }
}

/* --- بداية عمل الصفحة (الصفحة الرئيسية فقط) --- */
if (postsDiv) {
  loadPosts();
}

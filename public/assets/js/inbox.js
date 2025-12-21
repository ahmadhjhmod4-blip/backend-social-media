console.log("[Inbox] inbox.js loaded ✅");

// ===== إعدادات السيرفر / API =====
// ✅ مهم للنشر على أي شبكة/رابط خارجي:
// بدل ما نثبت localhost، ناخذ الدومين من نفس الصفحة (أو من إعداد يدوي عند الحاجة)
//
// طرق التخصيص (اختياري):
// 1) window.__SAEPEL_SERVER_BASE = "https://your-domain.com"
// 2) <meta name="saepel-server-base" content="https://your-domain.com">
// 3) localStorage.setItem("saepel_server_base","https://your-domain.com")
function resolveServerBase() {
  try {
    const g = (window.__SAEPEL_SERVER_BASE || window.SAEPEL_SERVER_BASE || "").trim();
    const meta = document.querySelector('meta[name="saepel-server-base"]')?.getAttribute("content") || "";
    const ls = localStorage.getItem("saepel_server_base") || "";
    const pick = (g || meta || ls || "").trim();

    const clean = (u) => {
      let x = String(u || "").trim();
      if (!x) return "";
      // remove trailing slash
      x = x.replace(/\/+$/, "");
      return x;
    };

    if (pick) return clean(pick);

    // الافتراضي: نفس الدومين/المنفذ الذي شغّال عليه الفرونت
    // (ممتاز لو رح تعمل deploy ب reverse proxy أو serve للـ frontend من نفس السيرفر)
    const origin = window.location.origin;
    return clean(origin);
  } catch {
    return "http://localhost:5000";
  }
}

const SERVER_BASE = resolveServerBase();
const API_BASE = SERVER_BASE + "/api";

// ✅ صمت إشعارات التسجيل الصوتي (بدون "جاري تسجيل/رفع/تم الإرسال")
const SILENT_VOICE_FEEDBACK = true;

// ⭐ Socket.io
const SOCKET_URL = SERVER_BASE;
let socket = null;

// ===== Global UI State (مهم لتفادي مشاكل الـ scope) =====
let inboxPage = null;

let conversationListEl = null;
let searchInput = null;
let newChatBtn = null;

let chatBackBtn = null;
let chatExitBtn = null;

let chatUserNameEl = null;
let chatUserStatusEl = null;
let chatAvatarImg = null;
let chatMessagesEl = null;

let chatActions = null;
let chatMoreBtn = null;
let chatOptionsMenu = null;

let audioCallBtn = null;
let videoCallBtn = null;

let chatInputBar = null;
let chatInput = null;
let chatSendBtn = null;
let chatMicBtn = null;

let chatActionsToggle = null;
let chatActionsMenu = null;

let hiddenFileInput = null;

// ===== Sidebar Tabs + Theme (Phase 5 UI only, safe) =====
let sidebarFilter = (localStorage.getItem('saepel_inbox_filter') || 'chats');
let sidebarTheme = (localStorage.getItem('saepel_inbox_theme') || 'light');
let sidebarTabsEl = null;
let sidebarThemeBtn = null;
let sidebarEmptyEl = null;

// ===== Attachments (+) State =====
let pendingAttachItems = []; // [{ id, file, previewUrl, kind }]
let attachPreviewWrap = null;
let attachPreviewList = null;
let attachPreviewClearBtn = null;

// ===== App Data =====
let conversations = [];
let activeConversationId = null;
let activeConversationUserId = null;
let isLoadingMessages = false;

// ✅ Space/Channel context (Telegram-like permissions)
let activeConversationMeta = null;
let activeSpaceCtx = {
  type: "chat", // chat | group | channel
  isChannel: false,
  isAdmin: false,
  canSend: true,
};

function computeSpaceCtx(conv) {
  const type = (conv?.type || (conv?.isGroup ? "group" : "chat")) || "chat";
  const isChannel = type === "channel";
  const uid = String(currentUserId || "");
  const ownerOk = conv?.owner && String(conv.owner) === uid;
  const admins = Array.isArray(conv?.admins) ? conv.admins.map((x) => String(x)) : [];
  const isAdmin = !!uid && (ownerOk || admins.includes(uid));
  // sending permission (channels default admins)
  const canSendRule = conv?.permissions?.canSend || (isChannel ? "admins" : "all");
  const canSend = !isChannel ? true : (canSendRule === "all" ? true : isAdmin);
  return { type, isChannel, isAdmin, canSend };
}

function applySpaceUiPermissions() {
  // call/video buttons: hide in channel/group (Telegram-like)
  const hideCalls = activeSpaceCtx.isChannel || activeSpaceCtx.type === "group";
  if (audioCallBtn) audioCallBtn.style.display = hideCalls ? "none" : "";
  if (videoCallBtn) videoCallBtn.style.display = hideCalls ? "none" : "";

  // read-only channel composer
  const readOnly = activeSpaceCtx.isChannel && !activeSpaceCtx.canSend;
  if (chatInput) {
    chatInput.disabled = !!readOnly;
    if (readOnly) chatInput.setAttribute("placeholder", "هذه قناة — النشر متاح للمشرفين فقط");
  }
  if (chatSendBtn) chatSendBtn.disabled = !!readOnly;

  // hide actions that don't make sense in read-only channels
  const toggle = (sel, show) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.style.display = show ? "" : "none";
    });
  };

  if (readOnly) {
    toggle('[data-action^="attach-"], #attachBtn, #attachImageBtn, #attachVideoBtn, #attachFileBtn, #attachCameraBtn, .attach-btn, .attach-image-btn, .attach-video-btn, .attach-file-btn, .attach-camera-btn', false);
    if (chatMicBtn) chatMicBtn.style.display = "none";
    // emoji may exist
    toggle('#emojiToggleBtn, .emoji-toggle, [data-action="emoji"]', false);
  } else {
    toggle('[data-action^="attach-"], #attachBtn, #attachImageBtn, #attachVideoBtn, #attachFileBtn, #attachCameraBtn, .attach-btn, .attach-image-btn, .attach-video-btn, .attach-file-btn, .attach-camera-btn', true);
    if (chatMicBtn) chatMicBtn.style.display = "";
    toggle('#emojiToggleBtn, .emoji-toggle, [data-action="emoji"]', true);
  }

  // Mark body class for CSS tweaks if needed
  try {
    document.body.classList.toggle("is-channel", activeSpaceCtx.isChannel);
    document.body.classList.toggle("is-channel-readonly", readOnly);
  } catch {}

  // ✅ Chat options menu: adjust items based on space type (chat/group/channel)
  try {
    if (chatOptionsMenu) {
      const setItem = (action, { show = true, label = null, icon = null } = {}) => {
        const btn = chatOptionsMenu.querySelector(`.chat-options-item[data-action="${action}"]`);
        if (!btn) return;
        btn.style.display = show ? "" : "none";
        if (label) {
          const textNode = btn.childNodes && btn.childNodes.length ? btn.childNodes[btn.childNodes.length - 1] : null;
          // safer: update textContent while keeping icon
          const ico = btn.querySelector("i");
          btn.innerHTML = `${ico ? ico.outerHTML : ""}${label}`;
        }
        if (icon) {
          const icoEl = btn.querySelector("i");
          if (icoEl) icoEl.className = icon;
        }
      };

      const isChat = activeSpaceCtx.type === "chat";
      const isGroup = activeSpaceCtx.type === "group";
      const isChannel = activeSpaceCtx.type === "channel";

      // view-profile becomes info in group/channel
      if (isChannel) {
        setItem("view-profile", { show: true, label: "معلومات القناة", icon: "fa-solid fa-circle-info" });
      } else if (isGroup) {
        setItem("view-profile", { show: true, label: "معلومات المجموعة", icon: "fa-solid fa-circle-info" });
      } else {
        setItem("view-profile", { show: true, label: "عرض الملف الشخصي", icon: "fa-regular fa-user" });
      }

      // block/report only makes sense in 1:1 chats
      setItem("block", { show: isChat });
      setItem("report", { show: isChat });

      // clear-chat: hide for channel non-admin (Telegram-like)
      if (isChannel && !activeSpaceCtx.isAdmin) {
        setItem("clear-chat", { show: false });
      } else {
        setItem("clear-chat", { show: true });
      }
    }
  } catch {}
}

function setActiveConversationMeta(conv) {
  activeConversationMeta = conv || null;
  activeSpaceCtx = computeSpaceCtx(conv);
  applySpaceUiPermissions();
}


// ===== New Messages UI State =====
let newMsgBannerEl = null;
let newMsgBannerCountEl = null;
let pendingNewMsgCount = 0;
let unreadDividerInserted = false;
const CHAT_BOTTOM_THRESHOLD_PX = 48;

// ===== Message Tools State (Select/Reply/Pin/Search) =====
let selectMode = false;
let selectedMsgIds = new Set();
let lastSelectedMsgId = null; // لميزة Shift range (تقريبية)
let replyDraft = null; // { msgId, previewText }
let pinnedMsgId = null;

// ===== Dedup (منع التكرار نهائياً) =====
let seenMessageIds = new Set(); // يحمي من تكرار نفس _id
let pendingOutbox = new Map(); // key -> { tempId, ts }

function _normStr(v) {
  return String(v || "").trim();
}

function buildOutboxKey({
  conversationId,
  senderId,
  text = "",
  attachments = [],
  replyTo = "",
  forwardOf = "",
  kind = "",
}) {
  const conv = _normStr(conversationId);
  const sender = _normStr(senderId);
  const t = _normStr(text).slice(0, 400);
  const r = _normStr(replyTo);
  const f = _normStr(forwardOf);
  const k = _normStr(kind);

  // نبني بصمة خفيفة وسريعة (ونضمن تفرّدها للـ Reply/Forward)
  const a = Array.isArray(attachments)
    ? attachments
        .map((x) => {
          const type = x?.type || x?.kind || "file";
          const url = _normStr(x?.url || x?.fallbackUrl || x?.path || x?.localUrl);
          const dur = Number(x?.duration || 0) || 0;
          return `${type}|${url}|${dur}`;
        })
        .join("~")
    : "";

  return `${conv}::${sender}::${k}::${t}::${a}::r=${r}::f=${f}`;
}

function registerPendingOutbox(key, tempId) {
  if (!key || !tempId) return;
  pendingOutbox.set(key, { tempId, ts: Date.now() });

  // تنظيف تلقائي سريع (حتى ما تتكدّس)
  setTimeout(() => {
    const v = pendingOutbox.get(key);
    if (v && Date.now() - v.ts > 60_000) pendingOutbox.delete(key);
  }, 65_000);
}

function tryResolvePendingOutbox(message) {
  try {
    const senderId = message?.sender?._id || message?.sender?.id || message?.sender;
    if (!senderId || !currentUserId) return false;
    if (String(senderId) !== String(currentUserId)) return false;

    const convId = message?.conversation?._id || message?.conversation;
    const key = buildOutboxKey({
      conversationId: convId,
      senderId: String(currentUserId),
      text: message?.text || "",
      attachments: Array.isArray(message?.attachments) ? message.attachments : [],
      replyTo: message?.replyTo || "",
      forwardOf: message?.forwardOf || message?.forwardedFrom || "",
      kind: message?.type || "",
    });

    const pending = pendingOutbox.get(key);
    if (!pending) return false;

    const tempId = pending.tempId;
    pendingOutbox.delete(key);

    const row =
      document.querySelector(`.msg-row.temp-message[data-temp-id="${tempId}"]`) ||
      document.querySelector(`.temp-message[data-temp-id="${tempId}"]`);

    if (row) {
      row.classList.remove("temp-message");
      row.removeAttribute("data-temp-id");
      row.dataset.msgId = message?._id || "";

      // ✅ ثبّت fallbackUrl للصوت لو لسه ما انحط
      const audio = row.querySelector("audio");
      const att0 = (message.attachments && message.attachments[0]) || null;
      if (audio && att0?.url) {
        audio.dataset.fallback = att0.url;
      }

      // ✅ حدّث علامة القراءة (✅/✅✅)
      const state = row.querySelector(".msg-meta .msg-state");
      if (state) state.innerHTML = getSeenIconHTML(message);

      // سجّل _id حتى ما يجي ينضاف ثانية
      if (message?._id) seenMessageIds.add(String(message._id));

      return true;
    }

    // لو ما لقينا row (مثلاً المستخدم عمل refresh) → بس منع التكرار
    if (message?._id) seenMessageIds.add(String(message._id));
    return true;
  } catch {
    return false;
  }
}


// التسجيل الصوتي
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimerId = null;

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

const currentUser = getUser();
const currentUserId =
  currentUser && (currentUser.id || currentUser._id)
    ? currentUser.id || currentUser._id
    : null;

function buildAvatarUrl(avatar) {
  if (!avatar) return "";
  let raw = String(avatar).trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (!raw.startsWith("/")) raw = "/" + raw;
  return SERVER_BASE + raw;
}

// ✅✅ FIX: لا تضف SERVER_BASE على data: / blob: (هذا سبب 431 + reset)
function buildFileUrl(path) {
  if (!path) return "";
  let raw = String(path).trim().replace(/\\/g, "/");
  if (!raw) return "";

  // مهم جداً: data URL أو blob URL لازم يرجع كما هو
  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (!raw.startsWith("/")) raw = "/" + raw;
  return SERVER_BASE + raw;
}

// ===== UI Toast + Confirm (بديل alert/confirm) =====
function ensureToastRoot() {
  let root = document.querySelector(".toast-wrap");
  if (!root) {
    root = document.createElement("div");
    root.className = "toast-wrap";
    document.body.appendChild(root);
  }
  return root;
}

function showToast(msg, type = "info") {
  try {
    const root = ensureToastRoot();

    const icons = {
      info: "fa-circle-info",
      success: "fa-circle-check",
      warning: "fa-triangle-exclamation",
      error: "fa-circle-xmark",
    };

    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = `
      <div class="t-ico"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
      <div class="t-body">
        <p class="t-title">${
          type === "success"
            ? "تم"
            : type === "error"
            ? "خطأ"
            : type === "warning"
            ? "تنبيه"
            : "معلومة"
        }</p>
        <p class="t-msg">${String(msg || "")}</p>
      </div>
      <button class="t-close" type="button" aria-label="close">×</button>
    `;

    const close = () => {
      t.style.opacity = "0";
      t.style.transform = "translateY(-6px)";
      setTimeout(() => t.remove(), 160);
    };

    t.querySelector(".t-close")?.addEventListener("click", close);

    // دخول بسيط
    t.style.transform = "translateY(-6px)";
    t.style.opacity = "0";
    root.prepend(t);
    requestAnimationFrame(() => {
      t.style.transition = "transform .18s ease, opacity .18s ease";
      t.style.transform = "translateY(0)";
      t.style.opacity = "1";
    });

    setTimeout(close, 3200);
  } catch (e) {
    console.log("[ToastFallback]", type, msg);
  }
}

function ensureConfirmModal() {
  // ✅ لا تلتقط أي overlay ثانية من Calls أو غيرها
  let overlay = document.querySelector('.ui-overlay[data-ui="confirm"]');

  const template = () => `
      <div class="ui-modal" role="dialog" aria-modal="true">
        <h3 id="uiTitle">تأكيد</h3>
        <p id="uiMsg">هل أنت متأكد؟</p>
        <div class="ui-actions">
          <button class="ui-btn secondary" type="button" id="uiCancel">إلغاء</button>
          <button class="ui-btn danger" type="button" id="uiOk">تأكيد</button>
        </div>
      </div>
    `;

  // إذا في overlay قديمة بدون data-ui (نسخ سابقة) نحاول نستعملها
  if (!overlay) {
    const legacy = document.querySelector(".ui-overlay");
    if (legacy && legacy.querySelector("#uiTitle") && legacy.querySelector("#uiOk")) {
      overlay = legacy;
      overlay.dataset.ui = "confirm";
    }
  }

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "ui-overlay";
    overlay.dataset.ui = "confirm";
    overlay.innerHTML = template();
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("show");
    });
  } else {
    // ✅ إذا overlay موجودة لكن محتواها انحذف/تغيّر (هذا سبب null.textContent)
    if (!overlay.querySelector("#uiTitle") || !overlay.querySelector("#uiOk") || !overlay.querySelector("#uiCancel")) {
      overlay.innerHTML = template();
    }
    overlay.dataset.ui = "confirm";
  }

  return overlay;
}

function uiConfirm({
  title = "تأكيد",
  message = "هل أنت متأكد؟",
  okText = "تأكيد",
  cancelText = "إلغاء",
}) {
  return new Promise((resolve) => {
    const overlay = ensureConfirmModal();
    const titleEl = overlay.querySelector("#uiTitle");
    const msgEl = overlay.querySelector("#uiMsg");
    const okBtn = overlay.querySelector("#uiOk");
    const cancelBtn = overlay.querySelector("#uiCancel");

    // ✅ فallback آمن (مستحيل تقريباً بعد ensureConfirmModal)
    if (!titleEl || !msgEl || !okBtn || !cancelBtn) {
      const ok = window.confirm(`${title}

${message}`);
      return resolve(!!ok);
    }

    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;

    const cleanup = () => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.classList.remove("show");
    };

    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };

    overlay.classList.add("show");
  });
}


// ===== Helpers =====
function isMobileView() {
  return window.innerWidth <= 820;
}

function formatTimeHM(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatSeconds(total) {
  const secs = Math.max(0, Math.floor(total));
  const mm = Math.floor(secs / 60).toString().padStart(1, "0");
  const ss = (secs % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===================== New Messages Indicators (Front-only) =====================
function isAtChatBottom() {
  if (!chatMessagesEl) return true;
  const distance =
    chatMessagesEl.scrollHeight - (chatMessagesEl.scrollTop + chatMessagesEl.clientHeight);
  return distance <= CHAT_BOTTOM_THRESHOLD_PX;
}

function ensureNewMsgUiStyle() {
  if (document.getElementById("newMsgUiStyle")) return;
  const st = document.createElement("style");
  st.id = "newMsgUiStyle";
  st.textContent = `
    .new-msg-banner{position:absolute;left:50%;transform:translateX(-50%);bottom:12px;z-index:60;display:none}
    .new-msg-banner.show{display:flex}
    .new-msg-banner button{display:flex;align-items:center;gap:8px;border:0;cursor:pointer;border-radius:999px;padding:10px 14px;background:rgba(20,25,45,.78);backdrop-filter:blur(10px);color:inherit;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:.15s}
    .new-msg-banner button:hover{transform:translateY(-1px)}
    .new-msg-banner .nmb-dot{width:8px;height:8px;border-radius:999px;background:rgba(99,102,241,.95)}
    .new-msg-banner .nmb-count{min-width:18px;height:18px;border-radius:999px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;background:rgba(255,255,255,.12)}
    .msg-row.system.unread-divider{display:flex;justify-content:center;margin:10px 0}
    .msg-row.system.unread-divider .msg-bubble{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.10);backdrop-filter:blur(10px);font-size:12px;opacity:.9}
  `;
  document.head.appendChild(st);
}

function ensureNewMsgBanner() {
  if (!chatMessagesEl) return null;
  ensureNewMsgUiStyle();

  if (newMsgBannerEl) return newMsgBannerEl;

  const host = chatMessagesEl.parentElement || chatMessagesEl;
  if (host && getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  const wrap = document.createElement("div");
  wrap.className = "new-msg-banner";
  wrap.innerHTML = `
    <button type="button" aria-label="رسالة جديدة">
      <span class="nmb-dot"></span>
      <span class="nmb-text">رسالة جديدة ↓</span>
      <span class="nmb-count">1</span>
    </button>
  `;
  host.appendChild(wrap);

  newMsgBannerEl = wrap;
  newMsgBannerCountEl = wrap.querySelector(".nmb-count");

  wrap.querySelector("button")?.addEventListener("click", () => {
    scrollChatToBottom({ markSeen: true });
  });

  return wrap;
}

function showNewMsgBanner(incrementBy = 1) {
  if (!chatMessagesEl) return;
  const el = ensureNewMsgBanner();
  if (!el) return;

  pendingNewMsgCount = Math.max(0, pendingNewMsgCount + (Number(incrementBy) || 0));
  if (newMsgBannerCountEl) newMsgBannerCountEl.textContent = String(pendingNewMsgCount || 1);

  el.classList.add("show");
}

function hideNewMsgBanner() {
  pendingNewMsgCount = 0;
  if (newMsgBannerCountEl) newMsgBannerCountEl.textContent = "0";
  if (newMsgBannerEl) newMsgBannerEl.classList.remove("show");
}

function insertUnreadDividerIfNeeded() {
  if (!chatMessagesEl) return;
  if (unreadDividerInserted) return;

  // لو موجود مسبقاً (مثلاً بعد reload)
  if (chatMessagesEl.querySelector('.msg-row.system.unread-divider[data-unread-divider="1"]')) {
    unreadDividerInserted = true;
    return;
  }

  const row = document.createElement("div");
  row.className = "msg-row system unread-divider";
  row.setAttribute("data-unread-divider", "1");
  row.innerHTML = `<div class="msg-bubble">غير مقروء</div>`;
  chatMessagesEl.appendChild(row);

  unreadDividerInserted = true;
}

function clearUnreadDivider() {
  unreadDividerInserted = false;
  if (!chatMessagesEl) return;
  chatMessagesEl
    .querySelectorAll('.msg-row.system.unread-divider[data-unread-divider="1"]')
    .forEach((el) => el.remove());
}

function scrollChatToBottom({ markSeen = false } = {}) {
  if (!chatMessagesEl) return;
  requestAnimationFrame(() => {
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    hideNewMsgBanner();
    clearUnreadDivider();
    if (markSeen && activeConversationId) {
      markMessagesAsSeen(activeConversationId);
    }
  });
}

function onChatScrollUiTick() {
  if (!chatMessagesEl) return;
  if (isAtChatBottom()) {
    if (pendingNewMsgCount || unreadDividerInserted) {
      scrollChatToBottom({ markSeen: true });
    } else {
      hideNewMsgBanner();
      clearUnreadDivider();
    }
  }
}



// ===================== Voice Playback Rate =====================
const VOICE_RATES = [1, 1.5, 2];

function voiceRateStorageKey() {
  // نخزن السرعة لكل مستخدم (وبشكل عام، بدون ما نربطها بمحادثة محددة لتبقى ثابتة)
  return currentUserId ? `saepel_voice_rate_${currentUserId}` : "saepel_voice_rate";
}

function getSavedVoiceRate() {
  const raw = localStorage.getItem(voiceRateStorageKey());
  const n = Number(raw);
  if (!n || isNaN(n)) return 1;
  return VOICE_RATES.includes(n) ? n : 1;
}

function saveVoiceRate(rate) {
  const n = Number(rate);
  const safe = VOICE_RATES.includes(n) ? n : 1;
  localStorage.setItem(voiceRateStorageKey(), String(safe));
  return safe;
}

function formatRateLabel(rate) {
  const r = Number(rate) || 1;
  return (r % 1 === 0 ? String(r) : String(r)).replace(".0", "") + "x";
}

function getSeenIconHTML(message) {
  try {
    const seenBy = Array.isArray(message?.seenBy) ? message.seenBy : [];
    if (!activeConversationUserId) return '<i class="fa-solid fa-check"></i>';
    const otherSeen = seenBy.some((x) => String(x?._id || x?.id || x) === String(activeConversationUserId));
    return otherSeen
      ? '<i class="fa-solid fa-check-double"></i>'
      : '<i class="fa-solid fa-check"></i>';
  } catch {
    return '<i class="fa-solid fa-check"></i>';
  }
}



async function apiRequest(path, options = {}) {
  const token = getToken();
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data && data.msg ? data.msg : "حدث خطأ غير متوقع";
    throw new Error(msg);
  }
  return data;
}

function getOtherParticipant(conv) {
  if (!conv || !Array.isArray(conv.participants)) return null;
  if (!currentUserId) return conv.participants[0] || null;
  const meId = String(currentUserId);
  return (
    conv.participants.find((p) => String(p._id || p.id) !== meId) ||
    conv.participants[0] ||
    null
  );
}

function formatConversationTime(iso) {
  if (!iso) return "";
  return formatTimeHM(iso);
}

// ✅ رفع ملف صوت للسيرفر وإرجاع url (ملف حقيقي)
async function uploadAudioBlobToServer(blob, filename = "voice-message.webm", durationSec = 0) {
  const fd = new FormData();
  fd.append("file", blob, filename);

  // (اختياري) مدة التسجيل بالثواني
  if (durationSec) fd.append("duration", String(durationSec));

  if (activeConversationId) fd.append("conversationId", activeConversationId);
  if (activeConversationUserId) fd.append("receiverId", activeConversationUserId);

  const tryPaths = ["/chat/upload-audio", "/upload"];

  let lastErr = null;
  for (const p of tryPaths) {
    try {
      const res = await apiRequest(p, { method: "POST", body: fd });
      const url =
        res?.url || res?.fileUrl || res?.path || res?.file?.url || res?.data?.url;
      if (!url) throw new Error("الرفع نجح بس ما رجع url");
      return url;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("تعذر رفع الملف الصوتي");
}

// ===================== Audio Loader (يدعم Authorization) =====================
async function fetchAsBlobUrl(originalUrl) {
  const url = buildFileUrl(originalUrl);
  if (!url) return "";

  // data:/blob: جاهزين
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  const token = getToken();
  try {
    // جرّب أولاً fetch مع Authorization (مفيد لو السيرفر يحمي الملفات)
    const res = await fetch(url, {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    if (!blob || !blob.size) throw new Error("empty blob");
    return URL.createObjectURL(blob);
  } catch {
    // fallback: خليه مثل ما هو (لو الملفات public)
    return url;
  }
}

// ===================== Voice Player (زجاجي) =====================
function buildVoiceBubbleHTML({ url, fallbackUrl = "", duration = 0, timeLabel = "" }) {
  const safeUrl = String(url || "");
  const safeFallback = String(fallbackUrl || "");
  const safeTime = String(timeLabel || "");
  const durLabel = duration ? formatSeconds(duration) : "0:00";
  const rateLabel = formatRateLabel(getSavedVoiceRate());

  return `
    <div class="msg-bubble voice-msg">
      <button class="voice-play-btn" type="button" aria-label="play">
        <i class="fa-solid fa-play"></i>
      </button>

      <div class="voice-bubble-main">
        <div class="voice-wave">
          <div class="voice-wave-progress"></div>
        </div>
        <div class="voice-info">
          <span class="voice-duration">${durLabel}</span>
          <span class="msg-time">${safeTime}</span>
        </div>
      </div>

      <button class="voice-speed-btn" type="button" aria-label="speed">${rateLabel}</button>

      <audio
        data-src="${safeUrl}"
        data-fallback="${safeFallback}"
        data-rate="${getSavedVoiceRate()}"
        preload="metadata"
        style="display:none"></audio>
    </div>
  `;
}

function wireVoiceBubble(bubbleEl, durationFromServer = 0) {
  const audio = bubbleEl.querySelector("audio");
  const playBtn = bubbleEl.querySelector(".voice-play-btn");
  const speedBtn = bubbleEl.querySelector(".voice-speed-btn");
  const durationEl = bubbleEl.querySelector(".voice-duration");
  const progress = bubbleEl.querySelector(".voice-wave-progress");

  if (!audio || !playBtn || !durationEl || !progress) return;

  // السرعة (تتذكر آخر اختيار)
  let currentRate = getSavedVoiceRate();
  if (speedBtn) speedBtn.textContent = formatRateLabel(currentRate);
  audio.playbackRate = currentRate;

  const applyRate = (rate) => {
    currentRate = saveVoiceRate(rate);
    audio.playbackRate = currentRate;
    if (speedBtn) speedBtn.textContent = formatRateLabel(currentRate);
  };

  if (speedBtn) {
    speedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = VOICE_RATES.indexOf(currentRate);
      const next = VOICE_RATES[(idx + 1) % VOICE_RATES.length];
      applyRate(next);
    });
  }

  // ✅ كشف أخطاء تشغيل/تحميل الصوت
  audio.addEventListener("error", () => {
    console.error("Audio element error:", audio.error, "src:", audio.src);
    showToast("فشل تحميل/تشغيل الصوت (تحقق من رابط الملف/السيرفر)", "error");
  });

  if (durationFromServer && !isNaN(durationFromServer)) {
    durationEl.textContent = formatSeconds(durationFromServer);
  }

  const setPlayIcon = (isPlaying) => {
    playBtn.innerHTML = isPlaying
      ? '<i class="fa-solid fa-pause"></i>'
      : '<i class="fa-solid fa-play"></i>';
  };

  const resetProgress = () => {
    progress.style.width = "0%";
  };

  audio.addEventListener("loadedmetadata", () => {
    // تطبيق السرعة دائماً بعد تحميل الميتاداتا
    try {
      audio.playbackRate = currentRate;
    } catch {}

    if (!durationFromServer && audio.duration && !isNaN(audio.duration)) {
      durationEl.textContent = formatSeconds(Math.round(audio.duration));
    }
  });

  audio.addEventListener("timeupdate", () => {
    if (!audio.duration || isNaN(audio.duration)) return;
    progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
  });

  audio.addEventListener("ended", () => {
    setPlayIcon(false);
    progress.style.width = "100%";
  });

  audio.addEventListener("pause", () => {
    setPlayIcon(false);
  });

  async function ensureAudioSrcLoaded() {
    if (audio.dataset.loaded === "1") return true;

    const mainSrc = audio.dataset.src || "";
    const fallbackSrc = audio.dataset.fallback || "";

    // جرّب الرابط الأساسي
    let playable = await fetchAsBlobUrl(mainSrc);

    // إذا طلع فاضي جرّب fallback
    if (!playable && fallbackSrc) {
      playable = await fetchAsBlobUrl(fallbackSrc);
    }

    if (!playable) return false;

    audio.src = playable;

    // ✅ اجبر المتصفح على التحميل
    try {
      audio.load();
    } catch {}

    // ✅ طبق السرعة قبل التشغيل
    try {
      audio.playbackRate = currentRate;
    } catch {}

    audio.dataset.loaded = "1";
    return true;
  }

  playBtn.addEventListener("click", async () => {
    // أوقف باقي الأصوات
    document.querySelectorAll(".msg-bubble.voice-msg audio").forEach((a) => {
      if (a !== audio && !a.paused) a.pause();
    });
    document.querySelectorAll(".msg-bubble.voice-msg .voice-play-btn").forEach((b) => {
      if (b !== playBtn) b.innerHTML = '<i class="fa-solid fa-play"></i>';
    });

    // ✅ لو المستخدم غير السرعة بوقت سابق، طبقها هون كمان
    applyRate(getSavedVoiceRate());

    if (audio.paused) {
      playBtn.disabled = true;
      try {
        const ok = await ensureAudioSrcLoaded();
        if (!ok) {
          showToast("تعذر تحميل ملف الصوت (تحقق من رابط الملف على السيرفر)", "error");
          return;
        }
        await audio.play();
        setPlayIcon(true);
      } catch (e) {
        console.error("audio play error:", e);
        resetProgress();
        showToast("تعذر تشغيل الصوت", "error");
      } finally {
        playBtn.disabled = false;
      }
    } else {
      audio.pause();
      setPlayIcon(false);
    }
  });
}


// ===================== Socket.io =====================

// ⭐ دالة الاتصال بالسوكيت ⭐
function connectSocket() {
  if (socket && socket.connected) return socket;

  try {
    // ✅ لو في سوكيت قديم، نظّف listeners لتفادي تكرار الأحداث
    if (socket) {
      try { socket.removeAllListeners(); } catch {}
    }

    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      auth: {
        token: getToken(),
      },
    });

    socket.on("connect", () => {
      console.log("✅ Socket.io connected:", socket.id);
      if (currentUserId) {
        socket.emit("join-user", currentUserId);
      window.socket = socket;
      window.dispatchEvent(new Event("saepel:socket:connected"));

      }
    });

    socket.on("new-message", (message) => {
      console.log("📩 رسالة جديدة وصلت:", message);
      handleIncomingMessage(message);
    });

    socket.on("message-sent", (data) => {
      console.log("✅ تأكيد إرسال الرسالة:", data);
      // السيرفر يرجّع messageId فقط حالياً، والترقية الفعلية تتم عند وصول new-message
    });

    socket.on("message-error", (error) => {
      console.error("❌ خطأ في إرسال الرسالة:", error);
      showToast(error?.error || "فشل إرسال الرسالة", "error");

      const tempMsgs = document.querySelectorAll(".temp-message");
      tempMsgs.forEach((msg) => msg.remove());
    });

    socket.on("user-typing", (data) => {
      handleTypingIndicator(data);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket.io disconnected");
    });

    return socket;
  } catch (error) {
    console.error("❌ فشل الاتصال بالسوكيت:", error);
    return null;
  }
}

// ⭐ دالة معالجة الرسائل الواردة ⭐
function handleIncomingMessage(message) {
  // ✅ 1) ترقية التيمب بالمطابقة (حل جذري للتكرار)
  if (tryResolvePendingOutbox(message)) return;

  // ✅ 2) إذا نفس _id وصل أكثر من مرة → تجاهله
  const incomingId = message?._id;
  if (incomingId && seenMessageIds.has(String(incomingId))) return;

  // ✅ 3) دعم ترقية via clientTempId لو أُرسلت لاحقاً
  try {
    const ct = message?.clientTempId;
    if (ct) {
      const tempRow = document.querySelector(`.msg-row.temp-message[data-temp-id="${ct}"]`) ||
                      document.querySelector(`.temp-message[data-temp-id="${ct}"]`);
      if (tempRow) {
        tempRow.classList.remove("temp-message");
        tempRow.removeAttribute("data-temp-id");
        tempRow.dataset.msgId = message._id || "";

        // ثبّت fallbackUrl للصوت إذا وصل رابط السيرفر
        const audio = tempRow.querySelector("audio");
        const att0 = (message.attachments && message.attachments[0]) || null;
        if (audio && att0?.url) {
          audio.dataset.fallback = att0.url;
        }
        return; // منع التكرار
      }
    }
  } catch {}

  const convId = message.conversation?._id || message.conversation;
  const ui = window.__inbox || {};

  if (activeConversationId && convId === activeConversationId) {
    // ✅ هل المستخدم بآخر الشات؟
    const atBottomBefore = isAtChatBottom();

    // إذا الرسالة من الطرف الثاني وما نحن بآخر الشات → فاصل غير مقروء + تنبيه "رسالة جديدة ↓"
    const fromOther =
      message?.sender && String(message.sender._id || message.sender.id || message.sender) !== String(currentUserId);

    if (fromOther && !atBottomBefore) {
      insertUnreadDividerIfNeeded();
    }

    ui.addMessageToUI?.(message);

    initMediaViewer();

    if (atBottomBefore) {
      scrollChatToBottom({ markSeen: fromOther }); // ينزل ويعلّم مقروء عند الحاجة
    } else {
      // ما ننزل تلقائياً حتى ما نخرب تجربة القراءة
      if (fromOther) showNewMsgBanner(1);
    }

    updateConversationListWithNewMessage(message);

    // ✅ ما نعلّم seen إلا إذا كنا بآخر الشات (أو المستخدم نزل لاحقاً)

  } else {
    updateConversationListWithNewMessage(message);

    const sender = message.sender?.username || "مستخدم";
    const preview = message.text?.substring(0, 60) || "محتوى جديد";
    showToast(`رسالة جديدة من ${sender}: ${preview}`, "info");
  }
}

// ⭐ تحديث قائمة المحادثات برسالة جديدة ⭐
function updateConversationListWithNewMessage(message) {
  const convId = message.conversation?._id || message.conversation;
  const idx = conversations.findIndex((c) => c._id === convId);

  if (idx !== -1) {
    const updatedConv = {
      ...conversations[idx],
      lastMessage: message,
      lastMessageAt: message.createdAt || new Date(),
    };
    conversations.splice(idx, 1);
    conversations.unshift(updatedConv);

    const ui = window.__inbox || {};
    ui.renderConversationList?.(conversations);

    // ✅ Phase 5: keep filter after reorder
    try { window.__inbox?.applySidebarFilter?.(); } catch {}
  }
}

// ⭐ دالة معالجة مؤشر الكتابة ⭐
function handleTypingIndicator(data) {
  if (!data.senderId || String(data.senderId) !== String(activeConversationUserId))
    return;

  const typingIndicator = document.getElementById("typingIndicator");
  if (typingIndicator) {
    typingIndicator.style.display = data.isTyping ? "block" : "none";
  }
}

// ⭐ إرسال مؤشر الكتابة ⭐
function sendTypingIndicator(isTyping) {
  if (!socket || !socket.connected) return;
  if (!activeConversationId || !activeConversationUserId) return;

  socket.emit("typing", {
    senderId: currentUserId,
    receiverId: activeConversationUserId,
    isTyping: isTyping,
  });
}

// ⭐ تعليم الرسائل كمقروءة ⭐
async function markMessagesAsSeen(conversationId) {
  try {
    await apiRequest(
      `/chat/conversations/${encodeURIComponent(conversationId)}/seen`,
      { method: "POST" }
    );
  } catch (err) {
    console.warn("mark seen error:", err);
  }
}

// ===================== Media Viewer (صور/فيديو) =====================
let mvOverlay = null;
let mvContent = null;
let mvCloseBtn = null;
let mvDownloadBtn = null;
let mvOpenBtn = null;
let mvTitle = null;

let mvScale = 1;
let mvTx = 0;
let mvTy = 0;
let mvPanning = false;
let mvPanStart = { x: 0, y: 0 };
let mvLast = { x: 0, y: 0 };
let mvActiveType = "";
let mvActiveUrl = "";
let mvActiveName = "";

function ensureMediaViewerDom() {
  mvOverlay = document.getElementById("mediaViewerOverlay");
  if (mvOverlay) return;

  // fallback: لو ما انضاف بالـ HTML
  const div = document.createElement("div");
  div.id = "mediaViewerOverlay";
  div.className = "media-viewer-overlay";
  div.innerHTML = `
    <div class="media-viewer" role="dialog" aria-modal="true" aria-label="عارض الوسائط">
      <div class="mv-top">
        <button id="mediaViewerCloseBtn" class="mv-btn mv-close" type="button" aria-label="إغلاق">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div id="mediaViewerTitle" class="mv-title"></div>
        <div class="mv-actions">
          <a id="mediaViewerOpenBtn" class="mv-btn" target="_blank" rel="noopener">فتح</a>
          <button id="mediaViewerDownloadBtn" class="mv-btn" type="button">حفظ</button>
        </div>
      </div>
      <div id="mediaViewerContent" class="mv-content"></div>
      <div class="mv-hint">تلميح: عجلة الماوس للتقريب، واسحب للتحريك</div>
    </div>
  `;
  document.body.appendChild(div);
  mvOverlay = div;
}

function resetMediaTransform() {
  mvScale = 1;
  mvTx = 0;
  mvTy = 0;
  mvPanning = false;
  mvPanStart = { x: 0, y: 0 };
  mvLast = { x: 0, y: 0 };
}

function applyMediaTransform() {
  if (!mvContent) return;
  const img = mvContent.querySelector("img.mv-media");
  if (!img) return;
  img.style.transform = `translate(${mvTx}px, ${mvTy}px) scale(${mvScale})`;
}

function openMediaViewer({ type, url, name }) {
  ensureMediaViewerDom();

  mvContent = document.getElementById("mediaViewerContent");
  mvCloseBtn = document.getElementById("mediaViewerCloseBtn");
  mvDownloadBtn = document.getElementById("mediaViewerDownloadBtn");
  mvOpenBtn = document.getElementById("mediaViewerOpenBtn");
  mvTitle = document.getElementById("mediaViewerTitle");

  mvActiveType = type || "";
  mvActiveUrl = url || "";
  mvActiveName = name || "";

  if (!mvContent || !mvOverlay || !mvActiveUrl) return;

  resetMediaTransform();
  mvContent.innerHTML = "";

  if (mvTitle) mvTitle.textContent = mvActiveName ? mvActiveName : (mvActiveType === "video" ? "فيديو" : "صورة");

  if (mvOpenBtn) {
    mvOpenBtn.href = mvActiveUrl;
    mvOpenBtn.style.display = "inline-flex";
  }

  if (mvActiveType === "video") {
    const v = document.createElement("video");
    v.className = "mv-media";
    v.src = mvActiveUrl;
    v.controls = true;
    v.playsInline = true;
    v.autoplay = true;
    v.controlsList = "nodownload";
    mvContent.appendChild(v);
  } else {
    const img = document.createElement("img");
    img.className = "mv-media";
    img.src = mvActiveUrl;
    img.alt = mvActiveName || "صورة";
    img.draggable = false;
    mvContent.appendChild(img);
  }

  // فتح
  mvOverlay.classList.add("show");
  mvOverlay.setAttribute("aria-hidden", "false");

  // events
  mvCloseBtn && (mvCloseBtn.onclick = () => closeMediaViewer());
  mvOverlay.onclick = (e) => {
    if (e.target === mvOverlay) closeMediaViewer();
  };

  document.addEventListener("keydown", onMediaViewerKeydown, { once: true });

  // تفعيل زوم/تحريك للصورة فقط
  if (mvActiveType !== "video") {
    mvContent.addEventListener("wheel", onMediaViewerWheel, { passive: false });
    mvContent.addEventListener("mousedown", onMediaViewerMouseDown);
    mvContent.addEventListener("mousemove", onMediaViewerMouseMove);
    mvContent.addEventListener("mouseup", onMediaViewerMouseUp);
    mvContent.addEventListener("mouseleave", onMediaViewerMouseUp);

    mvContent.addEventListener("dblclick", () => {
      mvScale = mvScale > 1 ? 1 : 2;
      if (mvScale === 1) { mvTx = 0; mvTy = 0; }
      applyMediaTransform();
    });
  }

  // حفظ
  if (mvDownloadBtn) {
    mvDownloadBtn.onclick = async () => {
      try {
        await downloadMedia(mvActiveUrl, mvActiveName);
      } catch (err) {
        console.error("download media error:", err);
        showToast("تعذر حفظ الملف", "error");
      }
    };
  }
}

function closeMediaViewer() {
  if (!mvOverlay) mvOverlay = document.getElementById("mediaViewerOverlay");
  if (!mvOverlay) return;

  mvOverlay.classList.remove("show");
  mvOverlay.setAttribute("aria-hidden", "true");

  // تنظيف سريع
  const c = document.getElementById("mediaViewerContent");
  if (c) c.innerHTML = "";

  resetMediaTransform();
}

function onMediaViewerKeydown(e) {
  if (e.key === "Escape") closeMediaViewer();
}

function onMediaViewerWheel(e) {
  e.preventDefault();
  const delta = e.deltaY || 0;
  const step = delta > 0 ? -0.12 : 0.12;
  const next = Math.min(5, Math.max(1, mvScale + step));
  mvScale = next;
  applyMediaTransform();
}

function onMediaViewerMouseDown(e) {
  if (mvScale <= 1) return;
  mvPanning = true;
  mvPanStart = { x: e.clientX, y: e.clientY };
  mvLast = { x: mvTx, y: mvTy };
  e.preventDefault();
}

function onMediaViewerMouseMove(e) {
  if (!mvPanning) return;
  const dx = e.clientX - mvPanStart.x;
  const dy = e.clientY - mvPanStart.y;
  mvTx = mvLast.x + dx;
  mvTy = mvLast.y + dy;
  applyMediaTransform();
}

function onMediaViewerMouseUp() {
  mvPanning = false;
}

async function downloadMedia(url, name) {
  // ملاحظة: المتصفحات ما بتسمح "يحفظ تلقائيًا" بدون تفاعل المستخدم،
  // هون بنعمل زر حفظ سريع.
  const safeName = (name || "saepel-media").replace(/[\\/:*?"<>|]/g, "_");
  const res = await fetch(url, { credentials: "include" }).catch(() => null);
  if (!res || !res.ok) {
    // fallback direct
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
}

function initMediaViewer() {
  if (!chatMessagesEl) return;

  // فتح الصورة بضغطه
  chatMessagesEl.addEventListener("click", (e) => {
    const copyBtn = e.target.closest?.(".msg-contact-card .c-copy");
    if (copyBtn) {
      const card = copyBtn.closest(".msg-contact-card");
      const phone = card?.dataset?.phone || "";
      const name = card?.dataset?.name || "";
      if (!phone) { showToast("لا يوجد رقم لنسخه", "warning"); return; }
      try {
        navigator.clipboard?.writeText(phone);
        showToast(`تم نسخ الرقم: ${phone}`, "success");
      } catch {
        prompt("انسخ الرقم:", phone);
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const locCard = e.target.closest?.(".msg-location-card");
    if (locCard) {
      const url = locCard?.dataset?.url || "";
      if (url) window.open(url, "_blank", "noopener");
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const saveBtn = e.target.closest?.(".msg-attach-save");
    if (saveBtn) {
      const wrap = saveBtn.closest(".msg-attach");
      const url = wrap?.dataset?.url || "";
      const name = wrap?.dataset?.name || "";
      if (url) downloadMedia(url, name);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const openBtn = e.target.closest?.(".msg-attach-open");
    if (openBtn) {
      const wrap = openBtn.closest(".msg-attach-video");
      const url = wrap?.dataset?.url || wrap?.querySelector("video")?.src || "";
      const name = wrap?.dataset?.name || "فيديو";
      if (url) openMediaViewer({ type: "video", url, name });
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const img = e.target.closest?.(".msg-attach-image img");
    if (img) {
      const wrap = img.closest(".msg-attach-image");
      const url = wrap?.dataset?.url || img.src || "";
      const name = wrap?.dataset?.name || img.alt || "صورة";
      if (url) openMediaViewer({ type: "image", url, name });
      return;
    }
  });

  // فتح الفيديو بدبل-كليك على الفيديو نفسه
  chatMessagesEl.addEventListener("dblclick", (e) => {
    const v = e.target.closest?.(".msg-attach-video video");
    if (!v) return;
    const wrap = v.closest(".msg-attach-video");
    const url = wrap?.dataset?.url || v.src || "";
    const name = wrap?.dataset?.name || "فيديو";
    if (url) openMediaViewer({ type: "video", url, name });
  });
}

// ===================== DOM Ready =====================
document.addEventListener("DOMContentLoaded", () => {
  // ===== عناصر أساسية من DOM =====
  inboxPage = document.querySelector(".inbox-page");

  conversationListEl = document.getElementById("conversationList");
  searchInput = document.getElementById("searchInput");
  newChatBtn = document.getElementById("newChatBtn");


  
  // ===================== Header Buttons (Settings + Plus) =====================
  // ✅ هدفها: زر الترس يفتح إعدادات سريعة / زر + يفتح قائمة "إنشاء" (بدون كسر أي شيء)
  // ملاحظة: نستخدم selectors متعددة حتى تشتغل مع أي HTML عندك

  const headerSettingsBtn =
    document.getElementById("themeToggleBtn") ||
    document.getElementById("settingsBtn") ||
    document.getElementById("inboxSettingsBtn") ||
    document.querySelector('[data-action="open-settings"]') ||
    document.querySelector(".inbox-header .btn-settings, .inbox-header-actions .btn-settings, .inbox-header-actions .settings-btn, .inbox-header-actions .fa-gear")?.closest("button");

  const headerPlusBtn =
    newChatBtn ||
    document.getElementById("plusBtn") ||
    document.querySelector('[data-action="open-create"]') ||
    document.querySelector(".inbox-header .btn-plus, .inbox-header-actions .btn-plus, .inbox-header-actions .plus-btn, .inbox-header-actions .fa-plus")?.closest("button");

  const headerThemeBtn =
    document.querySelector(".inbox-header-actions .theme-toggle-btn");

  function ensureHeaderMenusStyleOnce() {
    if (document.getElementById("headerMenusStyle")) return;
    const st = document.createElement("style");
    st.id = "headerMenusStyle";
    st.textContent = `
      .inbox-popover{position:fixed;z-index:9999;min-width:230px;max-width:280px;border-radius:18px;
        background:rgba(255,255,255,.72);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.55);
        box-shadow:0 22px 70px rgba(15,23,42,.18);padding:8px;transform-origin:top right}
      body[data-theme="dark"] .inbox-popover{background:rgba(15,23,42,.72);border-color:rgba(255,255,255,.12);box-shadow:0 26px 80px rgba(0,0,0,.40)}
      .inbox-popover .ip-title{font-weight:900;font-size:12px;opacity:.75;padding:6px 10px 8px}
      .inbox-popover .ip-item{display:flex;align-items:center;gap:10px;width:100%;border:0;background:transparent;color:inherit;
        cursor:pointer;border-radius:14px;padding:10px 10px;transition:transform .12s ease, background .12s ease, opacity .12s ease}
      .inbox-popover .ip-item:hover{background:rgba(79,70,229,.10);transform:translateY(-1px)}
      body[data-theme="dark"] .inbox-popover .ip-item:hover{background:rgba(129,140,248,.12)}
      .inbox-popover .ip-item:active{transform:translateY(1px);opacity:.92}
      .inbox-popover .ip-ico{width:30px;height:30px;border-radius:12px;display:grid;place-items:center;
        background:rgba(255,255,255,.55);border:1px solid rgba(0,0,0,.06)}
      body[data-theme="dark"] .inbox-popover .ip-ico{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.10)}
      .inbox-popover .ip-meta{display:flex;flex-direction:column;gap:2px;text-align:right;flex:1}
      .inbox-popover .ip-meta b{font-size:13px}
      .inbox-popover .ip-meta span{font-size:11px;opacity:.75}
      .inbox-popover .ip-sep{height:1px;background:rgba(0,0,0,.06);margin:6px 6px}
      body[data-theme="dark"] .inbox-popover .ip-sep{background:rgba(255,255,255,.10)}
      .inbox-popover .ip-badge{margin-inline-start:auto;font-size:11px;font-weight:900;opacity:.85}
    `;
    document.head.appendChild(st);
  }

  function closeAnyPopover() {
    document.querySelectorAll(".inbox-popover[data-open='1']").forEach((p) => {
      p.dataset.open = "0";
      p.remove();
    });
  }

  function placePopoverNear(el, pop) {
    const r = el.getBoundingClientRect();
    const gap = 10;
    // RTL: نحاول نخليه تحت الزر باتجاه اليمين
    let top = r.bottom + gap;
    let left = r.right - pop.offsetWidth;
    // لو خارج الشاشة
    if (left < 8) left = 8;
    if (left + pop.offsetWidth > window.innerWidth - 8) left = window.innerWidth - pop.offsetWidth - 8;
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = r.top - pop.offsetHeight - gap;
      if (top < 8) top = 8;
    }
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  }

  
  // ================== Space Wizard (Telegram-like) ==================
  // يعتمد على وجود <div id="spaceWizardOverlay"></div> داخل inbox.html
  function ensureSpaceWizardStylesOnce() {
    if (document.getElementById("spaceWizardStyles")) return;
    const st = document.createElement("style");
    st.id = "spaceWizardStyles";
    st.textContent = `
      .space-wizard-overlay{position:fixed;inset:0;z-index:999999;display:none;place-items:center;background:rgba(10,12,20,.35);backdrop-filter:blur(10px)}
      .space-wizard-overlay.show{display:grid}
      .swiz{width:min(720px,94vw);max-height:min(86vh,820px);overflow:hidden;border-radius:22px;background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.55);box-shadow:0 30px 90px rgba(15,23,42,.25);display:flex;flex-direction:column}
      body[data-theme="dark"] .swiz{background:rgba(15,23,42,.80);border-color:rgba(255,255,255,.12);box-shadow:0 35px 100px rgba(0,0,0,.45)}
      .swiz-top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(0,0,0,.06)}
      body[data-theme="dark"] .swiz-top{border-bottom-color:rgba(255,255,255,.10)}
      .swiz-title{display:flex;flex-direction:column;gap:2px}
      .swiz-title b{font-size:14px}
      .swiz-title span{font-size:12px;opacity:.75}
      .swiz-x{width:40px;height:40px;border-radius:14px;border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.55);cursor:pointer}
      body[data-theme="dark"] .swiz-x{border-color:rgba(255,255,255,.10);background:rgba(255,255,255,.08);color:inherit}
      .swiz-body{padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px}
      .swiz-steps{display:flex;gap:8px;flex-wrap:wrap}
      .swiz-pill{padding:8px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.55);font-size:12px;opacity:.8}
      body[data-theme="dark"] .swiz-pill{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.08)}
      .swiz-pill.active{opacity:1;background:rgba(79,70,229,.16);border-color:rgba(79,70,229,.22)}
      .swiz-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      @media(max-width:680px){.swiz-grid{grid-template-columns:1fr}}
      .swiz-field{display:flex;flex-direction:column;gap:6px}
      .swiz-field label{font-size:12px;opacity:.75}
      .swiz-input, .swiz-textarea{width:100%;border-radius:16px;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.65);padding:10px 12px;outline:none}
      body[data-theme="dark"] .swiz-input, body[data-theme="dark"] .swiz-textarea{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:inherit}
      .swiz-textarea{min-height:90px;resize:vertical}
      .swiz-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
      .swiz-avatarPick{display:flex;gap:12px;align-items:center}
      .swiz-avatar{width:58px;height:58px;border-radius:18px;overflow:hidden;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.55);display:grid;place-items:center}
      body[data-theme="dark"] .swiz-avatar{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.08)}
      .swiz-avatar img{width:100%;height:100%;object-fit:cover}
      .swiz-btn{border:0;cursor:pointer;border-radius:16px;padding:10px 14px;font-weight:800}
      .swiz-btn.primary{background:rgba(79,70,229,.95);color:#fff}
      .swiz-btn.primary:disabled{opacity:.45;cursor:not-allowed}
      .swiz-btn.ghost{background:transparent;border:1px solid rgba(0,0,0,.10)}
      body[data-theme="dark"] .swiz-btn.ghost{border-color:rgba(255,255,255,.12);color:inherit}
      .swiz-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:14px 16px;border-top:1px solid rgba(0,0,0,.06)}
      body[data-theme="dark"] .swiz-foot{border-top-color:rgba(255,255,255,.10)}
      .swiz-hint{font-size:12px;opacity:.75}
      .swiz-results{max-height:320px;overflow:auto;border-radius:18px;border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.55)}
      body[data-theme="dark"] .swiz-results{border-color:rgba(255,255,255,.10);background:rgba(255,255,255,.06)}
      .swiz-item{display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer}
      .swiz-item:hover{background:rgba(79,70,229,.10)}
      body[data-theme="dark"] .swiz-item:hover{background:rgba(129,140,248,.12)}
      .swiz-item img{width:36px;height:36px;border-radius:999px;object-fit:cover}
      .swiz-item .m{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
      .swiz-item .m b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .swiz-item .m span{font-size:12px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .swiz-item .chk{width:22px;height:22px;border-radius:8px;border:1px solid rgba(0,0,0,.10);display:grid;place-items:center}
      body[data-theme="dark"] .swiz-item .chk{border-color:rgba(255,255,255,.16)}
      .swiz-item.selected .chk{background:rgba(79,70,229,.22);border-color:rgba(79,70,229,.25)}
      .swiz-chips{display:flex;flex-wrap:wrap;gap:8px}
      .swiz-chip{display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:999px;border:1px solid rgba(0,0,0,.06);background:rgba(255,255,255,.55)}
      body[data-theme="dark"] .swiz-chip{border-color:rgba(255,255,255,.10);background:rgba(255,255,255,.08)}
      .swiz-chip img{width:22px;height:22px;border-radius:999px;object-fit:cover}
      .swiz-chip button{border:0;background:transparent;cursor:pointer;opacity:.8}
      .swiz-radio{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .swiz-radio label{display:flex;gap:8px;align-items:center;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.55);padding:10px 12px;border-radius:16px;cursor:pointer;font-size:12px}
      body[data-theme="dark"] .swiz-radio label{border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.08)}
    `;
    document.head.appendChild(st);
  }

  function getSpaceWizardOverlay() {
    ensureSpaceWizardStylesOnce();
    const el = document.getElementById("spaceWizardOverlay");
    if (!el) {
      console.warn("[Wizard] spaceWizardOverlay missing in inbox.html");
      return null;
    }
    return el;
  }

  async function uploadSpaceAvatar(file) {
    if (!file) return "";
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiRequest("/upload", { method: "POST", body: fd });
    return String(res?.url || "");
  }

  async function searchUsersWizard(q) {
    const query = String(q || "").trim();
    if (!query) return [];
    try {
      const res = await apiRequest(`/users/search?q=${encodeURIComponent(query)}`, { method: "GET" });
      const list = res?.users || [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function normalizeWizardUser(u) {
    const id = String(u?._id || u?.id || "");
    const username = u?.username || u?.name || u?.fullName || "User";
    const sub = u?.fullName || u?.email || "";
    const avatar = buildAvatarUrl(u?.avatar || u?.profilePic || u?.photo || "");
    return { id, username: String(username), sub: String(sub), avatar };
  }

  function openSpaceWizard(kind /* group|channel */) {
    const overlay = getSpaceWizardOverlay();
    if (!overlay) return;

    const type = kind === "channel" ? "channel" : "group";
    const steps = [
      { key: "members", label: "الأعضاء" },       // للجروب أساسي، للقناة اختياري
      { key: "info", label: "المعلومات" },        // اسم/نبذة/صورة
      { key: "privacy", label: "الخصوصية" },      // عام/خاص + username
      { key: "admins", label: "الإدارة" },        // مشرفين + صلاحيات
    ];

    const state = {
      step: 0,
      type,
      title: "",
      about: "",
      avatarFile: null,
      avatarPreview: "",
      visibility: "private",
      username: "",
      selectedMembers: new Map(), // id -> user
      selectedAdmins: new Map(),  // id -> user (subset)
      permissions: {
        canSend: type === "channel" ? "admins" : "all",
        canAddMembers: "admins",
        canEditInfo: "admins",
      },
    };

    // reset DOM
    overlay.innerHTML = "";
    overlay.classList.add("show");
    overlay.setAttribute("aria-hidden", "false");

    const root = document.createElement("div");
    root.className = "swiz";
    overlay.appendChild(root);

    const top = document.createElement("div");
    top.className = "swiz-top";
    top.innerHTML = `
      <div class="swiz-title">
        <b>${type === "channel" ? "إنشاء قناة" : "إنشاء مجموعة"}</b>
        <span>مثل تيليغرام: اسم + نبذة + صورة + خصوصية + مشرفين</span>
      </div>
      <button class="swiz-x" type="button" aria-label="close">✕</button>
    `;
    root.appendChild(top);

    const body = document.createElement("div");
    body.className = "swiz-body";
    root.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "swiz-foot";
    root.appendChild(foot);

    const close = () => {
      overlay.classList.remove("show");
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = "";
    };

    top.querySelector(".swiz-x")?.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); }, { once: false });

    const renderSteps = () => {
      const s = document.createElement("div");
      s.className = "swiz-steps";
      s.innerHTML = steps.map((x, i) => `
        <div class="swiz-pill ${i === state.step ? "active" : ""}">${i+1}. ${x.label}</div>
      `).join("");
      return s;
    };

    const setStep = (idx) => {
      state.step = Math.max(0, Math.min(steps.length - 1, idx));
      render();
    };

    const footerButtons = () => {
      const isLast = state.step === steps.length - 1;
      const isFirst = state.step === 0;

      const hint = document.createElement("div");
      hint.className = "swiz-hint";

      const nextBtn = document.createElement("button");
      nextBtn.className = "swiz-btn primary";
      nextBtn.type = "button";
      nextBtn.textContent = isLast ? "إنشاء" : "التالي";

      const backBtn = document.createElement("button");
      backBtn.className = "swiz-btn ghost";
      backBtn.type = "button";
      backBtn.textContent = "رجوع";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "swiz-btn ghost";
      cancelBtn.type = "button";
      cancelBtn.textContent = "إلغاء";

      cancelBtn.addEventListener("click", close);
      backBtn.addEventListener("click", () => setStep(state.step - 1));

      // validation
      const titleOk = String(state.title || "").trim().length >= 2;
      const membersOk = (state.type === "group") ? state.selectedMembers.size >= 1 : true; // channel optional
      const usernameOk = (state.visibility === "public") ? (String(state.username||"").trim().length >= 3) : true;

      const canCreate = titleOk && membersOk && usernameOk;

      if (isLast) nextBtn.disabled = !canCreate;
      hint.textContent = !titleOk
        ? "اكتب اسم (على الأقل حرفين)"
        : (!membersOk ? "اختر عضو واحد على الأقل للمجموعة" : (!usernameOk ? "اختر username (٣ أحرف+) للعام" : "جاهز ✅"));

      nextBtn.addEventListener("click", async () => {
        if (!isLast) return setStep(state.step + 1);

        // CREATE
        nextBtn.disabled = true;
        nextBtn.textContent = "جاري الإنشاء…";
        try {
          let avatarUrl = "";
          if (state.avatarFile) {
            avatarUrl = await uploadSpaceAvatar(state.avatarFile);
          }

          const memberIds = Array.from(state.selectedMembers.keys());
          const adminIds = Array.from(state.selectedAdmins.keys());

          const payload = {
            type: state.type,
            title: String(state.title || "").trim(),
            about: String(state.about || "").trim(),
            avatar: avatarUrl,
            visibility: state.visibility,
            username: state.visibility === "public" ? String(state.username || "").trim().toLowerCase() : "",
            memberIds,
            adminIds,
            permissions: state.permissions,
          };

          const res = await apiRequest("/chat/spaces", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          showToast(state.type === "channel" ? "تم إنشاء القناة ✅" : "تم إنشاء المجموعة ✅", "success");

          // تحديث القائمة وفتحها إن أمكن
          try { loadConversations?.(); } catch {}
          const convId = res?.conversation?._id || res?.conversationId || res?._id || res?.id;
          if (convId) {
            try { setSidebarFilter?.(state.type === "channel" ? "channels" : "groups"); } catch {}
            // افتح الرسائل (تحميل لاحقاً عند ظهور العنصر)
            setTimeout(() => {
              const btn = document.querySelector(`.conversation-item[data-conversation-id="${convId}"], .conversation-item[data-conversationid="${convId}"]`);
              if (btn) btn.click();
            }, 600);
          }

          close();
        } catch (e) {
          console.error("[Wizard] create error:", e);
          showToast(e?.message || "فشل إنشاء المجموعة/القناة", "error");
          nextBtn.disabled = false;
          nextBtn.textContent = "إنشاء";
        }
      });

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "10px";
      right.appendChild(cancelBtn);
      if (!isFirst) right.appendChild(backBtn);
      right.appendChild(nextBtn);

      foot.innerHTML = "";
      foot.appendChild(hint);
      foot.appendChild(right);
    };

    const renderMembersStep = () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="swiz-field">
          <label>${state.type === "channel" ? "أضف أعضاء (اختياري)" : "اختر أعضاء (مطلوب للمجموعة)"}</label>
          <input class="swiz-input" id="swizSearch" placeholder="ابحث عن شخص…" />
        </div>
        <div class="swiz-field">
          <label>المحددون</label>
          <div class="swiz-chips" id="swizChips"></div>
        </div>
        <div class="swiz-results" id="swizResults"></div>
      `;

      const searchEl = wrap.querySelector("#swizSearch");
      const chipsEl = wrap.querySelector("#swizChips");
      const resultsEl = wrap.querySelector("#swizResults");

      const renderChips = () => {
        chipsEl.innerHTML = "";
        for (const u of state.selectedMembers.values()) {
          const chip = document.createElement("div");
          chip.className = "swiz-chip";
          chip.innerHTML = `
            <img src="${u.avatar}" onerror="this.style.display='none'" />
            <span>${escapeHtml(u.username)}</span>
            <button type="button" aria-label="remove">✕</button>
          `;
          chip.querySelector("button")?.addEventListener("click", () => {
            state.selectedMembers.delete(u.id);
            state.selectedAdmins.delete(u.id);
            renderChips();
            renderResults(lastList);
            footerButtons();
          });
          chipsEl.appendChild(chip);
        }
      };

      let timer = null;
      let lastList = [];

      const renderResults = (list) => {
        lastList = list;
        resultsEl.innerHTML = "";
        if (!list.length) {
          resultsEl.innerHTML = `<div class="swiz-item" style="opacity:.7;cursor:default">لا توجد نتائج</div>`;
          return;
        }
        list.forEach((u) => {
          const row = document.createElement("div");
          const selected = state.selectedMembers.has(u.id);
          row.className = "swiz-item" + (selected ? " selected" : "");
          row.innerHTML = `
            <img src="${u.avatar}" onerror="this.style.display='none'" />
            <div class="m">
              <b>${escapeHtml(u.username)}</b>
              <span>${escapeHtml(u.sub || "")}</span>
            </div>
            <div class="chk">${selected ? "✓" : ""}</div>
          `;
          row.addEventListener("click", () => {
            if (state.selectedMembers.has(u.id)) {
              state.selectedMembers.delete(u.id);
              state.selectedAdmins.delete(u.id);
            } else {
              state.selectedMembers.set(u.id, u);
            }
            renderChips();
            renderResults(lastList);
            footerButtons();
          });
          resultsEl.appendChild(row);
        });
      };

      async function doSearch() {
        const q = String(searchEl.value || "").trim();
        if (!q) {
          resultsEl.innerHTML = `<div class="swiz-item" style="opacity:.7;cursor:default">اكتب للبحث عن الأشخاص</div>`;
          return;
        }
        resultsEl.innerHTML = `<div class="swiz-item" style="opacity:.7;cursor:default">جاري البحث…</div>`;
        const raw = await searchUsersWizard(q);
        const list = raw.map(normalizeWizardUser).filter((x) => x.id && x.id !== String(currentUserId || ""));
        renderResults(list);
      }

      searchEl.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(doSearch, 220);
      });

      // init
      resultsEl.innerHTML = `<div class="swiz-item" style="opacity:.7;cursor:default">اكتب للبحث عن الأشخاص</div>`;
      renderChips();
      setTimeout(() => searchEl.focus(), 80);

      return wrap;
    };

    const renderInfoStep = () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="swiz-grid">
          <div class="swiz-field">
            <label>${state.type === "channel" ? "اسم القناة" : "اسم المجموعة"}</label>
            <input class="swiz-input" id="swizTitle" placeholder="مثال: فريق Saepel" value="${escapeHtml(state.title)}" />
          </div>
          <div class="swiz-field">
            <label>الصورة</label>
            <div class="swiz-avatarPick">
              <div class="swiz-avatar" id="swizAvatarBox">
                ${state.avatarPreview ? `<img src="${state.avatarPreview}" />` : `<span style="opacity:.6">+</span>`}
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <input type="file" id="swizAvatar" accept="image/*" />
                <small style="opacity:.7">اختياري</small>
              </div>
            </div>
          </div>
        </div>
        <div class="swiz-field">
          <label>نبذة</label>
          <textarea class="swiz-textarea" id="swizAbout" placeholder="اكتب نبذة قصيرة…">${escapeHtml(state.about)}</textarea>
        </div>
      `;

      const titleEl = wrap.querySelector("#swizTitle");
      const aboutEl = wrap.querySelector("#swizAbout");
      const avatarEl = wrap.querySelector("#swizAvatar");
      const avatarBox = wrap.querySelector("#swizAvatarBox");

      titleEl.addEventListener("input", () => {
        state.title = titleEl.value;
        footerButtons();
      });
      aboutEl.addEventListener("input", () => {
        state.about = aboutEl.value;
      });
      avatarEl.addEventListener("change", () => {
        const f = avatarEl.files && avatarEl.files[0] ? avatarEl.files[0] : null;
        state.avatarFile = f;
        if (f) {
          const url = URL.createObjectURL(f);
          state.avatarPreview = url;
          avatarBox.innerHTML = `<img src="${url}" />`;
        }
      });

      setTimeout(() => titleEl.focus(), 80);
      return wrap;
    };

    const renderPrivacyStep = () => {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="swiz-field">
          <label>النوع</label>
          <div class="swiz-radio">
            <label><input type="radio" name="swizVis" value="private" ${state.visibility === "private" ? "checked" : ""}/> خاصة (رابط دعوة)</label>
            <label><input type="radio" name="swizVis" value="public" ${state.visibility === "public" ? "checked" : ""}/> عامة (username)</label>
          </div>
        </div>
        <div class="swiz-field" id="swizUsernameWrap" style="${state.visibility === "public" ? "" : "display:none"}">
          <label>Username</label>
          <input class="swiz-input" id="swizUsername" placeholder="مثال: saepel_team" value="${escapeHtml(state.username)}" />
          <small style="opacity:.7">سيظهر رابط مثل: saepel/${state.type}/username</small>
        </div>
      `;

      const radios = Array.from(wrap.querySelectorAll('input[name="swizVis"]'));
      const userWrap = wrap.querySelector("#swizUsernameWrap");
      const userEl = wrap.querySelector("#swizUsername");

      radios.forEach((r) => {
        r.addEventListener("change", () => {
          state.visibility = r.value === "public" ? "public" : "private";
          userWrap.style.display = state.visibility === "public" ? "" : "none";
          footerButtons();
        });
      });
      if (userEl) {
        userEl.addEventListener("input", () => {
          state.username = userEl.value;
          footerButtons();
        });
      }

      return wrap;
    };

    const renderAdminsStep = () => {
      const wrap = document.createElement("div");

      const members = Array.from(state.selectedMembers.values());
      const hasMembers = members.length > 0;

      // ensure admins subset: default owner only (owner handled server side)
      if (!state.selectedAdmins.size && hasMembers) {
        // default: first member as admin suggestion (optional)
      }

      wrap.innerHTML = `
        <div class="swiz-field">
          <label>المشرفون (Admins)</label>
          <div class="swiz-hint">المشرفين لازم يكونوا من الأعضاء. (المالك أنت)</div>
        </div>
        <div class="swiz-results" id="swizAdminsList"></div>

        <div class="swiz-field">
          <label>الصلاحيات</label>
          <div class="swiz-grid">
            <div class="swiz-field">
              <label>من يرسل؟</label>
              <select class="swiz-input" id="permSend">
                <option value="all">الكل</option>
                <option value="admins">المشرفين فقط</option>
              </select>
            </div>
            <div class="swiz-field">
              <label>من يضيف أعضاء؟</label>
              <select class="swiz-input" id="permAdd">
                <option value="admins">المشرفين</option>
                <option value="all">الكل</option>
              </select>
            </div>
          </div>
        </div>
      `;

      const listEl = wrap.querySelector("#swizAdminsList");
      const permSend = wrap.querySelector("#permSend");
      const permAdd = wrap.querySelector("#permAdd");

      // defaults based on type
      permSend.value = state.permissions.canSend || (state.type === "channel" ? "admins" : "all");
      permAdd.value = state.permissions.canAddMembers || "admins";

      permSend.addEventListener("change", () => {
        state.permissions.canSend = permSend.value;
        footerButtons();
      });
      permAdd.addEventListener("change", () => {
        state.permissions.canAddMembers = permAdd.value;
        footerButtons();
      });

      listEl.innerHTML = "";
      if (!hasMembers) {
        listEl.innerHTML = `<div class="swiz-item" style="opacity:.7;cursor:default">لا يوجد أعضاء محددين (يمكنك الرجوع لاختيار الأعضاء)</div>`;
        return wrap;
      }

      members.forEach((u) => {
        const row = document.createElement("div");
        const isAdmin = state.selectedAdmins.has(u.id);
        row.className = "swiz-item" + (isAdmin ? " selected" : "");
        row.innerHTML = `
          <img src="${u.avatar}" onerror="this.style.display='none'" />
          <div class="m">
            <b>${escapeHtml(u.username)}</b>
            <span>${escapeHtml(u.sub || "")}</span>
          </div>
          <div class="chk">${isAdmin ? "✓" : ""}</div>
        `;
        row.addEventListener("click", () => {
          if (state.selectedAdmins.has(u.id)) state.selectedAdmins.delete(u.id);
          else state.selectedAdmins.set(u.id, u);
          render();
        });
        listEl.appendChild(row);
      });

      return wrap;
    };

    function render() {
      body.innerHTML = "";
      body.appendChild(renderSteps());

      if (state.step === 0) body.appendChild(renderMembersStep());
      if (state.step === 1) body.appendChild(renderInfoStep());
      if (state.step === 2) body.appendChild(renderPrivacyStep());
      if (state.step === 3) body.appendChild(renderAdminsStep());

      footerButtons();
    }

    // ESC close
    const onEsc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onEsc, true);
    const cleanup = () => document.removeEventListener("keydown", onEsc, true);

    // cleanup on close by monkeypatch
    const oldClose = close;
    const closeWrapped = () => { cleanup(); oldClose(); };
    // replace close used in handlers
    // (simple: rebind x and cancel)
    top.querySelector(".swiz-x")?.removeEventListener("click", oldClose);
    top.querySelector(".swiz-x")?.addEventListener("click", closeWrapped);

    render();
  }


  function openCreateMenu(anchor) {
    if (!anchor) return;
    ensureHeaderMenusStyleOnce();
    closeAnyPopover();

    const pop = document.createElement("div");
    pop.className = "inbox-popover";
    pop.dataset.open = "1";
    pop.innerHTML = `
      <div class="ip-title">إنشاء</div>

      <button class="ip-item" type="button" data-act="new-chat">
        <span class="ip-ico"><i class="fa-regular fa-message"></i></span>
        <span class="ip-meta"><b>محادثة جديدة</b><span>ابدأ مع شخص</span></span>
      </button>

      <button class="ip-item" type="button" data-act="new-group">
        <span class="ip-ico"><i class="fa-solid fa-user-group"></i></span>
        <span class="ip-meta"><b>مجموعة</b><span>قريباً (واجهة فقط)</span></span>
      </button>

      <button class="ip-item" type="button" data-act="new-channel">
        <span class="ip-ico"><i class="fa-solid fa-bullhorn"></i></span>
        <span class="ip-meta"><b>قناة</b><span>قريباً (واجهة فقط)</span></span>
      </button>

      <div class="ip-sep"></div>

      <button class="ip-item" type="button" data-act="go-calls">
        <span class="ip-ico"><i class="fa-solid fa-phone"></i></span>
        <span class="ip-meta"><b>سجل المكالمات</b><span>عرض تبويب المكالمات</span></span>
      </button>
    `;
    document.body.appendChild(pop);

    // لازم بعد الإضافة حتى يقرأ offsetWidth/Height
    placePopoverNear(anchor, pop);

    pop.addEventListener("click", (e) => {
      const btn = e.target.closest(".ip-item");
      if (!btn) return;
      const act = btn.dataset.act;

      closeAnyPopover();

      if (act === "new-chat") {
        // أفضل سلوك آمن: تركيز على البحث
        try {
          searchInput?.focus();
          showToast("ابحث عن شخص وابدأ محادثة ✨", "info");
        } catch {}
        return;
      }

      if (act === "go-calls") {
        try { setSidebarFilter?.("calls"); } catch {}
        try { syncTabsActiveState?.(); } catch {}
        try { window.__inbox?.applySidebarFilter?.(); } catch {}
        showToast("تم فتح تبويب المكالمات", "success");
        return;
      }

      if (act === "new-group") { try { openSpaceWizard("group"); } catch {} return; }
      if (act === "new-channel") { try { openSpaceWizard("channel"); } catch {} return; }
    });

    // إغلاق عند النقر خارج القائمة
    setTimeout(() => {
      const onDoc = (e) => {
        if (pop.contains(e.target) || anchor.contains(e.target)) return;
        closeAnyPopover();
        document.removeEventListener("click", onDoc, true);
      };
      document.addEventListener("click", onDoc, true);
    }, 0);

    // ESC
    const onEsc = (e) => {
      if (e.key === "Escape") {
        closeAnyPopover();
        document.removeEventListener("keydown", onEsc, true);
      }
    };
    document.addEventListener("keydown", onEsc, true);
  }

  function openSettingsMenu(anchor) {
    if (!anchor) return;
    ensureHeaderMenusStyleOnce();
    closeAnyPopover();

    const pop = document.createElement("div");
    pop.className = "inbox-popover";
    pop.dataset.open = "1";
    pop.innerHTML = `
      <div class="ip-title">الإعدادات السريعة</div>

      <button class="ip-item" type="button" data-act="toggle-theme">
        <span class="ip-ico"><i class="fa-solid fa-circle-half-stroke"></i></span>
        <span class="ip-meta"><b>الثيم</b><span>تبديل فاتح/داكن</span></span>
        <span class="ip-badge">${(document.body.dataset.theme || "light") === "dark" ? "داكن" : "فاتح"}</span>
      </button>

      <button class="ip-item" type="button" data-act="clear-cache">
        <span class="ip-ico"><i class="fa-regular fa-trash-can"></i></span>
        <span class="ip-meta"><b>تنظيف واجهة</b><span>إعادة تعيين فلاتر القائمة</span></span>
      </button>

      <div class="ip-sep"></div>

      <button class="ip-item" type="button" data-act="help">
        <span class="ip-ico"><i class="fa-regular fa-circle-question"></i></span>
        <span class="ip-meta"><b>مساعدة</b><span>اختصارات وسلوك الأزرار</span></span>
      </button>
    `;
    document.body.appendChild(pop);
    placePopoverNear(anchor, pop);

    pop.addEventListener("click", (e) => {
      const btn = e.target.closest(".ip-item");
      if (!btn) return;
      const act = btn.dataset.act;

      if (act === "toggle-theme") {
        try { toggleTheme?.(); } catch {}
        // حدّث البادج مباشرة
        const badge = btn.querySelector(".ip-badge");
        if (badge) badge.textContent = (document.body.dataset.theme === "dark") ? "داكن" : "فاتح";
        return;
      }

      if (act === "clear-cache") {
        try { localStorage.removeItem("saepel_inbox_filter"); } catch {}
        try { setSidebarFilter?.("chats"); } catch {}
        try { syncTabsActiveState?.(); } catch {}
        try { window.__inbox?.applySidebarFilter?.(); } catch {}
        showToast("تمت إعادة التعيين", "success");
        closeAnyPopover();
        return;
      }

      if (act === "help") {
        showToast("زر + = إنشاء / زر الترس = إعدادات سريعة", "info");
        closeAnyPopover();
        return;
      }
    });

    setTimeout(() => {
      const onDoc = (e) => {
        if (pop.contains(e.target) || anchor.contains(e.target)) return;
        closeAnyPopover();
        document.removeEventListener("click", onDoc, true);
      };
      document.addEventListener("click", onDoc, true);
    }, 0);

    const onEsc = (e) => {
      if (e.key === "Escape") {
        closeAnyPopover();
        document.removeEventListener("keydown", onEsc, true);
      }
    };
    document.addEventListener("keydown", onEsc, true);
  }

  // Bind once
  if (!document.body.__headerBtnsBound) {
    document.body.__headerBtnsBound = true;

    headerPlusBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCreateMenu(headerPlusBtn);
    });

    headerSettingsBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSettingsMenu(headerSettingsBtn);
    });
    // ملاحظة: زر الثيم في الهيدر (إن وُجد كزر منفصل) يظل شغال من تبويب الثيم داخل الشريط الجانبي.
  }

// ===================== Phase 5: Sidebar Tabs + Theme Toggle (UI only) =====================
  function applyThemeFromStorage() {
    try {
      const t = (localStorage.getItem("saepel_inbox_theme") || "light").toLowerCase();
      sidebarTheme = (t === "dark") ? "dark" : "light";
      document.body.dataset.theme = sidebarTheme;
    } catch {}
  }

  function ensureSidebarPhase5UI() {
    if (!conversationListEl) return;

    // Find a suitable host in sidebar (prefer the sidebar element)
    const sidebar = document.querySelector(".inbox-sidebar") || conversationListEl.parentElement;
    if (!sidebar) return;

    // Don't duplicate
    if (sidebar.querySelector(".inbox-tabs")) {
      sidebarTabsEl = sidebar.querySelector(".inbox-tabs");
    } else {
      const tabs = document.createElement("div");
      tabs.className = "inbox-tabs";
      tabs.innerHTML = `
        <button type="button" class="inbox-tab" data-tab="chats"><span class="tab-label">الدردشات</span><span class="tab-count hidden">0</span></button>
        <button type="button" class="inbox-tab" data-tab="groups"><span class="tab-label">المجموعات</span><span class="tab-count hidden">0</span></button>
        <button type="button" class="inbox-tab" data-tab="channels"><span class="tab-label">القنوات</span><span class="tab-count hidden">0</span></button>
        <button type="button" class="inbox-tab" data-tab="calls"><span class="tab-label">المكالمات</span><span class="tab-count hidden">0</span></button>
        <button type="button" class="inbox-theme-btn" data-action="toggle-theme" aria-label="toggle theme" title="Light/Dark">
          <i class="fa-solid fa-circle-half-stroke"></i>
        </button>
      `;

      // Insert tabs above the conversation list (but after search if present)
      const searchWrap = sidebar.querySelector(".inbox-search") || searchInput?.closest(".inbox-search");
      if (searchWrap && searchWrap.parentElement === sidebar) {
        // put after search
        searchWrap.insertAdjacentElement("afterend", tabs);
      } else {
        sidebar.insertBefore(tabs, conversationListEl);
      }
      sidebarTabsEl = tabs;
    }

    sidebarThemeBtn = sidebarTabsEl?.querySelector('.inbox-theme-btn[data-action="toggle-theme"]') || null;

    // Empty state node (one)
    if (!sidebar.querySelector(".inbox-empty-state")) {
      const empty = document.createElement("div");
      empty.className = "inbox-empty-state";
      empty.style.display = "none";
      empty.innerHTML = `
        <div class="ies-ico"><i class="fa-regular fa-comments"></i></div>
        <div class="ies-title">لا يوجد محتوى</div>
        <div class="ies-sub">جرّب تبويب آخر أو ابحث عن شخص.</div>
      `;
      // Place after conversation list
      conversationListEl.insertAdjacentElement("afterend", empty);
      sidebarEmptyEl = empty;
    } else {
      sidebarEmptyEl = sidebar.querySelector(".inbox-empty-state");
    }


// ✅ Localize Tabs + ensure counters (works for both .inbox-tab and .tab-btn)
try {
  const labels = { chats: "الدردشات", groups: "المجموعات", channels: "القنوات", calls: "المكالمات" };
  const btns = Array.from(sidebarTabsEl.querySelectorAll(".inbox-tab, .tab-btn"));
  btns.forEach((b) => {
    const tab = String(b.dataset.tab || "").toLowerCase();
    const label = labels[tab] || b.textContent || "";
    // build inner only once (avoid breaking icons/theme btn)
    if (b.classList.contains("inbox-theme-btn")) return;
    const hasCount = !!b.querySelector(".tab-count");
    const hasLabelSpan = !!b.querySelector(".tab-label");
    if (!hasLabelSpan || !hasCount) {
      b.innerHTML = `<span class="tab-label">${label}</span><span class="tab-count hidden">0</span>`;
    } else {
      b.querySelector(".tab-label").textContent = label;
    }
    // keep a11y
    b.setAttribute("aria-label", label);
  });
} catch {}

    // Activate current tab
    syncTabsActiveState();

    // Bind tab clicks once
    if (!sidebarTabsEl.__bound) {
      sidebarTabsEl.__bound = true;

      sidebarTabsEl.addEventListener("click", (e) => {
        const tabBtn = e.target.closest(".inbox-tab, .tab-btn");
        const themeBtn = e.target.closest('.inbox-theme-btn[data-action="toggle-theme"]');

        if (tabBtn) {
          const tab = tabBtn.dataset.tab || "chats";
          setSidebarFilter(tab);
          return;
        }

        if (themeBtn) {
          toggleTheme();
          return;
        }
      });
    }

    // Bind search (safe)
    if (searchInput && !searchInput.__boundPhase5) {
      searchInput.__boundPhase5 = true;
      searchInput.addEventListener("input", () => {
        applySidebarFilter();
      });
    }

    // Theme button click handled above; still apply initial
    applyThemeFromStorage();
    updateThemeBtnUI();
  }

  function mapTabToType(tab) {
    const t = String(tab || "").toLowerCase();
    // دعم المفرد + الجمع حتى ما تتعطل التبويبات لو تغيرت قيم data-tab بالـ HTML
    if (t === "group" || t === "groups") return "group";
    if (t === "channel" || t === "channels") return "channel";
    if (t === "call" || t === "calls") return "call";
    if (t === "chat" || t === "chats") return "chat";
    // fallback
    return "chat";
  }


  function setSidebarFilter(tab) {
  sidebarFilter = String(tab || "chats").toLowerCase();
  localStorage.setItem("saepel_inbox_filter", sidebarFilter);
  syncTabsActiveState();

  // 🔄 Notify Calls Tab module (and any other listeners)
  try {
    window.dispatchEvent(new CustomEvent("saepel:sidebar:tab", { detail: sidebarFilter }));
  } catch {}

  // ✅ Calls tab uses a separate panel (CallLog) instead of conversations list
  if (sidebarFilter === "calls") {
    try {
      const list = document.getElementById("conversationList") || conversationListEl;
      const panel = document.getElementById("callsPanel");
      if (list) list.classList.add("hidden");
      if (panel) panel.classList.remove("hidden");
    } catch {}
    // Calls module will load logs on event; no need to filter conversations
    updateEmptyState(1);
    return;
  } else {
    try {
      const list = document.getElementById("conversationList") || conversationListEl;
      const panel = document.getElementById("callsPanel");
      if (panel) panel.classList.add("hidden");
      if (list) list.classList.remove("hidden");
    } catch {}
  }

  applySidebarFilter();
}

  function syncTabsActiveState() {
    if (!sidebarTabsEl) return;
    const wantType = mapTabToType(sidebarFilter);
    sidebarTabsEl.querySelectorAll(".inbox-tab, .tab-btn").forEach((b) => {
      const bTab = String(b.dataset.tab || "").toLowerCase();
      const isOn = (bTab === String(sidebarFilter || "").toLowerCase()) || (mapTabToType(bTab) === wantType);
      b.classList.toggle("active", isOn);
      b.setAttribute("aria-pressed", isOn ? "true" : "false");
      b.setAttribute("aria-selected", isOn ? "true" : "false");
    });
  }


  function updateEmptyState(visibleCount) {
    if (!sidebarEmptyEl) return;
    if (visibleCount > 0) {
      sidebarEmptyEl.style.display = "none";
      return;
    }

    const tab = sidebarFilter;
    const icon =
      tab === "groups" ? "fa-user-group" :
      tab === "channels" ? "fa-bullhorn" :
      tab === "calls" ? "fa-phone" :
      "fa-comments";

    const title =
      tab === "groups" ? "لا توجد مجموعات" :
      tab === "channels" ? "لا توجد قنوات" :
      tab === "calls" ? "سجل الاتصالات فارغ" :
      "لا توجد محادثات";

    const sub =
      tab === "calls"
        ? "بعد ما نربط Call Log مع السيرفر رح يبين هون."
        : "ابدأ محادثة جديدة أو جرّب البحث.";

    sidebarEmptyEl.querySelector(".ies-ico i")?.setAttribute("class", `fa-regular ${icon}`);
    sidebarEmptyEl.querySelector(".ies-title") && (sidebarEmptyEl.querySelector(".ies-title").textContent = title);
    sidebarEmptyEl.querySelector(".ies-sub") && (sidebarEmptyEl.querySelector(".ies-sub").textContent = sub);

    sidebarEmptyEl.style.display = "flex";
  }

  function applySidebarFilter() {
    if (!conversationListEl) return;

    // Apply filter to items
    const typeWanted = mapTabToType(sidebarFilter);
    const q = (searchInput?.value || "").trim().toLowerCase();

    let visible = 0;

    const items = Array.from(conversationListEl.querySelectorAll(".conversation-item"));
    items.forEach((el) => {
      const t = String(el.dataset.type || "chat");
      const matchesType = (t === typeWanted);

      const hay = String(el.dataset.search || el.dataset.name || "").toLowerCase();
      const matchesSearch = !q || hay.includes(q);

      const show = matchesType && matchesSearch;
      el.classList.toggle("is-hidden", !show);
      el.style.display = show ? "" : "none";
      if (show) visible++;
    });

    updateEmptyState(visible);
  }

  function updateThemeBtnUI() {
    if (!sidebarThemeBtn) return;
    sidebarThemeBtn.setAttribute("data-theme", sidebarTheme);
    sidebarThemeBtn.title = sidebarTheme === "dark" ? "Dark" : "Light";
  }

  function toggleTheme() {
    sidebarTheme = (document.body.dataset.theme === "dark") ? "light" : "dark";
    document.body.dataset.theme = sidebarTheme;
    localStorage.setItem("saepel_inbox_theme", sidebarTheme);
    updateThemeBtnUI();
  }

  // Ensure UI
  ensureSidebarPhase5UI();
  applySidebarFilter();

  chatBackBtn = document.getElementById("chatBackBtn");

  chatExitBtn =
    document.getElementById("chatExitBtn") ||
    document.querySelector(".chat-actions .chat-exit-btn") ||
    document.querySelector('.chat-actions button[title="العودة للرئيسية"]');

  chatUserNameEl = document.getElementById("chatUserName");
  chatUserStatusEl = document.getElementById("chatUserStatus");
  chatAvatarImg = document.getElementById("chatUserAvatar");
  chatMessagesEl = document.getElementById("chatMessages");

  chatActions =
    document.querySelector(".chat-actions") ||
    document.querySelector(".chat-header .chat-actions");

  // قراءة userId لو جينا من زر "مراسلة" بالبروفايل
  const urlParams = new URLSearchParams(window.location.search);
  const initialUserId = urlParams.get("userId") || null;

  // ===== قائمة الثلاث نقاط في الهيدر =====
  chatMoreBtn =
    document.getElementById("chatMoreBtn") ||
    (chatActions && chatActions.querySelector("button#chatMoreBtn")) ||
    (chatActions &&
      chatActions.querySelector("button .fa-ellipsis-vertical")?.closest("button"));

  chatOptionsMenu =
    document.getElementById("chatOptionsMenu") ||
    (chatActions && chatActions.querySelector(".chat-options-menu"));

  if (chatActions) {
    if (!chatMoreBtn) {
      chatMoreBtn = document.createElement("button");
      chatMoreBtn.type = "button";
      chatMoreBtn.title = "خيارات المحادثة";
      chatMoreBtn.className = "chat-icon-btn";
      chatMoreBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
      chatActions.appendChild(chatMoreBtn);
      console.log("[Inbox] created chatMoreBtn dynamically ✅");
    }

    if (!chatOptionsMenu) {
      chatOptionsMenu = document.createElement("div");
      chatOptionsMenu.className = "chat-options-menu";
      chatOptionsMenu.innerHTML = `
        <button class="chat-options-item" data-action="search-chat" type="button">
          <i class="fa-solid fa-magnifying-glass"></i>
          بحث داخل المحادثة
        </button>
        <button class="chat-options-item" data-action="view-profile" type="button">
          <i class="fa-regular fa-user"></i>
          عرض الملف الشخصي
        </button>
        <button class="chat-options-item" data-action="mute" type="button">
          <i class="fa-regular fa-bell-slash"></i>
          كتم المحادثة
        </button>
        <button class="chat-options-item" data-action="clear-chat" type="button">
          <i class="fa-regular fa-trash-can"></i>
          مسح محتوى المحادثة
        </button>
        <button class="chat-options-item" data-action="block" type="button">
          <i class="fa-regular fa-circle-xmark"></i>
          حظر المستخدم
        </button>
        <button class="chat-options-item" data-action="report" type="button">
          <i class="fa-regular fa-flag"></i>
          الإبلاغ عن المستخدم
        </button>
      `;
      chatActions.appendChild(chatOptionsMenu);
      console.log("[Inbox] created chatOptionsMenu dynamically ✅");
    }
  }

  audioCallBtn =
    document.getElementById("audioCallBtn") ||
    (chatActions && chatActions.querySelector("button i.fa-phone")?.closest("button"));

  videoCallBtn =
    document.getElementById("videoCallBtn") ||
    (chatActions && chatActions.querySelector("button i.fa-video")?.closest("button"));

  // ===== شريط الكتابة الجديد =====
  chatInputBar = document.getElementById("chatInputBar");
  if (chatInputBar) chatInputBar.classList.add("chat-input-bar");;
  chatInput = document.getElementById("chatInput"); // textarea
  chatSendBtn = document.getElementById("chatSendBtn");
  chatMicBtn = document.getElementById("chatMicBtn");

  chatActionsToggle = document.getElementById("chatActionsToggle");
  chatActionsMenu = document.getElementById("chatActionsMenu");

  // ===== Input مخفي لاختيار الملفات =====
  hiddenFileInput = document.createElement("input");
  hiddenFileInput.type = "file";
  hiddenFileInput.multiple = true;
  hiddenFileInput.style.display = "none";
  document.body.appendChild(hiddenFileInput);

  // ⭐ تهيئة السوكيت ⭐
  socket = connectSocket();

  // تفعيل أدوات الرسائل (تحديد/رد/بحث/تثبيت) — خفيفة وسريعة
  ensureMsgToolsUI();
  enableMsgSelectionEvents();


  // ===== فتح واجهة المحادثة =====
  function openConversationUI({ name, status, avatarUrl, userId, conversationId }) {
    if (chatUserNameEl && name) chatUserNameEl.textContent = name;
    if (chatUserStatusEl && status) chatUserStatusEl.textContent = status;
    if (chatAvatarImg) chatAvatarImg.src = avatarUrl || "";

    activeConversationUserId = userId || null;
    if (conversationId) activeConversationId = conversationId;
    // ✅ ensure permissions UI reflects current conversation
    try {
      if (conversationId) {
        const found = conversations.find((c) => String(c._id) === String(conversationId));
        if (found) setActiveConversationMeta(found);
      }
    } catch {}

    if (isMobileView() && inboxPage) {
      inboxPage.classList.add("show-chat");
    }
  }

  
  // ===== (+) Bind actions menu (Image/Video/Camera/File/Music/Location/Contact) =====
  bindPlusMenuActions();
// ===== جلب المحادثات =====
  async function loadConversations() {
    if (!conversationListEl) return;
    conversationListEl.innerHTML =
      '<div class="conversation-empty">جاري تحميل المحادثات...</div>';

    try {
      const data = await apiRequest("/chat/conversations");
      conversations = Array.isArray(data) ? data : [];

      if (!conversations.length) {
        conversationListEl.innerHTML =
          '<div class="conversation-empty">لا توجد محادثات بعد، جرّب مراسلة أحد من صفحته الشخصية.</div>';
        return;
      }

      renderConversationList(conversations);

      // ✅ Phase 5: re-apply filter + empty state
      try { applySidebarFilter(); } catch {}
    } catch (err) {
      console.error("loadConversations error:", err);
      conversationListEl.innerHTML =
        '<div class="conversation-empty">تعذر تحميل المحادثات</div>';
      showToast(err.message || "تعذر تحميل المحادثات من السيرفر", "error");
    }
  }

  // ===== رسم قائمة المحادثات =====
  function renderConversationList(list) {
  if (!conversationListEl) return;
  conversationListEl.innerHTML = "";

  // تجهيز نص المعاينة (بدون ما نكسر أي بنية قديمة)
  function buildLastPreview(conv) {
    const lm = conv?.lastMessage || null;
    if (!lm) return "";

    // Call log preview (لو صار نوعها call أو فيها callType)
    const t = String(lm?.type || lm?.kind || "").toLowerCase();
    const callType = String(lm?.callType || lm?.media || "").toLowerCase();
    if (t === "call" || callType === "audio" || callType === "video") {
      const icon = (callType === "video") ? "📹" : "📞";
      const dir = String(lm?.direction || lm?.dir || "").toLowerCase(); // incoming/outgoing/missed
      if (dir === "missed") return `${icon} مكالمة فائتة`;
      if (dir === "incoming") return `${icon} مكالمة واردة`;
      if (dir === "outgoing") return `${icon} مكالمة صادرة`;
      return `${icon} مكالمة`;
    }

    // نص
    if (lm?.type === "text" && lm?.text) return String(lm.text);

    // مرفقات
    const atts = Array.isArray(lm?.attachments) ? lm.attachments : [];
    if (atts.length) {
      const first = atts[0] || {};
      const ft = String(first?.type || first?.mimetype || "").toLowerCase();
      if (ft.includes("image")) return "🖼️ صورة";
      if (ft.includes("video")) return "🎞️ فيديو";
      if (ft.includes("audio")) return "🎤 رسالة صوتية";
      return "📎 ملف";
    }

    // fallback
    if (lm?.text) return String(lm.text);
    return "محتوى جديد";
  }

  function getUnreadCount(conv) {
    // لو صار عندك عدّاد جاهز من الباك (مستقبلاً)
    const direct =
      Number(conv?.unreadCount ?? conv?.unread ?? conv?.unseenCount ?? 0) || 0;
    if (direct > 0) return direct;

    // fallback: إذا آخر رسالة مش مقروءة بالنسبة إلي (نحسب 1 فقط)
    const lm = conv?.lastMessage || null;
    if (!lm || !currentUserId) return 0;

    const meId = String(currentUserId);
    const senderId = String(lm?.sender?._id || lm?.sender?.id || lm?.sender || "");
    const fromOther = senderId && senderId !== meId;

    if (!fromOther) return 0;

    if (Array.isArray(lm?.seenBy)) {
      const seen = lm.seenBy.some((id) => String(id?._id || id?.id || id) === meId);
      return seen ? 0 : 1;
    }

    // لو ما في seenBy أصلاً
    return 0;
  }

  list.forEach((conv) => {
    // ===== Determine type (chat/group/channel/call) =====
    const convTypeRaw = String(conv?.type || conv?.kind || conv?.chatType || "").toLowerCase();
    const isCall = !!(convTypeRaw === "call" || conv?.isCall);
    const isChannel = !!(conv?.isChannel || conv?.channel || convTypeRaw === "channel");
    const isGroup = !!(conv?.isGroup || conv?.group || convTypeRaw === "group");
    const itemType = isCall ? "call" : (isChannel ? "channel" : (isGroup ? "group" : "chat"));

    // ===== Display name + avatar =====
    const other = getOtherParticipant(conv);
    const otherId = other ? other._id || other.id : null;

    const rawName =
      itemType === "channel"
        ? (conv?.title || conv?.name || conv?.channelName || "قناة")
        : itemType === "group"
        ? (conv?.title || conv?.name || conv?.groupName || "مجموعة")
        : (other && (other.username || other.email)) || "مستخدم Saepel";

    const name = escapeHtml(rawName);

    const avatarSrc =
      (itemType === "channel" || itemType === "group")
        ? (conv?.avatar || conv?.image || conv?.photo || "")
        : (other && other.avatar ? other.avatar : "");

    const avatarUrl = avatarSrc ? buildAvatarUrl(avatarSrc) : "";

    // ✅ online/offline الحقيقي (للدردشة الخاصة فقط)
    const online =
      itemType === "chat" &&
      !!(other?.isOnline || other?.online || other?.status === "online" || other?.presence === "online");

    const lastTextRaw = buildLastPreview(conv);
    const lastText = escapeHtml(lastTextRaw);

    const timeLabel = formatTimeHM(conv.lastMessageAt || conv.updatedAt || conv.createdAt || Date.now());

    const unreadCount = getUnreadCount(conv);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "conversation-item";

    // ✅ Phase 5: tag item type for Tabs filtering (front-only, safe)
    btn.dataset.type = itemType;

    if (conv._id === activeConversationId) btn.classList.add("active");

    btn.dataset.conversationId = conv._id;
    // للدردشة الخاصة: نحتاج userId، للمجموعات/القنوات نتركه فاضي (حالياً)
    btn.dataset.userId = itemType === "chat" ? (otherId || "") : "";
    btn.dataset.name = rawName;

    // لفلترة البحث (نضيف آخر رسالة كمان)
    btn.dataset.search = `${rawName} ${lastTextRaw}`.toLowerCase();

    // أيقونة نوع المحادثة
    const typeIcon =
      itemType === "channel" ? '<i class="fa-solid fa-bullhorn"></i>' :
      itemType === "group" ? '<i class="fa-solid fa-users"></i>' :
      itemType === "call" ? '<i class="fa-solid fa-phone"></i>' :
      '';

    btn.innerHTML = `
      <div class="conv-avatar">
        ${
          avatarUrl
            ? `<img src="${avatarUrl}" alt="Avatar" />`
            : `<div class="conv-group-avatar">${typeIcon || '<i class="fa-solid fa-user"></i>'}</div>`
        }
        ${itemType === "chat" ? `<span class="status-dot ${online ? "online" : "offline"}"></span>` : ""}
      </div>
      <div class="conv-main">
        <div class="conv-row-top">
          <span class="conv-name">${name}</span>
          <span class="conv-time">${escapeHtml(timeLabel || "")}</span>
        </div>
        <div class="conv-row-bottom">
          <span class="conv-last-msg">${lastText || ""}</span>
          ${unreadCount > 0 ? `<span class="conv-unread-badge">${unreadCount > 99 ? "99+" : unreadCount}</span>` : ""}
        </div>
      </div>
    `;

    btn.addEventListener("click", () => {
      document.querySelectorAll(".conversation-item").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");

      const statusLabel =
        itemType === "channel" ? "قناة" :
        itemType === "group" ? "مجموعة" :
        (online ? "متصل" : "غير متصل");

      setActiveConversationMeta(conv);

      openConversationUI({
        name: rawName,
        status: statusLabel,
        avatarUrl,
        userId: itemType === "chat" ? otherId : null,
        conversationId: conv._id,
      });

      loadMessages(conv._id, { reset: true });
    });

    conversationListEl.appendChild(btn);
  });
}

  // ===== جلب رسائل محادثة =====
  
// ===================== Pagination / Infinite Scroll =====================
const PAGE_SIZE = 7;
let beforeCursor = null;      // cursor للأقدم (createdAt ISO)
let hasMoreOlder = true;       // هل في رسائل أقدم؟
let isLoadingOlder = false;    // تحميل للأقدم (سحب للأعلى)

async function loadMessages(conversationId, opts = {}) {
  if (!chatMessagesEl || !conversationId || isLoadingMessages) return;

  const reset = !!opts.reset;

  if (reset) {
    beforeCursor = null;
    hasMoreOlder = true;
    isLoadingOlder = false;
    isLoadingMessages = true;

    chatMessagesEl.innerHTML =
      '<div class="msg-row system"><div class="msg-bubble">جاري تحميل الرسائل...</div></div>';

    // ✅ reset new-message indicators
    hideNewMsgBanner();
    clearUnreadDivider();


    // ✅ reset dedup
    seenMessageIds = new Set();
  }

  try {
    const data = await apiRequest(
      `/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=${PAGE_SIZE}`
    );

    const items = Array.isArray(data) ? data : (data?.items || []);
    const hasMore = Array.isArray(data) ? (items.length === PAGE_SIZE) : !!data?.hasMore;
    const nextCursor = Array.isArray(data) ? null : (data?.nextCursor || null);

    hasMoreOlder = !!hasMore;

    // cursor للأقدم
    if (nextCursor) {
      beforeCursor = nextCursor;
    } else if (items.length) {
      // items عادةً ascending (الأقدم أولاً)
      const oldest = items[0];
      if (oldest?.createdAt) beforeCursor = new Date(oldest.createdAt).toISOString();
    }

    renderMessages(items);

    // نزّل لآخر الرسائل فقط عند reset (فتح المحادثة)
    if (reset) {
      requestAnimationFrame(() => {
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      });
    }

    // ✅ لو ما صار في سكرول، عبّي الشاشة تلقائياً
    requestAnimationFrame(() => {
      if (!chatMessagesEl) return;
      if (hasMoreOlder && chatMessagesEl.scrollHeight <= chatMessagesEl.clientHeight + 8) {
        loadOlderMessages({ force: true });
      }
    });
  } catch (e) {
    console.error("loadMessages error:", e);
    showToast("تعذر تحميل الرسائل", "error");
  } finally {
    isLoadingMessages = false;
  }
}



function appendMessages(messages) {
  if (!chatMessagesEl) return;
  messages.forEach((msg) => addMessageToUI(msg));
}

function prependMessages(messages) {
  if (!chatMessagesEl) return;
  // نضيف من الأقدم للأحدث فوق
  const frag = document.createDocumentFragment();
  messages.forEach((msg) => {
    const node = buildMessageNode(msg);
    if (node) frag.appendChild(node);
  });
  chatMessagesEl.insertBefore(frag, chatMessagesEl.firstChild);
}

// نستخدمها حتى نقدر نعمل prepend بدون ما نكسر addMessageToUI الحالية
function buildMessageNode(message) {
  try {
    const beforeCount = chatMessagesEl.children.length;
    addMessageToUI(message);
    // addMessageToUI بتضيف بآخر القائمة، فنرجع نطلع آخر عنصر ونستخدمه
    const afterCount = chatMessagesEl.children.length;
    if (afterCount === beforeCount) return null;
    const node = chatMessagesEl.lastElementChild;
    if (!node) return null;
    chatMessagesEl.removeChild(node);
    return node;
  } catch {
    return null;
  }
}

async function loadOlderMessages(opts = {}) {
  const force = !!opts.force;
  if (!activeConversationId || !chatMessagesEl) return;
  if (!hasMoreOlder || isLoadingOlder || isLoadingMessages) return;

  // لو ما في سكرول أصلاً، ما في حدث scroll للأعلى. هون منستعمل force عبر fillViewport.
  if (!force && chatMessagesEl.scrollHeight <= chatMessagesEl.clientHeight + 8) return;

  isLoadingOlder = true;

  // تثبيت مكان السكرول (anchor)
  const prevHeight = chatMessagesEl.scrollHeight;
  const prevTop = chatMessagesEl.scrollTop;
  // ✅ Anchor أدق: أول عنصر رسالة مرئي قبل التحميل (لتثبيت مكان القراءة)
  const firstMsgEl = chatMessagesEl.querySelector('.msg-row:not(.system)');
  const firstMsgId = firstMsgEl ? firstMsgEl.getAttribute("data-msg-id") : null;
  const firstMsgTop = firstMsgEl ? firstMsgEl.getBoundingClientRect().top : 0;


  try {
    const data = await apiRequest(
      `/chat/conversations/${encodeURIComponent(activeConversationId)}/messages?limit=${PAGE_SIZE}` +
        (beforeCursor ? `&before=${encodeURIComponent(beforeCursor)}` : ``)
    );

    const messages = Array.isArray(data) ? data : (data?.items || []);
    const hasMore = Array.isArray(data) ? (messages.length === PAGE_SIZE) : !!data?.hasMore;
    const nextCursor = Array.isArray(data) ? null : (data?.nextCursor || null);

    // ✅ dedup (بدون ما نضيف للـ set هون، addMessageToUI هي اللي بتعملها)
    const fresh = [];
    for (const msg of messages) {
      const id = String(msg?._id || msg?.id || "");
      if (!id) continue;
      if (seenMessageIds.has(id)) continue;
      fresh.push(msg);
    }

    hasMoreOlder = !!hasMore;
    if (nextCursor) {
      beforeCursor = nextCursor;
    } else if (messages.length) {
      // messages هنا عادةً ascending (الأقدم أولاً) بس خلينا حذرين
      const oldest = messages[0];
      if (oldest?.createdAt) beforeCursor = new Date(oldest.createdAt).toISOString();
    }

    if (fresh.length) {
      prependMessages(fresh);

      requestAnimationFrame(() => {
        // ✅ حاول تثبيت حسب الـ anchor أولاً
        let adjusted = false;
        if (firstMsgId) {
          const same = chatMessagesEl.querySelector(`.msg-row[data-msg-id="${CSS.escape(firstMsgId)}"]`);
          if (same) {
            const nowTop = same.getBoundingClientRect().top;
            const delta = nowTop - firstMsgTop;
            chatMessagesEl.scrollTop += delta;
            adjusted = true;
          }
        }

        // fallback: حساب الارتفاع (القديم)
        if (!adjusted) {
          const newHeight = chatMessagesEl.scrollHeight;
          if (force && prevHeight <= chatMessagesEl.clientHeight + 8) {
            chatMessagesEl.scrollTop = 0;
          } else {
            chatMessagesEl.scrollTop = newHeight - prevHeight + prevTop;
          }
        }
      });
    }
  } catch (e) {
    console.error("loadOlderMessages error:", e);
  } finally {
    isLoadingOlder = false;

    // ✅ لو لسا ما صار في سكرول، عبّي الشاشة تلقائياً (بدون قفزات)
    requestAnimationFrame(() => {
      if (!activeConversationId || !chatMessagesEl) return;
      if (hasMoreOlder && chatMessagesEl.scrollHeight <= chatMessagesEl.clientHeight + 8) {
        loadOlderMessages({ force: true });
      }
    });
  }
}

// ✅ Infinite Scroll: سحب للأعلى لتحميل الأقدم
if (chatMessagesEl) {
  chatMessagesEl.addEventListener(
    "scroll",
    () => {
      if (!activeConversationId) return;

      // 1) سحب للأعلى لتحميل الأقدم
      if (chatMessagesEl.scrollTop <= 20) loadOlderMessages();

      // 2) إدارة تنبيه "رسالة جديدة ↓" + فاصل "غير مقروء"
      onChatScrollUiTick();
    },
    { passive: true }
  );
}

 function renderMessages(messages) {
  if (!chatMessagesEl) return;

  chatMessagesEl.innerHTML = "";
  messages.forEach((msg) => addMessageToUI(msg));
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  hideNewMsgBanner();
  clearUnreadDivider();
}



  function addMessageToUI(message) {
    if (!chatMessagesEl) return;

    // توافق خلفي: بعض النسخ القديمة كانت تستخدم forwardedFrom بدل forwardOf
    if (message && !message.forwardOf && message.forwardedFrom) {
      message.forwardOf = message.forwardedFrom;
    }

    const msgId = message && (message._id || message.id) ? (message._id || message.id) : "";

    if (msgId) {
      const sid = String(msgId);
      if (seenMessageIds.has(sid)) return;
      if (chatMessagesEl.querySelector(`.msg-row[data-msg-id="${CSS.escape(sid)}"]`)) {
        seenMessageIds.add(sid);
        return;
      }
      seenMessageIds.add(sid);
    }

    const sender = message.sender || {};
    const senderId = sender._id || sender.id;
    const isMe =
      currentUserId && senderId && String(senderId) === String(currentUserId);
    const row = document.createElement("div");
    row.className = "msg-row " + (isMe ? "me" : "them");
    row.dataset.msgId = msgId;

    if (message.isTemp) {
      row.classList.add("temp-message");
      row.setAttribute("data-temp-id", msgId);
    }

    // زر تحديد (يظهر عند hover أو في وضع التحديد)
    const selectBtn = document.createElement("button");
    selectBtn.type = "button";
    selectBtn.className = "msg-select-btn";
    selectBtn.title = "تحديد";
    selectBtn.setAttribute("aria-label", "تحديد الرسالة");
    selectBtn.innerHTML = '<i class="fa-regular fa-circle"></i>';
    row.appendChild(selectBtn);

    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.className = "msg-bubble";

    const time = formatTimeHM(message.createdAt || new Date());
    const text = message.text || "";
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];

    // ===== Location / Contact Cards =====
    const meta = (message && message.meta && typeof message.meta === "object") ? message.meta : {};
    const loc =
      meta.location ||
      message.location ||
      ((meta && (typeof meta.lat === "number" || typeof meta.latitude === "number")) ? meta : null) ||
      null;
    const contact =
      meta.contact ||
      message.contact ||
      ((meta && (meta.name || meta.phone)) ? meta : null) ||
      null;

    // لا نعرض نص placeholder لو في بطاقة موقع/جهة اتصال
    const suppressMetaText =
      (!!loc && String(text || "").trim().startsWith("📍")) ||
      (!!contact && String(text || "").trim().startsWith("👤"));

    // ✅ خزّن المرفقات على الـ row (مفيد للتحويل بدون كسر أي شيء)
    try { row.dataset.attachments = JSON.stringify(attachments || []); } catch {}

    const __trim = typeof text === "string" ? text.trim() : "";
    const __isStickerToken = /^::sticker:[a-z0-9_-]+::$/i.test(__trim);
    const __isEmojiOnly = !__isStickerToken && attachments.length === 0 && /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(__trim);

    // ===== Forward Preview =====
    let inner = "";

    const fp = message.forwardPreview || null;
    const fpText =
      typeof fp === "string"
        ? fp
        : fp && typeof fp === "object"
        ? fp.text || fp.fileName || ""
        : "";
    const fpType =
      fp && typeof fp === "object" && fp.type ? String(fp.type) : "";
    const fpSender =
      fp && typeof fp === "object" && fp.senderName ? String(fp.senderName) : "";

    if (message.forwardOf && (fpText || "").trim()) {
      inner += `
        <div class="msg-reply-preview msg-forward-preview">
          <span class="fp-title"><i class="fa-solid fa-share"></i> محوّلة</span>
          ${fpSender ? `<span class="fp-from">من: ${escapeHtml(fpSender)}</span>` : ""}
          <span class="fp-text">${escapeHtml(fpText).slice(0, 140)}</span>
        </div>
      `;
    } else if (message.forwardOf && !fpText && fpType) {
      inner += `
        <div class="msg-reply-preview msg-forward-preview">
          <span class="fp-title"><i class="fa-solid fa-share"></i> محوّلة</span>
          <span class="fp-text">${escapeHtml(fpType)}</span>
        </div>
      `;
    }

    // ===== Reply Preview =====
    const rp = message.replyPreview;
    const rpText =
      typeof rp === "string"
        ? rp
        : rp && typeof rp === "object"
        ? (rp.text || "")
        : "";
    if (message.replyTo && (rpText || "").trim()) {
      inner += `
        <div class="msg-reply-preview" data-reply-to="${message.replyTo}">
          <span class="rp-title">ردّ على:</span>
          <span class="rp-text">${escapeHtml(rpText).slice(0, 140)}</span>
        </div>
      `;
    }

    // ===== Text =====
    // ===== Text / Sticker token =====
    const _t = typeof text === "string" ? text.trim() : "";
    const _st = _t.match(/^::sticker:([a-z0-9_-]+)::$/i);
    if (_st) {
      const sid = _st[1];
      const svgMap = {
        ok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22c55e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M50 86L32 68l10-10 8 8 34-34 10 10z" fill="url(#g)"/></svg>`,
        wow: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4fd1ff"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="56" r="6" fill="#0b1026"/><circle cx="76" cy="56" r="6" fill="#0b1026"/><circle cx="64" cy="80" r="12" fill="#0b1026"/></svg>`,
        fire: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 24c10 14 6 22 2 28 10-2 20 10 20 26 0 18-14 30-22 30S42 96 42 78c0-16 10-22 16-34 4-8 4-12 6-20z" fill="url(#g)"/></svg>`,
        party: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M38 82l18-44 40 18-20 44z" fill="url(#g)"/><circle cx="86" cy="38" r="6" fill="#ffd166"/><circle cx="96" cy="52" r="5" fill="#ff6bd5"/><circle cx="78" cy="54" r="4" fill="#4fd1ff"/></svg>`,
        heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6bd5"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 102S30 80 30 56c0-14 10-24 24-24 8 0 14 4 16 8 2-4 8-8 16-8 14 0 24 10 24 24 0 24-34 46-34 46z" fill="url(#g)"/></svg>`,
        rose: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6bd5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 32c16 0 28 12 28 26 0 12-8 20-18 23 8 8 12 18 12 30H42c0-12 4-22 12-30-10-3-18-11-18-23 0-14 12-26 28-26z" fill="url(#g)"/><path d="M64 78v36" stroke="#22c55e" stroke-width="10" stroke-linecap="round"/></svg>`,
        spark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd166"/><stop offset="1" stop-color="#ff6bd5"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 24l10 24 24 10-24 10-10 24-10-24-24-10 24-10z" fill="url(#g)"/></svg>`,
        kiss: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fb7185"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="60" r="30" fill="url(#g)"/><circle cx="54" cy="56" r="4" fill="#0b1026"/><circle cx="74" cy="56" r="4" fill="#0b1026"/><path d="M58 70c4 4 8 4 12 0" stroke="#0b1026" stroke-width="6" stroke-linecap="round"/></svg>`,
        lol: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd166"/><stop offset="1" stop-color="#ff6bd5"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="58" r="6" fill="#111827"/><circle cx="76" cy="58" r="6" fill="#111827"/><path d="M46 74c8 10 28 10 36 0" stroke="#111827" stroke-width="8" stroke-linecap="round"/></svg>`,
        angry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ef4444"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><path d="M46 58l16 8" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/><path d="M82 58l-16 8" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/><path d="M52 82c8-6 16-6 24 0" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>`,
        cool: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><rect x="38" y="52" width="52" height="12" rx="6" fill="#0b1026"/><path d="M48 78c10 10 22 10 32 0" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>`,
        think: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="58" r="6" fill="#0b1026"/><circle cx="76" cy="58" r="6" fill="#0b1026"/><path d="M56 78h16" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>`
      };
      const svg = svgMap[sid];
      if (svg) {
        const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\s+/g," ").trim());
        inner += `<div class="msg-sticker"><img src="${uri}" alt="sticker"></div>`;
      } else {
        inner += `<p class="msg-text">${escapeHtml(text)}</p>`;
      }
    } else if (text && !suppressMetaText) {
      inner += `<p class="msg-text">${escapeHtml(text)}</p>`;
    }

    // ===== Location / Contact Cards =====

    if (loc && (typeof loc.lat === "number" || typeof loc.latitude === "number")) {
      const lat = typeof loc.lat === "number" ? loc.lat : loc.latitude;
      const lng = typeof loc.lng === "number" ? loc.lng : loc.longitude;
      const url = loc.url || `https://www.google.com/maps?q=${lat},${lng}`;
      inner += `
        <div class="msg-attach msg-location-card" data-url="${escapeHtml(url)}">
          <div class="loc-ico"><i class="fa-solid fa-location-dot"></i></div>
          <div class="loc-body">
            <div class="loc-title">موقع</div>
            <a class="loc-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">فتح بالخريطة</a>
            <div class="loc-coords">${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
          </div>
        </div>
      `;
    }

    if (contact && (contact.name || contact.phone)) {
      const name = escapeHtml(contact.name || "جهة اتصال");
      const phone = escapeHtml(contact.phone || "");
      inner += `
        <div class="msg-attach msg-contact-card" data-name="${name}" data-phone="${phone}">
          <div class="c-ico"><i class="fa-solid fa-user"></i></div>
          <div class="c-body">
            <div class="c-name">${name}</div>
            ${phone ? `<div class="c-phone">${phone}</div>` : ``}
          </div>
          <button class="c-copy" type="button" title="نسخ">${'<i class="fa-solid fa-copy"></i>'}</button>
        </div>
      `;
    }

    // ===== Attachments =====
    if (attachments.length) {
      inner += `<div class="msg-attachments">`;

      attachments.forEach((att) => {
        const mainUrl = att.url || att.path || "";
        const fallbackUrl = att.fallbackUrl || att.localUrl || "";
        const url = buildFileUrl(mainUrl || fallbackUrl);
        if (!url) return;

        const t = att.type || att.kind || "file";
        const name = att.originalName || "ملف";

        if (t === "image") {
          inner += `
            <div class="msg-attach msg-attach-image" data-url="${url}" data-name="${escapeHtml(name)}">
              <button class="msg-attach-save" type="button" title="حفظ" aria-label="حفظ"><i class="fa-solid fa-download"></i></button>
              <img src="${url}" alt="${escapeHtml(name)}" loading="lazy" />
            </div>
          `;
        } else if (t === "video") {
          inner += `
            <div class="msg-attach msg-attach-video" data-url="${url}" data-name="${escapeHtml(name)}">
              <button class="msg-attach-save" type="button" title="حفظ" aria-label="حفظ"><i class="fa-solid fa-download"></i></button>
              <button class="msg-attach-open" type="button" title="فتح" aria-label="فتح"><i class="fa-solid fa-up-right-from-square"></i></button>
              <video src="${url}" controls playsinline></video>
            </div>
          `;
        } else if (t === "audio") {
          const duration = Number(att.duration || 0) || 0;
          inner += `
            <div class="msg-attach msg-attach-audio" data-audio-duration="${duration}">
              ${buildVoiceBubbleHTML({ url: mainUrl || url, fallbackUrl, duration, timeLabel: time })}
            </div>
          `;
        } else {
          inner += `
            <a class="msg-attach msg-attach-file" href="${url}" target="_blank" rel="noopener">
              📎 ${escapeHtml(name)}
            </a>
          `;
        }
      });

      inner += `</div>`;
    }

    // ===== Meta =====
    inner += `
      <div class="msg-meta">
        <span class="msg-time">${time}</span>
        ${
          isMe
            ? `<span class="msg-state">${getSeenIconHTML(message)}</span>`
            : ""
        }
      </div>
    `;

    bubbleWrapper.innerHTML = inner;
    if (typeof __isEmojiOnly !== "undefined" && __isEmojiOnly) bubbleWrapper.classList.add("emoji-only");
    if (typeof __isStickerToken !== "undefined" && __isStickerToken) bubbleWrapper.classList.add("sticker-only");
    row.appendChild(bubbleWrapper);

    chatMessagesEl.appendChild(row);

    // Wire voice players
    row.querySelectorAll(".msg-bubble.voice-msg").forEach((vb) => {
      const wrap = vb.closest(".msg-attach-audio");
      const dur = wrap ? Number(wrap.getAttribute("data-audio-duration") || 0) : 0;
      wireVoiceBubble(vb, dur);
    });

    // لو نحن في وضع التحديد، طبّق الحالة على الرسالة الجديدة
    if (selectMode && msgId) {
      row.classList.toggle("is-selected", selectedMsgIds.has(msgId));
      syncSelectBtnIcon(row);
    }
  }

  // ✅ حل السكوب: نخزن دوال الـ UI للجزء اللي برا DOMContentLoaded
  window.__inbox = window.__inbox || {};
  window.__inbox.addMessageToUI = addMessageToUI;
  window.__inbox.renderConversationList = renderConversationList;
  window.__inbox.applySidebarFilter = applySidebarFilter;

  // ===================== Message Tools (Select / Reply / Search / Pin) =====================

  function ensureMsgToolsUI() {
  // ستايلات + شريط التحديد + شريط الرد/البحث (بدون كسر أي جزء آخر)
  if (!document.getElementById("msgToolsStyle")) {
    const st = document.createElement("style");
    st.id = "msgToolsStyle";
    st.textContent = `
      .msg-location-card,.msg-contact-card{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,06);border:1px solid rgba(255,255,255,10);margin-top:8px}
      .msg-location-card .loc-ico,.msg-contact-card .c-ico{width:34px;height:34px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,25)}
      .msg-location-card .loc-title,.msg-contact-card .c-name{font-weight:700}
      .msg-location-card .loc-link{font-size:13px;opacity:.95;text-decoration:underline}
      .msg-location-card .loc-coords{font-size:12px;opacity:.8}
      .msg-contact-card .c-phone{font-size:12px;opacity:.85}
      .msg-contact-card .c-copy{margin-inline-start:auto;border:0;border-radius:12px;padding:8px 10px;background:rgba(255,255,255,10);color:inherit;cursor:pointer}

      .msg-select-btn{background:transparent;border:0;cursor:pointer;opacity:0;transform:scale(.95);transition:.15s;align-self:flex-end;margin:2px 6px;color:inherit}
      .msg-row:hover .msg-select-btn{opacity:1;transform:scale(1)}
      .msg-row.is-selected{outline:2px solid rgba(255,255,255,16);border-radius:16px}
      .msg-row.is-selected .msg-select-btn{opacity:1}

      .msg-reply-preview{border-right:3px solid rgba(255,255,255,25);padding:6px 10px;margin:0 0 8px 0;opacity:.92}
      .msg-reply-preview .rp-title{font-size:12px;opacity:.75;margin-left:6px}
      .msg-reply-preview .rp-text{font-size:12px;opacity:.95}

      .msg-select-bar{position:sticky;top:0px;z-index:60;display:none;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;margin:8px 10px 10px;box-sizing:border-box;width:calc(100% - 20px);max-width:100%;border-radius:16px;background:rgba(20,25,45,75);backdrop-filter: blur(10px)}
      .msg-select-bar.show{display:flex}
      .msb-left{display:flex;align-items:center;gap:10px}
      .msb-count{min-width:26px;text-align:center;opacity:.9}

      .msb-btn{display:flex;align-items:center;gap:8px;padding:8px 12px;border:0;border-radius:14px;background:rgba(255,255,255,08);cursor:pointer;color:inherit;transition:.15s}
      .msb-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,11)}
      .msb-btn:active{transform:translateY(0px);opacity:.9}
      .msb-btn span{font-size:12px;opacity:.92}
      .msb-cancel{background:rgba(255,255,255,06)}
      .msb-danger{background:rgba(255,80,80,16)}
      .msb-danger:hover{background:rgba(255,80,80,22)}
      .msb-right{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .msb-menu-wrap{position:relative;display:flex;align-items:center}
      .msb-caret{font-size:12px;opacity:.85}
      .msb-menu{position:absolute;top:calc(100% + 8px);left:0;min-width:160px;padding:8px;border-radius:16px;background:rgba(20,25,45,92);border:1px solid rgba(255,255,255,10);display:none;flex-direction:column;gap:6px}
      .msb-menu.show{display:flex}
      .msb-menu button{width:100%;text-align:right;border:0;border-radius:12px;padding:10px 10px;background:rgba(255,255,255,08);color:inherit;cursor:pointer}
      .msb-menu button:hover{background:rgba(255,255,255,12)}
      .msb-btn.disabled{opacity:.45;pointer-events:none}
      .chat-search-bar{display:flex;align-items:center;gap:8px;margin-right:8px}
      .chat-search-bar input{width:220px;max-width:45vw;border:0;border-radius:12px;padding:8px 10px;background:rgba(255,255,255,08);color:inherit;outline:none}
      .chat-search-bar .csb-close{border:0;border-radius:12px;padding:8px 10px;background:rgba(255,255,255,08);cursor:pointer;color:inherit}
      .pulse{animation:pulseBorder .7s ease}
      @keyframes pulseBorder{0%{transform:scale(.98)}50%{transform:scale(1.01)}100%{transform:scale(1)}}
    `;
    document.head.appendChild(st);
  }

  // شريط التحديد أعلى المحادثة
  if (!document.getElementById("msgSelectBar")) {
    const bar = document.createElement("div");
    bar.id = "msgSelectBar";
    bar.className = "msg-select-bar";
    bar.innerHTML = `
      <div class="msb-left">
        <button type="button" class="msb-btn msb-cancel" data-act="cancel" title="إلغاء التحديد">
          <i class="fa-solid fa-xmark"></i><span>إلغاء</span>
        </button>
        <span class="msb-count" title="عدد الرسائل المحددة">0</span>
      </div>

      <div class="msb-right">
        <button type="button" class="msb-btn" data-act="reply" title="ردّ على رسالة">
          <i class="fa-solid fa-reply"></i><span>ردّ</span>
        </button>

        <button type="button" class="msb-btn" data-act="copy" title="نسخ المحتوى">
          <i class="fa-regular fa-copy"></i><span>نسخ</span>
        </button>

        <button type="button" class="msb-btn" data-act="forward" title="تحويل (إرسال لمحادثة أخرى)">
          <i class="fa-solid fa-share-nodes"></i><span>تحويل</span>
        </button>

        <button type="button" class="msb-btn" data-act="pin" title="تثبيت رسالة">
          <i class="fa-solid fa-thumbtack"></i><span>تثبيت</span>
        </button>

        <div class="msb-menu-wrap">
          <button type="button" class="msb-btn msb-danger" data-act="del-menu" title="خيارات الحذف">
            <i class="fa-regular fa-trash-can"></i><span>حذف</span>
            <i class="fa-solid fa-chevron-down msb-caret"></i>
          </button>
          <div class="msb-menu" id="msbDelMenu">
            <button type="button" data-act="delete-me"><i class="fa-regular fa-circle-xmark"></i> حذف عندي</button>
            <button type="button" data-act="delete-all"><i class="fa-solid fa-ban"></i> حذف عند الجميع</button>
          </div>
        </div>
      </div>
    `;

    // مكان الشريط: داخل صندوق الرسائل لو موجود، وإلا أعلى الصفحة
    const host =
      document.querySelector("#chatMessages") ||
      document.querySelector(".chat-messages") ||
      document.querySelector(".chat-panel") ||
      document.body;

    // إذا host هو قائمة الرسائل نفسها، نخليه قبلها
    if (host && (host.id === "chatMessages" || host.classList.contains("chat-messages"))) {
      host.parentElement?.insertBefore(bar, host);
    } else {
      host.prepend(bar);
    }
  }

  // أحداث شريط التحديد
  const bar = document.getElementById("msgSelectBar");
  if (bar && !bar.__bound) {
    bar.__bound = true;

    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const act = btn.getAttribute("data-act") || "";
      if (!act) return;

      // قائمة الحذف
      if (act === "del-menu") {
        const m = document.getElementById("msbDelMenu");
        if (m) m.classList.toggle("show");
        return;
      }

      // إخفاء قائمة الحذف عند أي أكشن آخر
      document.getElementById("msbDelMenu")?.classList.remove("show");

      if (act === "cancel") return exitSelectMode();

      if (!selectedMsgIds.size) {
        showToast("حدد رسالة أولاً", "warning");
        return;
      }

      if (act === "copy") return copySelectedMessages();
      if (act === "reply") return prepareReplyFromSelected();
      if (act === "forward") return forwardSelectedStub();
      if (act === "pin") return pinSelectedMessage();
      if (act === "delete-me") return deleteSelected("me");
      if (act === "delete-all") return deleteSelected("all");
    });

    // إغلاق قائمة الحذف عند الضغط خارجها
    document.addEventListener("click", (e) => {
      if (!bar.contains(e.target)) {
        document.getElementById("msbDelMenu")?.classList.remove("show");
      }
    });
  }
}


function setSelectBarVisible(visible) {
    const bar = document.getElementById("msgSelectBar");
    if (!bar) return;

    // ✅ safety: non-admin in channel should never see select bar
    if (activeSpaceCtx?.isChannel && !activeSpaceCtx?.isAdmin) {
      bar.classList.remove("show");
      return;
    }

    bar.classList.toggle("show", !!visible);
  }

  function syncSelectBarCount() {
    const bar = document.getElementById("msgSelectBar");
    if (!bar) return;
    const c = bar.querySelector(".msb-count");
    if (c) c.textContent = String(selectedMsgIds.size);
    // الرد/تثبيت فقط عند اختيار رسالة واحدة
    const one = selectedMsgIds.size === 1;
    bar.querySelector('[data-act="reply"]')?.classList.toggle("disabled", !one);
    bar.querySelector('[data-act="pin"]')?.classList.toggle("disabled", !one);
  }

  function syncSelectBtnIcon(row) {
    const btn = row?.querySelector?.(".msg-select-btn");
    if (!btn) return;
    const isSel = row.classList.contains("is-selected");
    btn.innerHTML = isSel
      ? '<i class="fa-solid fa-circle-check"></i>'
      : '<i class="fa-regular fa-circle"></i>';
  }

  function enterSelectMode(initialMsgId = null) {
    // ✅ non-admin in channel: disable selection/deletion like Telegram
    if (activeSpaceCtx?.isChannel && !activeSpaceCtx?.isAdmin) {
      showToast("هذه قناة — لا يمكنك حذف الرسائل", "warn");
      return;
    }
    selectMode = true;
    setSelectBarVisible(true);
    if (initialMsgId) toggleSelectMessage(initialMsgId, true);
    syncSelectBarCount();
  }

  function exitSelectMode() {
    selectMode = false;
    selectedMsgIds.clear();
    lastSelectedMsgId = null;
    setSelectBarVisible(false);
    document.querySelectorAll(".msg-row.is-selected").forEach((r) => {
      r.classList.remove("is-selected");
      syncSelectBtnIcon(r);
    });
  }

  function toggleSelectMessage(msgId, forceOn = null) {
    if (!msgId) return;
    const row = chatMessagesEl?.querySelector?.(`.msg-row[data-msg-id="${CSS.escape(msgId)}"]`);
    if (!row) return;

    const willSelect = forceOn === null ? !selectedMsgIds.has(msgId) : !!forceOn;

    if (willSelect) selectedMsgIds.add(msgId);
    else selectedMsgIds.delete(msgId);

    row.classList.toggle("is-selected", willSelect);
    syncSelectBtnIcon(row);
    syncSelectBarCount();

    if (!selectedMsgIds.size) exitSelectMode();
  }

  function getSelectedRowsOrdered() {
    const rows = Array.from(chatMessagesEl?.querySelectorAll?.(".msg-row[data-msg-id]") || []);
    return rows.filter((r) => selectedMsgIds.has(r.dataset.msgId));
  }

  function getMessageTextFromRow(row) {
    const txt = row.querySelector(".msg-text")?.textContent?.trim() || "";
    if (txt) return txt;
    // attachments labels
    const att = row.querySelector(".msg-attachments");
    if (att) {
      if (row.querySelector(".msg-attach-image")) return "📷 صورة";
      if (row.querySelector(".msg-attach-video")) return "🎬 فيديو";
      if (row.querySelector(".msg-attach-audio")) return "🎧 صوت";
      if (row.querySelector(".msg-attach-file")) return "📎 ملف";
    }
    return "";
  }

  async function copySelectedMessages() {
    const rows = getSelectedRowsOrdered();
    const out = rows
      .map((r) => getMessageTextFromRow(r))
      .filter(Boolean)
      .join("\n");
    if (!out) return showToast("لا يوجد نص للنسخ", "warning");
    try {
      await navigator.clipboard.writeText(out);
      showToast("تم النسخ ✅", "success");
      exitSelectMode();
    } catch {
      showToast("فشل النسخ (صلاحيات المتصفح)", "error");
    }
  }

  function prepareReplyFromSelected() {
    if (selectedMsgIds.size !== 1) return;
    const msgId = Array.from(selectedMsgIds)[0];
    const row = chatMessagesEl?.querySelector?.(`.msg-row[data-msg-id="${CSS.escape(msgId)}"]`);
    if (!row) return;

    const preview = getMessageTextFromRow(row) || "رسالة";
    setReplyDraft({ msgId, previewText: preview });
    exitSelectMode();
    chatInput?.focus?.();
  }

  function setReplyDraft(d) {
    replyDraft = d || null;

    // ✅ تأكد أن شريط الرد موجود دائماً (بعض الشاشات/إعادة بناء DOM كانت تخفيه)
    let chip = chatInputBar?.querySelector?.(".reply-chip");
    if (!chip && chatInputBar) {
      chip = document.createElement("div");
      chip.className = "reply-chip";
      chip.style.display = "none";
      chip.innerHTML = `
        <button type="button" class="reply-chip-x" aria-label="close">×</button>
        <span class="reply-chip-label">رد على:</span>
        <span class="reply-chip-text"></span>
      `;
      // أول عنصر فوق حقل الكتابة
      chatInputBar.prepend(chip);

      chip.querySelector(".reply-chip-x")?.addEventListener("click", () => {
        clearReplyDraft();
      });
    }

    const textEl = chip?.querySelector?.(".reply-chip-text");
    if (!chip || !textEl) return;

    if (!replyDraft) {
      chip.style.display = "none";
      textEl.textContent = "";
      return;
    }

    chip.style.display = "flex";
    textEl.textContent = replyDraft.previewText || "رسالة";
  }

  function clearReplyDraft() {
    setReplyDraft(null);
  }

  function forwardSelectedStub() {
    if (!selectedMsgIds.size) return;

    const ids = Array.from(selectedMsgIds);
    const rows = getSelectedRowsOrdered();
    if (!rows.length) {
      showToast("حدد رسالة واحدة على الأقل", "warning");
      return;
    }

    openForwardModal({
      messageIds: ids,
      rows,
    });
  }

  function buildPreviewFromRow(row) {
    const msgId = row?.dataset?.msgId || "";

    // ✅ التقط مرفقات الرسالة الأصلية (لازم لتمريرها عند التحويل)
    let rawAttachments = [];
    try {
      rawAttachments = JSON.parse(row?.dataset?.attachments || "[]") || [];
      if (!Array.isArray(rawAttachments)) rawAttachments = [];
    } catch {
      rawAttachments = [];
    }
    const senderIsMe = row.classList.contains("me");
    const senderName = senderIsMe ? (currentUser?.username || "أنت") : (chatUserNameEl?.textContent || "مستخدم");
    const createdAt = null;

    // text
    const text = row.querySelector(".msg-text")?.textContent?.trim() || "";

    // detect attachment types (first)
    let type = "text";
    let url = "";
    let fileName = "";

    if (row.querySelector(".msg-attach-image img")) {
      type = "image";
      url = row.querySelector(".msg-attach-image img")?.getAttribute("src") || "";
      fileName = "صورة";
    } else if (row.querySelector(".msg-attach-video video")) {
      type = "video";
      url = row.querySelector(".msg-attach-video video")?.getAttribute("src") || "";
      fileName = "فيديو";
    } else if (row.querySelector(".msg-bubble.voice-msg audio")) {
      type = "audio";
      const a = row.querySelector(".msg-bubble.voice-msg audio");
      url = a?.dataset?.fallback || a?.dataset?.src || a?.getAttribute("src") || "";
      fileName = "رسالة صوتية";
    } else if (row.querySelector(".msg-attach-file")) {
      type = "file";
      url = row.querySelector(".msg-attach-file")?.getAttribute("href") || "";
      fileName = row.querySelector(".msg-attach-file")?.textContent?.trim() || "ملف";
    } else if (text) {
      type = "text";
    } else {
      // mixed/unknown
      type = "mixed";
    }

    // لو في نص + مرفقات => mixed
    const hasAtt =
      !!row.querySelector(".msg-attachments") &&
      (row.querySelector(".msg-attach-image") ||
        row.querySelector(".msg-attach-video") ||
        row.querySelector(".msg-attach-audio") ||
        row.querySelector(".msg-attach-file"));
    if (text && hasAtt) type = "mixed";

    return {
      msgId,
      preview: {
        type,
        text: text || "",
        fileName,
        url,
        senderName,
        createdAt,
      },
      attachments: rawAttachments,
    };
  }

  function ensureForwardModal() {
    let overlay = document.getElementById("forwardOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "forwardOverlay";
    overlay.className = "ui-overlay";
    overlay.innerHTML = `
      <div class="ui-modal" role="dialog" aria-modal="true" style="max-width:520px">
        <h3 style="margin-bottom:8px">تحويل الرسائل</h3>
        <p style="opacity:.85;margin-top:0;margin-bottom:10px">اختر المحادثة التي تريد التحويل إليها</p>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <input id="forwardSearch" type="text" placeholder="بحث..." style="flex:1;border:0;border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.08);color:inherit;outline:none" />
          <button id="forwardClose" type="button" class="ui-btn secondary" style="border-radius:12px">إغلاق</button>
        </div>

        <div style="margin-bottom:10px">
          <textarea id="forwardComment" rows="2" placeholder="(اختياري) اكتب تعليقاً قبل التحويل..." style="width:100%;resize:none;border:0;border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.08);color:inherit;outline:none"></textarea>
        </div>

        <div id="forwardList" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;padding-right:4px"></div>

        <div class="ui-actions" style="margin-top:12px">
          <button id="forwardCancel" class="ui-btn secondary" type="button">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("show");
    });

    overlay.querySelector("#forwardClose")?.addEventListener("click", () => {
      overlay.classList.remove("show");
    });
    overlay.querySelector("#forwardCancel")?.addEventListener("click", () => {
      overlay.classList.remove("show");
    });

    return overlay;
  }

  function openForwardModal({ messageIds, rows }) {
    const overlay = ensureForwardModal();
    const listEl = overlay.querySelector("#forwardList");
    const searchEl = overlay.querySelector("#forwardSearch");
    const commentEl = overlay.querySelector("#forwardComment");

    const render = (q) => {
      const query = (q || "").trim().toLowerCase();
      listEl.innerHTML = "";

      const items = Array.isArray(conversations) ? conversations.slice() : [];
      if (!items.length) {
        listEl.innerHTML = `<div style="opacity:.8">لا توجد محادثات متاحة للتحويل.</div>`;
        return;
      }

      items.forEach((conv) => {
        const other = getOtherParticipant(conv);
        const otherId = other ? other._id || other.id : null;
        const name = (other && (other.username || other.email)) || "مستخدم Saepel";
        if (query && !String(name).toLowerCase().includes(query)) return;

        const avatarUrl = other && other.avatar ? buildAvatarUrl(other.avatar) : "";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "conversation-item";
        btn.style.width = "100%";
        btn.style.textAlign = "start";
        btn.style.border = "1px solid rgba(255,255,255,.08)";
        btn.style.borderRadius = "16px";

        btn.innerHTML = `
          <div class="conv-avatar">
            ${
              avatarUrl
                ? `<img src="${avatarUrl}" alt="Avatar" />`
                : `<div class="conv-group-avatar"><i class="fa-solid fa-user"></i></div>`
            }
            <span class="status-dot online"></span>
          </div>
          <div class="conv-main">
            <div class="conv-row-top">
              <span class="conv-name">${escapeHtml(name)}</span>
              <span class="conv-time">${formatConversationTime(conv.lastMessageAt || conv.updatedAt || conv.createdAt) || ""}</span>
            </div>
            <div class="conv-row-bottom">
              <span class="conv-last-msg">اضغط للتحويل</span>
            </div>
          </div>
        `;

        btn.addEventListener("click", async () => {
          overlay.classList.remove("show");
          const comment = (commentEl?.value || "").trim();
          await sendForwardBatch({
            targetConversationId: conv._id,
            targetUserId: otherId,
            selectedRows: rows,
            comment,
          });
          exitSelectMode();
        });

        listEl.appendChild(btn);
      });

      if (!listEl.children.length) {
        listEl.innerHTML = `<div style="opacity:.8">لا يوجد نتائج.</div>`;
      }
    };

    // رندر أول مرة
    render("");

    // بحث
    let t = null;
    searchEl.value = "";
    searchEl.oninput = () => {
      clearTimeout(t);
      t = setTimeout(() => render(searchEl.value), 160);
    };

    overlay.classList.add("show");
    searchEl.focus?.();
  }

  async function sendForwardBatch({ targetConversationId, targetUserId, selectedRows, comment = "" }) {
    if (!targetConversationId || !targetUserId) {
      showToast("تعذر التحويل (بيانات المحادثة ناقصة)", "error");
      return;
    }
    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول", "error");
      return;
    }

    // تأكد من السوكيت
    if (!socket || !socket.connected) {
      socket = connectSocket();
      if (!socket) {
        showToast("تعذر الاتصال بالسيرفر الفوري", "error");
        return;
      }
    }

    // 1) إذا في تعليق، أرسله كرسالة نصية عادية قبل الفوروارد
    if (comment) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const tempMessage = {
        _id: tempId,
        text: comment,
        sender: { _id: currentUserId, username: currentUser?.username || "", avatar: currentUser?.avatar || "" },
        createdAt: new Date(),
        conversation: targetConversationId,
        isTemp: true,
        clientTempId: tempId,
                // Reply (اختياري)
                replyTo: replySnap?.msgId || null,
                replyPreview: replySnap?.previewText || "",
      };

      // إذا كنا داخل نفس المحادثة المستهدفة: اعرض فوراً
      if (String(activeConversationId) === String(targetConversationId)) {
        addMessageToUI(tempMessage);
        initMediaViewer();

    if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }

      const key = buildOutboxKey({
        conversationId: targetConversationId,
        senderId: String(currentUserId),
        text: comment,
        attachments: [],
        kind: "text",
      });
      registerPendingOutbox(key, tempId);

      socket.emit("send-message", {
        clientTempId: tempId,
        conversationId: targetConversationId,
        text: comment,
        senderId: currentUserId,
        receiverId: targetUserId,
      });
    }

    // 2) أرسل الرسائل المحددة كمحوّلة (Forward)
    for (const row of selectedRows) {
      const { msgId, preview, attachments } = buildPreviewFromRow(row);
      if (!msgId) continue;

      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const tempMessage = {
        _id: tempId,
        text: "", // محتوى الفوروارد ضمن preview
        sender: { _id: currentUserId, username: currentUser?.username || "", avatar: currentUser?.avatar || "" },
        createdAt: new Date(),
        conversation: targetConversationId,
        isTemp: true,
        clientTempId: tempId,

        forwardOf: msgId,
        forwardPreview: preview,
        // ✅ خلي التحويل يحافظ على المرفقات
        attachments: Array.isArray(attachments) ? attachments : [],
        type: (Array.isArray(attachments) && attachments[0]?.type) ? attachments[0].type : (preview?.type || "text"),
      };

      if (String(activeConversationId) === String(targetConversationId)) {
        addMessageToUI(tempMessage);
        initMediaViewer();

    if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      }

      const key = buildOutboxKey({
        conversationId: targetConversationId,
        senderId: String(currentUserId),
        text: "",
        attachments: [],
        replyTo: "",
        forwardOf: msgId,
        kind: "forward",
      });
      registerPendingOutbox(key, tempId);

      socket.emit("send-message", {
        clientTempId: tempId,
        conversationId: targetConversationId,
        text: "",
        senderId: currentUserId,
        receiverId: targetUserId,

        // ✅ Forward fields
        forwardOf: msgId,
        forwardPreview: preview,
        // ✅ إرسال نفس المرفقات مع التحويل (السيرفر يقوم بالتخزين كرسالة عادية)
        attachments: Array.isArray(attachments) ? attachments : [],
      });
    }

    showToast("تم تحويل الرسائل ✅", "success");
  }

  function pinSelectedMessage() {
    if (selectedMsgIds.size !== 1) return;
    const msgId = Array.from(selectedMsgIds)[0];
    pinnedMsgId = msgId;

    // تخزين محلي لكل محادثة (خفيف وسريع)
    try {
      if (activeConversationId) {
        localStorage.setItem(`saepel_pin_${activeConversationId}`, msgId);
      }
    } catch {}

    showToast("تم تثبيت الرسالة 📌", "success");
    exitSelectMode();
  }

  async  function deleteSelected(mode) {
    if (activeSpaceCtx?.isChannel && !activeSpaceCtx?.isAdmin) {
      showToast("هذه قناة — الحذف متاح للمشرفين فقط", "warn");
      return;
    }

    const ids = Array.from(selectedMsgIds);
    const ok = await uiConfirm({
      title: "حذف الرسائل",
      message:
        mode === "all"
          ? "هل تريد حذف الرسائل للجميع؟"
          : "هل تريد حذف الرسائل لديك فقط؟",
      okText: "حذف",
      cancelText: "إلغاء",
    });
    if (!ok) return;

    // تحديث UI فوراً (سريع) + حاول API لاحقاً
    ids.forEach((id) => {
      const row = chatMessagesEl?.querySelector?.(`.msg-row[data-msg-id="${CSS.escape(id)}"]`);
      if (row) row.remove();
    });

    exitSelectMode();

    // ✅ ربط مع الباك اند (بدون 404) — نفس الراوتات الموجودة في server.js
    try {
      if (mode === "all") {
        // bulk-delete لو أكثر من رسالة
        if (ids.length > 1) {
          await apiRequest("/chat/messages/bulk-delete", {
            method: "POST",
            body: JSON.stringify({ ids }),
          });
        } else if (ids.length === 1) {
          await apiRequest(`/chat/messages/${ids[0]}`, { method: "DELETE" });
        }
      } else {
        // حذف عندي فقط: لكل رسالة
        for (const mid of ids) {
          await apiRequest(`/chat/messages/${mid}/delete-for-me`, { method: "POST" });
        }
      }
    } catch (e) {
      console.warn("delete api skipped/failed:", e);
    }
  }

  function filterMessagesInUI(q) {
    const query = (q || "").toLowerCase();
    const rows = chatMessagesEl?.querySelectorAll?.(".msg-row") || [];
    rows.forEach((r) => {
      const t = (r.querySelector(".msg-text")?.textContent || "").toLowerCase();
      const match = !query || t.includes(query);
      r.style.display = match ? "" : "none";
    });
  }

  function enableMsgSelectionEvents() {
    if (!chatMessagesEl) return;

    let pressTimer = null;
    let pressTargetId = null;

    const startLongPress = (e, msgId) => {
      if (!msgId) return;
      clearTimeout(pressTimer);
      pressTargetId = msgId;
      pressTimer = setTimeout(() => {
        if (!selectMode) enterSelectMode(msgId);
      }, 420);
    };

    const cancelLongPress = () => {
      clearTimeout(pressTimer);
      pressTimer = null;
      pressTargetId = null;
    };

    // Click / tap
    chatMessagesEl.addEventListener("click", (e) => {
      const row = e.target.closest(".msg-row[data-msg-id]");
      if (!row) return;
      const msgId = row.dataset.msgId;

      // ضغط على زر التحديد
      if (e.target.closest(".msg-select-btn")) {
        if (!selectMode) enterSelectMode(msgId);
        else toggleSelectMessage(msgId);
        return;
      }

      // في وضع التحديد: أي نقرة على الرسالة = toggle
      if (selectMode) {
        toggleSelectMessage(msgId);
        return;
      }

      // فتح/قفز للرد (لو موجود)
      const rp = e.target.closest(".msg-reply-preview");
      if (rp && rp.dataset.replyTo) {
        const targetId = rp.dataset.replyTo;
        const targetRow = chatMessagesEl.querySelector(
          `.msg-row[data-msg-id="${CSS.escape(targetId)}"]`
        );
        if (targetRow) {
          targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
          targetRow.classList.add("pulse");
          setTimeout(() => targetRow.classList.remove("pulse"), 700);
        }
      }
    });

    // Long press (mobile)
    chatMessagesEl.addEventListener("pointerdown", (e) => {
      const row = e.target.closest(".msg-row[data-msg-id]");
      if (!row) return;
      const msgId = row.dataset.msgId;
      if (e.pointerType === "mouse") return; // الماوس عنده hover + زر تحديد
      startLongPress(e, msgId);
    });

    chatMessagesEl.addEventListener("pointerup", cancelLongPress);
    chatMessagesEl.addEventListener("pointercancel", cancelLongPress);
    chatMessagesEl.addEventListener("pointermove", cancelLongPress);
  }

  // زر بحث داخل المحادثة من قائمة الثلاث نقاط (اختياري)
  function openChatSearch() {
    const bar = document.getElementById("chatSearchBar");
    if (!bar) return;
    bar.style.display = "flex";
    bar.querySelector("input")?.focus?.();
  }


  // ===== بدء / جلب محادثة ثنائية =====
  async function startConversationWithUser(otherUserId) {
    if (!otherUserId) throw new Error("otherUserId مفقود");

    const existing = conversations.find((c) => {
      const other = getOtherParticipant(c);
      const otherId = other ? other._id || other.id : null;
      return otherId && String(otherId) === String(otherUserId);
    });

    if (existing) {
      activeConversationId = existing._id;
      return existing;
    }

    const conv = await apiRequest("/chat/conversations/start", {
      method: "POST",
      body: JSON.stringify({ otherUserId }),
    });

    conversations = [conv, ...conversations];
    renderConversationList(conversations);

    activeConversationId = conv._id;
    return conv;
  }

  // ===== فتح محادثة مباشرة لو جينا من البروفايل =====
  async function loadUserForDirectChat(userId) {
    if (!userId) return;
    try {
      const conv = await startConversationWithUser(userId);
      const other = getOtherParticipant(conv);

      const name = (other && (other.username || other.email)) || "مستخدم Saepel";
      const avatarUrl = other && other.avatar ? buildAvatarUrl(other.avatar) : "";

      openConversationUI({
        name,
        status: "متصل",
        avatarUrl,
        userId,
        conversationId: conv._id,
      });

      await loadMessages(conv._id, { reset: true });
    } catch (err) {
      console.error("loadUserForDirectChat error:", err);
      openConversationUI({
        name: "مستخدم Saepel",
        status: "متصل",
        avatarUrl: "",
        userId,
      });
      showToast(err.message || "تعذر بدء المحادثة", "error");
    }
  }

  // ===== زر رجوع (موبايل) =====
  if (chatBackBtn && inboxPage) {
    chatBackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      inboxPage.classList.remove("show-chat");
    });
  }

  // ===== رجوع للصفحة الرئيسية (مشترك) =====
  const goHomeOrBack = () => {
    try {
      if (window.history.length > 1) window.history.back();
      else window.location.href = "./index.html";
    } catch {
      window.location.href = "./index.html";
    }
  };

  // ===== سحب للرجوع للصفحة الرئيسية (موبايل) =====
  (function enableSwipeToHome() {
    if (!inboxPage) return;

    const EDGE = 28; // px من حافة الشاشة
    const MIN_DX = 90;
    const MAX_DY = 60;
    const MAX_TIME = 650;

    const swipeTarget =
      document.getElementById("chatPage") ||
      document.getElementById("inboxChat") ||
      document.querySelector(".inbox-chat") ||
      inboxPage;

    let sx = 0, sy = 0, st = 0;
    let lastX = 0, lastY = 0;
    let tracking = false;
    let edge = false;

    swipeTarget.addEventListener(
      "touchstart",
      (ev) => {
        if (!ev.touches || ev.touches.length !== 1) return;

        if (!isMobileView()) return;
        if (!inboxPage.classList.contains("show-chat")) return;

        // لا نرجع أثناء وجود واجهة اتصال فوق
        if (document.querySelector(".call-overlay.show, .call-modal.show, #callOverlay.show")) return;

        const t = ev.touches[0];
        sx = t.clientX;
        sy = t.clientY;
        lastX = sx;
        lastY = sy;
        st = Date.now();
        tracking = true;

        edge = sx <= EDGE || sx >= window.innerWidth - EDGE;
      },
      { passive: true }
    );

    swipeTarget.addEventListener(
      "touchmove",
      (ev) => {
        if (!tracking) return;
        if (!edge) return;
        if (!ev.touches || ev.touches.length !== 1) return;

        const t = ev.touches[0];
        lastX = t.clientX;
        lastY = t.clientY;

        const dx = lastX - sx;
        const dy = lastY - sy;

        // إذا الحركة عمودية أكثر: اعتبرها سكرول
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 18) {
          tracking = false;
        }
      },
      { passive: true }
    );

    swipeTarget.addEventListener(
      "touchend",
      () => {
        if (!tracking) return;

        tracking = false;

        if (!isMobileView()) return;
        if (!inboxPage.classList.contains("show-chat")) return;
        if (!edge) return;

        const dt = Date.now() - st;
        const dx = lastX - sx;
        const dy = lastY - sy;

        if (dt > MAX_TIME) return;
        if (Math.abs(dy) > MAX_DY) return;

        const ok =
          (sx <= EDGE && dx >= MIN_DX) ||
          (sx >= window.innerWidth - EDGE && dx <= -MIN_DX);

        if (ok) goHomeOrBack();
      },
      { passive: true }
    );
  })();


  // ===== زر الخروج (ديسكتوب) =====
  if (chatExitBtn) {
    chatExitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("[Inbox] chatExitBtn clicked");

      if (window.history.length > 1) window.history.back();
      else window.location.href = "./index.html";
    });
                  clearReplyDraft();
              } else {
    console.warn("[Inbox] chatExitBtn غير موجود في DOM.");
  }

  // ===== تغيير عرض الشاشة =====
  window.addEventListener("resize", () => {
    if (!inboxPage) return;
    if (!isMobileView()) inboxPage.classList.remove("show-chat");
  });

  // ===== قائمة الثلاث نقاط =====
  if (chatMoreBtn && chatOptionsMenu) {
    chatMoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      chatOptionsMenu.classList.toggle("is-open");
    });

    document.addEventListener("click", () => {
      chatOptionsMenu.classList.remove("is-open");
    });

    chatOptionsMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = e.target.closest(".chat-options-item");
      if (!item) return;
      const action = item.dataset.action;
      handleChatMenuAction(action);
      chatOptionsMenu.classList.remove("is-open");
    });
  }

  async function handleChatMenuAction(action) {
    switch (action) {
      case "search-chat":
        openChatSearch();
        break;

      case "view-profile":
        // ✅ في القنوات/المجموعات: هذا زر "معلومات" وليس بروفايل مستخدم
        if (activeSpaceCtx?.type === "channel") {
          showToast("معلومات القناة (واجهة لاحقاً)", "info");
          break;
        }
        if (activeSpaceCtx?.type === "group") {
          showToast("معلومات المجموعة (واجهة لاحقاً)", "info");
          break;
        }
        if (!activeConversationUserId) {
          showToast("ما في محادثة محددة حالياً", "warning");
          return;
        }
        window.location.href = `profile.html?userId=${activeConversationUserId}`;
        break;

      case "mute":
        toggleMuteConversation();
        break;

      case "clear-chat":
        await clearChatUI();
        break;

      case "block":
        showToast("واجهة حظر المستخدم لاحقاً", "info");
        break;

      case "report":
        showToast("الإبلاغ من داخل المحادثة لاحقاً", "info");
        break;

      default:
        console.warn("Unknown chat action:", action);
    }
  }

  function toggleMuteConversation() {
    const activeCard = document.querySelector(".conversation-item.active");
    if (!activeCard) return;
    activeCard.classList.toggle("is-muted");
    showToast(
      activeCard.classList.contains("is-muted")
        ? "تم كتم المحادثة"
        : "تم إلغاء كتم المحادثة",
      "info"
    );
  }

  async function clearChatUI() {
  if (!activeConversationId) {
    showToast("ما في محادثة محددة حالياً", "warning");
    return;
  }

  const ok = await uiConfirm({
    title: "مسح المحادثة",
    message: "بدك تمسح محتوى المحادثة عندك؟ (الطرف الآخر ما بيتأثر)",
    okText: "مسح",
    cancelText: "إلغاء",
  });
  if (!ok) return;

  // ✅ channels: prevent clear for non-admin
  if (activeSpaceCtx?.isChannel && !activeSpaceCtx?.isAdmin) {
    showToast("هذه قناة — لا يمكنك مسحها", "warn");
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/chat/conversations/${encodeURIComponent(activeConversationId)}/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
    });

    if (!resp.ok) {
      let msg = "تعذر مسح المحادثة";
      try {
        const j = await resp.json();
        if (j?.msg) msg = j.msg;
      } catch {}
      throw new Error(msg);
    }

    // ✅ امسح الواجهة + صفّر pagination state
    if (chatMessagesEl) chatMessagesEl.innerHTML = "";
    seenMessageIds = new Set();
    beforeCursor = null;
    hasMoreOlder = false; // لأنه صارت فاضية عندي
    showToast("تم مسح المحادثة عندك", "success");

    // ✅ حدّث قائمة المحادثات (حتى تختفي إذا عندك deletedFor على Conversation)
    if (typeof loadConversations === "function") {
      try { loadConversations(); } catch {}
    }
  } catch (e) {
    console.error("clearChatUI error:", e);
    showToast(e?.message || "تعذر مسح المحادثة", "error");
  }
}

  // ===== إرسال رسالة نصية =====
  async function handleSendMessage() {
    if (!chatInput || !chatMessagesEl) return;
    const text = (chatInput.value || "").trim();
    const hasPending = Array.isArray(pendingAttachItems) && pendingAttachItems.length > 0;
    // ✅ Snapshot للرد حتى ما يضيع مع أي تنظيف/إرسال مرفقات
    const replySnap = replyDraft ? { msgId: replyDraft.msgId, previewText: replyDraft.previewText } : null;

    // ✅ يسمح بإرسال مرفقات بدون نص
    if (!text && !hasPending) return;

    // ✅ لو في مرفقات معلّقة: ارفعها وأرسلها كرسالة واحدة
    if (hasPending) {
      await sendAttachmentMessage(pendingAttachItems.map((x) => x.file), text, { fromPending: true });
      // نظّف الإدخال/المعاينات
      if (chatInput) chatInput.value = "";
      updateSendMicState();
      clearPendingAttachments();
      return;
    }

    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    try {
      if (!activeConversationId && activeConversationUserId) {
        const conv = await startConversationWithUser(activeConversationUserId);
        activeConversationId = conv._id;
      }

      if (!activeConversationId) {
        showToast("اختر محادثة أو اضغط مراسلة من البروفايل", "warning");
        return;
      }

      if (!socket || !socket.connected) {
        socket = connectSocket();
        if (!socket) throw new Error("تعذر الاتصال بالسيرفر الفوري");
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const tempMessage = {
        _id: tempId,
        text,
        sender: {
          _id: currentUserId,
          username: currentUser?.username || "",
          avatar: currentUser?.avatar || "",
        },
        createdAt: new Date(),
        conversation: activeConversationId,
        isTemp: true,
        clientTempId: tempId,
        // Reply (اختياري)
        replyTo: replyDraft?.msgId || null,
        replyPreview: replyDraft?.previewText || "",
      };

      addMessageToUI(tempMessage);

      const outKey = buildOutboxKey({
        conversationId: activeConversationId,
        senderId: String(currentUserId),
        text,
        attachments: [],
        replyTo: replySnap?.msgId || "",
        forwardOf: "",
        kind: "text",
      });
      registerPendingOutbox(outKey, tempId);

      chatInput.value = "";
      updateSendMicState();
      clearReplyDraft();

      socket.emit("send-message", {
        clientTempId: tempId,
        conversationId: activeConversationId,
        text,
        senderId: currentUserId,
        receiverId: activeConversationUserId,
        replyTo: tempMessage.replyTo,
        replyPreview: tempMessage.replyTo
          ? { type: "text", text: tempMessage.replyPreview || "" }
          : null,
      });

      chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    } catch (err) {
      console.error("send message error:", err);
      showToast(err.message || "تعذر إرسال الرسالة", "error");
    }
  }
  // ===== إرسال المرفقات (Upload -> Message) =====
  async function uploadAttachmentToServer(file) {
    if (!file) throw new Error("لا يوجد ملف");
    const fd = new FormData();
    // السيرفر يستقبل "file" (وسنحاول أيضاً "attachment" للتوافق)
    fd.append("file", file, file.name || "upload");
    try {
      const res = await apiRequest("/chat/upload/attachment", { method: "POST", body: fd });
      // نتوقع { attachment: {...} } أو مباشرة { url,type,... }
      const att = res?.attachment || res?.data?.attachment || res;
      const url = att?.url || att?.path || att?.fileUrl || att?.data?.url;
      if (!url) throw new Error("الرفع نجح لكن لم يرجع رابط");
      return {
        url,
        type: att?.type || guessFileKind(file),
        originalName: att?.originalName || file.name || "",
        size: att?.size ?? file.size ?? 0,
        mimeType: att?.mimeType || att?.mime || file.type || "",
        duration: Number(att?.duration || 0) || 0,
      };
    } catch (e) {
      // fallback قديم: /chat/upload-audio (لو كان صوت)
      if (String(file.type || "").startsWith("audio/")) {
        const blob = file;
        const url = await uploadAudioBlobToServer(blob, file.name || "voice.webm", 0);
        return {
          url,
          type: "audio",
          originalName: file.name || "",
          size: file.size || 0,
          mimeType: file.type || "audio/webm",
          duration: 0,
        };
      }
      throw e;
    }
  }

  function guessFileKind(file) {
    const mt = String(file?.type || "").toLowerCase();
    if (mt.startsWith("image/")) return "image";
    if (mt.startsWith("video/")) return "video";
    if (mt.startsWith("audio/")) return "audio";
    return "file";
  }

  async function sendAttachmentMessage(files, text = "", opts = {}) {
    if (!files || !files.length) return;

    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    try {
      if (!activeConversationId && activeConversationUserId) {
        const conv = await startConversationWithUser(activeConversationUserId);
        activeConversationId = conv._id;
      }

      if (!activeConversationId) {
        showToast("اختر محادثة أو اضغط مراسلة من البروفايل", "warning");
        return;
      }

      // 1) ارفع الملفات فعلياً للسيرفر (uploads) وخد URLs
      showToast("جارٍ رفع المرفقات...", "info");
      const attachments = [];
      for (const f of Array.from(files)) {
        const att = await uploadAttachmentToServer(f);
        attachments.push(att);
      }

      // 2) أنشئ Temp message بالواجهة (علشان إحساس السرعة)
      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const tempMessage = {
        _id: tempId,
        text: String(text || ""),
        sender: {
          _id: currentUserId,
          username: currentUser?.username || "",
          avatar: currentUser?.avatar || "",
        },
        createdAt: new Date(),
        conversation: activeConversationId,
        isTemp: true,
        clientTempId: tempId,
        type: attachments.length ? (attachments[0]?.type || "file") : "text",
        attachments: attachments.map((a) => ({
          ...a,
          // لو السيرفر رجع url نسبي، buildFileUrl يتعامل معه وقت العرض
        })),
        replyTo: replyDraft?.msgId || null,
        replyPreview: replyDraft?.msgId
          ? { type: "text", text: replyDraft?.previewText || "" }
          : null,
      };

      // ضع بصمة بالـ outbox لمنع التكرار
      const outKey = buildOutboxKey({
        conversationId: activeConversationId,
        senderId: String(currentUserId),
        text: tempMessage.text || "",
        attachments: tempMessage.attachments || [],
        replyTo: tempMessage.replyTo || "",
        forwardOf: "",
        kind: tempMessage.type || "",
      });
      registerPendingOutbox(outKey, tempId);

      // أضف للواجهة فوراً
      window.__inbox?.addMessageToUI?.(tempMessage);
      initMediaViewer();
      scrollChatToBottom({ markSeen: false });

      // 3) إرسال عبر السوكيت (الرسالة النهائية تحفظ بالـ DB)
      // ✅ مهم: لا تعتمد على replyDraft هنا لأنه قد يُمسح قبل الإرسال
      const _sendReplyTo = tempMessage.replyTo || null;
      const _sendReplyPreview = tempMessage.replyTo ? (tempMessage.replyPreview || { type: "text", text: "" }) : null;

      clearReplyDraft();

      if (!socket || !socket.connected) socket = connectSocket();

      socket.emit("send-message", {
        clientTempId: tempId,
        conversationId: activeConversationId,
        text: String(text || ""),
        senderId: currentUserId,
        receiverId: activeConversationUserId,
        attachments,
        replyTo: _sendReplyTo,
        replyPreview: _sendReplyPreview,
      });
if (!opts?.silent) showToast("تم إرسال المرفق", "success");
    } catch (err) {
      console.error("send attachment error:", err);
      showToast(err.message || "تعذر إرسال المرفقات", "error");
    }
  }


  if (chatSendBtn && chatInput && chatMessagesEl) {
    chatSendBtn.addEventListener("click", () => {
      handleSendMessage();
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    chatInput.addEventListener("input", () => {
      updateSendMicState();
      sendTypingIndicator(chatInput.value.trim().length > 0);
    });

    chatInput.addEventListener("blur", () => {
      sendTypingIndicator(false);
    });

    updateSendMicState();
  }

  // ===== تبديل بين زر الإرسال والمايك =====
  function updateSendMicState() {
    if (!chatInputBar || !chatInput) return;

    const hasText = (chatInput.value || "").trim().length > 0;

    // ✅ مهم: وجود مرفقات معلّقة لازم يُظهر زر الإرسال حتى لو ما في نص
    const hasPending =
      Array.isArray(pendingAttachItems) && pendingAttachItems.length > 0;

    const shouldShowSend = hasText || hasPending;

    if (shouldShowSend) chatInputBar.classList.add("has-text");
    else chatInputBar.classList.remove("has-text");
  }

  // ===== واجهة التسجيل الصوتي =====
  function createRecordingChip() {
    if (!chatInputBar) return null;
    let chip = chatInputBar.querySelector(".chat-recording-chip");
    if (!chip) {
      chip = document.createElement("div");
      chip.className = "chat-recording-chip";
      chip.innerHTML = `
        <span class="chat-recording-chip-dot"></span>
        <span class="chat-recording-chip-text">تسجيل... <span class="time">0:00</span></span>
      `;
      chatInputBar.appendChild(chip);
    }
    return chip;
  }

  function startRecordingUI() {
    if (!chatMicBtn) return;
    chatMicBtn.classList.add("voice-recording");

    const chip = createRecordingChip();
    const timeSpan = chip?.querySelector(".time");

    recordingStartTime = Date.now();
    if (recordingTimerId) clearInterval(recordingTimerId);

    recordingTimerId = setInterval(() => {
      if (!recordingStartTime || !timeSpan) return;
      const elapsed = (Date.now() - recordingStartTime) / 1000;
      timeSpan.textContent = formatSeconds(elapsed);
    }, 500);
  }

  function stopRecordingUI() {
    if (chatMicBtn) chatMicBtn.classList.remove("voice-recording");
    if (recordingTimerId) {
      clearInterval(recordingTimerId);
      recordingTimerId = null;
    }
    recordingStartTime = null;

    if (chatInputBar) {
      const chip = chatInputBar.querySelector(".chat-recording-chip");
      if (chip) chip.remove();
    }
  }

  // ===== تسجيل رسالة صوتية (ملف حقيقي على السيرفر) =====
  if (chatMicBtn && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    chatMicBtn.addEventListener("click", async () => {
      try {
        if (!activeConversationId && activeConversationUserId) {
          const conv = await startConversationWithUser(activeConversationUserId);
          activeConversationId = conv._id;
        }
        if (!activeConversationId || !activeConversationUserId) {
          showToast("اختر محادثة أولاً قبل إرسال صوت", "warning");
          return;
        }

        if (!isRecording) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

          let options = {};
          const prefer = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
          for (const mt of prefer) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported?.(mt)) {
              options = { mimeType: mt };
              break;
            }
          }

          mediaRecorder = new MediaRecorder(stream, options);
          audioChunks = [];

          mediaRecorder.addEventListener("dataavailable", (e) => {
            if (e.data && e.data.size > 0) audioChunks.push(e.data);
          });

          mediaRecorder.addEventListener("stop", async () => {
            try {
              const mime = mediaRecorder?.mimeType || "audio/webm";
              const blob = new Blob(audioChunks, { type: mime });

              try {
                stream.getTracks().forEach((t) => t.stop());
              } catch {}

              const durationSec =
                recordingStartTime
                  ? Math.max(1, Math.round((Date.now() - recordingStartTime) / 1000))
                  : 0;

              stopRecordingUI();

              if (!blob || !blob.size) {
                showToast("فشل تسجيل الصوت", "error");
                return;
              }

              // ✅ (بدون تيمب) نرفع أولاً ثم نرسل/نرسم الرسالة كملف حقيقي فقط
              if (!SILENT_VOICE_FEEDBACK) showToast("جارٍ رفع الصوت للسيرفر...", "info");

              // ✅ FIX: اسم ملف حسب الـ mime (بدل .webm دائماً)
              const ext = mime.includes("ogg") ? "ogg" : "webm";
              const filename = `voice-${Date.now()}.${ext}`;

              // ارفع للباك-إند (ويرجع رابط ملف حقيقي)
              const uploadedUrl = await uploadAudioBlobToServer(blob, filename, durationSec);


              // ✅ التقط بيانات الرد قبل أي مسح/تغييرات
              const replySnap = replyDraft ? { msgId: replyDraft.msgId, previewText: replyDraft.previewText } : null;
              // ✅ اظهار الرسالة الصوتية فوراً عند المرسل (بدون انتظار السوكيت)
              // ملاحظة: هذه رسالة "قيد الإرسال" وسيتم تثبيتها عند وصول new-message / message-sent
              const localUrl = URL.createObjectURL(blob);
              const tempId = `temp-voice-${Date.now()}`;
              const tempMsg = {
                _id: tempId,
                text: "",
                sender: { _id: currentUserId, username: currentUser?.username || "", avatar: currentUser?.avatar || "" },
                createdAt: new Date(),
                conversation: activeConversationId,
                attachments: [
                  {
                    type: "audio",
                    url: localUrl,
                    fallbackUrl: uploadedUrl,
                    originalName: "رسالة صوتية",
                    duration: durationSec,
                    mimeType: mime,
                  },
                ],
                isTemp: true,
                clientTempId: tempId,
              };

              try {
                addMessageToUI(tempMsg);

              // ✅ سجلّ رسالة الصوت كمعلّقة لمنع التكرار
              const voiceKey = buildOutboxKey({
                conversationId: activeConversationId,
                senderId: String(currentUserId),
                text: "",
                attachments: [
                  { type: "audio", url: uploadedUrl, originalName: "رسالة صوتية", duration: durationSec },
                ],
                replyTo: replyDraft?.msgId || "",
                forwardOf: "",
                kind: "audio",
              });
              registerPendingOutbox(voiceKey, tempId);

                initMediaViewer();

    if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
              } catch (e) {
                console.warn('Failed to render temp voice msg', e);
              }


              if (!socket || !socket.connected) socket = connectSocket();

              if (socket && socket.connected) {
                // نرسل للسيرفر → السيرفر يحفظ DB ويعمل broadcast للطرفين
                socket.emit("send-message", {
                  clientTempId: tempId,
                  conversationId: activeConversationId,
                  text: "",
                  senderId: currentUserId,
                  receiverId: activeConversationUserId,
                  attachments: [
                    {
                      type: "audio",
                      url: uploadedUrl,
                      originalName: "رسالة صوتية",
                      duration: durationSec,
                    },
                  ],
                  replyTo: replyDraft?.msgId || null,
                  replyPreview: replyDraft?.msgId ? { type: "text", text: replyDraft?.previewText || "" } : null,
                });
              } else {
                throw new Error("تعذر الاتصال بالسيرفر الفوري لإرسال الصوت");
              }
if (!SILENT_VOICE_FEEDBACK) showToast("تم إرسال الرسالة الصوتية ✅", "success");
            } catch (e) {
              console.error("voice stop handler error:", e);
              stopRecordingUI();
              showToast(e.message || "تعذر رفع/إرسال الصوت", "error");
            } finally {
              isRecording = false;
              mediaRecorder = null;
              audioChunks = [];
            }
          });

          mediaRecorder.start();
          isRecording = true;
          startRecordingUI();

          if (!SILENT_VOICE_FEEDBACK) showToast("جارٍ تسجيل رسالة صوتية...", "info");
        } else {
          try {
            mediaRecorder.stop();
          } catch {}
          isRecording = false;

          if (!SILENT_VOICE_FEEDBACK) showToast("تم إيقاف التسجيل", "success");
        }
      } catch (err) {
        console.error("Microphone error:", err);
        stopRecordingUI();
        isRecording = false;
        showToast("المتصفح منع الوصول للمايك", "error");
      }
    });
  } else if (chatMicBtn) {
    chatMicBtn.disabled = true;
    chatMicBtn.title = "المتصفح لا يدعم تسجيل الصوت";
  }

  // ===== فتح File Picker للمرفقات =====
  function openFilePicker(accept, callback) {
    hiddenFileInput.accept = accept;
    hiddenFileInput.onchange = () => {
      const files = Array.from(hiddenFileInput.files || []);
      hiddenFileInput.value = "";
      if (files.length && typeof callback === "function") callback(files);
    };
    hiddenFileInput.click();
  }

  // ===================== (+) Attachments Preview & Queue =====================
  function ensureAttachPreviewUI() {
    if (!chatInputBar) return;
    if (attachPreviewWrap && document.body.contains(attachPreviewWrap)) return;

    // Inject minimal style once
    if (!document.getElementById("saepelAttachPreviewStyle")) {
      const st = document.createElement("style");
      st.id = "saepelAttachPreviewStyle";
      st.textContent = `
        .attach-preview-wrap{display:none;gap:10px;align-items:center;padding:8px 10px;margin:8px 10px 0;border-radius:16px;background:rgba(255,255,255,.06);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.10)}
        .attach-preview-wrap.show{display:flex}
        .attach-preview-list{display:flex;gap:8px;align-items:center;flex:1;overflow:auto;scrollbar-width:thin}
        .attach-chip{position:relative;min-width:64px;height:54px;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center}
        .attach-chip img,.attach-chip video{width:100%;height:100%;object-fit:cover}
        .attach-chip .attach-ico{font-size:20px;opacity:.9}
        .attach-chip .attach-name{position:absolute;left:6px;right:26px;bottom:4px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,.35);padding:2px 6px;border-radius:999px}
        .attach-chip .attach-remove{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:999px;border:0;cursor:pointer;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center}
        .attach-preview-clear{border:0;cursor:pointer;border-radius:12px;padding:8px 10px;background:rgba(255,255,255,.10);color:inherit}
      `;
      document.head.appendChild(st);
    }

    // Create container
    attachPreviewWrap = document.getElementById("attachPreviewWrap");
    if (!attachPreviewWrap) {
      attachPreviewWrap = document.createElement("div");
      attachPreviewWrap.id = "attachPreviewWrap";
      attachPreviewWrap.className = "attach-preview-wrap";
      attachPreviewWrap.innerHTML = `
        <div class="attach-preview-list" id="attachPreviewList"></div>
        <button class="attach-preview-clear" id="attachPreviewClearBtn" type="button" title="مسح المرفقات">مسح</button>
      `;
      // insert above input bar if possible
      chatInputBar.prepend(attachPreviewWrap);
    }

    attachPreviewList = attachPreviewWrap.querySelector("#attachPreviewList");
    attachPreviewClearBtn = attachPreviewWrap.querySelector("#attachPreviewClearBtn");

    attachPreviewClearBtn?.addEventListener("click", () => {
      clearPendingAttachments();
    });
  }

  function clearPendingAttachments() {
    // revoke previews
    pendingAttachItems.forEach((x) => {
      try {
        if (x?.previewUrl && x.previewUrl.startsWith("blob:")) URL.revokeObjectURL(x.previewUrl);
      } catch {}
    });
    pendingAttachItems = [];
    renderPendingAttachments();
  }

  function addPendingFiles(files) {
    if (!files || !files.length) return;
    ensureAttachPreviewUI();

    const list = Array.from(files);
    for (const f of list) {
      const id = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const kind = guessFileKind(f);
      let previewUrl = "";
      try {
        // preview only for media (image/video/audio show icon)
        if (kind === "image" || kind === "video") previewUrl = URL.createObjectURL(f);
      } catch {}
      pendingAttachItems.push({ id, file: f, previewUrl, kind });
    }
    renderPendingAttachments();
  }

  function renderPendingAttachments() {
    if (!attachPreviewWrap || !attachPreviewList) {
      if (pendingAttachItems.length) ensureAttachPreviewUI();
      if (!attachPreviewList) return;
    }

    attachPreviewList.innerHTML = "";
    pendingAttachItems.forEach((item) => {
      const el = document.createElement("div");
      el.className = "attach-chip";
      el.dataset.id = item.id;

      const name = item.file?.name || "ملف";
      const kind = item.kind || "file";

      if (kind === "image" && item.previewUrl) {
        el.innerHTML = `
          <button class="attach-remove" type="button" aria-label="remove">×</button>
          <img src="${item.previewUrl}" alt="${escapeHtml(name)}" />
          <div class="attach-name">${escapeHtml(name)}</div>
        `;
      } else if (kind === "video" && item.previewUrl) {
        el.innerHTML = `
          <button class="attach-remove" type="button" aria-label="remove">×</button>
          <video src="${item.previewUrl}" muted playsinline></video>
          <div class="attach-name">${escapeHtml(name)}</div>
        `;
      } else {
        const ico =
          kind === "audio"
            ? '<i class="fa-solid fa-music attach-ico"></i>'
            : '<i class="fa-solid fa-paperclip attach-ico"></i>';
        el.innerHTML = `
          <button class="attach-remove" type="button" aria-label="remove">×</button>
          ${ico}
          <div class="attach-name">${escapeHtml(name)}</div>
        `;
      }

      el.querySelector(".attach-remove")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removePendingAttachment(item.id);
      });

      attachPreviewList.appendChild(el);
    });

    if (pendingAttachItems.length) attachPreviewWrap.classList.add("show");
    else attachPreviewWrap.classList.remove("show");

    // ✅ حدّث حالة زر الإرسال/المايك حسب وجود مرفقات
    updateSendMicState();

  }

  function removePendingAttachment(id) {
    const idx = pendingAttachItems.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const it = pendingAttachItems[idx];
    try {
      if (it?.previewUrl && it.previewUrl.startsWith("blob:")) URL.revokeObjectURL(it.previewUrl);
    } catch {}
    pendingAttachItems.splice(idx, 1);
    renderPendingAttachments();
  }

  // ===================== (+) Location & Contact =====================
  async function sendLocationMessage() {
    try {
      closeActionsMenu?.();
    } catch {}

    if (!navigator.geolocation) {
      showToast("المتصفح لا يدعم تحديد الموقع", "error");
      return;
    }

    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    const getPos = () =>
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      });

    try {
      showToast("جارٍ تحديد موقعك...", "info");
      const pos = await getPos();
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") throw new Error("تعذر تحديد الإحداثيات");

      const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      // أرسل كرسالة نصية + meta (السيرفر سيحفظها لو مدعوم)
      await sendMetaMessage({
        kind: "location",
        text: "📍 موقع",
        meta: { location: { lat, lng, url: mapUrl } },
      });
    } catch (e) {
      console.warn("geolocation error:", e);
      showToast("تعذر تحديد الموقع (تأكد من الصلاحيات)", "error");
    }
  }

  async function pickContactViaApi() {
    // Contact Picker API (Chrome Android غالباً)
    try {
      if (navigator.contacts && navigator.contacts.select) {
        const res = await navigator.contacts.select(["name", "tel"], { multiple: false });
        const c = Array.isArray(res) ? res[0] : null;
        const name = (c?.name && c.name[0]) || "";
        const tel = (c?.tel && c.tel[0]) || "";
        if (name || tel) return { name, phone: tel };
      }
    } catch {}
    return null;
  }

  async function sendContactMessage() {
    try {
      closeActionsMenu?.();
    } catch {}

    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    let contact = await pickContactViaApi();
    if (!contact) {
      const name = prompt("اسم جهة الاتصال:");
      if (!name) return;
      const phone = prompt("رقم الهاتف (اختياري):") || "";
      contact = { name, phone };
    }

    const safeName = String(contact?.name || "").trim();
    const safePhone = String(contact?.phone || "").trim();

    await sendMetaMessage({
      kind: "contact",
      text: `👤 ${safeName}${safePhone ? " — " + safePhone : ""}`,
      meta: { contact: { name: safeName, phone: safePhone } },
    });
  }

  async function sendMetaMessage({ kind = "text", text = "", meta = {} }) {
    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    try {
      if (!activeConversationId && activeConversationUserId) {
        const conv = await startConversationWithUser(activeConversationUserId);
        activeConversationId = conv._id;
      }

      if (!activeConversationId) {
        showToast("اختر محادثة أو اضغط مراسلة من البروفايل", "warning");
        return;
      }

      const tempId = `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const tempMessage = {
        _id: tempId,
        text: String(text || ""),
        sender: {
          _id: currentUserId,
          username: currentUser?.username || "",
          avatar: currentUser?.avatar || "",
        },
        createdAt: new Date(),
        conversation: activeConversationId,
        isTemp: true,
        clientTempId: tempId,
        type: "text",
        meta: meta || {},
      };

      const outKey = buildOutboxKey({
        conversationId: activeConversationId,
        senderId: String(currentUserId),
        text: tempMessage.text || "",
        attachments: [],
        replyTo: "",
        forwardOf: "",
        kind: kind || "text",
      });
      registerPendingOutbox(outKey, tempId);

      window.__inbox?.addMessageToUI?.(tempMessage);
      scrollChatToBottom({ markSeen: false });

      if (!socket || !socket.connected) socket = connectSocket();
      socket.emit("send-message", {
        conversationId: activeConversationId,
        text: String(text || ""),
        senderId: currentUserId,
        receiverId: activeConversationUserId,
        attachments: [],
        meta: meta || {},
        kind: kind || "text",
        clientTempId: tempId,
      });
    } catch (e) {
      console.error("sendMetaMessage error:", e);
      showToast(e.message || "تعذر إرسال الرسالة", "error");
    }
  }



  
  function bindPlusMenuActions() {
    // event delegation على قائمة (+)
    if (chatActionsMenu && !chatActionsMenu.__saepelBound) {
      chatActionsMenu.__saepelBound = true;

      chatActionsMenu.addEventListener("click", (e) => {
        const btn = e.target.closest("button, a, [data-action], [data-kind]");
        if (!btn) return;

        const act =
          btn.getAttribute("data-action") ||
          btn.getAttribute("data-kind") ||
          btn.id ||
          "";

        const action = String(act || "").toLowerCase();

        const clickPick = (accept, { capture = "" } = {}) => {
          try {
            if (capture) hiddenFileInput.setAttribute("capture", capture);
            else hiddenFileInput.removeAttribute("capture");
          } catch {}
          openFilePicker(accept, (files) => addPendingFiles(files));
          try {
            closeActionsMenu();
          } catch {}
        };

        // أسماء أكشن متوقعة (عدّة احتمالات حسب HTML)
        if (action.includes("image")) return clickPick("image/*");
        if (action.includes("video")) return clickPick("video/*");
        if (action.includes("camera")) return clickPick("image/*", { capture: "environment" });
        if (action.includes("file") || action.includes("document")) return clickPick("*/*");
        if (action.includes("music") || action.includes("audio")) return clickPick("audio/*");

        if (action.includes("location") || action.includes("map")) {
          e.preventDefault();
          e.stopPropagation();
          sendLocationMessage();
          return;
        }

        if (action.includes("contact") || action.includes("person")) {
          e.preventDefault();
          e.stopPropagation();
          sendContactMessage();
          return;
        }
      });
    }

    // fallback: لو الأزرار خارج chatActionsMenu
    const bySel = (sel, fn) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.__saepelBound) return;
        el.__saepelBound = true;
        el.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          fn();
        });
      });
    };

    bySel('[data-action="attach-image"], #attachImageBtn, .attach-image-btn', () =>
      openFilePicker("image/*", (files) => addPendingFiles(files))
    );
    bySel('[data-action="attach-video"], #attachVideoBtn, .attach-video-btn', () =>
      openFilePicker("video/*", (files) => addPendingFiles(files))
    );
    bySel('[data-action="attach-camera"], #attachCameraBtn, .attach-camera-btn', () => {
      try { hiddenFileInput.setAttribute("capture", "environment"); } catch {}
      openFilePicker("image/*", (files) => addPendingFiles(files));
    });
    bySel('[data-action="attach-file"], #attachFileBtn, .attach-file-btn', () =>
      openFilePicker("*/*", (files) => addPendingFiles(files))
    );
    bySel('[data-action="attach-music"], #attachMusicBtn, .attach-music-btn', () =>
      openFilePicker("audio/*", (files) => addPendingFiles(files))
    );
    bySel('[data-action="attach-location"], #attachLocationBtn, .attach-location-btn', () =>
      sendLocationMessage()
    );
    bySel('[data-action="attach-contact"], #attachContactBtn, .attach-contact-btn', () =>
      sendContactMessage()
    );
  }

// ===== رفع الملفات كرسالة في المحادثة =====
  async function uploadChatFiles(files) {
    if (!files || !files.length) return;

    if (!currentUserId) {
      showToast("يلزم تسجيل الدخول لاستخدام الرسائل", "error");
      return;
    }

    try {
      if (!activeConversationId && activeConversationUserId) {
        const conv = await startConversationWithUser(activeConversationUserId);
        activeConversationId = conv._id;
      }

      if (!activeConversationId) {
        showToast("اختر محادثة أو اضغط مراسلة من البروفايل", "warning");
        return;
      }

      const text = chatInput?.value.trim() || "";
      addPendingFiles(files);
      renderPendingAttachments();
      showToast("تمت إضافة المرفق، اضغط إرسال", "success");

      if (chatInput && text) {
        chatInput.value = "";
        updateSendMicState();
      }

      showToast("تم إرسال المرفق", "success");
    } catch (err) {
      console.error("uploadChatFiles error:", err);
      showToast(err.message || "تعذر إرسال المرفقات", "error");
    }
  }

  // ===== قائمة (+) الاحترافية + زر الإيموجي داخل حقل الكتابة =====
  // مبدأنا: لا نغيّر الباك-إند ولا نكسر أي ميزة—بس UX/DOM هنا.
  const inputWrapper = document.querySelector(".chat-input-wrapper");
  const chatInputEl = document.getElementById("chatInput");

  // =========================
  // Emoji + Stickers (Stable)
  // =========================

  // زر الإيموجي: استخدم الموجود إن وُجد، وإلا أنشئه مرة واحدة فقط
  let chatEmojiBtn =
    document.getElementById("chatEmojiBtn") ||
    document.querySelector(".chat-emoji-btn") ||
    document.querySelector('[data-action="emoji"]');

  if (!chatEmojiBtn && inputWrapper) {
    chatEmojiBtn = document.createElement("button");
    chatEmojiBtn.type = "button";
    chatEmojiBtn.id = "chatEmojiBtn";
    chatEmojiBtn.className = "chat-emoji-btn";
    chatEmojiBtn.title = "الرموز التعبيرية";
    chatEmojiBtn.setAttribute("aria-label", "الرموز التعبيرية");
    chatEmojiBtn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
    inputWrapper.prepend(chatEmojiBtn);
  }

  // منع التكرار (لو بقي زر من نسخ قديمة)
  if (inputWrapper) {
    const all = Array.from(inputWrapper.querySelectorAll("#chatEmojiBtn,.chat-emoji-btn"));
    const keep = chatEmojiBtn || all[0] || null;
    all.forEach((b) => {
      if (keep && b !== keep) b.remove();
    });
    if (keep) {
      keep.id = "chatEmojiBtn";
      keep.classList.add("chat-emoji-btn");
      chatEmojiBtn = keep;
    }
  }

  // لوحة الإيموجي/الملصقات (معلّقة على body لتجنّب القصّ بسبب overflow)
  let emojiPanel = document.getElementById("chatEmojiPanel");
  if (!emojiPanel) {
    emojiPanel = document.createElement("div");
    emojiPanel.id = "chatEmojiPanel";
    emojiPanel.className = "emoji-panel";
    emojiPanel.innerHTML = `
      <div class="emoji-panel-top">
        <div class="emoji-tabs">
          <button type="button" class="emoji-tab is-active" data-tab="emoji">إيموجي</button>
          <button type="button" class="emoji-tab" data-tab="stickers">ملصقات</button>
        </div>
        <button type="button" class="emoji-close" aria-label="إغلاق">×</button>
      </div>

      <div class="emoji-panel-cats" data-pane="emoji"></div>
      <div class="emoji-panel-grid" data-pane="emoji"></div>

      <div class="emoji-panel-cats is-hidden" data-pane="stickers"></div>
      <div class="emoji-panel-grid is-hidden" data-pane="stickers"></div>
    `;
    document.body.appendChild(emojiPanel);
  }

  const emojiCloseBtn = emojiPanel.querySelector(".emoji-close");
  const emojiTabBtns = Array.from(emojiPanel.querySelectorAll(".emoji-tab"));

  // ===== Emoji data (أكثر + أقسام) =====
  const EMOJI_CATS = [
    { key: "faces", label: "😀", title: "وجوه", items: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 😘 😋 😛 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 😱 😨 😰 😥 😴 🤤 😪 😮 😯 😲 🤯 😳 🥴 🤢 🤮 🤧 😷".split(" ") },
    { key: "hearts", label: "❤️", title: "قلوب", items: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ❤️‍🔥 ❤️‍🩹".split(" ") },
    { key: "flowers", label: "🌸", title: "ورود", items: "🌸 🌺 🌹 🌷 🌻 💐 🌼 🪷 🍀 🌿 🌱 🌲 🌳 🍃".split(" ") },
    { key: "gestures", label: "👌", title: "إيماءات", items: "👍 👎 👌 ✌️ 🤞 🤟 🤘 👋 🤚 ✋ 🖐️ 🫶 🙌 👏 🤝 🙏 🫡 💪 🫵".split(" ") },
    { key: "symbols", label: "✨", title: "رموز", items: "✨ ⭐ 🌟 💫 🔥 🎉 🎊 ✅ ☑️ ❌ ❗ ❓ ⚠️ 🔔 💡 🎵 🎶 💯 💤 ♻️".split(" ") },
  ];

  // ===== Stickers (SVG مدمج – بدون ملفات/باك-إند) =====
  const STICKER_CATS = [
    { key: "react", label: "✨", title: "تفاعل", items: [
      { id:"ok", name:"تمام", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22c55e"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M50 86L32 68l10-10 8 8 34-34 10 10z" fill="url(#g)"/></svg>` },
      { id:"wow", name:"واو", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4fd1ff"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="56" r="6" fill="#0b1026"/><circle cx="76" cy="56" r="6" fill="#0b1026"/><circle cx="64" cy="80" r="12" fill="#0b1026"/></svg>` },
      { id:"fire", name:"نار", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 24c10 14 6 22 2 28 10-2 20 10 20 26 0 18-14 30-22 30S42 96 42 78c0-16 10-22 16-34 4-8 4-12 6-20z" fill="url(#g)"/></svg>` },
      { id:"party", name:"احتفال", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M38 82l18-44 40 18-20 44z" fill="url(#g)"/><circle cx="86" cy="38" r="6" fill="#ffd166"/><circle cx="96" cy="52" r="5" fill="#ff6bd5"/><circle cx="78" cy="54" r="4" fill="#4fd1ff"/></svg>` },
    ]},
    { key: "love", label: "❤️", title: "حب", items: [
      { id:"heart", name:"قلب", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6bd5"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 102S30 80 30 56c0-14 10-24 24-24 8 0 14 4 16 8 2-4 8-8 16-8 14 0 24 10 24 24 0 24-34 46-34 46z" fill="url(#g)"/></svg>` },
      { id:"rose", name:"وردة", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6bd5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 32c16 0 28 12 28 26 0 12-8 20-18 23 8 8 12 18 12 30H42c0-12 4-22 12-30-10-3-18-11-18-23 0-14 12-26 28-26z" fill="url(#g)"/><path d="M64 78v36" stroke="#22c55e" stroke-width="10" stroke-linecap="round"/></svg>` },
      { id:"spark", name:"لمعة", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd166"/><stop offset="1" stop-color="#ff6bd5"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><path d="M64 24l10 24 24 10-24 10-10 24-10-24-24-10 24-10z" fill="url(#g)"/></svg>` },
      { id:"kiss", name:"قبلة", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fb7185"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="60" r="30" fill="url(#g)"/><circle cx="54" cy="56" r="4" fill="#0b1026"/><circle cx="74" cy="56" r="4" fill="#0b1026"/><path d="M58 70c4 4 8 4 12 0" stroke="#0b1026" stroke-width="6" stroke-linecap="round"/></svg>` },
    ]},
    { key: "fun", label: "😂", title: "مرح", items: [
      { id:"lol", name:"ضحك", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd166"/><stop offset="1" stop-color="#ff6bd5"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="58" r="6" fill="#111827"/><circle cx="76" cy="58" r="6" fill="#111827"/><path d="M46 74c8 10 28 10 36 0" stroke="#111827" stroke-width="8" stroke-linecap="round"/></svg>` },
      { id:"angry", name:"زعل", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ef4444"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><path d="M46 58l16 8" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/><path d="M82 58l-16 8" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/><path d="M52 82c8-6 16-6 24 0" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>` },
      { id:"cool", name:"كول", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><rect x="38" y="52" width="52" height="12" rx="6" fill="#0b1026"/><path d="M48 78c10 10 22 10 32 0" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>` },
      { id:"think", name:"تفكير", svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a78bfa"/><stop offset="1" stop-color="#38bdf8"/></linearGradient></defs><rect rx="26" ry="26" width="128" height="128" fill="rgba(255,255,255,0.06)"/><circle cx="64" cy="64" r="38" fill="url(#g)"/><circle cx="52" cy="58" r="6" fill="#0b1026"/><circle cx="76" cy="58" r="6" fill="#0b1026"/><path d="M56 78h16" stroke="#0b1026" stroke-width="8" stroke-linecap="round"/></svg>` },
    ]},
  ];

  const stickerMap = new Map();
  STICKER_CATS.forEach(cat => cat.items.forEach(it => stickerMap.set(it.id, it)));

  function svgToDataUri(svg) {
    const compact = String(svg).replace(/\s+/g, " ").trim();
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(compact);
  }

  function insertAtCursor(el, text) {
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    el.value = before + text + after;
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function renderEmojiCats() {
    const catsWrap = emojiPanel.querySelector('.emoji-panel-cats[data-pane="emoji"]');
    const grid = emojiPanel.querySelector('.emoji-panel-grid[data-pane="emoji"]');
    if (!catsWrap || !grid) return;

    catsWrap.innerHTML = EMOJI_CATS.map((c, i) =>
      `<button type="button" class="emoji-cat ${i===0?'is-active':''}" data-cat="${c.key}" title="${c.title}">${c.label}</button>`
    ).join("");

    function fill(catKey) {
      const cat = EMOJI_CATS.find(x => x.key === catKey) || EMOJI_CATS[0];
      grid.innerHTML = cat.items.map(e => `<button type="button" class="emoji-item" data-emoji="${e}">${e}</button>`).join("");
    }
    fill(EMOJI_CATS[0].key);

    catsWrap.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".emoji-cat");
      if (!btn) return;
      catsWrap.querySelectorAll(".emoji-cat").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      fill(btn.getAttribute("data-cat"));
    });

    grid.addEventListener("click", (ev) => {
      const b = ev.target.closest(".emoji-item");
      if (!b) return;
      insertAtCursor(chatInputEl, b.getAttribute("data-emoji") || "");
    });
  }

  function renderStickerCats() {
    const catsWrap = emojiPanel.querySelector('.emoji-panel-cats[data-pane="stickers"]');
    const grid = emojiPanel.querySelector('.emoji-panel-grid[data-pane="stickers"]');
    if (!catsWrap || !grid) return;

    catsWrap.innerHTML = STICKER_CATS.map((c, i) =>
      `<button type="button" class="emoji-cat ${i===0?'is-active':''}" data-scat="${c.key}" title="${c.title}">${c.label}</button>`
    ).join("");

    function fill(catKey) {
      const cat = STICKER_CATS.find(x => x.key === catKey) || STICKER_CATS[0];
      grid.innerHTML = cat.items.map(it => {
        const uri = svgToDataUri(it.svg);
        return `<button type="button" class="sticker-item" data-sticker="${it.id}" title="${it.name}">
                  <img src="${uri}" alt="${it.name}" loading="lazy"/>
                </button>`;
      }).join("");
    }
    fill(STICKER_CATS[0].key);

    catsWrap.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".emoji-cat");
      if (!btn) return;
      catsWrap.querySelectorAll(".emoji-cat").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      fill(btn.getAttribute("data-scat"));
    });

    grid.addEventListener("click", (ev) => {
      const b = ev.target.closest(".sticker-item");
      if (!b) return;
      const id = b.getAttribute("data-sticker") || "";
      // نرسل كتوكِن؛ سيُعرض كملصق عند العرض
      insertAtCursor(chatInputEl, `::sticker:${id}::`);
    });
  }

  renderEmojiCats();
  renderStickerCats();

  function showPane(which) {
    emojiTabBtns.forEach(btn => btn.classList.toggle("is-active", btn.getAttribute("data-tab") === which));
    emojiPanel.querySelectorAll(".emoji-panel-cats, .emoji-panel-grid").forEach((el) => {
      el.classList.toggle("is-hidden", el.getAttribute("data-pane") !== which);
    });
  }

  emojiTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => showPane(btn.getAttribute("data-tab")));
  });

  // ================== Actions (+) Menu controls (stable) ==================
  // الهدف: تعريف closeActionsMenu وغيره لتفادي الأخطاء + إبقاء زر (+) شغال
  function closeActionsMenu() {
    if (!chatInputBar) return;
    chatInputBar.classList.remove("actions-open");
    document.body.classList.remove("actions-open");
  }

  function openActionsMenu() {
    if (!chatInputBar) return;
    // لو لوحة الإيموجي مفتوحة، سكّرها
    if (typeof closeEmojiPanel === "function") closeEmojiPanel();
    chatInputBar.classList.add("actions-open");
    document.body.classList.add("actions-open");
  }

  function toggleActionsMenu() {
    if (!chatInputBar) return;
    chatInputBar.classList.contains("actions-open") ? closeActionsMenu() : openActionsMenu();
  }

  // اربط زر (+) مرة واحدة
  (function bindActionsToggleOnce() {
    if (!chatActionsToggle || !chatInputBar) return;
    if (chatActionsToggle.__saepelBound) return;
    chatActionsToggle.__saepelBound = true;

    chatActionsToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleActionsMenu();
    });

    // اغلاق عند النقر خارج شريط الإدخال
    document.addEventListener("click", (e) => {
      if (!chatInputBar.classList.contains("actions-open")) return;
      const inside = e.target.closest(".chat-input-bar") || e.target.closest("#chatActionsMenu");
      if (!inside) closeActionsMenu();
    });

    // ESC يغلق
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeActionsMenu();
    });
  })();

  function positionEmojiPanel() {
    if (!emojiPanel || !chatInputBar) return;
    const r = chatInputBar.getBoundingClientRect();
    const bottom = Math.max(76, window.innerHeight - r.top + 10);
    emojiPanel.style.bottom = bottom + "px";
  }

  function openEmojiPanel() {
    if (!emojiPanel) return;
    closeActionsMenu();
    positionEmojiPanel();
    emojiPanel.classList.add("is-open");
    document.body.classList.add("emoji-open");
    chatEmojiBtn?.classList.add("is-active");
  }

  function closeEmojiPanel() {
    if (!emojiPanel) return;
    emojiPanel.classList.remove("is-open");
    document.body.classList.remove("emoji-open");
    chatEmojiBtn?.classList.remove("is-active");
  }

  function toggleEmojiPanel() {
    if (!emojiPanel) return;
    emojiPanel.classList.contains("is-open") ? closeEmojiPanel() : openEmojiPanel();
  }

  emojiCloseBtn?.addEventListener("click", closeEmojiPanel);

  document.addEventListener("click", (e) => {
    if (!emojiPanel.classList.contains("is-open")) return;
    const t = e.target;
    if (emojiPanel.contains(t) || (chatEmojiBtn && chatEmojiBtn.contains(t))) return;
    closeEmojiPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeEmojiPanel();
  });

  window.addEventListener("resize", () => {
    if (emojiPanel.classList.contains("is-open")) positionEmojiPanel();
  }, { passive: true });

  chatEmojiBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleEmojiPanel();
  });


// ===== أول تحميل =====
  loadConversations().then(() => {
    if (initialUserId) loadUserForDirectChat(initialUserId);
  });

  initMediaViewer();

    if (chatMessagesEl) chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
});

/* ===================================================================== */
/*  Calls (Audio/Video) - UI + Signaling عبر Socket.io (بدون WebRTC)      */
/*  ✅ معزول عن نظام Inbox (ما بيلمس الرسائل/المرفقات)                    */
/* ===================================================================== */

(function SaepelCalls() {
  if (window.__saepelCallsInit) return;
  window.__saepelCallsInit = true;

  const CallState = Object.freeze({
    IDLE: "idle",
    OUTGOING: "outgoing",
    INCOMING: "incoming",
    ACTIVE: "active",
  });

  let state = CallState.IDLE;
  let callId = null;
  let peerId = null;
  let callType = "audio"; // "audio" | "video"
  let timerT0 = 0;
  let timerInt = null;

  // ==== WebRTC runtime ====
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let role = null; // "caller" | "callee"
  let rtcConfigCache = null;
  let audioSender = null;
  let videoSender = null;

  // ==== WebRTC Perfect Negotiation (للسماح بتبديل/إضافة فيديو أثناء المكالمة) ====
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;

  function isPolitePeer() {
    // القاعدة البسيطة: المستلم (callee) يكون polite
    return role === "callee";
  }

  function qs(id) { return document.getElementById(id); }

  function getSock() {
    try { return window.socket || socket || null; } catch { return null; }
  }

  function ensureCallStyle() {
    if (document.getElementById("saepelCallStyle")) return;
    const st = document.createElement("style");
    st.id = "saepelCallStyle";
    st.textContent = `
      .call-overlay{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.52);backdrop-filter:blur(10px);z-index:9999}
      .call-overlay.show{display:flex}
      .call-sheet{width:min(560px,calc(100vw - 24px));border-radius:22px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.10)}
      .call-sheet.glassy{background:rgba(15,18,32,.78)}
      .call-top{display:flex;align-items:center;gap:12px;padding:14px 14px 10px}
      .call-badge{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12)}
      .call-head{flex:1;min-width:0}
      .call-title{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .call-sub{opacity:.85;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
      .call-close{border:0;background:transparent;color:inherit;width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:.9}
      .call-close:hover{background:rgba(255,255,255,.08)}
      .call-peer{display:flex;align-items:center;gap:12px;padding:8px 14px 10px}
      .call-avatar{width:54px;height:54px;border-radius:18px;overflow:hidden;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10)}
      .call-avatar img{width:100%;height:100%;object-fit:cover}
      .call-peer-name{font-weight:800}
      .call-peer-status{opacity:.75;font-size:12px;margin-top:2px}
      .call-media{position:relative;margin:0 14px 10px;border-radius:18px;overflow:hidden;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.08);aspect-ratio:16/10}
      .call-media.hide{display:none}
      .call-remote{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
      .call-local{position:absolute;right:12px;bottom:12px;width:118px;height:84px;border-radius:14px;object-fit:cover;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);box-shadow:0 16px 40px rgba(0,0,0,.35)}
      .call-audio-pill{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;color:rgba(255,255,255,.92);font-weight:800}
      .call-audio-pill i{opacity:.9}
      .call-timer-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 14px 10px}
      .call-timer{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.3px}
      .call-hint{opacity:.75;font-size:12px}
      .call-controls{padding:0 14px 12px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      .call-ctrl{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:inherit;border-radius:16px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer}
      .call-ctrl:hover{background:rgba(255,255,255,.10)}
      .call-ctrl.is-on{background:rgba(99,102,241,.18);border-color:rgba(99,102,241,.42)}
      .call-ctrl span{font-size:12px;opacity:.9}
      .call-actions{padding:0 14px 14px;display:flex;gap:10px;justify-content:flex-end}
      .call-btn{border:0;border-radius:16px;padding:10px 14px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-weight:800}
      .call-btn.secondary{background:rgba(255,255,255,.10);color:inherit}
      .call-btn.ok{background:rgba(34,197,94,.22);color:#eafff1;border:1px solid rgba(34,197,94,.35)}
      .call-btn.danger{background:rgba(239,68,68,.18);color:#ffecec;border:1px solid rgba(239,68,68,.35)}
      @media (max-width:520px){
        .call-controls{grid-template-columns:repeat(2,1fr)}
        .call-media{aspect-ratio:16/11}
        .call-local{width:104px;height:74px}
      }
    `;
    document.head.appendChild(st);
  }

  // نحاول نجيب الطرف الآخر من الهيدر الحالي (مضمون)
  function getPeerUiInfo() {
    const name = (chatUserNameEl && chatUserNameEl.textContent) ? chatUserNameEl.textContent.trim() : "مستخدم";
    const status = (chatUserStatusEl && chatUserStatusEl.textContent) ? chatUserStatusEl.textContent.trim() : "";
    const avatar = (chatAvatarImg && chatAvatarImg.src) ? chatAvatarImg.src : (qs("chatUserAvatar")?.src || "");
    return { name, status, avatar };
  }

  function requireConversationPeer() {
    try {
      const pid = (typeof activeConversationUserId !== "undefined") ? activeConversationUserId : null;
      if (!pid) {
        showToast("اختر محادثة أولاً قبل الاتصال", "warning");
        return null;
      }
      return String(pid);
    } catch {
      return null;
    }
  }

  function ensureOverlay() {
    ensureCallStyle();
    let ov = qs("callOverlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "callOverlay";
      ov.className = "call-overlay";
      ov.setAttribute("aria-hidden", "true");
      ov.innerHTML = `
        <div class="call-sheet glassy" role="dialog" aria-modal="true" aria-label="مكالمة">
          <div class="call-top">
            <div class="call-badge" id="callTypeBadge" aria-hidden="true"><i class="fa-solid fa-phone"></i></div>
            <div class="call-head">
              <div class="call-title" id="callTitle">مكالمة</div>
              <div class="call-sub" id="callSub">...</div>
            </div>
            <button type="button" class="call-close" id="callCloseBtn" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
          </div>

          <div class="call-peer">
            <div class="call-avatar" id="callPeerAvatar"><img id="callPeerAvatarImg" alt="Avatar" /></div>
            <div class="call-peer-meta">
              <div class="call-peer-name" id="callPeerName">مستخدم</div>
              <div class="call-peer-status" id="callPeerStatus">—</div>
            </div>
          </div>

          <div class="call-media" id="callMedia">
            <video id="callRemoteVideo" class="call-remote" autoplay playsinline></video>
            <video id="callLocalVideo" class="call-local" autoplay playsinline muted></video>
            <div class="call-audio-pill" id="callAudioPill" style="display:none">
              <i class="fa-solid fa-microphone-lines"></i>
              <span>مكالمة صوتية</span>
            </div>
          </div>

          <audio id="callRemoteAudio" autoplay></audio>

          <div class="call-timer-row">
            <div class="call-timer" id="callTimer" style="display:none">00:00</div>
            <div class="call-hint" id="callHint">...</div>
          </div>

          <div class="call-controls" id="callControls" style="display:none">
            <button type="button" class="call-ctrl" id="callMuteBtn" aria-pressed="false"><i class="fa-solid fa-microphone-slash"></i><span>كتم</span></button>
            <button type="button" class="call-ctrl" id="callSpeakerBtn" aria-pressed="false"><i class="fa-solid fa-volume-high"></i><span>مكبر</span></button>
            <button type="button" class="call-ctrl" id="callFullscreenBtn" aria-pressed="false"><i class="fa-solid fa-expand"></i><span>تكبير</span></button>
            <button type="button" class="call-ctrl" id="callCamBtn" aria-pressed="false"><i class="fa-solid fa-video"></i><span>كاميرا</span></button>
          </div>

          <div class="call-actions">
            <button type="button" class="call-btn secondary" id="callCancelBtn" style="display:none"><i class="fa-solid fa-ban"></i>إلغاء</button>
            <button type="button" class="call-btn danger" id="callRejectBtn" style="display:none"><i class="fa-solid fa-xmark"></i>رفض</button>
            <button type="button" class="call-btn ok" id="callAcceptBtn" style="display:none"><i class="fa-solid fa-check"></i>قبول</button>
            <button type="button" class="call-btn danger" id="callEndBtn" style="display:none"><i class="fa-solid fa-phone-slash"></i>إنهاء</button>
          </div>
        </div>
      `;
      document.body.appendChild(ov);
    }

    ov.addEventListener("click", (e) => {
      if (e.target === ov && state === CallState.IDLE) hideOverlay();
    });

    qs("callCloseBtn")?.addEventListener("click", () => {
      if (state === CallState.IDLE) hideOverlay();
    });

    bindButtonsOnce();
    return ov;
  }

  function showOverlay() {
    const ov = ensureOverlay();
    try { ov.inert = false; } catch {}
    ov.classList.add("show");
    ov.setAttribute("aria-hidden", "false");
  }

  function hideOverlay() {
    const ov = qs("callOverlay");
    if (!ov) return;

    // ✅ لا تخفِ عنصر عليه focus (يسبب تحذير aria-hidden)
    try {
      const ae = document.activeElement;
      if (ae && ov.contains(ae) && typeof ae.blur === "function") ae.blur();
    } catch {}

    ov.classList.remove("show");
    ov.setAttribute("aria-hidden", "true");
    // دعم browsers حديثة: inert يمنع التركيز/التفاعل
    try { ov.inert = true; } catch {}
    stopTimer();
  }

  function setBadge(type) {
    const badge = qs("callTypeBadge");
    if (!badge) return;
    badge.innerHTML = type === "video"
      ? '<i class="fa-solid fa-video"></i>'
      : '<i class="fa-solid fa-phone"></i>';
  }

  function setPeer({ name, status, avatar }) {
    const n = qs("callPeerName");
    const s = qs("callPeerStatus");
    const img = qs("callPeerAvatarImg");
    if (n) n.textContent = name || "مستخدم";
    if (s) s.textContent = status || "";
    if (img) {
      img.src = avatar || "https://i.pravatar.cc/150?img=12";
    }
  }

  function setMediaVisibility() {
    try { updateCallBadge(); } catch {}
    const media = qs("callMedia");
    const pill = qs("callAudioPill");
    const localV = qs("callLocalVideo");
    const remoteV = qs("callRemoteVideo");

    if (!media) return;

    if (callType === "video") {
      media.classList.remove("hide");
      if (pill) pill.style.display = "none";
      if (localV) localV.style.display = "block";
      if (remoteV) remoteV.style.display = "block";
    } else {
      // صوت: نخفي الفيديو لكن نبقي حاوية لطيفة
      media.classList.remove("hide");
      if (pill) pill.style.display = "flex";
      if (localV) localV.style.display = "none";
      if (remoteV) remoteV.style.display = "none";
    }
  }

  function updateCallBadge() {
    const badge = qs("callTypeBadge");
    if (!badge) return;
    badge.innerHTML = callType === "video"
      ? '<i class="fa-solid fa-video"></i>'
      : '<i class="fa-solid fa-phone"></i>';
  }


  function setUI(mode) {
    qs("callTitle") && (qs("callTitle").textContent = mode.title || "مكالمة");
    qs("callSub") && (qs("callSub").textContent = mode.sub || "");
    qs("callHint") && (qs("callHint").textContent = mode.hint || "");

    const timer = qs("callTimer");
    if (timer) timer.style.display = mode.showTimer ? "block" : "none";

    const controls = qs("callControls");
    if (controls) controls.style.display = mode.showControls ? "grid" : "none";

    const cancelBtn = qs("callCancelBtn");
    const rejectBtn = qs("callRejectBtn");
    const acceptBtn = qs("callAcceptBtn");
    const endBtn = qs("callEndBtn");

    if (cancelBtn) cancelBtn.style.display = mode.cancel ? "inline-flex" : "none";
    if (rejectBtn) rejectBtn.style.display = mode.reject ? "inline-flex" : "none";
    if (acceptBtn) acceptBtn.style.display = mode.accept ? "inline-flex" : "none";
    if (endBtn) endBtn.style.display = mode.end ? "inline-flex" : "none";
  }

  function fmt2(n){ return String(Math.max(0, n|0)).padStart(2,"0"); }

  function startTimer() {
    stopTimer();
    timerT0 = Date.now();
    const t = qs("callTimer");
    if (!t) return;
    timerInt = setInterval(() => {
      const d = Math.floor((Date.now() - timerT0) / 1000);
      t.textContent = `${fmt2(Math.floor(d/60))}:${fmt2(d%60)}`;
    }, 250);
  }

  function stopTimer(){
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
  }

  function newCallId(){
    return `call_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  async function getRtcConfig() {
    if (rtcConfigCache) return rtcConfigCache;
    try {
      const cfg = await apiRequest("/calls/rtc-config");
      const iceServers = Array.isArray(cfg?.iceServers) ? cfg.iceServers : [{ urls: ["stun:stun.l.google.com:19302"] }];
      rtcConfigCache = { iceServers };
      return rtcConfigCache;
    } catch (e) {
      // fallback STUN only
      rtcConfigCache = { iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }] };
      return rtcConfigCache;
    }
  }

  async function cleanupWebRTC() {
    try {
      if (pc) {
        try { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; } catch {}
        try { pc.close(); } catch {}
      }
    } finally {
      pc = null;
      audioSender = null;
      videoSender = null;
    }

    try {
      if (localStream) {
        localStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {}
    localStream = null;

    try {
      if (remoteStream) {
        remoteStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
      }
    } catch {}
    remoteStream = null;

    role = null;

    const lv = qs("callLocalVideo");
    const rv = qs("callRemoteVideo");
    const ra = qs("callRemoteAudio");
    if (lv) lv.srcObject = null;
    if (rv) rv.srcObject = null;
    if (ra) ra.srcObject = null;
  }

  function resetCall(){
    state = CallState.IDLE;
    const prevCallId = callId;
    callId = null;
    peerId = null;
    callType = "audio";
    hideOverlay();
    stopTimer();
    // اترك الغرفة بشكل لطيف (إن وجدت)
    const s = getSock();
    if (s && prevCallId) { try { s.emit("call:leave", { callId: prevCallId }); } catch {} }
    cleanupWebRTC();
  }

  function emitSafe(evt, payload){
    const s = getSock();
    if (!s) return false;
    try { s.emit(evt, payload); return true; } catch { return false; }
  }

  async function startWebRTC(nextRole) {
    const s = getSock();
    if (!s || !s.connected) throw new Error("socket not connected");
    if (!callId) throw new Error("missing callId");

    role = nextRole;
    setMediaVisibility();

    // join room call:<callId> for relay offer/answer/ice
    emitSafe("call:join", { callId });

    const rtcConfig = await getRtcConfig();

    pc = new RTCPeerConnection(rtcConfig);
    remoteStream = new MediaStream();

    // ✅ ثبّت transceivers لتفادي مشاكل SDP عند تشغيل/إيقاف الفيديو
    try {
      if (pc.addTransceiver) {
        // Video transceiver دائماً موجود حتى لو مكالمة صوتية
        const vT = pc.addTransceiver("video", { direction: callType === "video" ? "sendrecv" : "recvonly" });
        videoSender = vT && vT.sender ? vT.sender : null;

        const aT = pc.addTransceiver("audio", { direction: "sendrecv" });
        audioSender = aT && aT.sender ? aT.sender : null;
      }
    } catch {
      audioSender = null;
      videoSender = null;
    }

    // Reset negotiation flags
    makingOffer = false;
    ignoreOffer = false;
    isSettingRemoteAnswerPending = false;


    const remoteVideoEl = qs("callRemoteVideo");
    const localVideoEl = qs("callLocalVideo");
    const remoteAudioEl = qs("callRemoteAudio");

    // attach remote
    if (remoteVideoEl) remoteVideoEl.srcObject = remoteStream;
    if (remoteAudioEl) remoteAudioEl.srcObject = remoteStream;

    pc.ontrack = (ev) => {
      try {
        // بعض المتصفحات لا تضع stream ضمن ev.streams، لذلك نعتمد track مباشرة
        const t = ev && ev.track ? ev.track : null;
        if (t) {
          try {
            const exists = remoteStream.getTracks().some((x) => x.id === t.id);
            if (!exists) remoteStream.addTrack(t);
          } catch {}
        }

        // وفي حال توفر streams أيضاً، نضيف أي track ناقص
        const s0 = ev && ev.streams && ev.streams[0] ? ev.streams[0] : null;
        if (s0 && s0.getTracks) {
          s0.getTracks().forEach((tr) => {
            try {
              const exists = remoteStream.getTracks().some((x) => x.id === tr.id);
              if (!exists) remoteStream.addTrack(tr);
            } catch {}
          });
        }

        // تأكيد ربط الفيديو/الصوت بالـ stream
        const remoteVideoEl = qs("callRemoteVideo");
        const remoteAudioEl = qs("callRemoteAudio");
        if (remoteVideoEl && remoteVideoEl.srcObject !== remoteStream) remoteVideoEl.srcObject = remoteStream;
        if (remoteAudioEl && remoteAudioEl.srcObject !== remoteStream) remoteAudioEl.srcObject = remoteStream;

        // لو وصل فيديو من الطرف الآخر، أظهر الفيديو حتى لو كنا "audio" محلياً
        try {
          if (ev && ev.track && ev.track.kind === "video" && callType !== "video") {
            callType = "video";
            setMediaVisibility();
          }
        } catch {}

        // محاولة تشغيل الفيديو (بعض الأجهزة تحتاج play بعد attach)
        if (remoteVideoEl && typeof remoteVideoEl.play === "function") {
          remoteVideoEl.play().catch(() => {});
        }
      } catch {}
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        emitSafe("call:ice", { callId, candidate: ev.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState || "";
      if (st === "failed" || st === "disconnected") {
        showToast("انقطع الاتصال، حاول إعادة المكالمة", "warning");
      }
    };

    // ✅ Perfect negotiation: يسمح بإضافة/إزالة فيديو بدون كسر المكالمة
    pc.onnegotiationneeded = async () => {
      try {
        // قد يحدث negotiationneeded بينما signaling ليس stable
        if (!pc || pc.signalingState !== "stable") return;

        makingOffer = true;
        // ✅ أفضل: دع المتصفح يبني الـ SDP بنفسه (أقل أخطاء InvalidModificationError)
        await pc.setLocalDescription();
        emitSafe("call:offer", { callId, offer: pc.localDescription });
      } catch (e) {
        console.warn("[WebRTC] negotiationneeded error:", e);
      } finally {
        makingOffer = false;
      }
    };

    // getUserMedia
    const constraints = callType === "video"
      ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }
      : { audio: true, video: false };

    try {
      localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      // إذا الفيديو فشل، جرّب صوت فقط
      if (callType === "video") {
        showToast("تعذر تشغيل الكاميرا — سيتم التحويل لصوت فقط", "warning");
        callType = "audio";
        setBadge("audio");
        setMediaVisibility();
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else {
        throw e;
      }
    }

    // attach local
    if (localVideoEl) {
      localVideoEl.srcObject = localStream;
      localVideoEl.muted = true;
    }

    // add/replace tracks (مع transceivers ثابتة)
    try {
      const aTrack = localStream.getAudioTracks ? localStream.getAudioTracks()[0] : null;
      const vTrack = localStream.getVideoTracks ? localStream.getVideoTracks()[0] : null;

      if (audioSender) {
        try { audioSender.replaceTrack(aTrack || null); } catch {}
      } else if (aTrack) {
        pc.addTrack(aTrack, localStream);
      }

      if (videoSender) {
        try { videoSender.replaceTrack(vTrack || null); } catch {}
      } else if (vTrack) {
        pc.addTrack(vTrack, localStream);
      }

      // أي Tracks إضافية (نادر) نضيفها كـ addTrack
      localStream.getTracks().forEach((t) => {
        if (t.kind === "audio" && (audioSender || t === aTrack)) return;
        if (t.kind === "video" && (videoSender || t === vTrack)) return;
        try { pc.addTrack(t, localStream); } catch {}
      });
    } catch (e) {
      // fallback
      try { localStream.getTracks().forEach((t) => pc.addTrack(t, localStream)); } catch {}
    }

    // initial states for buttons
    syncButtonsWithTracks();

    // negotiation is handled by pc.onnegotiationneeded (perfect negotiation)
}

  function syncButtonsWithTracks() {
    const muteBtn = qs("callMuteBtn");
    const camBtn = qs("callCamBtn");

    const aTrack = localStream?.getAudioTracks?.()[0] || null;
    const vTrack = localStream?.getVideoTracks?.()[0] || null;

    if (muteBtn) {
      const muted = aTrack ? !aTrack.enabled : true;
      muteBtn.classList.toggle("is-on", muted);
      muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    }

    if (camBtn) {
      const camOff = vTrack ? !vTrack.enabled : (callType !== "video");
      camBtn.classList.toggle("is-on", camOff);
      camBtn.setAttribute("aria-pressed", camOff ? "true" : "false");
    }
  }

  function setAudioMuted(muted) {
    const a = localStream?.getAudioTracks?.() || [];
    a.forEach((t) => { t.enabled = !muted; });
    syncButtonsWithTracks();
  }

  function setCamEnabled(enabled) {
    const wantOn = !!enabled;

    // لو ما في WebRTC بعد → بس حدّث UI
    if (!localStream) {
      syncButtonsWithTracks();
      return;
    }

    // Helper: احصل على track كاميرا مع retries بسيطة
    async function acquireCameraTrack() {
      // 1) حاول القياسي
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        return { stream: s, track: s.getVideoTracks()[0] || null };
      } catch (e1) {
        // 2) لو Device in use / NotReadableError → حاول بعد تحرير أي track قديم
        try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          return { stream: s, track: s.getVideoTracks()[0] || null };
        } catch (e2) {
          throw e2 || e1;
        }
      }
    }

    // ===== إيقاف الكاميرا (حرّر الجهاز فعلياً) =====
    if (!wantOn) {
      try {
        const vTracks = localStream.getVideoTracks ? localStream.getVideoTracks() : [];
        vTracks.forEach((t) => {
          try { t.stop(); } catch {}
          try { localStream.removeTrack(t); } catch {}
        });

        if (pc) {
          const sender = videoSender || pc.getSenders().find((s) => s.track && s.track.kind === "video");
          // لو sender موجود → افصل الفيديو من الإرسال
          if (sender) {
            try { sender.replaceTrack(null); } catch {}
          }
        }
      } catch {}

      syncButtonsWithTracks();
      setMediaVisibility();
      return;
    }

    // ===== تشغيل الكاميرا =====

    // إذا مو مكالمة فيديو وبدنا نشغل الكاميرا → نحول UI لفيديو
    if (callType !== "video") {
      callType = "video";
      setMediaVisibility();
      try { updateCallBadge(); } catch {}
    }

    // إذا عندنا track فيديو جاهز (مثلاً كان disabled) → فقط فعّله
    try {
      const vTracks = localStream.getVideoTracks ? localStream.getVideoTracks() : [];
      if (vTracks.length) {
        vTracks.forEach((t) => { t.enabled = true; });
        syncButtonsWithTracks();
        setMediaVisibility();
        return;
      }
    } catch {}

    // أثناء المكالمة: اطلب كاميرا وأضف/استبدل track
    (async () => {
      try {
        if (!pc) {
          // لو ما في pc (نادر) → بس شغل local preview
          const { stream, track } = await acquireCameraTrack();
          if (!track) throw new Error("no camera track");

          try { localStream.addTrack(track); } catch {}

          const localVideoEl = qs("callLocalVideo");
          if (localVideoEl) {
            localVideoEl.srcObject = localStream;
            localVideoEl.muted = true;
            try { await localVideoEl.play(); } catch {}
          }

          // أوقف باقي tracks من stream الجديد (غير الفيديو المستخدم)
          try { stream.getTracks().forEach((t) => { if (t !== track) t.stop(); }); } catch {}

          syncButtonsWithTracks();
          setMediaVisibility();
          return;
        }

        // ✅ مهم: لو في فيديو قديم متوقف/معلّق، نظّفه قبل طلب جديد
        try {
          const old = localStream.getVideoTracks ? localStream.getVideoTracks() : [];
          old.forEach((t) => { try { t.stop(); } catch {} });
          old.forEach((t) => { try { localStream.removeTrack(t); } catch {} });
        } catch {}

        const { stream: camStream, track: camTrack } = await acquireCameraTrack();
        if (!camTrack) throw new Error("no camera track");

        // ضمّ الفيديو لـ localStream
        try { localStream.addTrack(camTrack); } catch {}

        // اربط local preview
        const localVideoEl = qs("callLocalVideo");
        if (localVideoEl) {
          localVideoEl.srcObject = localStream;
          localVideoEl.muted = true;
          try { await localVideoEl.play(); } catch {}
        }

        // استبدل sender أو أضف track جديد
        const sender = videoSender || pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(camTrack);
        } else {
          pc.addTrack(camTrack, localStream);
        }

        // أوقف باقي tracks من stream الجديد (غير الفيديو المستخدم)
        try { camStream.getTracks().forEach((t) => { if (t !== camTrack) t.stop(); }); } catch {}

        syncButtonsWithTracks();
        setMediaVisibility();
      } catch (e) {
        console.warn("[Call] enable camera mid-call failed:", e);

        const name = String(e?.name || "");
        if (name === "NotReadableError") {
          showToast("الكاميرا مستخدمة من تطبيق/تبويب آخر. أغلقه وحاول مجدداً.", "error");
        } else if (name === "NotAllowedError") {
          showToast("تم رفض صلاحية الكاميرا. فعّلها من إعدادات المتصفح.", "error");
        } else {
          showToast("تعذر تشغيل الكاميرا", "error");
        }

        // لا نفصل المكالمة، فقط نبقيها صوت
        syncButtonsWithTracks();
        setMediaVisibility();
      }
    })();
  }

  async function setSpeakerOn(on) {
    // المتصفح لا يقدر يبدّل "speaker" مثل موبايل native دائماً.
    // إذا في دعم setSinkId (Chrome/Edge) نحاول نختار default device.
    const el = qs("callRemoteAudio") || qs("callRemoteVideo");
    if (!el) return;
    if (typeof el.setSinkId !== "function") return;
    try {
      // "default" عادةً يحترم اختيار النظام (مكبر/سماعة بالموبايل حسب OS)
      await el.setSinkId("default");
    } catch {}
  }

  // ===== Outgoing =====
  function startOutgoing(type){
    const s = getSock();
    if (!s || !s.connected) {
      showToast("السوكيت غير متصل حالياً", "error");
      return;
    }
    const pid = requireConversationPeer();
    if (!pid) return;

    if (state !== CallState.IDLE) {
      showToast("يوجد اتصال قيد التنفيذ", "warning");
      return;
    }

    callType = type === "video" ? "video" : "audio";
    peerId = pid;
    callId = newCallId();
    state = CallState.OUTGOING;
    role = "caller";

    const peer = getPeerUiInfo();
    showOverlay();
    setBadge(callType);
    setPeer(peer);
    setMediaVisibility();
    setUI({
      title: callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
      sub: "جارِ الاتصال...",
      hint: "انتظر قبول الطرف الآخر…",
      cancel: true,
      reject: false,
      accept: false,
      end: false,
      showTimer: false,
      showControls: false,
    });

    const ok = emitSafe("call:invite", {
      callId,
      to: peerId,
      type: callType,
      fromName: currentUser?.username || currentUser?.name || "مستخدم",
      fromAvatar: currentUser?.avatar || "",
    });

    if (!ok) {
      showToast("تعذر بدء الاتصال", "error");
      resetCall();
    }
  }

  function cancelOutgoing(){
    if (!callId || !peerId) return resetCall();
    emitSafe("call:cancel", { callId, to: peerId });
    resetCall();
  }

  // ===== Incoming =====
  function onIncoming(data){
    const s = getSock();
    if (!s) return;

    if (state !== CallState.IDLE) {
      emitSafe("call:busy", { callId: data?.callId, to: data?.from });
      return;
    }

    state = CallState.INCOMING;
    callId = String(data?.callId || "");
    peerId = String(data?.from || "");
    callType = data?.type === "video" ? "video" : "audio";
    role = "callee";

    showOverlay();
    setBadge(callType);
    setPeer({
      name: data?.fromName || "مستخدم",
      status: callType === "video" ? "مكالمة فيديو واردة" : "مكالمة صوتية واردة",
      avatar: data?.fromAvatar ? buildAvatarUrl(data.fromAvatar) : getPeerUiInfo().avatar,
    });
    setMediaVisibility();

    setUI({
      title: callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
      sub: "مكالمة واردة…",
      hint: "اضغط قبول لبدء WebRTC",
      cancel: false,
      reject: true,
      accept: true,
      end: false,
      showTimer: false,
      showControls: false,
    });
  }

  async function acceptCall(){
    if (!callId || !peerId) return;
    state = CallState.ACTIVE;

    setUI({
      title: callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
      sub: "جارِ الاتصال…",
      hint: "تجهيز الصوت/الفيديو…",
      cancel: false,
      reject: false,
      accept: false,
      end: true,
      showTimer: true,
      showControls: true,
    });

    startTimer();
    emitSafe("call:accept", { callId, to: peerId });

    // callee يبدأ WebRTC وينتظر offer
    try {
      await startWebRTC("callee");
      qs("callSub") && (qs("callSub").textContent = "نشطة الآن");
      qs("callHint") && (qs("callHint").textContent = "تم الاتصال عبر WebRTC");
    } catch (e) {
      console.error("[WebRTC] accept start error:", e);
      showToast("فشل تشغيل المايك/الكاميرا — تأكد من الصلاحيات", "error");
      endCall();
    }
  }

  function rejectCall(){
    if (!callId || !peerId) return resetCall();
    emitSafe("call:reject", { callId, to: peerId });
    resetCall();
  }

  function endCall(){
    if (!callId || !peerId) return resetCall();
    emitSafe("call:end", { callId, to: peerId });
    resetCall();
  }

  // ===== UI controls toggles (حقيقية) =====
  function toggleBtn(btn, on){
    if (!btn) return false;
    const next = (typeof on === "boolean") ? on : !btn.classList.contains("is-on");
    btn.classList.toggle("is-on", next);
    btn.setAttribute("aria-pressed", next ? "true" : "false");
    return next;
  }

  function tryFullscreen(){
    const sheet = document.querySelector("#callOverlay .call-sheet");
    if (!sheet) return;
    const isFs = document.fullscreenElement;
    if (!isFs) sheet.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.().catch(()=>{});
  }

  function bindButtonsOnce(){
    const ov = qs("callOverlay");
    if (!ov || ov.__bound) return;
    ov.__bound = true;

    qs("callCancelBtn")?.addEventListener("click", () => {
      if (state === CallState.OUTGOING) cancelOutgoing();
      else resetCall();
    });
    qs("callRejectBtn")?.addEventListener("click", () => rejectCall());
    qs("callAcceptBtn")?.addEventListener("click", () => acceptCall());
    qs("callEndBtn")?.addEventListener("click", () => endCall());

    qs("callMuteBtn")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const next = toggleBtn(btn);
      // is-on = muted
      setAudioMuted(next);
    });

    qs("callSpeakerBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const next = toggleBtn(btn);
      await setSpeakerOn(next);
    });

    qs("callCamBtn")?.addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const next = toggleBtn(btn);
      // is-on = cam off
      setCamEnabled(!next);
    });

    qs("callFullscreenBtn")?.addEventListener("click", () => {
      toggleBtn(qs("callFullscreenBtn"));
      tryFullscreen();
    });
  }

  // ===== Bind header call buttons (بدون ما نكسر أي زر تاني) =====
  document.addEventListener("click", (e) => {
    const a = e.target.closest("#audioCallBtn");
    const v = e.target.closest("#videoCallBtn");
    if (a) startOutgoing("audio");
    if (v) startOutgoing("video");
  });

  // ===== Socket listeners (مرة واحدة) =====
  function bindSocketOnce(){
    const s = getSock();
    if (!s) return;
    if (s.__callsBound) return;
    s.__callsBound = true;

    // Call UI signaling
    s.on("call:incoming", (d) => onIncoming(d));

    s.on("call:ringing", (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      if (state === CallState.OUTGOING) {
        setUI({
          title: callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
          sub: "يرن عند الطرف الآخر...",
          hint: "انتظر القبول…",
          cancel: true,
          reject: false,
          accept: false,
          end: false,
          showTimer: false,
          showControls: false,
        });
      }
    });

    s.on("call:accepted", async (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      state = CallState.ACTIVE;

      setUI({
        title: callType === "video" ? "مكالمة فيديو" : "مكالمة صوتية",
        sub: "جارِ الاتصال…",
        hint: "تجهيز الصوت/الفيديو…",
        cancel: false, reject: false, accept: false, end: true,
        showTimer: true,
        showControls: true,
      });
      startTimer();

      // caller يبدأ WebRTC ويرسل offer
      try {
        await startWebRTC("caller");
        qs("callSub") && (qs("callSub").textContent = "نشطة الآن");
        qs("callHint") && (qs("callHint").textContent = "تم الاتصال عبر WebRTC");
      } catch (e) {
        console.error("[WebRTC] caller start error:", e);
        showToast("فشل تشغيل المكالمة — تأكد من الصلاحيات/السيرفر", "error");
        endCall();
      }
    });

    s.on("call:rejected", (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      showToast("تم رفض المكالمة", "info");
      resetCall();
    });

    s.on("call:cancelled", (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      showToast("تم إلغاء المكالمة", "info");
      resetCall();
    });

    s.on("call:ended", (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      showToast("انتهت المكالمة", "info");
      resetCall();
    });

    s.on("call:busy", (d) => {
      if (!d || String(d.callId||"") !== String(callId||"")) return;
      showToast("المستخدم مشغول", "warning");
      resetCall();
    });

    // WebRTC relay
    s.on("call:offer", async ({ offer } = {}) => {
      try {
        if (!pc || state !== CallState.ACTIVE) return;
        if (!offer) return;

        const desc = new RTCSessionDescription(offer);
        const offerCollision = makingOffer || pc.signalingState !== "stable";

        ignoreOffer = !isPolitePeer() && offerCollision;
        if (ignoreOffer) return;

        isSettingRemoteAnswerPending = desc.type === "answer";
        if (offerCollision && isPolitePeer()) {
          try { await pc.setLocalDescription({ type: "rollback" }); } catch {}
        }

        await pc.setRemoteDescription(desc);

        if (desc.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          emitSafe("call:answer", { callId, answer: pc.localDescription });
        }
      } catch (e) {
        console.error("[WebRTC] on offer error:", e);
      } finally {
        isSettingRemoteAnswerPending = false;
      }
    });

    s.on("call:answer", async ({ answer } = {}) => {
      try {
        if (!pc || state !== CallState.ACTIVE) return;
        if (!answer) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (e) {
        console.error("[WebRTC] on answer error:", e);
      }
    });

    s.on("call:ice", async ({ candidate } = {}) => {
      try {
        if (!pc || state !== CallState.ACTIVE) return;
        if (!candidate) return;
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        // بعض المتصفحات ترمي خطأ لو وصل ICE قبل remoteDescription، نتجاهله بهدوء
        console.warn("[WebRTC] addIceCandidate warn:", e?.message || e);
      }
    });

    s.on("call:leave", () => {
      // الطرف الآخر ترك الغرفة أو أغلق
      showToast("الطرف الآخر غادر المكالمة", "info");
      resetCall();
    });
  }

  ensureOverlay();
  bindSocketOnce();
  window.addEventListener("saepel:socket:connected", () => bindSocketOnce());

})();


// ===================== Phase 5 – Calls Tab (Safe Add-on) =====================
(function(){
  let calls = [];
  let callsPanel = document.getElementById("callsPanel");
  let callsListEl = document.getElementById("callsList");
  let callsEmptyEl = document.getElementById("callsEmpty");

function ensureCallsPanel() {
  // if HTML doesn't include Calls panel, create it safely (no effect on chat/call overlay)
  let panel = document.getElementById("callsPanel");
  let list = document.getElementById("callsList");
  let empty = document.getElementById("callsEmpty");

  if (!panel) {
    const hostList = document.getElementById("conversationList") || conversationListEl;
    const host = (hostList && hostList.parentElement) || document.querySelector(".inbox-sidebar") || document.body;

    panel = document.createElement("section");
    panel.id = "callsPanel";
    panel.className = "calls-panel hidden";
    panel.innerHTML = `
      <div class="calls-panel-head">
        <div class="calls-title">سجل المكالمات</div>
      </div>
      <div id="callsEmpty" class="calls-empty hidden">
        <div class="empty-ico"><i class="fa-solid fa-phone"></i></div>
        <div class="empty-title">لا يوجد سجل مكالمات</div>
        <div class="empty-sub">ابدأ مكالمة لتظهر هنا.</div>
      </div>
      <div id="callsList" class="calls-list"></div>
    `;

    // place after conversations list if possible
    if (hostList && hostList.parentElement) {
      hostList.insertAdjacentElement("afterend", panel);
    } else {
      host.appendChild(panel);
    }
  }

  // ensure children refs
  list = document.getElementById("callsList");
  empty = document.getElementById("callsEmpty");
  return { panel, list, empty };
}

  async function loadCalls(){
    try{
      const ensured = ensureCallsPanel();
      // refresh live refs
      if (ensured?.panel) {}
      
      const data = await apiRequest("/calls/logs");
      calls = Array.isArray(data) ? data : [];
      renderCalls();
      updateTabCounters();
    }catch(e){
      console.warn("loadCalls failed:", e);
      calls = [];
      renderCalls();
    }
  }

  function renderCalls(){
    if(!callsListEl) return;
    callsListEl.innerHTML = "";
    if(!calls.length){
      callsEmptyEl && callsEmptyEl.classList.remove("hidden");
      return;
    }
    callsEmptyEl && callsEmptyEl.classList.add("hidden");

    calls.forEach(call=>{
      const item = document.createElement("div");

      const other = call.otherUser || {};
      const peerId = other._id || call.peerId || "";
      const peerName = other.username || call.peerName || "مستخدم";
      const peerAvatar = other.avatar || call.peerAvatar || "";
      const verified = !!(other.isVerified);

      const st = String(call.status || "").toLowerCase();
      const isMissed = (st === "missed" || st === "no-answer" || st === "no_answer" || st === "timeout");
      const dir = isMissed ? "missed" : (call.direction || "outgoing");
      const ico = dir === "incoming" ? "fa-arrow-down" :
                  dir === "missed" ? "fa-xmark" : "fa-arrow-up";
      item.className = "call-item";
      item.innerHTML = `
        <div class="call-ico ${dir}">
          <i class="fa-solid ${ico}"></i>
        </div>
        <div class="call-main">
          <div class="call-name">${escapeHtml(peerName)}${verified ? ` <span class="v-badge" title="موثّق">✔</span>` : ``}</div>
          <div class="call-meta">
            ${call.type === "video" ? "📹" : "📞"}
            ${formatSeconds(call.durationSec || call.duration || 0)} · ${formatTimeHM(call.createdAt)}
          </div>
        </div>
        <div class="call-actions">
          <button class="call-action-btn" data-act="call"><i class="fa-solid fa-phone"></i></button>
          <button class="call-action-btn" data-act="video"><i class="fa-solid fa-video"></i></button>
          <button class="call-action-btn danger" data-act="delete"><i class="fa-solid fa-trash"></i></button>
        </div>
      `;
      item.querySelector('[data-act="call"]')?.addEventListener("click",()=>{
        window.startAudioCall && window.startAudioCall(peerId);
      });
      item.querySelector('[data-act="video"]')?.addEventListener("click",()=>{
        window.startVideoCall && window.startVideoCall(peerId);
      });
      item.querySelector('[data-act="delete"]')?.addEventListener("click", async ()=>{
        const ok = await uiConfirm({title:"حذف", message:"حذف هذا السجل؟"});
        if(!ok) return;
        try{
          await apiRequest("/calls/logs/"+call._id+"/delete-for-me",{method:"POST"});
          calls = calls.filter(c=>c._id!==call._id);
          renderCalls();
          updateTabCounters();
        }catch{}
      });
      callsListEl.appendChild(item);
    });
  }

  function updateTabCounters(){
    document.querySelectorAll(".tab-btn, .inbox-tab").forEach(btn=>{
      const tab = btn.dataset.tab;
      let countEl = btn.querySelector(".tab-count");
      if(!countEl){
        countEl = document.createElement("span");
        countEl.className = "tab-count hidden";
        btn.appendChild(countEl);
      }
      let n = 0;
      if(tab==="calls") n = calls.length;
      if(tab==="chats") n = document.querySelectorAll('.conversation-item[data-type="chat"]').length;
      if(tab==="groups") n = document.querySelectorAll('.conversation-item[data-type="group"]').length;
      if(tab==="channels") n = document.querySelectorAll('.conversation-item[data-type="channel"]').length;
      countEl.textContent = n;
      countEl.classList.toggle("hidden", n===0);
    });
  }

  window.addEventListener("saepel:sidebar:tab", (e)=>{
    if(e.detail==="calls"){
      const ensured = ensureCallsPanel();
      const list = document.getElementById("conversationList") || conversationListEl;
      if (list) list.classList.add("hidden");
      if (ensured?.panel) ensured.panel.classList.remove("hidden");
      loadCalls();
    }else{
      const list = document.getElementById("conversationList") || conversationListEl;
      const panel = document.getElementById("callsPanel") || callsPanel;
      if (panel) panel.classList.add("hidden");
      if (list) list.classList.remove("hidden");
    }
  });

  document.addEventListener("DOMContentLoaded", () => { try { updateTabCounters(); } catch {} });
})();
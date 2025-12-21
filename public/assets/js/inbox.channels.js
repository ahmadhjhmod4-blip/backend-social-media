// assets/js/inbox.channels.js
// Saepel Inbox — Channels module (safe, optional)
// الهدف: عزل منطق القنوات عن inbox.js بدون كسر أي شيء.
// ملاحظة: كلشي هنا يعتمد على window.__inbox إذا كان موجوداً.

(function () {
  "use strict";

  const log = (...a) => console.log("[Channels]", ...a);
  const qs = (id) => document.getElementById(id);

  // عناصر UI (اختيارية — إذا ما كانت موجودة ما بنعمل شي)
  const ui = () => ({
    body: document.body,
    badgesWrap: qs("spaceBadges"),
    roleBadge: qs("channelRoleBadge"),
    subsBadge: qs("channelSubsBadge"),
    subsCount: qs("channelSubsCount"),
    notice: qs("channelNotice"),
    composerDefault: qs("composerDefault"),
    composerGate: qs("composerChannelGate"),
    btnSubscribe: qs("channelSubscribeBtn"),
    btnMute: qs("channelMuteBtn"),
    btnMuteLbl: qs("channelMuteBtn") ? qs("channelMuteBtn").querySelector(".lbl") : null,
  });

  function setBodyState({ spaceType, isAdmin, isMember, isMuted } = {}) {
    const u = ui();
    if (!u.body) return;

    if (spaceType) u.body.dataset.space = spaceType;
    if (typeof isAdmin === "boolean") u.body.dataset.channelRole = isAdmin ? "admin" : "member";
    if (typeof isMember === "boolean") u.body.dataset.channelMember = isMember ? "1" : "0";
    if (typeof isMuted === "boolean") u.body.dataset.channelMuted = isMuted ? "1" : "0";
  }

  function renderChannelUI(meta) {
    const u = ui();
    const isChannel = meta && String(meta.type || meta.spaceType || "").toLowerCase() === "channel";
    if (!isChannel) {
      // رجّع كلشي طبيعي
      setBodyState({ spaceType: "chat" });
      if (u.badgesWrap) u.badgesWrap.style.display = "none";
      if (u.notice) u.notice.style.display = "none";
      if (u.composerGate) u.composerGate.style.display = "none";
      if (u.composerDefault) u.composerDefault.style.display = "";
      return;
    }

    const isAdmin = !!meta.isAdmin;
    const isMember = meta.isMember == null ? false : !!meta.isMember;
    const isMuted = !!meta.isMuted;
    const subs = Number(meta.subscribersCount ?? meta.membersCount ?? meta.subs ?? 0);

    setBodyState({ spaceType: "channel", isAdmin, isMember, isMuted });

    // badges
    if (u.badgesWrap) u.badgesWrap.style.display = "flex";
    if (u.roleBadge) u.roleBadge.style.display = isAdmin ? "inline-flex" : "none";
    if (u.subsBadge) u.subsBadge.style.display = "inline-flex";
    if (u.subsCount) u.subsCount.textContent = Number.isFinite(subs) && subs > 0 ? String(subs) : "0";

    // notice
    if (u.notice) u.notice.style.display = isAdmin ? "none" : "flex";

    // composer
    if (isAdmin) {
      // المشرف ينشر طبيعي
      if (u.composerGate) u.composerGate.style.display = "none";
      if (u.composerDefault) u.composerDefault.style.display = "";
    } else {
      // المستخدم العادي: ما في إرسال/مرفقات
      if (u.composerDefault) u.composerDefault.style.display = "none";
      if (u.composerGate) u.composerGate.style.display = "flex";

      if (u.btnSubscribe) u.btnSubscribe.style.display = isMember ? "none" : "inline-flex";
      if (u.btnMute) u.btnMute.style.display = isMember ? "inline-flex" : "none";

      if (u.btnMuteLbl) u.btnMuteLbl.textContent = isMuted ? "إلغاء الكتم" : "كتم";
      if (u.btnMute) {
        const ico = u.btnMute.querySelector("i");
        if (ico) {
          ico.className = isMuted ? "fa-regular fa-bell" : "fa-regular fa-bell-slash";
        }
      }
    }
  }

  // محاولة قراءة الحالة من window.__inbox (لو موجودة)
  function readMetaFromInbox() {
    const inbox = window.__inbox || null;
    if (!inbox) return null;

    // 1) دالة مباشرة (أفضل)
    if (typeof inbox.getActiveSpaceMeta === "function") {
      try { return inbox.getActiveSpaceMeta(); } catch {}
    }
    if (typeof inbox.getActiveChatMeta === "function") {
      try { return inbox.getActiveChatMeta(); } catch {}
    }

    // 2) state object
    const st = inbox.state || inbox.__state || null;
    if (st && (st.activeSpace || st.activeChat)) return st.activeSpace || st.activeChat;

    // 3) قيمة عامة
    if (inbox.activeSpace) return inbox.activeSpace;

    return null;
  }


  // fallback: قراءة meta من الـ DOM (بدون الاعتماد على inbox.js)
  function readMetaFromDOM() {
    try {
      const active =
        document.querySelector(".conversation-item.active") ||
        document.querySelector(".conversation-item[data-active='1']") ||
        null;
      if (!active) return null;

      const type = String(active.getAttribute("data-type") || active.dataset.type || "").toLowerCase();
      if (!type) return null;

      const isAdminRaw = active.getAttribute("data-is-admin") || active.dataset.isAdmin || active.dataset.admin || active.dataset.role;
      const isMemberRaw = active.getAttribute("data-is-member") || active.dataset.isMember || active.dataset.member || active.dataset.subscribed;
      const isMutedRaw = active.getAttribute("data-is-muted") || active.dataset.isMuted || active.dataset.muted;

      const subsRaw =
        active.getAttribute("data-subscribers") ||
        active.getAttribute("data-subscribers-count") ||
        active.dataset.subscribers ||
        active.dataset.subscribersCount ||
        active.dataset.membersCount ||
        active.dataset.members;

      const toBool = (v) => {
        if (v == null) return null;
        const s = String(v).trim().toLowerCase();
        if (s === "1" || s === "true" || s === "yes" || s === "y") return true;
        if (s === "0" || s === "false" || s === "no" || s === "n") return false;
        return null;
      };

      const meta = {
        type,
        isAdmin: toBool(isAdminRaw) ?? false,
        // لو ما عنا معلومة، افتراضياً: المستخدم غير مشترك (حتى تظهر زر اشتراك بدل اختفاء كلشي)
        isMember: toBool(isMemberRaw) ?? false,
        isMuted: toBool(isMutedRaw) ?? false,
        subscribersCount: subsRaw != null ? Number(subsRaw) : 0,
      };

      return meta;
    } catch {
      return null;
    }
  }
  // Events من inbox.js (مستحسن)
  function onSpaceChanged(detail) {
    // detail ممكن يكون meta كامل أو { meta }
    const meta = detail && (detail.meta || detail);
    renderChannelUI(meta || readMetaFromInbox() || readMetaFromDOM());
  }

  // يُستدعى من inbox.js أو من HTML عند تغيير التاب
  function onTabChanged(kind) {
    const k = String(kind || "").toLowerCase();
    if (k !== "channels" && k !== "channel") return;
    log("tab active");
    // عند فتح تب القنوات، خلي UI تتحدث إذا في قناة مفتوحة
    renderChannelUI(readMetaFromInbox() || readMetaFromDOM());
  }

  // ✅ أزرار إنشاء قناة من الـ Quick Actions (إذا موجودة)
  function wireQuickActions() {
    const createBtn = qs("createChannelBtn");
    if (createBtn && !createBtn.__wired) {
      createBtn.__wired = true;
      createBtn.addEventListener("click", () => {
        if (typeof window.openSpaceWizard === "function") {
          window.openSpaceWizard("channel");
          return;
        }
        window.dispatchEvent(new CustomEvent("saepel:space:create", { detail: { type: "channel" } }));
      });
    }
  }

  // ✅ أزرار Gate (اشتراك/كتم) — نرسل Events فقط (السيرفر لاحقاً)
  function wireGateButtons() {
    const u = ui();

    if (u.btnSubscribe && !u.btnSubscribe.__wired) {
      u.btnSubscribe.__wired = true;
      u.btnSubscribe.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("saepel:channel:subscribe", { detail: (readMetaFromInbox() || readMetaFromDOM() || {}) }));
      });
    }

    if (u.btnMute && !u.btnMute.__wired) {
      u.btnMute.__wired = true;
      u.btnMute.addEventListener("click", () => {
        window.dispatchEvent(new CustomEvent("saepel:channel:toggleMute", { detail: (readMetaFromInbox() || readMetaFromDOM() || {}) }));
      });
    }
  }

  // fallback: راقب تغيّر الهيدر لتحديث UI (بدون كسر)
  function setupObserverFallback() {
    const nameEl = qs("chatUserName");
    const statusEl = qs("chatUserStatus");
    if (!nameEl && !statusEl) return;

    let t = null;
    const schedule = () => {
      clearTimeout(t);
      t = setTimeout(() => renderChannelUI(readMetaFromInbox() || readMetaFromDOM()), 50);
    };

    const obs = new MutationObserver(schedule);
    if (nameEl) obs.observe(nameEl, { childList: true, characterData: true, subtree: true });
    if (statusEl) obs.observe(statusEl, { childList: true, characterData: true, subtree: true });
  }

  // استقبل Events من inbox.js
  window.addEventListener("saepel:sidebar:tab", (e) => onTabChanged(e?.detail));
  window.addEventListener("saepel:space:opened", (e) => onSpaceChanged(e?.detail));
  window.addEventListener("saepel:space:changed", (e) => onSpaceChanged(e?.detail));

  document.addEventListener("DOMContentLoaded", () => {
    wireQuickActions();
    wireGateButtons();
    setupObserverFallback();
    // تحديث أولي
    renderChannelUI(readMetaFromInbox() || readMetaFromDOM());
  });

  // API لغيره (اختياري)
  window.__channels = {
    onTabChanged,
    renderChannelUI,
  };
})();

// assets/js/inbox.groups.js
// Saepel Inbox — Groups module (safe, optional)
// الهدف: عزل منطق المجموعات عن inbox.js (هنخليه بسيط حالياً).

(function () {
  "use strict";

  const log = (...a) => console.log("[Groups]", ...a);

  function qs(id) { return document.getElementById(id); }

  function onTabChanged(kind) {
    const k = String(kind || "").toLowerCase();
    if (k !== "groups" && k !== "group") return;
    log("tab active");
  }

  function wireQuickActions() {
    const createBtn = qs("createGroupBtn");
    if (createBtn && !createBtn.__wired) {
      createBtn.__wired = true;
      createBtn.addEventListener("click", () => {
        if (typeof window.openSpaceWizard === "function") {
          window.openSpaceWizard("group");
          return;
        }
        window.dispatchEvent(new CustomEvent("saepel:space:create", { detail: { type: "group" } }));
      });
    }
  }

  window.addEventListener("saepel:sidebar:tab", (e) => onTabChanged(e?.detail));

  document.addEventListener("DOMContentLoaded", () => {
    wireQuickActions();
  });

  window.__groups = {
    onTabChanged,
  };
})();

// assets/js/config.js
// يحدد API_BASE بشكل ذكي (localhost:5000 أو Production/Tunnel) مع إمكانية override من localStorage/meta.
(function () {
  // 1) Override سريع للاختبار: localStorage.setItem("SAEPEL_API_BASE","https://....")
  const forced = localStorage.getItem("SAEPEL_API_BASE");
  if (forced && /^https?:\/\//i.test(forced)) {
    window.API_BASE = forced.replace(/\/+$/, "");
    window.apiUrl = (p) => window.API_BASE + (p.startsWith("/") ? p : "/" + p);
    return;
  }

  // 2) Meta tag: <meta name="api-base" content="https://api.example.com">
  const meta = document.querySelector('meta[name="api-base"]')?.content?.trim();
  if (meta && /^https?:\/\//i.test(meta)) {
    window.API_BASE = meta.replace(/\/+$/, "");
    window.apiUrl = (p) => window.API_BASE + (p.startsWith("/") ? p : "/" + p);
    return;
  }

  const { protocol, hostname } = window.location;

  // 3) Local Dev: فرونت على localhost أو 127.0.0.1 → الباك على 5000
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    window.API_BASE = `${protocol}//${hostname}:5000`;
    window.apiUrl = (p) => window.API_BASE + (p.startsWith("/") ? p : "/" + p);
    return;
  }

  // 4) Cloudflare Tunnel / Production: عادةً HTTPS → نستخدم نفس الـ origin
  // إذا كان الباك على دومين مختلف، خزّن رابط الباك بـ SAEPEL_API_BASE أو ضع meta tag.
  window.API_BASE = window.location.origin.replace(/\/+$/, "");
  window.apiUrl = (p) => window.API_BASE + (p.startsWith("/") ? p : "/" + p);
})();

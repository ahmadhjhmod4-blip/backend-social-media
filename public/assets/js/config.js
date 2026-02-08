// assets/js/config.js
// يحدد API_BASE بشكل ذكي (localhost:5000 أو Production/Tunnel) مع إمكانية override من localStorage/meta.
(function () {
  const { protocol, hostname } = window.location;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isAllowedApiBase = (value) => {
    if (!value) return false;
    const v = value.trim();
    if (!/^https?:\/\//i.test(v)) return false;
    if (/^https:\/\//i.test(v)) return true;
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(v);
  };
  const setApiBase = (base) => {
    window.API_BASE = base.replace(/\/+$/, "");
    window.apiUrl = (p) => window.API_BASE + (p.startsWith("/") ? p : "/" + p);
  };

  // 1) Override سريع للاختبار: localStorage.setItem("SAEPEL_API_BASE","https://....")
  const forced = localStorage.getItem("SAEPEL_API_BASE");
  if (isAllowedApiBase(forced)) {
    setApiBase(forced);
    return;
  }

  // 2) Meta tag: <meta name="api-base" content="https://api.example.com">
  const meta = document.querySelector('meta[name="api-base"]')?.content?.trim();
  if (isAllowedApiBase(meta)) {
    setApiBase(meta);
    return;
  }

  // 3) Local Dev: فرونت على localhost أو 127.0.0.1 → الباك على 5000
  if (isLocalHost) {
    setApiBase(`${protocol}//${hostname}:5000`);
    return;
  }

  // 4) Cloudflare Tunnel / Production: إجبار HTTPS في الإنتاج
  // إذا كان الباك على دومين مختلف، خزّن رابط الباك بـ SAEPEL_API_BASE أو ضع meta tag.
  const secureOrigin = window.location.origin.replace(/^http:/i, "https:");
  setApiBase(secureOrigin);
})();

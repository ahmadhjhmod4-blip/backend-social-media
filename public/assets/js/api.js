// assets/js/api.js
function apiUrl(path) {
  const base = (window.API_BASE || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${base}/${p}`;
}

async function apiFetch(path, options = {}) {
  const opts = { ...options };

  // JSON by default إذا في body object
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.headers = { ...(opts.headers || {}), "Content-Type": "application/json" };
    opts.body = JSON.stringify(opts.body);
  }

  // مهم: إذا بتستخدم cookies/session
  // opts.credentials = "include";

  const res = await fetch(apiUrl(path), opts);
  const ct = res.headers.get("content-type") || "";

  let data = null;
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else data = await res.text().catch(() => null);

  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

// token helpers (لو عندك JWT)
function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("jwt") || "";
}

function authHeaders(extra = {}) {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}

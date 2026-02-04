// assets/js/register.js
// يعتمد على window.API_BASE من config.js
(function () {
  const $ = (sel) => document.querySelector(sel);

  const form = $("#registerForm");
  const btn = $("#registerBtn");

  const fullNameEl = $("#fullName");
  const usernameEl = $("#username");
  const emailEl = $("#email");
  const passEl = $("#password");
  const confirmEl = $("#confirmPassword");

  const dayEl = $("#birthDay");
  const monthEl = $("#birthMonth");
  const yearEl = $("#birthYear");

  const toggleBtn = $("#togglePassword");

  function fillSelect(selectEl, from, to, pad2 = false) {
    if (!selectEl) return;
    for (let i = from; i <= to; i++) {
      const opt = document.createElement("option");
      const val = pad2 ? String(i).padStart(2, "0") : String(i);
      opt.value = val;
      opt.textContent = val;
      selectEl.appendChild(opt);
    }
  }

  function setLoading(isLoading) {
    if (btn) {
      btn.disabled = !!isLoading;
      btn.dataset.loading = isLoading ? "1" : "0";
      btn.textContent = isLoading ? "جاري إنشاء الحساب..." : "إنشاء حساب";
    }
  }

  function showError(msg) {
    alert(msg || "حدث خطأ غير متوقع.");
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
      const msg = data?.message || data?.error || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // جرّب أكثر من endpoint (حسب الباك عندك)
  async function registerRequest(payload) {
    const base = (window.API_BASE || "").replace(/\/+$/, "");
    if (!base) throw new Error("API_BASE غير معرّف. تأكد من تحميل config.js أولاً.");

    const candidates = [
      `${base}/api/auth/register`,
      `${base}/api/users/register`,
      `${base}/api/register`,
    ];

    let lastErr = null;
    for (const url of candidates) {
      try {
        return await postJSON(url, payload);
      } catch (e) {
        lastErr = e;
        // 404 = جرب التالي، غيره غالباً مشكلة حقيقية
        if (e.status && e.status !== 404) break;
      }
    }
    throw lastErr || new Error("فشل إنشاء الحساب.");
  }

  function getBirthDateISO() {
    const d = dayEl?.value?.trim();
    const m = monthEl?.value?.trim();
    const y = (yearEl?.value ?? "").toString().trim();

    if (!d || !m || !y) return "";

    const yyyy = y.padStart(4, "0");
    const mm = m.padStart(2, "0");
    const dd = d.padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // تهيئة قوائم اليوم/الشهر/السنة
  document.addEventListener("DOMContentLoaded", () => {
    fillSelect(dayEl, 1, 31, true);
    fillSelect(monthEl, 1, 12, true);

    // إذا السنة input number: ضع max للسنة الحالية
    const nowY = new Date().getFullYear();
    if (yearEl && yearEl.tagName === "INPUT") {
      yearEl.max = String(nowY);
      if (!yearEl.min) yearEl.min = "1900";
    } else if (yearEl && yearEl.tagName === "SELECT") {
      // fallback لو رجّعت السنة Select
      const start = nowY;
      const end = 1900;
      for (let y = start; y >= end; y--) {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = String(y);
        yearEl.appendChild(opt);
      }
    }

    if (toggleBtn && passEl) {
      toggleBtn.addEventListener("click", () => {
        const isPwd = passEl.type === "password";
        passEl.type = isPwd ? "text" : "password";
      });
    }
  });

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameEl?.value?.trim();
    const fullName = fullNameEl?.value?.trim();
    const email = emailEl?.value?.trim();
    const password = passEl?.value || "";
    const confirm = confirmEl?.value || "";
    const birthDate = getBirthDateISO();

    if (!username || username.length < 3) return showError("اكتب اسم مستخدم صحيح (3 أحرف أو أكثر).");
    if (!/^[A-Za-z0-9_]{3,}$/.test(username))
      return showError("اسم المستخدم يجب أن يكون بالإنكليزي ويحتوي على حروف/أرقام/_.");
    if (!email || !isEmail(email)) return showError("اكتب بريد إلكتروني صحيح.");
    if (!password || password.length < 6) return showError("كلمة المرور لازم تكون 6 أحرف أو أكثر.");
    if (password !== confirm) return showError("كلمتا المرور غير متطابقتين.");
    if (!birthDate) return showError("اختر تاريخ الميلاد بالكامل.");

    // تحقق عمر 13 سنة+
    const today = new Date();
    const dob = new Date(birthDate + "T00:00:00");
    const age = today.getFullYear() - dob.getFullYear() - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
    if (age < 13) return showError("يجب أن يكون عمرك 13 سنة أو أكثر لاستخدام Saepel.");

    const payload = {
      fullName,
      name: fullName,
      username,
      email,
      password,
      birthDate,         // ISO: YYYY-MM-DD
      birthdate: birthDate, // توافق مع الباك
      birthDay: dayEl?.value || "",
      birthMonth: monthEl?.value || "",
      birthYear: (yearEl?.value ?? "").toString() || "",
    };

    try {
      setLoading(true);
      const data = await registerRequest(payload);

      // خزّن التوكن إذا رجع من الباك
      const token = data?.token || data?.accessToken || data?.jwt;
      if (token) {
        localStorage.setItem("SAEPEL_TOKEN", token);
        localStorage.setItem("token", token);
      }

      // خزّن المستخدم إن وجد
      if (data?.user) localStorage.setItem("SAEPEL_USER", JSON.stringify(data.user));

      // تحويل
      window.location.href = "home.html";
    } catch (err) {
      showError(err?.message || "فشل إنشاء الحساب.");
      console.error("Register error:", err);
    } finally {
      setLoading(false);
    }
  });
})();

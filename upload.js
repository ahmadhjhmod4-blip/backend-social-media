// upload.js — مسؤول عن رفع الملفات (صور / فيديو / صوت) (ES Module)

import multer from "multer";
import path from "path";
import fs from "fs";

// ✅ نخلي مجلد الرفع ثابت على جذر تشغيل السيرفر (project root)
// هذا يحل مشكلة 404 لأن /uploads لازم يطابق نفس المجلد اللي نحفظ فيه فعلياً.
// ✅ على Render (وأي استضافة) الأفضل نخلي مجلد uploads قابل للتخصيص عبر ENV
// مثال Render Persistent Disk:
// UPLOADS_DIR=/var/data/uploads
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");

// ✅ أنشئ المجلد إذا مش موجود (يمنع ENOENT)
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 تم إنشاء مجلد uploads تلقائياً:", uploadsDir);
}

// ✅ خريطة امتدادات حسب mime (لتسجيلات الصوت خصوصاً)
const mimeToExt = {
  "audio/webm": ".webm",
  "audio/webm;codecs=opus": ".webm",
  "audio/ogg": ".ogg",
  "audio/ogg;codecs=opus": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",

  "video/webm": ".webm",
  "video/mp4": ".mp4",

  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
};

// إعداد طريقة التخزين
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);

    // ✅ حاول خذ الامتداد من originalname
    let ext = path.extname(file.originalname || "").toLowerCase();

    // ✅ إذا فاضي أو غريب، خذ امتداد من mimeType
    if (!ext || ext.length > 6) {
      const mapped = mimeToExt[file.mimetype];
      if (mapped) ext = mapped;
    }

    // ✅ fallback آمن
    if (!ext) ext = ".bin";

    cb(null, unique + ext);
  },
});

// ✅ فلترة بسيطة للأنواع المسموحة (صور/فيديو/صوت)
function fileFilter(req, file, cb) {
  const ok =
    file.mimetype?.startsWith("image/") ||
    file.mimetype?.startsWith("video/") ||
    file.mimetype?.startsWith("audio/");

  if (!ok) {
    return cb(new Error("نوع الملف غير مدعوم"), false);
  }
  cb(null, true);
}

// ✅ حدود حجم (ارفعها إذا بدك)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB
  },
});

export default upload;

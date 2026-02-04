// upload.js — مسؤول عن رفع الملفات (صور / فيديو / صوت) (ES Module)
// ✅ تنظيم التخزين: حفظ مرفقات كل مستخدم داخل:
// uploads/users/<userId>/
// ✅ يدعم تغيير مسار uploads عبر ENV: UPLOADS_DIR (مثلاً على القرص D)

import dotenv from "dotenv";
dotenv.config();

import multer from "multer";
import path from "path";
import fs from "fs";

// ✅ مجلد الرفع الأساسي (Base)
export const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");

function ensureDirSync(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    // لا تكسر التشغيل لو فشل إنشاء المجلد (نطبع فقط)
    console.error("❌ Failed to create uploads directory:", dirPath, e?.message || e);
  }
}

// ✅ أنشئ المجلد الأساسي إذا مش موجود (يمنع ENOENT)
ensureDirSync(uploadsDir);

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

// ✅ تنظيم المسار حسب المستخدم: uploads/users/<userId>
function getUserUploadsDir(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return uploadsDir;
  return path.join(uploadsDir, "users", uid);
}

// إعداد طريقة التخزين
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // ✅ إذا موجود req.userId (من authMiddleware) نخزن داخل users/<id>
    const userId = req?.userId ? String(req.userId) : "";
    const dest = getUserUploadsDir(userId);

    ensureDirSync(dest);
    cb(null, dest);
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

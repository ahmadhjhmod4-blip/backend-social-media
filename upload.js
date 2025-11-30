// upload.js  — مسؤول عن رفع الملفات (صور / فيديو)

import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

// لأننا نستخدم ES Modules ما في __dirname جاهز
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// إعداد مكان حفظ الملفات واسم الملف
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // يحفظ الملفات داخل مجلد uploads جنب السيرفر
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

// إنشاء كائن الرفع
const upload = multer({ storage });

export default upload;

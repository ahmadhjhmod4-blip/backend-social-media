import multer from 'multer';
import path from 'path';

// إعدادات التخزين
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // حدد مجلد uploads كوجهة للملفات
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname); // الحصول على امتداد الملف
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${extension}`; // اسم فريد لكل ملف
    cb(null, filename);
  }
});

// خيارات multer
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // تحديد الحد الأقصى لحجم الملف (10MB هنا)
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|mp4|mp3|webm/; // أنواع الملفات المسموح بها
    const mimeType = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimeType && extname) {
      return cb(null, true);
    } else {
      cb("الملف غير مدعوم!"); // رسالة إذا كان الملف غير مدعوم
    }
  }
});

export default upload;

# نقل المشروع إلى لابتوبك كسيرفر مستقل

## 1) المتطلبات على لابتوب السيرفر
- تثبيت Docker Desktop.
- تفعيل تشغيل تلقائي للجهاز ومنع Sleep (مهم جدًا).
- فتح بورتات `5000` ويفضل `80/443` إذا ستستخدم دومين.

## 2) نسخ المشروع إلى لابتوب السيرفر
```cmd
git clone https://github.com/ahmadhjhmod4-blip/backend-social-media.git
cd backend-social-media
```

## 3) إعداد ملف البيئة
```cmd
copy .env.server.example .env.server
```
- افتح `.env.server` وعدل القيم:
  - `JWT_SECRET`
  - `TURN_USERNAME`, `TURN_CREDENTIAL`
  - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

## 4) تشغيل السيرفر وقاعدة البيانات
```cmd
run-selfhost.cmd
```

بعد التشغيل:
- Backend: `http://localhost:5000`
- MongoDB: `mongodb://localhost:27017`

## 5) نقل بيانات قاعدة البيانات الحالية (اختياري ولكن مهم)
من جهازك الحالي:
```cmd
mongodump --uri="OLD_MONGO_URI" --archive=backup.gz --gzip
```
ثم على لابتوب السيرفر:
```cmd
mongorestore --uri="mongodb://localhost:27017/saepel" --archive=backup.gz --gzip
```

## 6) تحديث تطبيق Flutter ليستخدم السيرفر الجديد
ابنِ التطبيق بعنوان الـ API الجديد:
```cmd
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR_DOMAIN_OR_IP
```

## 7) HTTPS (مهم للاتصال والإشعارات)
- يفضل استخدام دومين + Reverse Proxy (Nginx/Caddy) مع شهادة SSL.
- إذا جهازك خلف CGNAT استخدم Cloudflare Tunnel.

## 8) فحص سريع بعد النقل
- تسجيل الدخول.
- إرسال رسالة نص/صورة/صوت.
- اتصال صوت/فيديو.
- إشعار رسالة بالخلفية.


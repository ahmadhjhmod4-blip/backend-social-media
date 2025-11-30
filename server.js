// server.js  (نسخة ES Module)

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

import User from "./models/User.js";
import Post from "./models/Post.js";
import upload from "./upload.js";

dotenv.config();

const app = express();

// لتجهيز __dirname في ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= ميدلوير عام =============

// نخلي الأصل مسموح من env (للـ Render) أو الكل في التطوير
const allowedOrigin = process.env.CLIENT_ORIGIN || "*";

app.use(
  cors({
    origin: allowedOrigin,
  })
);

app.use(express.json());

// ملفات الرفع (الصور / الفيديو) كـ static
// ملاحظة: على Render الملفات في uploads قد لا تبقى بعد إعادة التشغيل
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// تقديم ملفات الواجهة (HTML/CSS/JS) من مجلد public
app.use(express.static(path.join(__dirname, "public")));

// ============= ميدلوير للتحقق من التوكن (JWT) =============
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"]; // الشكل: Bearer token

  if (!authHeader) {
    return res.status(401).json({ msg: "لا يوجد توكن في الهيدر" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "تنسيق التوكن غير صالح" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME"
    );
    req.userId = decoded.id; // حفظ id المستخدم في الطلب
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ msg: "التوكن غير صالح أو منتهي" });
  }
};

// ============= اتصال MongoDB =============
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  "mongodb://127.0.0.1:27017/socialapp";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ تم الاتصال بقاعدة البيانات"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// راوت اختبار للتأكد أن الـ API شغّال
// GET /api/test
app.get("/api/test", (req, res) => {
  res.json({ msg: "API working" });
});

// ====================== المستخدمين (Register / Login / Profile) ======================

// REGISTER  =>  POST /api/register
app.post("/api/register", async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    const finalUsername = (username || name || "").trim();

    if (!finalUsername || !email || !password) {
      return res.status(400).json({ msg: "يرجى تعبئة جميع البيانات" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ msg: "هذا البريد مستخدم مسبقاً" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username: finalUsername,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    res.json({ msg: "تم إنشاء الحساب بنجاح" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// LOGIN  =>  POST /api/login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ msg: "الرجاء إدخال البريد وكلمة المرور" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "هذا البريد غير مسجل" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "كلمة المرور غير صحيحة" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME",
      { expiresIn: "7d" }
    );

    res.json({
      msg: "تم تسجيل الدخول بنجاح",
      token,
      user: {
        id: user._id,
        name: user.username,
        username: user.username,
        email: user.email,
        avatar: user.avatar || "",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// GET /api/profile
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    const postsCount = await Post.countDocuments({ user: userId });

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || "",
      postsCount,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// PUT /api/profile
app.put(
  "/api/profile",
  authMiddleware,
  upload.single("avatar"),
  async (req, res) => {
    try {
      const userId = req.userId;
      const { username } = req.body;
      let avatarPath;

      if (req.file) {
        avatarPath = "/uploads/" + req.file.filename;
      }

      const updateData = {};
      if (username && username.trim()) updateData.username = username.trim();
      if (avatarPath) updateData.avatar = avatarPath;

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
      }).select("-password");

      if (!updatedUser) {
        return res.status(404).json({ msg: "المستخدم غير موجود" });
      }

      res.json({
        msg: "تم تحديث البروفايل بنجاح",
        user: {
          _id: updatedUser._id,
          username: updatedUser.username,
          email: updatedUser.email,
          avatar: updatedUser.avatar || "",
        },
      });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ msg: "خطأ في الخادم أثناء تحديث البروفايل" });
    }
  }
);

// ====================== راوتات البوستات ======================

// POST /api/posts
app.post(
  "/api/posts",
  authMiddleware,
  upload.single("media"),
  async (req, res) => {
    try {
      let { text, link } = req.body;

      text = text?.trim();
      link = link?.trim();

      let imageUrl = "";
      let videoUrl = "";

      if (req.file) {
        const filePath = "/uploads/" + req.file.filename;

        if (req.file.mimetype.startsWith("image")) {
          imageUrl = filePath;
        } else if (req.file.mimetype.startsWith("video")) {
          videoUrl = filePath;
        }
      }

      if (!text && !imageUrl && !videoUrl && !link) {
        return res.status(400).json({
          msg: "يجب أن يحتوي المنشور على نص أو صورة أو فيديو أو رابط",
        });
      }

      const newPost = new Post({
        text,
        imageUrl,
        videoUrl,
        link,
        user: req.userId,
      });

      await newPost.save();
      await newPost.populate("user", "username email avatar");

      res.json({
        msg: "تم إنشاء المنشور",
        post: newPost,
      });
    } catch (err) {
      console.error("ERROR in /api/posts:", err);
      res.status(500).json({ msg: "خطأ في الخادم" });
    }
  }
);

// GET /api/posts
app.get("/api/posts", async (req, res) => {
  try {
    console.log("GET /api/posts called");

    const posts = await Post.find()
      .populate("user", "username email avatar")
      .populate("comments.user", "username avatar")
      .sort({ createdAt: -1 });

    res.json(posts);
  } catch (err) {
    console.error("ERROR in /api/posts:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// POST /api/posts/:id/like
app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ msg: "المنشور غير موجود" });
    }

    const userId = req.userId.toString();
    const index = post.likes.findIndex((id) => id.toString() === userId);

    let liked = false;

    if (index === -1) {
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes.splice(index, 1);
      liked = false;
    }

    await post.save();

    res.json({
      msg: liked ? "تم إضافة إعجاب" : "تم إزالة الإعجاب",
      liked,
      likesCount: post.likes.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// POST /api/posts/:id/comment
app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const trimmed = text?.trim();

    if (!trimmed) {
      return res.status(400).json({ msg: "نص التعليق مطلوب" });
    }

    const post = await Post.findById(req.params.id).populate(
      "comments.user",
      "username avatar"
    );

    if (!post) {
      return res.status(404).json({ msg: "المنشور غير موجود" });
    }

    const comment = {
      text: trimmed,
      user: req.userId,
      createdAt: new Date(),
    };

    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "username avatar");

    const lastComment = post.comments[post.comments.length - 1];

    res.json({
      msg: "تم إضافة التعليق",
      comment: {
        text: lastComment.text,
        createdAt: lastComment.createdAt,
        user: {
          _id: lastComment.user._id,
          username: lastComment.user.username,
          name: lastComment.user.username,
          avatar: lastComment.user.avatar || "",
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// DELETE /api/posts/:id
app.delete("/api/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ msg: "المنشور غير موجود" });
    }

    if (post.user.toString() !== req.userId.toString()) {
      return res.status(403).json({ msg: "غير مسموح حذف منشور شخص آخر" });
    }

    await post.deleteOne();

    res.json({ msg: "تم حذف المنشور" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ======================== واجهة الموقع ========================

// أي زيارة للجذر / تفتح index.html من public
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =======================================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ السيرفر شغال على المنفذ ${PORT}`);
});

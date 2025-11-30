// routes/authRoutes.js

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // تأكد أن الملف models/User.js موجود

const router = express.Router();

// ✅ راوت اختبار: GET /api/test
router.get("/test", (req, res) => {
  res.json({ msg: "authRoutes working" });
});

// ✅ REGISTER  =>  POST /api/register
// انتبه: هون المسار "/register" فقط بدون /api
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: "يرجى تعبئة جميع البيانات" });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ msg: "هذا البريد مستخدم مسبقاً" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
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

// ✅ LOGIN  =>  POST /api/login
// كمان هون "/login" فقط
router.post("/login", async (req, res) => {
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
      "SECRET_KEY_CHANGE_ME",
      { expiresIn: "7d" }
    );

    res.json({
      msg: "تم تسجيل الدخول بنجاح",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

export default router;

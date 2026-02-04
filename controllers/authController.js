import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// إنشاء حساب جديد
export const register = async (req, res) => {
  try {
    const { username, name, email, password, birthdate, birthDate } = req.body;
    const finalUsername = (username || name || "").trim();
    const finalBirthdate = birthdate || birthDate;

    if (!finalUsername || !email || !password) {
      return res.status(400).json({ msg: "الرجاء إدخال جميع البيانات" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: "هذا البريد مستخدم مسبقاً" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      username: finalUsername,
      email,
      password: hashedPassword,
      birthdate: finalBirthdate,
    });

    return res.status(201).json({
      msg: "تم إنشاء الحساب بنجاح",
      user: {
        id: user._id,
        name: user.username || user.name,
        email: user.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ msg: "خطأ في السيرفر" });
  }
};

// تسجيل الدخول
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "يرجى إدخال البريد وكلمة المرور" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "المستخدم غير موجود" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "كلمة المرور خاطئة" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME",
      { expiresIn: "7d" }
    );

    return res.json({
      msg: "تم تسجيل الدخول",
      token,
      user: {
        id: user._id,
        name: user.username || user.name,
        email: user.email,
      },
    });
  } catch (err) {
    return res.status(500).json({ msg: "خطأ في السيرفر" });
  }
};

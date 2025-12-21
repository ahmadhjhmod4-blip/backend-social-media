// models/User.js — نسخة ES Module محدّثة (مع blockedUsers)

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // اسم المستخدم (يظهر في Saepel)
    username: {
      type: String,
      required: true,
      trim: true,
      unique: true, // ✅ ما في اسم مستخدم مكرر
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    // ✅ صورة البروفايل
    avatar: {
      type: String,
      default: "",
    },

    // ✅ تاريخ الميلاد (اختياري)
    birthdate: {
      type: Date,
    },

    // ✅ نبذة عن المستخدم (bio)
    bio: {
      type: String,
      trim: true,
      default: "",
    },

    // ✅ الموقع الجغرافي (مدينة / دولة)
    location: {
      type: String,
      trim: true,
      default: "",
    },

    // ✅ رابط خارجي (موقع / حساب)
    website: {
      type: String,
      trim: true,
      default: "",
    },

    // ✅ حالة الحساب: خاص / عام
    // false = عام (أي شخص يقدر يشوفه)
    // true  = خاص
    isPrivate: {
      type: Boolean,
      default: false,
    },

    // ✅ المتابعون (الناس اللي بيتابعوك)
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ✅ الناس اللي أنت بتابعهم
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ✅ المنشورات المحفوظة (Saved Posts / المفضّلة)
    savedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],

    // ✅ هل المستخدم مشرف (Admin)؟
    isAdmin: {
      type: Boolean,
      default: false,
    },

    // ✅ قائمة المستخدمين المحظورين (أنت حاجبهم)
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password; // ✅ ما نرجّع الباسورد أبداً في الـ JSON
        return ret;
      },
    },
  }
);

const User = mongoose.model("User", userSchema);

export default User;

// models/User.js — نسخة ES Module

import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
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
  },
  { timestamps: true }
);

// الموديل
const User = mongoose.model("User", userSchema);

// 👈 أهم سطر
export default User;

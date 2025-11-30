// models/Post.js  — نسخة ES Module

import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // نص البوست
    text: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط صورة (نستقبلها كـ imageUrl في الـ body)
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط فيديو (videoUrl)
    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط خارجي (link)
    link: {
      type: String,
      default: "",
      trim: true,
    },

    // مصفوفة إعجابات (IDs للمستخدمين)
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // التعليقات
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt تلقائياً
  }
);

const Post = mongoose.model("Post", postSchema);
export default Post;

// models/Post.js  — نسخة ES Module محسّنة بدون كسر أي شيء

import mongoose from "mongoose";

const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true } // نخلي لكل تعليق _id خاص فيه (مهم للتعديل/الحذف)
);

const reportSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    reason: {
      type: String,
      trim: true,
    },
    other: {
      type: String,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const postSchema = new Schema(
  {
    // صاحب المنشور
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // نوع ظهور المنشور: عام أو خاص
    privacy: {
      type: String,
      enum: ["public", "private"], // public = عام, private = خاص
      default: "public",
    },

    // نص البوست
    text: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط صورة
    imageUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط فيديو
    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    // رابط خارجي
    link: {
      type: String,
      default: "",
      trim: true,
    },

    // مصفوفة إعجابات (IDs للمستخدمين)
    likes: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [], // ✅ ضمان أن تكون دائماً [] لو ما في لايكات
    },

    // التعليقات
    comments: {
      type: [commentSchema],
      default: [], // ✅ دائماً مصفوفة، حتى لو ما في تعليقات
    },

    // البلاغات على المنشور
    reports: {
      type: [reportSchema],
      default: [], // ✅ نفس الشيء للبلاغات
    },
  },
  {
    timestamps: true, // createdAt, updatedAt تلقائياً
  }
);

// ================== فهارس (Indexes) لتحسين الأداء ==================

// ترتيب المنشورات في الصفحة الرئيسية
postSchema.index({ createdAt: -1 });

// منشورات مستخدم واحد (مفيد لصفحة البروفايل)
postSchema.index({ user: 1, createdAt: -1 });

// استعلامات الخصوصية (public/private)
postSchema.index({ privacy: 1, createdAt: -1 });

// لاستخدامات مستقبلية (من علّق / من بلّغ)
postSchema.index({ "comments.user": 1 });
postSchema.index({ "reports.user": 1 });

// ================== دوال مساعدة (اختيارية) ==================

// هل المستخدم عمل لايك على هذا المنشور؟
postSchema.methods.isLikedBy = function (userId) {
  if (!userId) return false;
  const strId = userId.toString();
  return this.likes.some((id) => id.toString() === strId);
};

const Post = mongoose.model("Post", postSchema);
export default Post;

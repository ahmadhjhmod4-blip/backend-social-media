// models/Report.js
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    // نوع الهدف: منشور أو قصة
    targetType: {
      type: String,
      enum: ["post", "story"],
      required: true,
    },

    // لو البلاغ على منشور
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },

    // لو البلاغ على ستوري
    story: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Story",
    },

    // المستخدم الذي قدّم البلاغ
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // سبب البلاغ
    reason: {
      type: String,
      required: true,
      trim: true,
    },

    // تفاصيل إضافية (اختياري)
    details: {
      type: String,
      trim: true,
    },

    // حالة البلاغ
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true, // createdAt و updatedAt
  }
);

// ✅ تأكيد أن عندنا هدف واحد على الأقل حسب النوع
reportSchema.pre("validate", function (next) {
  if (this.targetType === "post" && !this.post) {
    return next(new Error("حقل post مطلوب لبلاغ المنشور"));
  }
  if (this.targetType === "story" && !this.story) {
    return next(new Error("حقل story مطلوب لبلاغ الستوري"));
  }
  next();
});

// 🔒 تجنّب OverwriteModelError لو الموديل اتسجّل سابقاً
const Report =
  mongoose.models.Report || mongoose.model("Report", reportSchema);

export default Report;

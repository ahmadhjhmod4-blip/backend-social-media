// models/Message.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const attachmentSchema = new Schema(
  {
    // رابط الملف النهائي على السيرفر (المصدر الأساسي)
    url: { type: String, required: true },

    // (اختياري) رابط بديل - CDN/نسخة محلية/إعادة رفع
    fallbackUrl: { type: String, default: "" },

    type: {
      type: String,
      enum: ["image", "video", "audio", "file"],
      default: "file",
    },

    originalName: { type: String, default: "" },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: "" },

    // للصوت (ثواني)
    duration: { type: Number, default: 0 },
  },
  { _id: false }
);

// معاينة سريعة للرسالة (للرد/الفوروارد) لتسريع العرض بدون populate ثقيل
const messagePreviewSchema = new Schema(
  {
    type: { type: String, default: "text" }, // text | image | video | audio | file | mixed
    text: { type: String, default: "" },
    fileName: { type: String, default: "" },
    url: { type: String, default: "" }, // اختياري (مثلاً أول مرفق)
    senderId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    senderName: { type: String, default: "" }, // اختياري
    createdAt: { type: Date, default: null }, // وقت الرسالة الأصلية (اختياري)
  },
  { _id: false }
);

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },

    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ✅ أهم حقل لمنع التكرار: نفس الإرسال لا يُحفظ مرتين (بيجي من الفرونت UUID)
    clientMsgId: { type: String, default: null },

    // نوع الرسالة
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "mixed", "location", "contact"],
      default: "text",
    },

    text: { type: String, trim: true, default: "" },

    // المرفقات (بما فيها الصوت)
    attachments: { type: [attachmentSchema], default: [] },

    // بيانات إضافية لأنواع خاصة (Location / Contact ...)
    meta: { type: Schema.Types.Mixed, default: {} },

    // قراءة الرسالة
    seenBy: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // حذف الرسالة عند مستخدم معيّن فقط
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // ✅ حذف للجميع (soft delete)
    deletedForAll: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    // ======================
    // ✅ Reply
    // ======================
    replyTo: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    replyPreview: { type: messagePreviewSchema, default: null },

    // ======================
    // ✅ Forward
    // ======================
    forwardOf: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    forwardComment: { type: String, trim: true, default: "" },
    forwardPreview: { type: messagePreviewSchema, default: null },

    // ======================
    // ✅ Edit / Reactions
    // ======================
    editedAt: { type: Date, default: null },
    editedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reactions: {
      type: [
        new Schema(
          {
            user: { type: Schema.Types.ObjectId, ref: "User", required: true },
            emoji: { type: String, trim: true, default: "" },
            at: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

// تسريع تحميل الرسائل
messageSchema.index({ conversation: 1, createdAt: 1 });

// ✅ الجذر الحقيقي لمنع تكرار الرسائل في DB (unique + sparse حتى يسمح null بدون مشاكل)
messageSchema.index(
  { conversation: 1, sender: 1, clientMsgId: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model("Message", messageSchema);

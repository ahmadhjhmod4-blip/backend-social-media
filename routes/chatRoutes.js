// routes/chatRoutes.js
import express from "express";
import authMiddleware from "../middleware/auth.js";

import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";

import upload from "../upload.js"; // multer config

const router = express.Router();

// ✅ مساعد: تحقق أن المستخدم مشارك بالمحادثة
async function assertParticipant(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { ok: false, status: 404, msg: "المحادثة غير موجودة" };

  if (!conversation.participants.some((p) => String(p) === String(userId))) {
    return { ok: false, status: 403, msg: "لا تملك صلاحية على هذه المحادثة" };
  }

  return { ok: true, conversation };
}

// ✅ مساعد: رجّع رابط نسبي للملف داخل uploads
function toUploadsUrl(reqFile) {
  return `/uploads/${reqFile.filename}`;
}

// ✅ مساعد: تحديد نوع المرفق من mimetype
function detectAttachmentType(mimeType = "") {
  const mt = String(mimeType || "").toLowerCase();
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "audio";
  return "file";
}

/*
  ✅ 1) جلب قائمة المحادثات للمستخدم الحالي
  GET /api/chat/conversations
*/
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
      deletedFor: { $ne: userId },
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({
        path: "participants",
        select: "username avatar isVerified",
      })
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username avatar" },
      });

    res.json(conversations);
  } catch (err) {
    console.error("GET /api/chat/conversations error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب المحادثات" });
  }
});

/*
  ✅ 2) بدء / الحصول على محادثة ثنائية مع مستخدم آخر
  POST /api/chat/conversations/start
  body: { otherUserId }
*/
router.post("/conversations/start", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ msg: "otherUserId مطلوب" });
    }

    if (otherUserId === userId) {
      return res.status(400).json({ msg: "لا يمكنك بدء محادثة مع نفسك حالياً" });
    }

    const otherUser = await User.findById(otherUserId).select("username avatar");
    if (!otherUser) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [userId, otherUserId] },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [userId, otherUserId],
        isGroup: false,
        createdBy: userId,
        lastMessageAt: new Date(),
      });
    }

    conversation = await conversation.populate({
      path: "participants",
      select: "username avatar isVerified",
    });

    res.json(conversation);
  } catch (err) {
    console.error("POST /api/chat/conversations/start error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إنشاء المحادثة" });
  }
});

/*
  ✅ 3) جلب رسائل محادثة معيّنة (Cursor Pagination + دعم page القديم)
  GET /api/chat/conversations/:id/messages?limit=&before=&page=
*/
router.get("/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "30", 10), 100));
    const beforeRaw = req.query.before ? String(req.query.before) : "";
    const page = parseInt(req.query.page || "0", 10);

    const check = await assertParticipant(conversationId, userId);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });

    const baseFilter = {
      conversation: conversationId,
      deletedFor: { $ne: userId },
    };

    if (beforeRaw) {
      const beforeDate = new Date(beforeRaw);
      if (!isNaN(beforeDate.getTime())) {
        baseFilter.createdAt = { $lt: beforeDate };
      }
    }

    let skip = 0;
    if (!beforeRaw && page && page > 0) {
      skip = (page - 1) * limit;
    }

    const docs = await Message.find(baseFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit + 1)
      .populate("sender", "username avatar");

    const hasMore = docs.length > limit;
    const items = (hasMore ? docs.slice(0, limit) : docs).reverse();

    const nextCursor = items.length ? new Date(items[0].createdAt).toISOString() : null;

    res.json({ items, hasMore, nextCursor });
  } catch (err) {
    console.error("GET /api/chat/conversations/:id/messages error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب الرسائل" });
  }
});

/*
  ✅ رفع ملف صوت فقط (توافق قديم)
  POST /api/chat/upload/audio
  form-data: audio=<file>
*/
router.post("/upload/audio", authMiddleware, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "ملف الصوت مطلوب" });

    const mt = String(req.file.mimetype || "");
    if (!mt.startsWith("audio/")) {
      return res.status(400).json({ msg: "الملف المرفوع ليس صوتاً" });
    }

    const url = toUploadsUrl(req.file);

    res.status(201).json({
      url,
      type: "audio",
      mimeType: req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname || "",
      filename: req.file.filename,
    });
  } catch (err) {
    console.error("POST /api/chat/upload/audio error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء رفع الصوت" });
  }
});

/*
  ✅ رفع أي مرفق (صورة/فيديو/ملف/موسيقى)
  POST /api/chat/upload/attachment
  form-data: file=<any>
*/
router.post("/upload/attachment", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "الملف مطلوب" });

    const url = toUploadsUrl(req.file);
    const mimeType = String(req.file.mimetype || "");
    const type = detectAttachmentType(mimeType);

    const payload = {
      url,
      type,
      mimeType,
      size: req.file.size || 0,
      originalName: req.file.originalname || "",
      filename: req.file.filename,
    };

    // ✅ رجّع شكلين لتوافق أي فرونت قديم/جديد
    return res.status(201).json({
      ...payload,
      attachment: payload,
    });
  } catch (err) {
    console.error("POST /api/chat/upload/attachment error:", err);
    return res.status(500).json({ msg: "حدث خطأ أثناء رفع الملف" });
  }
});

/*
  ✅ إرسال رسالة صوتية (ملف + رسالة واحدة)
  POST /api/chat/conversations/:id/messages/voice
  form-data:
    audio=<file>
    durationMs?=number
    clientMsgId?=string
*/
router.post(
  "/conversations/:id/messages/voice",
  authMiddleware,
  upload.single("audio"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const conversationId = req.params.id;

      const check = await assertParticipant(conversationId, userId);
      if (!check.ok) return res.status(check.status).json({ msg: check.msg });

      if (!req.file) return res.status(400).json({ msg: "ملف الصوت مطلوب" });

      const mt = String(req.file.mimetype || "");
      if (!mt.startsWith("audio/")) {
        return res.status(400).json({ msg: "الملف المرفوع ليس صوتاً" });
      }

      const url = toUploadsUrl(req.file);
      const durationMs = Number(req.body.durationMs || 0) || 0;
      const duration = durationMs > 0 ? Math.round((durationMs / 1000) * 100) / 100 : 0;
      const clientMsgId = req.body.clientMsgId ? String(req.body.clientMsgId) : null;

      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        clientMsgId,
        type: "audio",
        text: "",
        attachments: [
          {
            type: "audio",
            url,
            mimeType: req.file.mimetype,
            size: req.file.size,
            originalName: req.file.originalname || "",
            duration,
          },
        ],
        seenBy: [userId],
      });

      check.conversation.lastMessage = message._id;
      check.conversation.lastMessageAt = message.createdAt;
      await check.conversation.save();

      const populatedMsg = await message.populate("sender", "username avatar");
      res.status(201).json(populatedMsg);
    } catch (err) {
      if (String(err?.code) === "11000") {
        return res.status(409).json({ msg: "تم حفظ هذه الرسالة مسبقاً" });
      }
      console.error("POST /api/chat/conversations/:id/messages/voice error:", err);
      res.status(500).json({ msg: "حدث خطأ أثناء إرسال الرسالة الصوتية" });
    }
  }
);

/*
  ✅ إرسال رسالة (نص + مرفقات + موقع + جهة اتصال + موسيقى)
  POST /api/chat/conversations/:id/messages
  body:
    {
      type?,
      text?,
      attachments?,
      location?,
      contact?,
      clientMsgId?,
      meta?
    }
*/
router.post("/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const typeRaw = req.body?.type ? String(req.body.type) : "";
    const textRaw = req.body?.text ?? req.body?.message ?? req.body?.content ?? "";
    const text = String(textRaw || "").trim();

    // ✅ دعم شكلين للمرفقات: attachments[] أو attachment واحد
    let attachments = [];
    if (Array.isArray(req.body?.attachments)) attachments = req.body.attachments;
    else if (req.body?.attachment && typeof req.body.attachment === "object") attachments = [req.body.attachment];

    const location = req.body?.location && typeof req.body.location === "object" ? req.body.location : null;
    const contact = req.body?.contact && typeof req.body.contact === "object" ? req.body.contact : null;
    const clientMsgId = req.body?.clientMsgId ? String(req.body.clientMsgId) : null;
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    const hasText = !!text;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const hasLocation = !!(location && typeof location.lat === "number" && typeof location.lng === "number");
    const hasContact = !!(contact && (contact.name || contact.phone));

    if (!hasText && !hasAttachments && !hasLocation && !hasContact) {
      return res.status(400).json({ msg: "لا يوجد محتوى لإرسال الرسالة" });
    }

    const check = await assertParticipant(conversationId, userId);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });

    const safeAttachments = hasAttachments
      ? attachments
          .filter((a) => a && a.url)
          .map((a) => ({
            url: String(a.url),
            fallbackUrl: a.fallbackUrl ? String(a.fallbackUrl) : "",
            type: a.type ? String(a.type) : detectAttachmentType(a.mimeType || a.mimeType),
            originalName: a.originalName ? String(a.originalName) : "",
            size: Number(a.size || 0) || 0,
            mimeType: a.mimeType ? String(a.mimeType) : "",
            duration: Number(a.duration || 0) || 0,
          }))
      : [];

    // ✅ type النهائي
    let finalType = "text";
    if (hasLocation) finalType = "location";
    else if (hasContact) finalType = "contact";
    else if (typeRaw) finalType = typeRaw;
    else if (safeAttachments.length) finalType = safeAttachments[0]?.type || "file";
    else finalType = "text";

    // ✅ mixed إذا نص + شيء إضافي
    const extrasCount = (safeAttachments.length ? 1 : 0) + (hasLocation ? 1 : 0) + (hasContact ? 1 : 0);
    if (hasText && extrasCount >= 1) finalType = "mixed";

    // ✅ بناء location
    let safeLocation = null;
    if (hasLocation) {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      const label = location.label ? String(location.label) : "";
      const mapUrl =
        location.mapUrl && String(location.mapUrl).trim()
          ? String(location.mapUrl).trim()
          : `https://maps.google.com/?q=${lat},${lng}`;
      safeLocation = { lat, lng, label, mapUrl };
    }

    // ✅ بناء contact
    let safeContact = null;
    if (hasContact) {
      safeContact = {
        name: contact.name ? String(contact.name).trim() : "",
        phone: contact.phone ? String(contact.phone).trim() : "",
      };
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      clientMsgId,
      type: finalType,
      text: hasText ? text : "",
      attachments: safeAttachments,
      location: safeLocation,
      contact: safeContact,
      meta, // إذا موديلك فيه meta بيتخزن، وإذا ما فيه ما رح يكسّر (Mongoose strict قد يمنعه)
      seenBy: [userId],
    });

    check.conversation.lastMessage = message._id;
    check.conversation.lastMessageAt = message.createdAt;
    await check.conversation.save();

    const populatedMsg = await message.populate("sender", "username avatar");
    res.status(201).json(populatedMsg);
  } catch (err) {
    if (String(err?.code) === "11000") {
      return res.status(409).json({ msg: "تم حفظ هذه الرسالة مسبقاً" });
    }
    console.error("POST /api/chat/conversations/:id/messages error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إرسال الرسالة" });
  }
});

/*
  ✅ تعليم الرسائل كمقروءة (seen)
  POST /api/chat/conversations/:id/seen
*/
router.post("/conversations/:id/seen", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const check = await assertParticipant(conversationId, userId);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });

    await Message.updateMany(
      { conversation: conversationId, seenBy: { $ne: userId } },
      { $addToSet: { seenBy: userId } }
    );

    res.json({ msg: "تم تحديث حالة القراءة" });
  } catch (err) {
    console.error("POST /api/chat/conversations/:id/seen error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء تحديث حالة القراءة" });
  }
});

/*
  ✅ مسح محتوى المحادثة عندي فقط (Soft delete via deletedFor)
  POST /api/chat/conversations/:id/clear
*/
router.post("/conversations/:id/clear", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversationId = req.params.id;

    const check = await assertParticipant(conversationId, userId);
    if (!check.ok) return res.status(check.status).json({ msg: check.msg });

    const r = await Message.updateMany(
      { conversation: conversationId, deletedFor: { $ne: userId } },
      { $addToSet: { deletedFor: userId } }
    );

    const cleared = Number(r?.modifiedCount ?? r?.nModified ?? 0) || 0;
    res.json({ ok: true, cleared });
  } catch (err) {
    console.error("POST /api/chat/conversations/:id/clear error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء مسح المحادثة" });
  }
});

export default router;

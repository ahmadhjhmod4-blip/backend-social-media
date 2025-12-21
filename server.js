// server.js  (نسخة ES Module معدَّلة + خصوصية المنشورات + خصوصية الحساب + واجهة المشرف + الستوري + نظام بلاغات موحّد + حظر المستخدمين + المحادثات + Socket.io)

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs/promises";
import crypto from "crypto";

import User from "./models/User.js";
import Post from "./models/Post.js";
import Report from "./models/Report.js";
import Story from "./models/Story.js"; // ⭐ موديل القصص
import upload from "./upload.js";
import Conversation from "./models/Conversation.js"; // ⭐ موديل المحادثات
import Message from "./models/Message.js"; // ⭐ موديل الرسائل
import CallLog from "./models/CallLog.js"; // ⭐ سجل الاتصالات

dotenv.config();
mongoose.set("strictPopulate", false);

const app = express();
const server = createServer(app);
app.set("trust proxy", 1);

// ===== إعداد __dirname في ES Modules =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================== إعدادات CORS ==================
// ✅ للنشر على أي شبكة/دومين: دعم قائمة Origins (مفصولة بفاصلة) أو السماح للجميع
// مثال:
// CLIENT_ORIGIN=https://saepel.com,https://www.saepel.com,http://localhost:5173
// أو
// CLIENT_ORIGIN=*
const CLIENT_ORIGIN_RAW = String(process.env.CLIENT_ORIGIN || "").trim();
const ALLOWED_ORIGINS = CLIENT_ORIGIN_RAW
  ? CLIENT_ORIGIN_RAW.split(",").map((x) => x.trim()).filter(Boolean)
  : ["*"];

const ALLOW_ALL = ALLOWED_ORIGINS.includes("*");

// نسمح بطلبات بدون Origin (مثل Postman / السيرفر-تو-سيرفر)
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (ALLOW_ALL) return true;
  return ALLOWED_ORIGINS.includes(origin);
}
// ================== Socket.io للدردشة الفورية ==================
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // origin قد يكون undefined أحياناً
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS (socket.io)"), false);
    },
    methods: ["GET", "POST"],
    credentials: !ALLOW_ALL, // لو * ما في credentials
  },
});
// تخزين المستخدمين المتصلين
const connectedUsers = new Map();

// ================== Helpers للصوت/المرفقات عبر DataURL ==================
const UPLOADS_DIR = path.join(__dirname, "uploads");

async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {}
}

function safeExtFromMime(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.includes("image/jpeg")) return "jpg";
  if (m.includes("image/png")) return "png";
  if (m.includes("image/webp")) return "webp";
  if (m.includes("image/gif")) return "gif";
  if (m.includes("video/mp4")) return "mp4";
  if (m.includes("video/webm")) return "webm";
  if (m.includes("audio/webm")) return "webm";
  if (m.includes("audio/mpeg")) return "mp3";
  if (m.includes("audio/mp4")) return "m4a";
  if (m.includes("audio/ogg")) return "ogg";
  return "bin";
}

function detectKindFromMime(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

// يحوّل dataURL إلى ملف داخل uploads ويرجع مساره /uploads/xxx.ext
async function saveDataUrlToUploads(dataUrl, fallbackMime = "", preferredName = "") {
  if (!dataUrl || typeof dataUrl !== "string") return "";

  // إذا أصلاً مسار جاهز
  if (dataUrl.startsWith("/uploads/")) return dataUrl;
  if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) return dataUrl;

  // نتوقع data:*;base64,....
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return "";

  const mime = match[1] || fallbackMime || "application/octet-stream";
  const b64 = match[2] || "";
  const ext = safeExtFromMime(mime);

  const rand = crypto.randomBytes(16).toString("hex");
  const cleanBase = (preferredName || "").toString().trim().replace(/[^\w\-\.]+/g, "_");
  const fileName =
    (cleanBase ? cleanBase.replace(/\.[^/.]+$/, "") : `socket_${rand}`) + `_${rand}.${ext}`;

  const abs = path.join(UPLOADS_DIR, fileName);
  const buf = Buffer.from(b64, "base64");

  await ensureUploadsDir();
  await fs.writeFile(abs, buf);

  return `/uploads/${fileName}`;
}

// يدعم:
// - عنصر نصّي (dataURL أو /uploads/.. أو رابط)
// - أو عنصر كائن: { url, mimeType, originalName, size, type }
async function normalizeIncomingAttachments(raw = []) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];

  for (const item of list) {
    if (!item) continue;

    // لو String
    if (typeof item === "string") {
      const savedUrl = await saveDataUrlToUploads(item, "", "file");
      if (!savedUrl) continue;
      out.push({
        url: savedUrl,
        type: "file",
        originalName: "file",
        size: 0,
        mimeType: "",
        duration: 0,
      });
      continue;
    }

    // لو Object
    const mimeType = item.mimeType || item.mimetype || "";
    const originalName = item.originalName || item.name || "file";
    const size = item.size || 0;

    const urlRaw = item.url || item.path || item.dataUrl || "";
    const savedUrl = await saveDataUrlToUploads(urlRaw, mimeType, originalName);

    if (!savedUrl) continue;

    const kind = item.type || item.kind || detectKindFromMime(mimeType);

    const durationRaw = item.duration ?? item.audioDuration ?? item.dur ?? 0;
    const duration = Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : 0;

    out.push({
      url: savedUrl,
      type: kind,
      originalName,
      size,
      mimeType,
      duration,
    });
  }

  return out;
}

// ================== تحديد نوع الرسالة بشكل موحّد وآمن ==================
// - نص فقط => text
// - مرفق واحد بدون نص => نوع المرفق
// - عدة مرفقات (أو نص + مرفقات) => mixed
function computeMessageType(text = "", attachments = []) {
  const hasText = !!String(text || "").trim();
  const list = Array.isArray(attachments) ? attachments : [];
  if (hasText && list.length) return "mixed";
  if (hasText && !list.length) return "text";
  if (!hasText && list.length === 1) return list[0].type || "file";
  if (!hasText && list.length > 1) return "mixed";
  return "text";
}


// ================== Socket Auth (JWT) ==================
// ✅ يمنع التزوير (عدم الثقة بـ senderId القادم من الفرونت)
io.use((socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.split(" ")?.[1] ||
      "";

    if (!token) return next(new Error("NO_TOKEN"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME");
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) return next(new Error("BAD_TOKEN"));

    socket.userId = String(userId);
    next();
  } catch {
    next(new Error("BAD_TOKEN"));
  }
});



/* ===================================================================== */
/* 📞 Call Logs (سجل الاتصالات) — Backend */
/*  - تخزين محاولات الاتصال (audio/video) + الحالة + المدة */
/*  - الحذف يكون per-user عبر deletedFor */
/* ===================================================================== */

async function upsertCallLogRinging({ callId, from, to, type }) {
  try {
    const cid = String(callId || "").trim();
    const caller = String(from || "").trim();
    const callee = String(to || "").trim();
    const t = (type === "video") ? "video" : "audio";
    if (!cid || !caller || !callee) return null;

    const doc = await CallLog.findOneAndUpdate(
      { callId: cid },
      {
        $setOnInsert: {
          callId: cid,
          participants: [caller, callee],
          caller,
          callee,
          type: t,
          status: "ringing",
          startedAt: null,
          endedAt: null,
          durationSec: 0,
          deletedFor: [],
        },
        $set: { type: t, status: "ringing" },
      },
      { new: true, upsert: true }
    );
    return doc;
  } catch (e) {
    console.error("upsertCallLogRinging error:", e);
    return null;
  }
}

async function markCallLogAccepted({ callId }) {
  try {
    const cid = String(callId || "").trim();
    if (!cid) return null;
    const now = new Date();
    const doc = await CallLog.findOneAndUpdate(
      { callId: cid },
      { $set: { status: "accepted", startedAt: now, endedAt: null, durationSec: 0 } },
      { new: true }
    );
    return doc;
  } catch (e) {
    console.error("markCallLogAccepted error:", e);
    return null;
  }
}

async function markCallLogEnded({ callId, status = "ended" }) {
  try {
    const cid = String(callId || "").trim();
    if (!cid) return null;
    const now = new Date();

    const doc = await CallLog.findOne({ callId: cid });
    if (!doc) return null;

    // لا نغيّر حالة نهائية سابقاً (مثلاً rejected/cancelled) إلا إذا كانت ringing/accepted
    const terminal = ["ended", "rejected", "cancelled", "busy", "missed"];
    const nextStatus = terminal.includes(status) ? status : "ended";

    let durationSec = doc.durationSec || 0;
    const startedAt = doc.startedAt ? new Date(doc.startedAt) : null;
    if (startedAt && !Number.isNaN(startedAt.getTime())) {
      durationSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
    }

    doc.status = nextStatus;
    doc.endedAt = now;
    doc.durationSec = durationSec;
    await doc.save();

    return doc;
  } catch (e) {
    console.error("markCallLogEnded error:", e);
    return null;
  }
}


io.on("connection", (socket) => {
  console.log("🔌 مستخدم متصل:", socket.id, "userId:", socket.userId);

  // ✅ join-user لازم يطابق توكن
  socket.on("join-user", (userId) => {
    try {
      const uid = String(userId || "");
      if (!uid || uid !== String(socket.userId)) {
        console.warn("⚠️ join-user مرفوض: userId لا يطابق التوكن", { uid, tokenUser: socket.userId });
        return;
      }

      socket.join(`user-${uid}`);
      connectedUsers.set(uid, socket.id);
      console.log(`👤 ${uid} انضم للدردشة (socket: ${socket.id})`);
    } catch (e) {
      console.error("join-user error:", e);
    }
  });

  // ⭐⭐ إرسال رسالة عبر Socket (يدعم text + attachments + voiceNote كـ DataURL) ⭐⭐
  socket.on("send-message", async (data) => {
    try {
      const conversationId = data?.conversationId;
      if (!conversationId) {
        return socket.emit("message-error", { error: "conversationId مفقود" });
      }

      // ✅ المرسل الحقيقي من التوكن فقط
      const senderId = String(socket.userId);

      // تأكد من المحادثة + صلاحية المرسل
      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        return socket.emit("message-error", { error: "المحادثة غير موجودة" });
      }

      const isMember = (conv.participants || []).some((p) => String(p) === senderId);
      if (!isMember) {
        return socket.emit("message-error", { error: "لا تملك صلاحية على هذه المحادثة" });
      }

      // المستقبل (لمحادثة ثنائية) — لا نثق بالـ receiverId القادم
      let receiverId = null;
      if (!conv.isGroup) {
        receiverId = (conv.participants || []).find((p) => String(p) !== senderId) || null;
        receiverId = receiverId ? String(receiverId) : null;
      }

      const text = typeof data?.text === "string" ? data.text.trim() : "";

      // دمج: attachments + voiceNote (كله يتحول لمصفوفة attachments)
      const rawAttachments = [];
      if (Array.isArray(data?.attachments) && data.attachments.length) rawAttachments.push(...data.attachments);
      if (data?.voiceNote) rawAttachments.push(data.voiceNote);

      const attachments = await normalizeIncomingAttachments(rawAttachments);
      // ✅ Reply / Forward (اختياري)
      const rawReplyTo = data?.replyTo || data?.replyToId || null;
      const rawForwardOf = data?.forwardOf || data?.forwardOfId || null;

      const replyTo =
        rawReplyTo && mongoose.Types.ObjectId.isValid(String(rawReplyTo))
          ? String(rawReplyTo)
          : null;

      const forwardOf =
        rawForwardOf && mongoose.Types.ObjectId.isValid(String(rawForwardOf))
          ? String(rawForwardOf)
          : null;

      // previews (كائنات صغيرة للعرض السريع)
      const replyPreview = data?.replyPreview && typeof data.replyPreview === "object" ? data.replyPreview : null;
      let forwardPreview = data?.forwardPreview && typeof data.forwardPreview === "object" ? data.forwardPreview : null;

      // تعليق اختياري مع الفوروارد
      const forwardComment = typeof data?.forwardComment === "string" ? data.forwardComment.trim() : "";


      const hasText = !!text;
      const hasFiles = attachments.length > 0;
      const hasForward = !!forwardOf;
      // ملاحظة: الرد بدون نص/مرفق نتركه حسب سياستك، حالياً ما نعتبره كافي لوحده.
      const hasReply = !!replyTo && (hasText || hasFiles);

      if (!hasText && !hasFiles && !hasForward && !hasReply) {
        return socket.emit("message-error", { error: "يجب إرسال نص أو مرفق واحد على الأقل" });
      }
      // ✅ تجهيز محتوى الرسالة النهائي (خصوصاً للفوروارد)
      let finalText = text || "";
      let finalAttachments = attachments;

      // ✅ Forward: انسخ محتوى الرسالة الأصلية (نص/مرفقات) حتى تشتغل (صوت/صورة/فيديو) طبيعي
      if (hasForward) {
        const original = await Message.findById(forwardOf).lean();
        if (!original || original.deletedForAll) {
          return socket.emit("message-error", { error: "لا يمكن تحويل هذه الرسالة" });
        }

        // تأكد إن المرسل يملك صلاحية الوصول للرسالة الأصلية (عضو بالمحادثة الأصلية)
        const canAccess = await Conversation.exists({ _id: original.conversation, participants: senderId });
        if (!canAccess) {
          return socket.emit("message-error", { error: "لا يمكن تحويل هذه الرسالة" });
        }

        const oText = String(original.text || "");
        const oAttachments = Array.isArray(original.attachments) ? original.attachments : [];

        // ✅ بعض النسخ القديمة كانت تحفظ الروابط خارج attachments (audioUrl / imageUrl / videoUrl / fileUrl ...)
        // نحاول استخراجها لحتى يتحول الصوت/الصورة/الفيديو كـ مرفق فعلي عند الـ Forward
        const legacyUrls = [
          original.audioUrl,
          original.voiceUrl,
          original.voiceNoteUrl,
          original.imageUrl,
          original.videoUrl,
          original.fileUrl,
          original.url,
          original.path,
        ].filter(Boolean);

        let derivedAttachments = [];
        if (!oAttachments.length && legacyUrls.length) {
          const inferredType =
            original.type === "audio" || original.kind === "audio"
              ? "audio"
              : original.type === "image" || original.kind === "image"
              ? "image"
              : original.type === "video" || original.kind === "video"
              ? "video"
              : "file";

          derivedAttachments = legacyUrls.map((u) => ({
            url: String(u),
            type: inferredType,
            originalName: "",
            size: 0,
            mimeType: "",
            duration: Number(original.duration || 0) || 0,
          }));
        }


        // comment اختياري
        const cmt = String(forwardComment || "").trim();

        // لو الأصل نص فقط: انقل النص نفسه (مع تعليق اختياري)
        if (oAttachments.length === 0 && derivedAttachments.length === 0) {
          finalAttachments = [];
          // ضمّ التعليق مع نص الرسالة الأصلية بسطر جديد
          finalText = (cmt ? cmt + "\n" : "") + oText;
        } else {
          // لو الأصل فيه مرفقات (صوت/صورة/فيديو/ملف): انقل المرفقات، والنص يصبح تعليق فقط
          finalAttachments = oAttachments.length ? oAttachments : derivedAttachments;
          // لو في مرفقات، نخلي النص: تعليق + (نص أصلي لو كان مفيد)
          const looksLikePlaceholder = oText.trim() === "رسالة صوتية" || oText.trim() === "رسالة" || oText.trim() === "";
          if (!looksLikePlaceholder) {
            finalText = cmt ? (cmt + "\n" + oText) : oText;
          } else {
            finalText = cmt;
          }
        }

        // بنينا forwardPreview تلقائياً لو مو مبعوث من الفرونت
        if (!forwardPreview || typeof forwardPreview !== "object") {
          const first = oAttachments[0] || null;
          forwardPreview = {
            type: original.type || computeMessageType(oText, oAttachments),
            text: oText ? oText.slice(0, 140) : "",
            fileName: first?.originalName || "",
            url: first?.url || "",
            senderId: original.sender || null,
            createdAt: original.createdAt || null,
          };
        }
      }

      // ✅ نوع الرسالة بشكل موحّد وآمن (بعد تعديل المحتوى النهائي)
      const msgType = computeMessageType(finalText, finalAttachments);

      const message = await Message.create({
        conversation: conversationId,
        sender: senderId,
        clientMsgId: String(data?.clientMsgId || data?.clientTempId || "") || null,
        type: msgType,
        text: finalText,
        attachments: finalAttachments,
        // Reply
        replyTo,
        replyPreview,
        // Forward
        forwardOf,
        forwardPreview,
        forwardComment,
        seenBy: [senderId],
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastMessageAt: message.createdAt,
        // ✅ لو كانت المحادثة مخفية بسبب Clear Chat عند أي طرف، رجّعها للظهور
        $pull: { deletedFor: { $in: (conv.participants || []).map((p) => String(p)) } },
      });
const populatedMessage = await message.populate("sender", "username avatar");

      const payload = populatedMessage.toObject();
      payload.conversation = conversationId;
      // تمرير clientTempId (لمنع تكرار الرسائل بالواجهة)
      if (data?.clientTempId) payload.clientTempId = String(data.clientTempId);

      // إرسال للمرسل دائماً
      io.to(`user-${senderId}`).emit("new-message", payload);

      // إرسال للمستقبل/المجموعة
      if (!conv.isGroup) {
        if (receiverId) io.to(`user-${receiverId}`).emit("new-message", payload);
      } else {
        for (const p of conv.participants || []) {
          const pid = String(p);
          if (pid !== senderId) io.to(`user-${pid}`).emit("new-message", payload);
        }
      }

      socket.emit("message-sent", { success: true, messageId: message._id });

      console.log("✅ Socket message sent:", {
        conversationId,
        type: msgType,
        from: senderId,
        to: receiverId || "group",
        hasText: !!text,
        attachmentsCount: attachments.length,
      });
    } catch (error) {
      console.error("❌ Socket send-message error:", error);
      socket.emit("message-error", { error: "فشل إرسال الرسالة" });
    }
  });

  // ✅ Typing: المرسل من التوكن
  socket.on("typing", async ({ receiverId, isTyping }) => {
    try {
      const senderId = String(socket.userId);
      const rid = receiverId ? String(receiverId) : null;
      if (!rid) return;

      socket.to(`user-${rid}`).emit("user-typing", {
        senderId,
        isTyping: !!isTyping,
      });
    } catch (e) {
      console.error("typing error:", e);
    }
  });

  
  /* ================== Calls Signaling (بدون WebRTC) ================== */
  // ملاحظة: هذا فقط ترحيل (relay) بين المستخدمين عبر غرف user-<id>.
  // الفرونت يرسل: call:invite / call:ringing / call:accept / call:reject / call:cancel / call:end / call:busy

  socket.on("call:invite", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      const type = payload.type === "video" ? "video" : "audio";
      if (!from || !to || !callId || to === from) return;

      // ✅ Call log: create/update ringing
      upsertCallLogRinging({ callId, from, to, type });

      // أرسل للطرف الآخر
      io.to(`user-${to}`).emit("call:incoming", { callId, from, type });
    } catch (e) {
      console.error("call:invite error:", e);
    }
  });

  socket.on("call:ringing", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      io.to(`user-${to}`).emit("call:ringing", { callId, from });
    } catch (e) {
      console.error("call:ringing error:", e);
    }
  });

  socket.on("call:accept", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      // ✅ Call log: accepted (start timer)
      markCallLogAccepted({ callId });

      io.to(`user-${to}`).emit("call:accepted", { callId, from });
    } catch (e) {
      console.error("call:accept error:", e);
    }
  });

  socket.on("call:reject", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      // ✅ Call log: rejected
      markCallLogEnded({ callId, status: "rejected" });

      io.to(`user-${to}`).emit("call:rejected", { callId, from });
    } catch (e) {
      console.error("call:reject error:", e);
    }
  });

  socket.on("call:cancel", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      // ✅ Call log: cancelled (caller cancelled before accept)
      markCallLogEnded({ callId, status: "cancelled" });

      io.to(`user-${to}`).emit("call:cancelled", { callId, from });
    } catch (e) {
      console.error("call:cancel error:", e);
    }
  });

  socket.on("call:end", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      // ✅ Call log: ended
      markCallLogEnded({ callId, status: "ended" });

      io.to(`user-${to}`).emit("call:ended", { callId, from });
    } catch (e) {
      console.error("call:end error:", e);
    }
  });

  /* ===================================================================== */
  /* ✅ WebRTC Signaling Relay (offer/answer/ice) — Actual Media (Stage 2)  */
  /* ===================================================================== */
  // ملاحظة: نحن فقط "نرحّل" SDP/ICE عبر Socket.io.  لا نحفظ أي شيء في DB.
  // الغرفة: call:<callId> + إرسال مباشر عبر user-<id> إن توفّر "to".

  
  // ✅ Alias موحّد (يدعم call:signal) لراحة الفرونت:
  // payload: { callId, to, type: "offer"|"answer"|"ice", sdp?, candidate? }
  socket.on("call:signal", (payload = {}) => {
    try {
      const cid = String(payload.callId || "").trim();
      const to = payload.to ? String(payload.to) : "";
      const from = String(socket.userId || "");
      const t = String(payload.type || "").toLowerCase();

      if (!cid || !from) return;

      if (t === "offer" && payload.sdp) {
        if (to) io.to(`user-${to}`).emit("call:offer", { callId: cid, from, offer: payload.sdp });
        else socket.to(`call:${cid}`).emit("call:offer", { callId: cid, from, offer: payload.sdp });
        return;
      }

      if (t === "answer" && payload.sdp) {
        if (to) io.to(`user-${to}`).emit("call:answer", { callId: cid, from, answer: payload.sdp });
        else socket.to(`call:${cid}`).emit("call:answer", { callId: cid, from, answer: payload.sdp });
        return;
      }

      if (t === "ice" && payload.candidate) {
        if (to) io.to(`user-${to}`).emit("call:ice", { callId: cid, from, candidate: payload.candidate });
        else socket.to(`call:${cid}`).emit("call:ice", { callId: cid, from, candidate: payload.candidate });
        return;
      }
    } catch (e) {
      console.error("call:signal error:", e);
    }
  });

  // ✅ Alias إضافية (اختياري): call:start → call:invite
  socket.on("call:start", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      const type = payload.type === "video" ? "video" : "audio";
      if (!from || !to || !callId || to === from) return;
      io.to(`user-${to}`).emit("call:incoming", { callId, from, type });
    } catch (e) {
      console.error("call:start error:", e);
    }
  });
socket.on("call:join", ({ callId } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid) return;
      socket.join(`call:${cid}`);
      // خبر الطرف الآخر (اختياري)
      socket.to(`call:${cid}`).emit("call:peer-joined", { callId: cid, from: String(socket.userId) });
    } catch (e) {
      console.error("call:join error:", e);
    }
  });

  socket.on("call:leave", ({ callId } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid) return;
      socket.to(`call:${cid}`).emit("call:peer-left", { callId: cid, from: String(socket.userId) });
      socket.leave(`call:${cid}`);
    } catch (e) {
      console.error("call:leave error:", e);
    }
  });

  // relay offer
  socket.on("call:offer", ({ callId, to, offer } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid || !offer) return;
      const from = String(socket.userId || "");
      if (to) io.to(`user-${String(to)}`).emit("call:offer", { callId: cid, from, offer });
      else socket.to(`call:${cid}`).emit("call:offer", { callId: cid, from, offer });
    } catch (e) {
      console.error("call:offer error:", e);
    }
  });

  // relay answer
  socket.on("call:answer", ({ callId, to, answer } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid || !answer) return;
      const from = String(socket.userId || "");
      if (to) io.to(`user-${String(to)}`).emit("call:answer", { callId: cid, from, answer });
      else socket.to(`call:${cid}`).emit("call:answer", { callId: cid, from, answer });
    } catch (e) {
      console.error("call:answer error:", e);
    }
  });

  // relay ICE candidates
  socket.on("call:ice", ({ callId, to, candidate } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid || !candidate) return;
      const from = String(socket.userId || "");
      if (to) io.to(`user-${String(to)}`).emit("call:ice", { callId: cid, from, candidate });
      else socket.to(`call:${cid}`).emit("call:ice", { callId: cid, from, candidate });
    } catch (e) {
      console.error("call:ice error:", e);
    }
  });

  socket.on("call:busy", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      if (!from || !to || !callId) return;

      // ✅ Call log: busy
      markCallLogEnded({ callId, status: "busy" });

      io.to(`user-${to}`).emit("call:busy", { callId, from });
    } catch (e) {
      console.error("call:busy error:", e);
    }
  });


  socket.on("disconnect", () => {
    console.log("❌ مستخدم انقطع:", socket.id);
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
    }
  });
});

// ================== ميدلوير عام ==================
app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: !ALLOW_ALL, // لو * ما في credentials
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
// ✅ مهم لبعض المتصفحات مع preflight
app.options(/.*/, cors()); // Express v5: استخدم Regex بدل "*"
app.use(express.json({ limit: "15mb" })); // ✅ حتى لا ينفجر لو وصل DataURL صغير (لكن الأفضل دائماً رفع كملف)

// ملفات الرفع (الصور / الفيديو / الصوت) كـ static
// ✅ يدعم أكثر من مسار لأن بعض النسخ تخزّن الملفات في (backend/uploads) أو (backend/public/uploads) أو (projectRoot/uploads)
const UPLOADS_DIR_BACKEND = path.join(__dirname, "uploads");
const UPLOADS_DIR_PUBLIC = path.join(__dirname, "public", "uploads");
const UPLOADS_DIR_ROOT = path.join(process.cwd(), "uploads");

app.use("/uploads", express.static(UPLOADS_DIR_BACKEND));
if (UPLOADS_DIR_PUBLIC !== UPLOADS_DIR_BACKEND) app.use("/uploads", express.static(UPLOADS_DIR_PUBLIC));
if (UPLOADS_DIR_ROOT !== UPLOADS_DIR_BACKEND && UPLOADS_DIR_ROOT !== UPLOADS_DIR_PUBLIC) {
  app.use("/uploads", express.static(UPLOADS_DIR_ROOT));
}
// تقديم ملفات الواجهة (HTML/CSS/JS) من مجلد public
app.use(express.static(path.join(__dirname, "public")));

/* ===================================================================== */
/* ✅✅✅  راوت رفع عام (كان ناقص وهو سبب 404 /api/upload)  ✅✅✅ */
/* ===================================================================== */
// يرفع أي ملف via FormData (أول ملف موجود) ويرجع URL جاهز للاستخدام
app.post("/api/upload", upload.any(), async (req, res) => {
  try {
    const f = Array.isArray(req.files) && req.files.length ? req.files[0] : null;
    if (!f) return res.status(400).json({ msg: "لا يوجد ملف مرفوع" });

    const url = `/uploads/${f.filename}`;
    const kind = detectKindFromMime(f.mimetype);

    return res.json({
      url,
      type: kind, // audio/image/video/file
      originalName: f.originalname,
      size: f.size,
      mimeType: f.mimetype,
      filename: f.filename,
    });
  } catch (err) {
    console.error("POST /api/upload error:", err);
    return res.status(500).json({ msg: "فشل رفع الملف" });
  }
});

// ================== ميدلوير JWT ==================

// ميدلوير إجباري
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ msg: "لا يوجد توكن في الهيدر" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "تنسيق التوكن غير صالح" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME");

    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) {
      console.error("JWT payload بدون userId:", decoded);
      return res.status(401).json({ msg: "التوكن غير صالح" });
    }

    req.userId = userId;
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ msg: "التوكن غير صالح أو منتهي" });
  }

};

/* ===================================================================== */
/* ✅ WebRTC RTC Config (STUN/TURN) — ليشتغل على كل الشبكات */
/* ===================================================================== */
app.get("/api/calls/rtc-config", authMiddleware, (req, res) => {
  try {
    const iceServers = [
      { urls: ["stun:stun.l.google.com:19302"] },
    ];

    const turnUrlRaw = String(process.env.TURN_URL || "").trim();
    const turnUsername = String(process.env.TURN_USERNAME || "").trim();
    const turnCredential = String(process.env.TURN_CREDENTIAL || "").trim();

    if (turnUrlRaw && turnUsername && turnCredential) {
      const urls = turnUrlRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (urls.length) {
        iceServers.push({
          urls,
          username: turnUsername,
          credential: turnCredential,
        });
      }
    }

    return res.json({ iceServers });
  } catch (e) {
    console.error("GET /api/calls/rtc-config error:", e);
    return res.status(500).json({ msg: "خطأ أثناء تجهيز RTC config" });
  }
});


// ميدلوير اختياري (لا يرمي خطأ لو ما في توكن)
const authMiddlewareOptional = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next();

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return next();

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME");
    const userId = decoded.id || decoded.userId || decoded._id;
    if (userId) {
      req.userId = userId;
    }
  } catch {
    // تجاهل
  }
  next();
};



/* ===================================================================== */
/* ✅ رفع تسجيل صوتي مستقل (لتوافق فرونت /api/chat/upload-audio) ✅ */
/* ===================================================================== */
/*
  يدعم حالتين:
  1) FormData: key = "audio" أو "voice" أو أي ملف أول داخل req.files
  2) JSON: { dataUrl, mimeType, originalName }  (اختياري)
  ويرجع نفس شكل attachment الذي تتوقعه الواجهة.
*/
app.post(
  "/api/chat/upload-audio",
  authMiddleware,
  upload.any(),
  async (req, res) => {
    try {
      // 1) ملف مرفوع (FormData)
      let f = null;
      if (req.file) f = req.file;
      if (!f && req.files) {
        if (Array.isArray(req.files) && req.files.length) f = req.files[0];
        else if (Array.isArray(req.files.audio) && req.files.audio.length) f = req.files.audio[0];
        else if (Array.isArray(req.files.voice) && req.files.voice.length) f = req.files.voice[0];
      }

      if (f) {
        const url = `/uploads/${f.filename}`;
        const durationRaw = req.body?.duration ?? req.body?.voiceDuration ?? 0;
        const duration = Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : 0;

        return res.json({
          url,
          type: "audio",
          originalName: f.originalname || "voice.webm",
          size: f.size || 0,
          mimeType: f.mimetype || "audio/webm",
          filename: f.filename,
          duration,
        });
      }

      // 2) DataURL عبر JSON (fallback)
      const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/webm";
      const originalName =
        typeof req.body?.originalName === "string" && req.body.originalName.trim()
          ? req.body.originalName.trim()
          : "voice.webm";

      if (!dataUrl) {
        return res.status(400).json({ msg: "لا يوجد ملف صوتي مرفوع" });
      }

      const savedUrl = await saveDataUrlToUploads(dataUrl, mimeType, originalName);
      if (!savedUrl) {
        return res.status(400).json({ msg: "صيغة الصوت غير مدعومة" });
      }

      const durationRaw2 = req.body?.duration ?? req.body?.voiceDuration ?? 0;
      const duration2 = Number.isFinite(Number(durationRaw2)) ? Number(durationRaw2) : 0;

      return res.json({
        url: savedUrl,
        type: "audio",
        originalName,
        size: 0,
        mimeType,
        duration: duration2,
      });
    } catch (err) {
      console.error("POST /api/chat/upload-audio error:", err);
      return res.status(500).json({ msg: "فشل رفع الصوت" });
    }
  }
);


/* ===================================================================== */
/* ✅ رفع مرفق عام (صورة/فيديو/ملف/موسيقى) — /api/chat/upload/attachment */
/* ===================================================================== */
/*
  POST /api/chat/upload/attachment
  FormData:
    - file=<File>  (يفضل)
  Returns:
    { attachment: { url, type, originalName, size, mimeType, filename } }
*/
app.post(
  "/api/chat/upload/attachment",
  authMiddleware,
  upload.any(), // نقبل أي key للملف (file / image / video ... إلخ)
  async (req, res) => {
    try {
      let f = null;

      // multer مع any(): الملفات تكون في req.files
      if (req.file) f = req.file;
      if (!f && Array.isArray(req.files) && req.files.length) f = req.files[0];

      // دعم لو صار req.files كـ object (حسب إعدادات multer المختلفة)
      if (!f && req.files && typeof req.files === "object") {
        const firstKey = Object.keys(req.files)[0];
        const arr = firstKey ? req.files[firstKey] : null;
        if (Array.isArray(arr) && arr.length) f = arr[0];
      }

      if (!f) return res.status(400).json({ msg: "الملف مطلوب" });

      const url = `/uploads/${f.filename}`;
      const kind = detectKindFromMime(f.mimetype);

      return res.status(201).json({
        attachment: {
          url,
          type: kind, // image | video | audio | file
          originalName: f.originalname || "",
          size: f.size || 0,
          mimeType: f.mimetype || "",
          filename: f.filename,
        },
      });
    } catch (err) {
      console.error("POST /api/chat/upload/attachment error:", err);
      return res.status(500).json({ msg: "فشل رفع الملف" });
    }
  }
);

// ================== ميدلوير المشرف ==================
const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ msg: "المستخدم غير موجود" });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ msg: "لا تملك صلاحية الدخول (هذا الحساب ليس مشرفاً)" });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error("adminMiddleware error:", err);
    res.status(500).json({ msg: "خطأ في التحقق من صلاحيات المشرف" });
  }
};

// دالة بسيطة لضمان أن القيمة مصفوفة
const ensureArray = (v) => (Array.isArray(v) ? v : []);

// ================== اتصال MongoDB ==================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || "mongodb://127.0.0.1:27017/socialapp";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ تم الاتصال بقاعدة البيانات"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ================== راوت اختبار ==================
app.get("/api/test", (req, res) => {
  res.json({ msg: "API working" });
});

// ================== راوتات المستخدم القديمة ==================
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

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "الرجاء إدخال البريد وكلمة المرور" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "هذا البريد غير مسجل" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "كلمة المرور غير صحيحة" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME", { expiresIn: "7d" });

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

// ================== راوتات Saepel الجديدة ==================

// REGISTER جديد /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, birthdate } = req.body;
    const finalUsername = (username || "").trim();

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
      birthdate,
    });

    await newUser.save();

    res.json({
      msg: "تم إنشاء الحساب بنجاح، تم إرسال رسالة تفعيل (تجريبياً) إلى بريدك.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// LOGIN جديد /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ msg: "الرجاء إدخال البريد/اسم المستخدم وكلمة المرور" });
    }

    let query;
    if (identifier.includes("@") && !identifier.startsWith("@")) {
      query = { email: identifier.toLowerCase() };
    } else {
      const clean = identifier.replace(/^@+/, "");
      query = { username: clean };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({ msg: "البريد أو اسم المستخدم غير مسجل" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "كلمة المرور غير صحيحة" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME", { expiresIn: "7d" });

    res.json({
      msg: "تم تسجيل الدخول بنجاح",
      token,
      user: {
        id: user._id,
        _id: user._id,
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

// إعادة إرسال بريد التفعيل (تجريبي)
app.post("/api/auth/resend-verify-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ msg: "يرجى إرسال البريد الإلكتروني" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "هذا البريد غير مسجل لدينا" });
    }

    console.log("Pretend sending verify email to:", email);

    return res.json({
      msg: "تم إعادة إرسال رسالة التفعيل إلى بريدك (تجريبياً).",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// بروفايل عام لأي مستخدم (مع bio / location / website + isPrivate + حظر)

// ================== Users Search (for Groups/Channels wizard) ==================
// GET /api/users/search?q=ahmed
app.get("/api/users/search", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ users: [] });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const users = await User.find({
      _id: { $ne: userId },
      $or: [{ username: regex }, { fullName: regex }, { name: regex }, { email: regex }],
    })
      .select("_id username fullName name avatar profilePic photo email")
      .limit(20)
      .lean();

    return res.json({ users });
  } catch (e) {
    console.error("GET /api/users/search error:", e);
    return res.status(500).json({ msg: "حدث خطأ في البحث" });
  }
});

app.get("/api/users/:id", authMiddlewareOptional, async (req, res) => {
  try {
    const viewerId = req.userId || null;

    const u = await User.findById(req.params.id).select(
      "username email avatar createdAt followers following bio location website isPrivate blockedUsers"
    );
    if (!u) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const postsCount = await Post.countDocuments({ user: u._id });
    const followersCount = u.followers ? u.followers.length : 0;
    const followingCount = u.following ? u.following.length : 0;

    let isFollowing = false;
    if (viewerId && u.followers && u.followers.length) {
      isFollowing = u.followers.some((id) => String(id) === String(viewerId));
    }

    // 🔒 حالة الحظر بين المشاهد وهذا المستخدم
    let isBlockedByMe = false;
    let hasBlockedMe = false;

    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");
      const viewerBlocked = ensureArray(viewer?.blockedUsers);
      const userBlocked = ensureArray(u.blockedUsers);

      isBlockedByMe = viewerBlocked.some((id) => String(id) === String(u._id));
      hasBlockedMe = userBlocked.some((id) => String(id) === String(viewerId));
    }

    res.json({
      _id: u._id,
      username: u.username,
      email: u.email,
      avatar: u.avatar || "",
      postsCount,
      followersCount,
      followingCount,
      isFollowing,
      createdAt: u.createdAt,
      bio: u.bio || "",
      location: u.location || "",
      website: u.website || "",
      isPrivate: !!u.isPrivate,
      isBlockedByMe,
      hasBlockedMe,
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
    if (!userId) return res.status(401).json({ msg: "غير مصرح" });

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const postsCount = await Post.countDocuments({ user: userId });
    const followersCount = user.followers ? user.followers.length : 0;
    const followingCount = user.following ? user.following.length : 0;

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || "",
      postsCount,
      followersCount,
      followingCount,
      createdAt: user.createdAt,
      isAdmin: !!user.isAdmin,
      bio: user.bio || "",
      location: user.location || "",
      website: user.website || "",
      isPrivate: !!user.isPrivate,
    });
  } catch (err) {
    console.error("ERROR in GET /api/profile:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ✅ تغيير خصوصية الحساب
app.patch("/api/users/me/privacy", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    let { isPrivate } = req.body;

    if (typeof isPrivate === "string") {
      isPrivate = isPrivate === "true" || isPrivate === "1";
    } else {
      isPrivate = !!isPrivate;
    }

    const user = await User.findByIdAndUpdate(userId, { isPrivate }, { new: true }).select(
      "username email avatar isPrivate"
    );

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    res.json({
      msg: isPrivate ? "تم ضبط الحساب كحساب خاص" : "تم ضبط الحساب كحساب عام",
      isPrivate: !!user.isPrivate,
    });
  } catch (err) {
    console.error("ERROR in PATCH /api/users/me/privacy:", err);
    res.status(500).json({ msg: "خطأ في الخادم أثناء تعديل خصوصية الحساب" });
  }
});

// PUT /api/profile
app.put("/api/profile", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    const userId = req.userId;
    const { username, bio, location, website } = req.body;
    let avatarPath;

    if (req.file) avatarPath = "/uploads/" + req.file.filename;

    const updateData = {};
    if (typeof username === "string" && username.trim()) updateData.username = username.trim();
    if (typeof bio === "string") updateData.bio = bio.trim();
    if (typeof location === "string") updateData.location = location.trim();
    if (typeof website === "string") updateData.website = website.trim();
    if (avatarPath) updateData.avatar = avatarPath;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
    if (!updatedUser) return res.status(404).json({ msg: "المستخدم غير موجود" });

    res.json({
      msg: "تم تحديث البروفايل بنجاح",
      user: {
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        avatar: updatedUser.avatar || "",
        bio: updatedUser.bio || "",
        location: updatedUser.location || "",
        website: updatedUser.website || "",
        isPrivate: !!updatedUser.isPrivate,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم أثناء تحديث البروفايل" });
  }
});

// FOLLOW / UNFOLLOW
app.post("/api/users/:id/follow", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetUserId) === String(currentUserId)) {
      return res.status(400).json({ msg: "لا يمكنك متابعة نفسك" });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    const ensureArr = (v) => (Array.isArray(v) ? v : []);
    currentUser.following = ensureArr(currentUser.following);
    targetUser.followers = ensureArr(targetUser.followers);

    const alreadyFollowing = currentUser.following.some((id) => String(id) === String(targetUserId));

    if (alreadyFollowing) {
      currentUser.following = currentUser.following.filter((id) => String(id) !== String(targetUserId));
      targetUser.followers = targetUser.followers.filter((id) => String(id) !== String(currentUserId));
      await currentUser.save();
      await targetUser.save();

      return res.json({
        msg: "تم إلغاء المتابعة",
        following: false,
        followersCount: targetUser.followers.length,
        followingCount: currentUser.following.length,
      });
    } else {
      currentUser.following.push(targetUserId);
      targetUser.followers.push(currentUserId);
      await currentUser.save();
      await targetUser.save();

      return res.json({
        msg: "تمت المتابعة",
        following: true,
        followersCount: targetUser.followers.length,
        followingCount: currentUser.following.length,
      });
    }
  } catch (err) {
    console.error("ERROR in /api/users/:id/follow:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

/* ✅ حظر / إلغاء حظر مستخدم */
app.post("/api/users/:id/block-toggle", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetUserId) === String(currentUserId)) {
      return res.status(400).json({ msg: "لا يمكنك حظر حسابك الشخصي" });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    currentUser.blockedUsers = ensureArray(currentUser.blockedUsers);
    currentUser.followers = ensureArray(currentUser.followers);
    currentUser.following = ensureArray(currentUser.following);

    targetUser.followers = ensureArray(targetUser.followers);
    targetUser.following = ensureArray(targetUser.following);

    const alreadyBlocked = currentUser.blockedUsers.some((id) => String(id) === String(targetUserId));
    let blocked;

    if (alreadyBlocked) {
      currentUser.blockedUsers = currentUser.blockedUsers.filter((id) => String(id) !== String(targetUserId));
      blocked = false;
    } else {
      currentUser.blockedUsers.push(targetUserId);
      blocked = true;

      currentUser.followers = currentUser.followers.filter((id) => String(id) !== String(targetUserId));
      currentUser.following = currentUser.following.filter((id) => String(id) !== String(targetUserId));

      targetUser.followers = targetUser.followers.filter((id) => String(id) !== String(currentUserId));
      targetUser.following = targetUser.following.filter((id) => String(id) !== String(currentUserId));
    }

    await currentUser.save();
    await targetUser.save();

    return res.json({
      msg: blocked ? "تم حظر هذا المستخدم، لن يستطيع التفاعل معك ✅" : "تم إلغاء حظر هذا المستخدم ✅",
      blocked,
      blockedCount: currentUser.blockedUsers.length,
    });
  } catch (err) {
    console.error("ERROR in /api/users/:id/block-toggle:", err);
    res.status(500).json({ msg: "خطأ في الخادم أثناء تحديث الحظر" });
  }
});

/* ========================= */
/*  قوائم المتابعين / تتابِع */
/* ========================= */

app.get("/api/users/:id/followers", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate("followers", "username email avatar createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    return res.json(user.followers || []);
  } catch (err) {
    console.error("GET /api/users/:id/followers error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب قائمة المتابعين" });
  }
});

app.get("/api/users/:id/following", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate("following", "username email avatar createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    return res.json(user.following || []);
  } catch (err) {
    console.error("GET /api/users/:id/following error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب قائمة تتابِع" });
  }
});

app.delete("/api/users/:id/followers/:followerId", authMiddleware, async (req, res) => {
  try {
    const profileOwnerId = req.params.id;
    const followerId = req.params.followerId;
    const currentUserId = req.userId;

    if (String(profileOwnerId) !== String(currentUserId)) {
      return res.status(403).json({ msg: "غير مسموح إزالة متابع من حساب شخص آخر" });
    }

    const profileUser = await User.findById(profileOwnerId);
    const followerUser = await User.findById(followerId);

    if (!profileUser || !followerUser) {
      return res.status(404).json({ msg: "المستخدم غير موجود" });
    }

    const ensureArr = (v) => (Array.isArray(v) ? v : []);
    profileUser.followers = ensureArr(profileUser.followers);
    followerUser.following = ensureArr(followerUser.following);

    const beforeCount = profileUser.followers.length;

    profileUser.followers = profileUser.followers.filter((id) => String(id) !== String(followerId));
    followerUser.following = followerUser.following.filter((id) => String(id) !== String(profileOwnerId));

    if (profileUser.followers.length === beforeCount) {
      return res.status(400).json({
        msg: "هذا المستخدم ليس ضمن متابعيك",
        followersCount: profileUser.followers.length,
      });
    }

    await profileUser.save();
    await followerUser.save();

    return res.json({
      msg: "تمت إزالة المتابع",
      followersCount: profileUser.followers.length,
    });
  } catch (err) {
    console.error("DELETE /api/users/:id/followers/:followerId error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إزالة المتابع" });
  }
});

// ================== القصص (Stories) ==================
app.get("/api/stories/feed", authMiddlewareOptional, async (req, res) => {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stories = await Story.find({ createdAt: { $gte: since } })
      .populate("user", "username avatar")
      .sort({ createdAt: -1 });

    const currentUserId = req.userId?.toString?.() || "";

    const payload = stories.map((s) => {
      const viewsCount = s.views?.length || 0;
      const viewed = (s.views || []).some((v) => v.user && v.user.toString() === currentUserId);

      return {
        id: s._id,
        userId: s.user?._id,
        userName: s.user?.username || "مستخدم Saepel",
        avatar: s.user?.avatar || "",
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType || "image",
        text: s.text || "",
        createdAt: s.createdAt,
        viewsCount,
        viewed,
      };
    });

    res.json(payload);
  } catch (err) {
    console.error("GET /api/stories/feed error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب القصص" });
  }
});

app.post("/api/stories", authMiddleware, upload.single("media"), async (req, res) => {
  try {
    const userId = req.userId;
    let mediaUrl = "";
    let mediaType = "image";

    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      if (req.file.mimetype.startsWith("video/")) mediaType = "video";
    }

    if (!mediaUrl) return res.status(400).json({ msg: "يجب إرفاق صورة أو فيديو" });

    const text = (req.body.text || "").trim();

    const story = await Story.create({
      user: userId,
      mediaUrl,
      mediaType,
      text,
    });

    res.status(201).json({ msg: "تم إنشاء القصة بنجاح", id: story._id });
  } catch (err) {
    console.error("POST /api/stories error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إنشاء القصة" });
  }
});

app.post("/api/stories/:id/view", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    const already = (story.views || []).some((v) => v.user && v.user.toString() === userId.toString());
    if (!already) {
      story.views.push({ user: userId });
      await story.save();
    }

    res.json({ msg: "تم تسجيل المشاهدة", viewsCount: story.views.length });
  } catch (err) {
    console.error("POST /api/stories/:id/view error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء تسجيل المشاهدة" });
  }
});

app.get("/api/stories/:id/viewers", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId).populate("views.user", "username email avatar");
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "غير مسموح لك بعرض مشاهدات قصص الآخرين" });
    }

    const viewers = (story.views || []).map((v) => ({
      id: v.user?._id,
      username: v.user?.username || v.user?.email || "مستخدم Saepel",
      avatar: v.user?.avatar || "",
      viewedAt: v.at,
    }));

    res.json({ viewers });
  } catch (err) {
    console.error("GET /api/stories/:id/viewers error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب المشاهدات" });
  }
});

app.delete("/api/stories/:id", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "غير مسموح بحذف قصة شخص آخر" });
    }

    await story.deleteOne();
    res.json({ msg: "تم حذف القصة بنجاح" });
  } catch (err) {
    console.error("DELETE /api/stories/:id error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء حذف القصة" });
  }
});

app.post("/api/stories/:id/report", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ msg: "معرّف القصة غير صالح" });
    }

    const userId = req.userId;

    let reason = "";
    if (req.body && typeof req.body.reason === "string") reason = req.body.reason.trim();
    if (!reason) reason = "محتوى غير لائق";

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    const existingReport = await Report.findOne({
      targetType: "story",
      story: story._id,
      reporter: userId,
    });

    if (existingReport) return res.json({ msg: "سبق وقمت بالإبلاغ عن هذه القصة" });

    const rep = await Report.create({
      targetType: "story",
      story: story._id,
      reporter: userId,
      reason,
      details: "",
      status: "pending",
    });

    return res.json({
      msg: "تم إرسال البلاغ، سيتم مراجعته من الإدارة ✅",
      reportId: rep._id,
    });
  } catch (err) {
    console.error("POST /api/stories/:id/report error:", err);
    return res.status(500).json({ msg: "حدث خطأ أثناء إرسال البلاغ" });
  }
});

app.post("/api/stories/:id/react", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ msg: "الرمز التعبيري مطلوب" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    if (!Array.isArray(story.reactions)) story.reactions = [];
    story.reactions.push({ user: userId, emoji });
    await story.save();

    res.json({ msg: "تم إرسال رد الفعل", emoji });
  } catch (err) {
    console.error("POST /api/stories/:id/react error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إرسال رد الفعل" });
  }
});

app.post("/api/stories/:id/reply", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;
    const { message } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ msg: "الرسالة مطلوبة" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

    if (!Array.isArray(story.replies)) story.replies = [];
    story.replies.push({ user: userId, message: message.trim() });
    await story.save();

    res.json({ msg: "تم إرسال الرد بنجاح" });
  } catch (err) {
    console.error("POST /api/stories/:id/reply error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إرسال الرد" });
  }
});



/* ===================================================================== */
/* 📞 Call Logs API  /api/calls */
/* ===================================================================== */

// ✅ جلب سجل الاتصالات للمستخدم الحالي (آخر 50 افتراضياً)
app.get("/api/calls/logs", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "50", 10) || 50));

    const logs = await CallLog.find({
      participants: userId,
      deletedFor: { $ne: userId },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // جلب معلومات المستخدم الآخر (username/avatar/isVerified) فقط
    const otherIds = Array.from(
      new Set(
        logs
          .map((l) => (Array.isArray(l.participants) ? l.participants.map(String) : []))
          .flat()
          .filter((id) => id && id !== userId)
      )
    );

    const users = await User.find({ _id: { $in: otherIds } }).select("username avatar isVerified").lean();
    const uMap = new Map(users.map((u) => [String(u._id), u]));

    const out = logs.map((l) => {
      const caller = String(l.caller || "");
      const callee = String(l.callee || "");
      const otherUserId = caller === userId ? callee : caller;
      const direction = caller === userId ? "outgoing" : "incoming";

      return {
        _id: l._id,
        callId: l.callId,
        type: l.type,
        status: l.status,
        direction,
        startedAt: l.startedAt,
        endedAt: l.endedAt,
        durationSec: l.durationSec || 0,
        createdAt: l.createdAt,
        otherUser: otherUserId ? { _id: otherUserId, ...(uMap.get(otherUserId) || {}) } : null,
      };
    });

    return res.json(out);
  } catch (e) {
    console.error("GET /api/calls/logs error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء جلب سجل الاتصالات" });
  }
});

// ✅ حذف سجل اتصال واحد "عندي" فقط
app.post("/api/calls/logs/:id/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) return res.status(400).json({ msg: "معرّف غير صالح" });

    const log = await CallLog.findById(id).select("_id participants");
    if (!log) return res.json({ ok: true });

    const isMember = Array.isArray(log.participants) && log.participants.some((p) => String(p) === userId);
    if (!isMember) return res.status(403).json({ msg: "غير مسموح" });

    await CallLog.updateOne({ _id: id }, { $addToSet: { deletedFor: userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/calls/logs/:id/delete-for-me error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء حذف السجل" });
  }
});

// ✅ مسح كل السجل "عندي" فقط
app.post("/api/calls/logs/clear-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    await CallLog.updateMany({ participants: userId }, { $addToSet: { deletedFor: userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/calls/logs/clear-for-me error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء مسح السجل" });
  }
});


/* ===================================================================== */
/* 🔵 🔵 🔵  قسم المحادثات والرسائل /api/chat  🔵 🔵 🔵 */
/* ===================================================================== */

app.get("/api/chat/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const conversations = await Conversation.find({
      deletedFor: { $ne: userId },
      $or: [
        { participants: userId },
        { owner: userId },
        { admins: userId },
        { createdBy: userId },
      ],
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

app.post("/api/chat/conversations/start", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { otherUserId } = req.body;

    if (!otherUserId) return res.status(400).json({ msg: "otherUserId مطلوب" });
    if (String(otherUserId) === String(userId)) {
      return res.status(400).json({ msg: "لا يمكنك بدء محادثة مع نفسك حالياً" });
    }

    const otherUser = await User.findById(otherUserId).select("username avatar");
    if (!otherUser) return res.status(404).json({ msg: "المستخدم غير موجود" });

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


    // ✅ ضمان أن المحادثة لا تبقى مخفية بعد Clear Chat
    await Conversation.updateOne(
      { _id: conversation._id },
      { $pull: { deletedFor: { $in: [String(userId), String(otherUserId)] } } }
    );

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


// ================== List Spaces (Groups/Channels) ==================
// GET /api/chat/spaces
// يرجّع القنوات + المجموعات التي أنا ضمنها (participants/owner/admins/createdBy)
app.get("/api/chat/spaces", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const spaces = await Conversation.find({
      deletedFor: { $ne: userId },
      type: { $in: ["group", "channel"] },
      $or: [
        { participants: userId },
        { owner: userId },
        { admins: userId },
        { createdBy: userId },
      ],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate({ path: "participants", select: "username avatar isVerified" })
      .populate({ path: "lastMessage", populate: { path: "sender", select: "username avatar" } });

    return res.json(spaces);
  } catch (err) {
    console.error("GET /api/chat/spaces error:", err);
    return res.status(500).json({ msg: "حدث خطأ أثناء جلب القنوات/المجموعات" });
  }
});


// ================== Create Group / Channel (Telegram-like) ==================
// POST /api/chat/spaces
// Body: { type:"group|channel", title, about, avatar, visibility:"public|private", username, memberIds:[], adminIds:[], permissions:{} }
app.post("/api/chat/spaces", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const type = String(req.body?.type || "").toLowerCase();
    const title = String(req.body?.title || "").trim();
    const about = String(req.body?.about || "").trim();
    const avatar = String(req.body?.avatar || "").trim();
    const visibility = String(req.body?.visibility || "private").toLowerCase();
    const username = String(req.body?.username || "").trim().toLowerCase();
    const memberIds = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    const adminIds = Array.isArray(req.body?.adminIds) ? req.body.adminIds.map(String) : [];

    // ✅ حماية من قيم غير صالحة تسبب CastError (مثل "undefined" أو "")
    const isOid = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));
    const safeMemberIds = memberIds.map((v) => String(v || "").trim()).filter((v) => v && isOid(v));
    const safeAdminIds = adminIds.map((v) => String(v || "").trim()).filter((v) => v && isOid(v));
    const permissions = req.body?.permissions && typeof req.body.permissions === "object" ? req.body.permissions : {};

    if (!["group", "channel"].includes(type)) {
      return res.status(400).json({ msg: "type غير صالح" });
    }
    if (title.length < 2) {
      return res.status(400).json({ msg: "اسم المجموعة/القناة قصير جداً" });
    }
    if (!["public", "private"].includes(visibility)) {
      return res.status(400).json({ msg: "visibility غير صالحة" });
    }

    // Normalize members: include owner always
    const participants = [userId, ...safeMemberIds].filter(Boolean);
    const uniqParticipants = [...new Set(participants.map(String))];

    // Validate users exist (light)
    const foundUsers = await User.find({ _id: { $in: uniqParticipants } }).select("_id").lean();
    const foundIds = new Set(foundUsers.map((u) => String(u._id)));
    if (!foundIds.has(String(userId))) foundIds.add(String(userId));
    const finalParticipants = uniqParticipants.filter((id) => foundIds.has(String(id)));

    // Public username must be unique (best-effort)
    if (visibility === "public") {
      if (!username || username.length < 3) {
        return res.status(400).json({ msg: "username مطلوب للقنوات/المجموعات العامة" });
      }
      const taken = await Conversation.findOne({ username: username }).select("_id").lean();
      if (taken) return res.status(409).json({ msg: "هذا الـ username مستخدم بالفعل" });
    }

    // Invite code for private spaces
    const inviteCode =
      visibility === "private" ? crypto.randomBytes(8).toString("hex") : "";

    // Admins: owner + chosen admins (must be in participants)
    const adminSet = new Set([String(userId), ...safeAdminIds.map(String)]);
    const finalAdmins = [...adminSet].filter((id) => finalParticipants.includes(String(id)));

    // Default permissions:
    const mergedPermissions = {
      canSend: type === "channel" ? "admins" : "all",
      canAddMembers: "admins",
      canEditInfo: "admins",
      ...(permissions || {}),
    };

    const conv = await Conversation.create({
      participants: finalParticipants,
      type,
      title,
      about,
      avatar,
      visibility,
      username: visibility === "public" ? username : "",
      inviteCode,
      isGroup: type === "group",
      createdBy: userId,
      owner: userId,
      admins: finalAdmins,
      permissions: mergedPermissions,
      lastMessage: null,
      lastMessageAt: null,
    });

    // return minimal info
    return res.json({ ok: true, conversation: conv });
  } catch (e) {
    console.error("POST /api/chat/spaces error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء إنشاء المجموعة/القناة" });
  }
});


app.get("/api/chat/conversations/:id/messages", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const conversationId = req.params.id;

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "30", 10) || 30, 80));

    // Cursor style: before = ISO date OR messageId
    const beforeRaw = (req.query.before || req.query.beforeCursor || "").toString().trim();
    let beforeDate = null;

    // لو before هو ObjectId → خذ createdAt للرسالة نفسها كـ cursor
    if (beforeRaw && mongoose.Types.ObjectId.isValid(beforeRaw)) {
      const pivot = await Message.findOne({ _id: beforeRaw, conversation: conversationId })
        .select("createdAt")
        .lean();
      if (pivot?.createdAt) beforeDate = new Date(pivot.createdAt);
    }

    // لو before تاريخ ISO
    if (!beforeDate && beforeRaw) {
      const d = new Date(beforeRaw);
      if (!isNaN(d.getTime())) beforeDate = d;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    const q = {
      conversation: conversationId,
      deletedFor: { $ne: userId },
    };
    if (beforeDate) {
      q.createdAt = { $lt: beforeDate };
    }

    // نجيب +1 لمعرفة hasMore
    const rows = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("sender", "username avatar");

    const hasMore = rows.length > limit;
    const itemsDesc = hasMore ? rows.slice(0, limit) : rows;

    // nextCursor = أقدم عنصر في هذه الدفعة (آخر عنصر بالـ desc)
    const oldest = itemsDesc.length ? itemsDesc[itemsDesc.length - 1] : null;
    const nextCursor = oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : null;

    // للواجهة: لازم تكون تصاعدي (الأقدم فوق)
    const items = itemsDesc.slice().reverse();

    return res.json({ items, hasMore, nextCursor });
  } catch (err) {
    console.error("GET /api/chat/conversations/:id/messages error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب الرسائل" });
  }
});


// ✅ مسح المحادثة عندي فقط (Soft delete لكل الرسائل) — POST /api/chat/conversations/:id/clear
// لا يؤثر على الطرف الآخر. (يستخدم deletedFor)
app.post("/api/chat/conversations/:id/clear", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const conversationId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ msg: "conversationId غير صالح" });
    }

    const conversation = await Conversation.findById(conversationId).select("_id participants type owner admins isGroup");
    if (!conversation) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    const isMember = Array.isArray(conversation.participants) && conversation.participants.some((p) => String(p) === userId);
    if (!isMember) return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });

    if (isChannel(conversation) && !isConvAdmin(conversation, userId)) {
      return res.status(403).json({ msg: "لا يمكنك مسح قناة إلا إذا كنت مشرفاً" });
    }

    // ✅ مسح كل الرسائل عندي فقط
    const result = await Message.updateMany(
      { conversation: conversationId, deletedFor: { $ne: userId } },
      { $addToSet: { deletedFor: userId } }
    );

    // ✅ لا نحذف/نخفي المحادثة نفسها — فقط نمسح الرسائل عند هذا المستخدم
    return res.json({ ok: true, modified: result?.modifiedCount || result?.nModified || 0 });
  } catch (e) {
    console.error("POST /api/chat/conversations/:id/clear error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء مسح المحادثة" });
  }
});

app.post(
  "/api/chat/conversations/:id/messages",
  authMiddleware,
  upload.fields([
    { name: "attachments", maxCount: 5 },
    { name: "voice", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const userId = req.userId;
      const conversationId = req.params.id;

      const rawText = typeof req.body.text === "string" ? req.body.text : "";
      const text = rawText.trim();

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return res.status(404).json({ msg: "المحادثة غير موجودة" });

      if (!conversation.participants.some((p) => String(p) === String(userId))) {
        return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
      }

      const files = [];
      if (req.files) {
        if (Array.isArray(req.files.attachments)) files.push(...req.files.attachments);
        if (Array.isArray(req.files.voice) && req.files.voice.length > 0) files.push(req.files.voice[0]);
      }

      const detectKind = (mime) => {
        if (!mime) return "file";
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "audio";
        return "file";
      };

      // دعم مدة الرسالة الصوتية (ثواني) إذا أرسلها الفرونت
      const voiceDurationRaw = req.body?.voiceDuration ?? req.body?.duration ?? 0;
      const voiceDuration = Number.isFinite(Number(voiceDurationRaw)) ? Number(voiceDurationRaw) : 0;

      const attachments = files.map((f) => {
        const kind = detectKind(f.mimetype);
        const att = {
          url: `/uploads/${f.filename}`,
          type: kind,
          originalName: f.originalname,
          size: f.size,
          mimeType: f.mimetype,
          duration: 0,
        };

        // إذا هذا الملف صوتي وعندنا مدة مرسلة
        if (kind === "audio" && voiceDuration > 0) {
          att.duration = voiceDuration;
        }

        return att;
      });


      // ✅ Reply / Forward (من FormData)
      const rawReplyTo = req.body?.replyTo || req.body?.replyToId || null;
      const rawForwardOf = req.body?.forwardOf || req.body?.forwardOfId || null;

      const replyTo =
        rawReplyTo && mongoose.Types.ObjectId.isValid(String(rawReplyTo))
          ? String(rawReplyTo)
          : null;

      const forwardOf =
        rawForwardOf && mongoose.Types.ObjectId.isValid(String(rawForwardOf))
          ? String(rawForwardOf)
          : null;

      let replyPreview = null;
      let forwardPreview = null;

      try {
        if (req.body?.replyPreview) replyPreview = JSON.parse(req.body.replyPreview);
      } catch {}
      try {
        if (req.body?.forwardPreview) forwardPreview = JSON.parse(req.body.forwardPreview);
      } catch {}

      const forwardComment =
        typeof req.body?.forwardComment === "string" ? req.body.forwardComment.trim() : "";


      const hasText = !!text;
      const hasFiles = attachments.length > 0;
      const hasForward = !!forwardOf;
      const hasReply = !!replyTo && (hasText || hasFiles);

      if (!hasText && !hasFiles && !hasForward && !hasReply) {
        return res.status(400).json({ msg: "يجب إرسال نص أو مرفق واحد على الأقل" });
      }

      // ✅ نوع الرسالة بشكل موحّد وآمن
      const msgType = computeMessageType(text, attachments);

      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        clientMsgId: typeof req.body?.clientMsgId === "string" && req.body.clientMsgId.trim() ? req.body.clientMsgId.trim() : null,
        type: msgType,
        text: text || "",
        attachments,
        // Reply
        replyTo,
        replyPreview,
        // Forward
        forwardOf,
        forwardPreview,
        forwardComment,
        seenBy: [userId],
      });

      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;
      // ✅ لو كانت المحادثة مخفية عند أي طرف بسبب Clear Chat، رجّعها
      conversation.deletedFor = [];
      await conversation.save();

      const populatedMsg = await message.populate("sender", "username avatar");

      // ================== مزامنة الطرفين عبر Socket.io (حتى لو الإرسال تم عبر REST) ==================
      try {
        const payload = populatedMsg.toObject();
        payload.conversation = conversationId;

        // إرسال للمرسل دائماً
        io.to(`user-${String(userId)}`).emit("new-message", payload);

        // إرسال لباقي المشاركين
        if (!conversation.isGroup) {
          const receiverId =
            (conversation.participants || []).find((p) => String(p) !== String(userId)) || null;
          if (receiverId) io.to(`user-${String(receiverId)}`).emit("new-message", payload);
        } else {
          for (const p of conversation.participants || []) {
            const pid = String(p);
            if (pid !== String(userId)) io.to(`user-${pid}`).emit("new-message", payload);
          }
        }
      } catch (e) {
        console.error("socket sync (REST send) error:", e);
      }

      res.status(201).json(populatedMsg);
    } catch (err) {
      console.error("POST /api/chat/conversations/:id/messages error:", err);
      res.status(500).json({ msg: "حدث خطأ أثناء إرسال الرسالة" });
    }
  }
);


/* ===================================================================== */
/* 🗑️ حذف الرسائل (حذف عندي / حذف للجميع) + حذف دفعة واحدة */
/* ===================================================================== */

// Helpers
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

// ✅ صلاحيات القنوات/المجموعات (Telegram-like)
function isConvAdmin(conv, userId) {
  const uid = String(userId || "");
  if (!conv || !uid) return false;
  const ownerOk = conv.owner && String(conv.owner) === uid;
  const admins = Array.isArray(conv.admins) ? conv.admins.map((x) => String(x)) : [];
  return ownerOk || admins.includes(uid);
}

function isChannel(conv) {
  return !!conv && (conv.type === "channel" || (conv.type == null && conv.isGroup && conv.permissions?.canSend === "admins"));
}


// ✅ حذف عندي فقط (soft delete) — endpoint مطابق للفرونت: POST /api/chat/messages/delete-for-me
// Body:
// - { id: "..." } أو { ids: ["..",".."] }
app.post("/api/chat/messages/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const idsRaw = req.body?.ids ?? req.body?.messageIds ?? null;
    const oneId = req.body?.id ?? req.body?.messageId ?? null;

    let ids = [];
    if (Array.isArray(idsRaw)) ids = idsRaw;
    else if (typeof oneId === "string") ids = [oneId];

    ids = ids.map((x) => String(x || "")).filter(Boolean);

    // تجاهل أي temp-... أو ids غير صالحة (بدون 500)
    const validIds = ids.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) return res.json({ ok: true, deleted: 0 });

    // جلب الرسائل + التحقق من صلاحية المحادثات
    const msgs = await Message.find({ _id: { $in: validIds } }).select("_id conversation");
    if (!msgs.length) return res.json({ ok: true, deleted: 0 });

    const convIds = [...new Set(msgs.map((m) => String(m.conversation)))];
    const convs = await Conversation.find({ _id: { $in: convIds } }).select("_id participants type owner admins isGroup");
    const convMap = new Map(convs.map((c) => [String(c._id), c]));

    const allowedIds = [];
    for (const m of msgs) {
      const c = convMap.get(String(m.conversation));
      if (!c) continue;
      if (!Array.isArray(c.participants)) continue;
      const isMember = c.participants.some((p) => String(p) === userId);
      if (!isMember) continue;
      // ✅ قنوات: غير المشرف لا يحق له حذف حتى عنده فقط (Telegram-like)
      if (isChannel(c) && !isConvAdmin(c, userId)) {
        return res.status(403).json({ msg: "لا يمكنك حذف رسائل داخل قناة إلا إذا كنت مشرفاً" });
      }
      allowedIds.push(String(m._id));
    }

    if (allowedIds.length === 0) return res.json({ ok: true, deleted: 0 });

    await Message.updateMany({ _id: { $in: allowedIds } }, { $addToSet: { deletedFor: userId } });

    // مزامنة: فقط لهذا المستخدم (حتى ما نعمل تشويش عند الطرف الآخر)
    io.to(`user-${userId}`).emit("messages-deleted", {
      conversationId: null,
      messageIds: allowedIds,
      mode: "me",
      byUserId: userId,
    });

    return res.json({ ok: true, deleted: allowedIds.length });
  } catch (e) {
    console.error("POST /api/chat/messages/delete-for-me error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء الحذف" });
  }
});

// ✅ حذف للجميع (hard delete) — DELETE /api/chat/messages/:id
// حذف عندي فقط (Soft delete) — لا يمس الرسالة عند الطرف الآخر
app.post("/api/chat/messages/:id/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const messageId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ msg: "messageId غير صالح" });
    }

    const msg = await Message.findById(messageId).select("conversation");
    if (!msg) return res.status(404).json({ msg: "الرسالة غير موجودة" });

    const conv = await Conversation.findById(msg.conversation).select("participants isGroup type owner admins");
    if (!conv) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    if (!conv.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    if (isChannel(conv) && !isConvAdmin(conv, userId)) {
      return res.status(403).json({ msg: "لا يمكنك حذف رسائل داخل قناة إلا إذا كنت مشرفاً" });
    }

    await Message.updateOne({ _id: messageId }, { $addToSet: { deletedFor: userId } });

    // مزامنة للطرفين/المجموعة
    for (const pid of conv.participants || []) {
      io.to(`user-${String(pid)}`).emit("message-deleted", {
        messageId: String(messageId),
        conversationId: String(conv._id),
        mode: "me",
        byUserId: String(userId),
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/chat/messages/:id/delete-for-me error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء الحذف" });
  }
});

app.delete("/api/chat/messages/:id", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const messageId = String(req.params.id || "");

    // لا ترمي 500 لو temp-... أو غير صالح
    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ msg: "معرّف الرسالة غير صالح" });
    }

    const msg = await Message.findById(messageId).lean();
    if (!msg) return res.status(404).json({ msg: "الرسالة غير موجودة" });

    const conv = await Conversation.findById(msg.conversation).select("participants isGroup type owner admins");
    if (!conv) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    if (!Array.isArray(conv.participants) || !conv.participants.some((p) => String(p) === userId)) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    // صلاحية: فقط المرسل يحذف للجميع (أو توسّعها لاحقاً للمشرف/مالك المجموعة)
    if (String(msg.sender) !== userId) {
      return res.status(403).json({ msg: "فقط مُرسل الرسالة يستطيع حذفها للجميع" });
    }

    // حذف ملفات المرفقات من uploads إن وجدت
    try {
      const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
      for (const a of atts) {
        const u = a?.url ? String(a.url) : "";
        if (u.startsWith("/uploads/")) {
          const filename = u.replace("/uploads/", "").replace(/^\/+/, "");
          const filePath = path.join(__dirname, "uploads", filename);
          try {
            await fs.unlink(filePath);
          } catch {}
        }
      }
    } catch (e) {
      console.warn("unlink warn:", e?.message || e);
    }

    await Message.deleteOne({ _id: messageId });

    // مزامنة للطرفين/المجموعة
    for (const pid of conv.participants || []) {
      io.to(`user-${String(pid)}`).emit("messages-deleted", {
        conversationId: String(conv._id),
        messageIds: [messageId],
        mode: "all",
        byUserId: userId,
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/chat/messages/:id error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء الحذف" });
  }
});

// ✅ حذف للجميع دفعة واحدة (hard) — POST /api/chat/messages/bulk-delete
// Body: { ids: ["..",".."] }
app.post("/api/chat/messages/bulk-delete", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const validIds = ids.map((x) => String(x || "")).filter((id) => isValidObjectId(id));
    if (validIds.length === 0) return res.json({ ok: true, deleted: 0 });

    const msgs = await Message.find({ _id: { $in: validIds } }).lean();
    if (!msgs.length) return res.json({ ok: true, deleted: 0 });

    const convIds = [...new Set(msgs.map((m) => String(m.conversation)))];
    const convs = await Conversation.find({ _id: { $in: convIds } }).select("_id participants type owner admins isGroup");
    const convMap = new Map(convs.map((c) => [String(c._id), c]));

    // فقط رسائلي + ضمن محادثة أنا مشارك فيها
    // ✅ قنوات: الحذف (حتى للجميع) للمشرفين فقط. المشرف داخل قناة يستطيع حذف أي رسالة.
    const deletable = [];
    for (const m of msgs) {
      const c = convMap.get(String(m.conversation));
      if (!c) continue;
      if (!Array.isArray(c.participants) || !c.participants.some((p) => String(p) === userId)) continue;

      if (isChannel(c)) {
        if (!isConvAdmin(c, userId)) {
          return res.status(403).json({ msg: "لا يمكنك حذف رسائل داخل قناة إلا إذا كنت مشرفاً" });
        }
        // admin: allow delete any message in channel
        deletable.push(m);
        continue;
      }

      // chat/group: لا تحذف إلا رسائلك
      if (String(m.sender) !== userId) continue;
      deletable.push(m);
    }

    if (!deletable.length) return res.json({ ok: true, deleted: 0 });

    // حذف الملفات
    for (const m of deletable) {
      try {
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        for (const a of atts) {
          const u = a?.url ? String(a.url) : "";
          if (u.startsWith("/uploads/")) {
            const filename = u.replace("/uploads/", "").replace(/^\/+/, "");
            const filePath = path.join(__dirname, "uploads", filename);
            try {
              await fs.unlink(filePath);
            } catch {}
          }
        }
      } catch {}
    }

    const deletableIds = deletable.map((m) => String(m._id));
    await Message.deleteMany({ _id: { $in: deletableIds } });

    // مزامنة مجمّعة لكل محادثة لتقليل الترافيك
    const byConv = new Map();
    for (const m of deletable) {
      const cid = String(m.conversation);
      if (!byConv.has(cid)) byConv.set(cid, []);
      byConv.get(cid).push(String(m._id));
    }

    for (const [cid, idsArr] of byConv.entries()) {
      const c = convMap.get(cid);
      for (const pid of c?.participants || []) {
        io.to(`user-${String(pid)}`).emit("messages-deleted", {
          conversationId: cid,
          messageIds: idsArr,
          mode: "all",
          byUserId: userId,
        });
      }
    }

    return res.json({ ok: true, deleted: deletableIds.length });
  } catch (e) {
    console.error("POST /api/chat/messages/bulk-delete error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء الحذف" });
  }
});
app.post("/api/chat/conversations/:id/seen", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const conversationId = req.params.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: userId }, // ✅ لا تلمس رسائلي
        deletedFor: { $ne: userId },
        seenBy: { $ne: userId },
      },
      { $addToSet: { seenBy: userId } }
    );

    // ✅ مزامنة القراءة للطرفين (يظهر ✅✅ عند المرسل فقط بعد فتح المستلم للمحادثة)
    try {
      const conv = await Conversation.findById(conversationId).select("participants isGroup");
      if (conv && Array.isArray(conv.participants)) {
        for (const pid of conv.participants) {
          io.to(`user-${String(pid)}`).emit("messages-seen", {
            conversationId,
            seenBy: String(userId),
          });
        }
      }
    } catch (e) {
      console.error("emit messages-seen error:", e);
    }

    res.json({ msg: "تم تحديث حالة القراءة" });
  } catch (err) {
    console.error("POST /api/chat/conversations/:id/seen error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء تحديث حالة القراءة" });
  }
});

/* ===================================================================== */
/* 🔶 راوت موحّد للبلاغات (منشورات + قصص) + باقي راوتات البوستات والإدارة */
/* ===================================================================== */

// ====================== البوستات ======================
app.post("/api/reports", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { type, targetId, reason, details } = req.body || {};

    if (!type || !targetId) {
      return res.status(400).json({ msg: "بيانات البلاغ غير كاملة (النوع أو المعرّف مفقود)" });
    }

    let finalReason = (reason || "").trim();
    const finalDetails = (details || "").trim();
    if (!finalReason) finalReason = "سبب غير محدد";

    if (type === "post") {
      if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ msg: "معرّف المنشور غير صالح" });

      const post = await Post.findById(targetId);
      if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

      const existing = await Report.findOne({ targetType: "post", post: post._id, reporter: userId });
      if (existing) return res.json({ msg: "سبق وقمت بالإبلاغ عن هذا المنشور" });

      const finalReasonForPost = finalReason === "other" ? "سبب آخر" : finalReason;

      if (!Array.isArray(post.reports)) post.reports = [];
      post.reports.push({ user: userId, reason: finalReasonForPost, other: finalDetails, createdAt: new Date() });
      await post.save();

      const rep = await Report.create({
        targetType: "post",
        post: post._id,
        reporter: userId,
        reason: finalReasonForPost,
        details: finalDetails,
        status: "pending",
      });

      return res.json({ msg: "تم إرسال البلاغ على المنشور، سيتم مراجعته من الإدارة ✅", reportId: rep._id });
    }

    if (type === "story") {
      if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ msg: "معرّف القصة غير صالح" });

      const story = await Story.findById(targetId);
      if (!story) return res.status(404).json({ msg: "القصة غير موجودة" });

      const existing = await Report.findOne({ targetType: "story", story: story._id, reporter: userId });
      if (existing) return res.json({ msg: "سبق وقمت بالإبلاغ عن هذه القصة" });

      const rep = await Report.create({
        targetType: "story",
        story: story._id,
        reporter: userId,
        reason: finalReason,
        details: finalDetails,
        status: "pending",
      });

      return res.json({ msg: "تم إرسال البلاغ على القصة، سيتم مراجعته من الإدارة ✅", reportId: rep._id });
    }

    return res.status(400).json({ msg: "نوع البلاغ غير مدعوم (post أو story فقط)" });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إرسال البلاغ، حاول مرة أخرى" });
  }
});

app.post("/api/posts/report/:id", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;
    const { reason, other } = req.body || {};

    if (!reason && !other) return res.status(400).json({ msg: "يجب تحديد سبب للإبلاغ" });

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "معرّف المنشور غير صالح" });
    }

    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const alreadyReported = (post.reports || []).some((r) => r.user && r.user.toString() === userId.toString());
    if (alreadyReported) return res.status(400).json({ msg: "لقد قمت بالإبلاغ عن هذا المنشور من قبل" });

    const finalReason = reason === "other" ? "سبب آخر" : reason || "سبب غير محدد";

    if (!Array.isArray(post.reports)) post.reports = [];
    post.reports.push({ user: userId, reason: finalReason, other: other || "", createdAt: new Date() });
    await post.save();

    await Report.create({
      targetType: "post",
      post: post._id,
      reporter: userId,
      reason: finalReason,
      details: other || "",
      status: "pending",
    });

    return res.json({ msg: "تم إرسال الإبلاغ، سيتم مراجعته من الإدارة ✅", reportsCount: post.reports.length });
  } catch (err) {
    console.error("POST /api/posts/report/:id error:", err);
    return res.status(500).json({ msg: "خطأ في الخادم أثناء إرسال الإبلاغ" });
  }
});

app.post("/api/posts/:id/save", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const ensureArr = (v) => (Array.isArray(v) ? v : []);
    user.savedPosts = ensureArr(user.savedPosts);

    const alreadySaved = user.savedPosts.some((id) => String(id) === String(postId));

    let saved;
    if (alreadySaved) {
      user.savedPosts = user.savedPosts.filter((id) => String(id) !== String(postId));
      saved = false;
    } else {
      user.savedPosts.push(postId);
      saved = true;
    }

    await user.save();

    return res.json({
      msg: saved ? "تم حفظ المنشور" : "تم إلغاء حفظ المنشور",
      saved,
      savedCount: user.savedPosts.length,
    });
  } catch (err) {
    console.error("ERROR in /api/posts/:id/save:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.get("/api/saved", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).populate({
      path: "savedPosts",
      populate: [
        { path: "user", select: "username email avatar isPrivate followers" },
        { path: "comments.user", select: "username avatar" },
        { path: "likes", select: "username avatar" },
      ],
    });

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const viewerIsAdmin = !!user.isAdmin;
    let savedPosts = user.savedPosts || [];

    savedPosts = savedPosts.filter((post) => {
      if (!post.user) return false;

      const ownerId = post.user._id?.toString?.() || post.user.toString();
      const isOwner = ownerId === userId.toString();
      const userIsPrivate = !!post.user.isPrivate;

      if (!userIsPrivate) return true;
      if (viewerIsAdmin || isOwner) return true;

      const followers = ensureArray(post.user.followers);
      return followers.some((id) => id.toString() === userId.toString());
    });

    savedPosts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json(savedPosts);
  } catch (err) {
    console.error("ERROR in GET /api/saved:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.post("/api/posts", authMiddleware, upload.single("media"), async (req, res) => {
  try {
    let { text, link, privacy } = req.body;
    text = text?.trim();
    link = link?.trim();

    let privacyValue = (privacy || "public").toString().toLowerCase();
    if (!["public", "private"].includes(privacyValue)) privacyValue = "public";

    let imageUrl = "";
    let videoUrl = "";

    if (req.file) {
      const filePath = "/uploads/" + req.file.filename;
      if (req.file.mimetype.startsWith("image")) imageUrl = filePath;
      else if (req.file.mimetype.startsWith("video")) videoUrl = filePath;
    }

    if (!text && !imageUrl && !videoUrl && !link) {
      return res.status(400).json({ msg: "يجب أن يحتوي المنشور على نص أو صورة أو فيديو أو رابط" });
    }

    const newPost = new Post({
      text,
      imageUrl,
      videoUrl,
      link,
      user: req.userId,
      privacy: privacyValue,
    });

    await newPost.save();
    await newPost.populate("user", "username email avatar isPrivate followers");

    res.json({ msg: "تم إنشاء المنشور", post: newPost });
  } catch (err) {
    console.error("ERROR in /api/posts:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.get("/api/posts", authMiddlewareOptional, async (req, res) => {
  try {
    const viewerId = req.userId || null;

    let viewerIsAdmin = false;
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("isAdmin");
      viewerIsAdmin = !!viewer?.isAdmin;
    }

    let query;
    if (viewerId) {
      query = {
        $or: [{ privacy: "public" }, { privacy: { $exists: false } }, { user: viewerId }],
      };
    } else {
      query = { $or: [{ privacy: "public" }, { privacy: { $exists: false } }] };
    }

    const rawPosts = await Post.find(query)
      .populate("user", "username email avatar isPrivate followers")
      .populate("comments.user", "username avatar")
      .populate("likes", "username avatar")
      .sort({ createdAt: -1 });

    const posts = rawPosts.filter((post) => {
      if (!post.user) return false;

      const ownerId = post.user._id?.toString?.() || post.user.toString();
      const userIsPrivate = !!post.user.isPrivate;

      if (!viewerId) return !userIsPrivate;

      const viewerIdStr = viewerId.toString();
      const isOwner = ownerId === viewerIdStr;

      if (!userIsPrivate) return true;
      if (viewerIsAdmin || isOwner) return true;

      const followers = ensureArray(post.user.followers);
      return followers.some((id) => id.toString() === viewerIdStr);
    });

    res.json(posts);
  } catch (err) {
    console.error("ERROR in /api/posts:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.get("/api/posts/:id", authMiddlewareOptional, async (req, res) => {
  try {
    const viewerId = req.userId || null;

    let viewerIsAdmin = false;
    if (viewerId) {
      const viewer = await User.findById(viewerId).select("isAdmin");
      viewerIsAdmin = !!viewer?.isAdmin;
    }

    const post = await Post.findById(req.params.id)
      .populate("user", "username email avatar isPrivate followers")
      .populate("comments.user", "username avatar")
      .populate("likes", "username avatar");

    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    if (post.user && post.user.isPrivate) {
      const ownerId = post.user._id?.toString?.();
      const viewerIdStr = viewerId ? viewerId.toString() : null;
      const isOwner = viewerIdStr && ownerId === viewerIdStr;

      const followers = ensureArray(post.user.followers);
      const isFollower = viewerIdStr && followers.some((id) => id.toString() === viewerIdStr);

      if (!viewerIdStr || (!isOwner && !viewerIsAdmin && !isFollower)) {
        return res.status(403).json({ msg: "هذا الحساب خاص، يمكن للمتابعين فقط رؤية منشوراته" });
      }
    }

    if (
      post.privacy === "private" &&
      (!viewerId || (post.user._id.toString() !== viewerId.toString() && !viewerIsAdmin))
    ) {
      return res.status(403).json({ msg: "هذا المنشور خاص" });
    }

    res.json(post);
  } catch (err) {
    console.error("ERROR in GET /api/posts/:id:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.put("/api/posts/:id", authMiddleware, upload.single("media"), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    if (String(post.user) !== String(req.userId)) {
      return res.status(403).json({ msg: "غير مسموح تعديل منشور شخص آخر" });
    }

    let { text, link, privacy } = req.body;

    if (typeof text === "string") post.text = text.trim();
    if (typeof link === "string") post.link = link.trim();

    if (typeof privacy === "string") {
      const p = privacy.toLowerCase();
      if (["public", "private"].includes(p)) post.privacy = p;
    }

    if (req.file) {
      const filePath = "/uploads/" + req.file.filename;
      if (req.file.mimetype.startsWith("image")) {
        post.imageUrl = filePath;
        post.videoUrl = "";
      } else if (req.file.mimetype.startsWith("video")) {
        post.videoUrl = filePath;
        post.imageUrl = "";
      }
    }

    if (!post.text && !post.imageUrl && !post.videoUrl && !post.link) {
      return res.status(400).json({ msg: "يجب أن يحتوي المنشور على نص أو صورة أو فيديو أو رابط" });
    }

    await post.save();
    await post.populate("user", "username email avatar isPrivate followers");

    res.json({ msg: "تم تعديل المنشور", post });
  } catch (err) {
    console.error("ERROR in PUT /api/posts/:id:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

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

app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const trimmed = text?.trim();
    if (!trimmed) return res.status(400).json({ msg: "نص التعليق مطلوب" });

    const post = await Post.findById(req.params.id).populate("comments.user", "username avatar");
    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const comment = { text: trimmed, user: req.userId, createdAt: new Date() };
    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "username avatar");

    const lastComment = post.comments[post.comments.length - 1];

    res.json({
      msg: "تم إضافة التعليق",
      comment: {
        _id: lastComment._id,
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

app.put("/api/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const trimmed = text?.trim();
    if (!trimmed) return res.status(400).json({ msg: "نص التعليق مطلوب" });

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "معرف المنشور غير صالح" });
    }

    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ msg: "التعليق غير موجود" });

    const userId = req.userId.toString();
    const isOwner = comment.user && comment.user.toString() === userId;
    if (!isOwner) return res.status(403).json({ msg: "غير مسموح تعديل هذا التعليق" });

    comment.text = trimmed;
    await post.save();

    return res.json({
      msg: "تم تعديل التعليق",
      comment: { _id: comment._id, text: comment.text, createdAt: comment.createdAt },
    });
  } catch (err) {
    console.error("ERROR update comment:", err);
    return res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.delete("/api/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "معرف المنشور غير صالح" });
    }

    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ msg: "التعليق غير موجود" });

    const userId = req.userId.toString();
    const isCommentOwner = comment.user && comment.user.toString() === userId;
    const isPostOwner = post.user && post.user.toString() === userId;

    if (!isCommentOwner && !isPostOwner) return res.status(403).json({ msg: "غير مسموح حذف هذا التعليق" });

    comment.deleteOne();
    await post.save();

    return res.json({ msg: "تم حذف التعليق", commentsCount: post.comments.length });
  } catch (err) {
    console.error("ERROR delete comment:", err);
    return res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.delete("/api/posts/:id", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    let post;
    try {
      post = await Post.findById(postId);
    } catch (e) {
      console.error("❌ invalid postId:", e);
      return res.status(400).json({ msg: "معرّف المنشور غير صالح" });
    }

    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });
    if (!post.user) return res.status(403).json({ msg: "لا يمكن حذف هذا المنشور (مالك غير معروف)" });

    if (post.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "غير مسموح حذف منشور شخص آخر" });
    }

    await post.deleteOne();
    return res.json({ msg: "تم حذف المنشور" });
  } catch (err) {
    console.error("ERROR in DELETE /api/posts/:id", err);
    return res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ================== تحويل حسابك إلى مشرف ==================
app.get("/make-me-admin", async (req, res) => {
  try {
    const email = "ahmadhjhmod4@gmail.com";

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود", email });

    user.isAdmin = true;
    await user.save();

    res.json({
      msg: "تم تحويل هذا الحساب إلى مشرف (Admin) بنجاح ✅",
      email: user.email,
      isAdmin: user.isAdmin,
    });
  } catch (err) {
    console.error("make-me-admin error:", err);
    res.status(500).json({ msg: "خطأ أثناء جعل الحساب مشرفاً" });
  }
});

// ================== روتات المشرف (Admin) ==================
app.get("/api/admin/reports", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "post",
        select: "text imageUrl videoUrl link privacy createdAt user",
        populate: { path: "user", select: "username email avatar" },
      })
      .populate({
        path: "story",
        select: "mediaUrl mediaType text createdAt user",
        populate: { path: "user", select: "username email avatar" },
      })
      .populate("reporter", "username email avatar");

    res.json(reports);
  } catch (err) {
    console.error("GET /api/admin/reports error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب البلاغات" });
  }
});

app.post("/api/admin/reports/:id/accept", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ msg: "معرّف البلاغ غير صالح" });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ msg: "البلاغ غير موجود" });

    if (report.status !== "pending") {
      return res.status(400).json({ msg: "تمت معالجة هذا البلاغ مسبقاً" });
    }

    if (report.targetType === "post" && report.post) {
      await Post.findByIdAndDelete(report.post);
      await Report.updateMany({ targetType: "post", post: report.post }, { $set: { status: "accepted" } });
    } else if (report.targetType === "story" && report.story) {
      await Story.findByIdAndDelete(report.story);
      await Report.updateMany({ targetType: "story", story: report.story }, { $set: { status: "accepted" } });
    }

    report.status = "accepted";
    await report.save();

    res.json({ msg: "تم قبول البلاغ ومعالجة المحتوى", report });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/accept error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء قبول البلاغ" });
  }
});

app.post("/api/admin/reports/:id/reject", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ msg: "معرّف البلاغ غير صالح" });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ msg: "البلاغ غير موجود" });

    if (report.status !== "pending") {
      return res.status(400).json({ msg: "تمت معالجة هذا البلاغ مسبقاً" });
    }

    report.status = "rejected";
    await report.save();

    res.json({ msg: "تم رفض البلاغ", report });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/reject error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء رفض البلاغ" });
  }
});

app.post("/api/admin/dev/migrate-story-reports", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stories = await Story.find({ "reports.0": { $exists: true } });
    let createdCount = 0;
    let skippedCount = 0;

    for (const story of stories) {
      const storyId = story._id;

      for (const embeddedReport of story.reports || []) {
        const reporterId = embeddedReport.user;
        const reason = embeddedReport.reason || "محتوى غير لائق";
        const at = embeddedReport.at || story.createdAt || new Date();

        const exists = await Report.findOne({
          targetType: "story",
          story: storyId,
          reporter: reporterId,
        });

        if (exists) {
          skippedCount++;
          continue;
        }

        await Report.create({
          targetType: "story",
          story: storyId,
          reporter: reporterId,
          reason,
          details: "",
          status: "pending",
          createdAt: at,
        });

        createdCount++;
      }
    }

    res.json({ msg: "تمت هجرة بلاغات الستوري بنجاح", created: createdCount, skipped: skippedCount });
  } catch (err) {
    console.error("migrate-story-reports error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء هجرة بلاغات الستوري" });
  }
});

// ================== إدارة المستخدمين والمشرفين ==================
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({})
      .select("username email avatar isAdmin createdAt isPrivate")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب المستخدمين" });
  }
});

app.post("/api/admin/users/:id/make-admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    if (user.isAdmin) return res.status(400).json({ msg: "هذا المستخدم مشرف بالفعل" });

    user.isAdmin = true;
    await user.save();

    res.json({
      msg: "تم ترقية المستخدم إلى مشرف ✅",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isPrivate: !!user.isPrivate,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/users/:id/make-admin error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء ترقية المستخدم" });
  }
});

app.post("/api/admin/users/:id/remove-admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetId) === String(currentUserId)) {
      return res.status(400).json({ msg: "لا يمكنك إزالة صلاحية المشرف عن نفسك" });
    }

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    if (!user.isAdmin) return res.status(400).json({ msg: "هذا المستخدم ليس مشرفاً أصلاً" });

    user.isAdmin = false;
    await user.save();

    res.json({
      msg: "تم إزالة صلاحية المشرف عن المستخدم",
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isPrivate: !!user.isPrivate,
      },
    });
  } catch (err) {
    console.error("POST /api/admin/users/:id/remove-admin error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء تعديل صلاحيات المستخدم" });
  }
});

// ======================== حماية 404 للـ API (حتى ما يرجع HTML) ========================
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.use("/api", (req, res) => res.status(404).json({ msg: "API route not found" }));

// ======================== واجهة الموقع ========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ======================== تشغيل السيرفر ========================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ السيرفر شغال على المنفذ ${PORT}`);
  console.log(`🔌 Socket.io جاهز للدردشة الفورية`);
});

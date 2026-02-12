// server.js  (ظ†ط³ط®ط© ES Module ظ…ط¹ط¯ظ‘ظژظ„ط© + ط®طµظˆطµظٹط© ط§ظ„ظ…ظ†ط´ظˆط±ط§طھ + ط®طµظˆطµظٹط© ط§ظ„ط­ط³ط§ط¨ + ظˆط§ط¬ظ‡ط© ط§ظ„ظ…ط´ط±ظپ + ط§ظ„ط³طھظˆط±ظٹ + ظ†ط¸ط§ظ… ط¨ظ„ط§ط؛ط§طھ ظ…ظˆط­ظ‘ط¯ + ط­ط¸ط± ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† + ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ + Socket.io)

import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

// ===== طھط­ظ…ظٹظ„ .env ط¨ط´ظƒظ„ ط«ط§ط¨طھ ط­طھظ‰ ظ„ظˆ ط´ط؛ظ‘ظ„طھ ط§ظ„ط³ظٹط±ظپط± ظ…ظ† ظ…ط³ط§ط± ظ…ط®طھظ„ظپ =====
// ظ‡ط°ط§ ظٹط­ظ„ ظ…ط´ظƒظ„ط©: ط£ط­ظٹط§ظ†ط§ظ‹ ط¨ط¹ط¯ ط¥ط¹ط§ط¯ط© طھط´ط؛ظٹظ„ ط§ظ„ط¬ظ‡ط§ط²/ط§ظ„طھظٹط±ظ…ظ†ط§ظ„طŒ dotenv ظ…ط§ ظٹظ„ط§ظ‚ظٹ .env ظپظٹطھطµظ„ ط§ظ„ط³ظٹط±ظپط± ط¨ظ‚ط§ط¹ط¯ط© ظ…ط®طھظ„ظپط©.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });
// fallback: ظ„ظˆ ط­ط§ط¨ طھط´ط؛ظ‘ظ„ظ‡ ظ…ظ† ط£ظٹ ظ…ظƒط§ظ† ظˆظپظٹظ‡ .env ط¨ط§ظ„ظ€ CWD
dotenv.config();

// ===== Firebase Admin (Push Notifications) =====
const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
} = process.env;

let firebaseReady = false;
if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: FIREBASE_PROJECT_ID,
        clientEmail: FIREBASE_CLIENT_EMAIL,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
    firebaseReady = true;
    console.log("✅ Firebase Admin initialized");
  } catch (e) {
    console.error("⚠️ Firebase Admin init failed:", e?.message || e);
  }
} else {
  console.warn("⚠️ Firebase Admin is not configured. Set FIREBASE_* env vars.");
}

import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs/promises";
import crypto from "crypto";
import admin from "firebase-admin";

import User from "./models/User.js";
import Post from "./models/Post.js";
import Report from "./models/Report.js";
import Story from "./models/Story.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ظ‚طµطµ
import upload, { uploadsDir } from "./upload.js";
import Conversation from "./models/Conversation.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ
import Message from "./models/Message.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ط±ط³ط§ط¦ظ„
import CallLog from "./models/CallLog.js"; // â­گ ط³ط¬ظ„ ط§ظ„ط§طھطµط§ظ„ط§طھ
import NotificationToken from "./models/NotificationToken.js";
import AuthSession from "./models/AuthSession.js";
import ProfileView from "./models/ProfileView.js";
import FollowEvent from "./models/FollowEvent.js";
mongoose.set("strictPopulate", false);

async function sendIncomingCallPush({ toUserId, fromUserId, type, callId }) {
  try {
    if (!firebaseReady) return;
    const to = String(toUserId || "").trim();
    const from = String(fromUserId || "").trim();
    const cid = String(callId || "").trim();
    if (!to || !from || !cid) return;

    const doc = await NotificationToken.findOne({ userId: to }).lean();
    const tokens = Array.isArray(doc?.tokens) ? doc.tokens.filter(Boolean) : [];
    if (!tokens.length) return;

    const isVideo = String(type || "").toLowerCase() === "video";
    const fromUser = await User.findById(from).select("fullName username").lean();
    const fromName = String(
      fromUser?.fullName || fromUser?.username || "User",
    );
    const message = {
      tokens,
      android: {
        priority: "high",
        ttl: 60000,
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
      data: {
        type: "call_incoming",
        callId: cid,
        from: from,
        mode: isVideo ? "video" : "audio",
        fromName,
      },
    };

    await admin.messaging().sendEachForMulticast(message);
  } catch (e) {
    console.error("sendIncomingCallPush error:", e?.message || e);
  }
}

function _pushMessagePreview({ text = "", type = "text", attachments = [] } = {}) {
  const cleanText = String(text || "").trim();
  if (cleanText) return cleanText.slice(0, 180);

  const list = Array.isArray(attachments) ? attachments : [];
  const first = list[0] || {};
  const firstType = String(first?.type || type || "file").toLowerCase();

  if (firstType === "image") return "Photo";
  if (firstType === "video") return "Video";
  if (firstType === "audio") return "Voice message";
  if (firstType === "sticker") return "Sticker";
  if (list.length > 1) return "Attachments";
  return "Attachment";
}

async function sendChatMessagePush({
  toUserId,
  fromUserId,
  fromName,
  conversationId,
  conversationTitle = "",
  messageId = "",
  messageType = "text",
  text = "",
  attachments = [],
}) {
  try {
    if (!firebaseReady) return;

    const to = String(toUserId || "").trim();
    const from = String(fromUserId || "").trim();
    const cid = String(conversationId || "").trim();
    if (!to || !from || !cid || to === from) return;

    const doc = await NotificationToken.findOne({ userId: to }).lean();
    const tokens = Array.isArray(doc?.tokens) ? doc.tokens.filter(Boolean) : [];
    if (!tokens.length) return;

    const senderName = String(fromName || "").trim() || "User";
    const preview = _pushMessagePreview({
      text,
      type: messageType,
      attachments,
    });
    const titleBase = String(conversationTitle || "").trim();
    const title = titleBase || senderName;
    const body = titleBase ? `${senderName}: ${preview}` : preview;

    const payload = {
      tokens,
      notification: {
        title,
        body,
      },
      android: {
        priority: "high",
        collapseKey: `chat_${cid}`,
        notification: {
          sound: "default",
          channelId: "chat_messages",
          priority: "high",
          visibility: "private",
          tag: `chat_${cid}`,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            contentAvailable: true,
          },
        },
      },
      data: {
        type: "chat_message",
        conversationId: cid,
        messageId: String(messageId || ""),
        senderId: from,
        senderName,
        preview,
        messageType: String(messageType || "text"),
        conversationTitle: titleBase,
      },
    };

    await admin.messaging().sendEachForMulticast(payload);
  } catch (e) {
    console.error("sendChatMessagePush error:", e?.message || e);
  }
}

function _normalizeMessagePermission(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "followers") return "followers";
  if (v === "none") return "none";
  return "everyone";
}

function _safeUserAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 240);
}

function _safeIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.ip || req.socket?.remoteAddress || "";
  return String(ip).slice(0, 80);
}

function _safePlatform(req) {
  return String(req.headers["x-platform"] || req.headers["x-client-platform"] || "").slice(0, 60);
}

function _safeAppVersion(req) {
  return String(req.headers["x-app-version"] || "").slice(0, 40);
}

function _todayKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function createSessionAndToken(userId, req) {
  const session = await AuthSession.create({
    userId,
    userAgent: _safeUserAgent(req),
    ip: _safeIp(req),
    platform: _safePlatform(req),
    appVersion: _safeAppVersion(req),
    isRevoked: false,
    lastSeenAt: new Date(),
  });

  const token = jwt.sign(
    { id: userId, sid: String(session._id) },
    JWT_SECRET_EFFECTIVE,
    { expiresIn: "7d" },
  );
  return { token, sessionId: String(session._id) };
}

async function recordProfileView({ profileUserId, viewerUserId }) {
  try {
    const profileId = String(profileUserId || "").trim();
    const viewerId = String(viewerUserId || "").trim();
    if (!profileId || !viewerId || profileId === viewerId) return;
    await ProfileView.updateOne(
      {
        profileUserId: profileId,
        viewerUserId: viewerId,
        dayKey: _todayKey(),
      },
      {
        $set: {
          viewedAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (_) {}
}

// Counter model for publicId sequence
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

const app = express();
const server = createServer(app);
app.set("trust proxy", 1);

// ================== JWT Secret (Dev vs Prod) ==================
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim();
const JWT_SECRET_EFFECTIVE = JWT_SECRET || "DEV_SECRET_CHANGE_ME";
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("❌ JWT_SECRET غير مضبوط. مطلوب في الإنتاج.");
    process.exit(1);
  } else {
    console.warn("⚠️ JWT_SECRET غير مضبوط. سيتم استخدام قيمة تطوير مؤقتة.");
  }
}


// ================== ط¥ط¹ط¯ط§ط¯ط§طھ CORS ==================
// âœ… ظ„ظ„ظ†ط´ط± ط¹ظ„ظ‰ ط£ظٹ ط´ط¨ظƒط©/ط¯ظˆظ…ظٹظ†: ط¯ط¹ظ… ظ‚ط§ط¦ظ…ط© Origins (ظ…ظپطµظˆظ„ط© ط¨ظپط§طµظ„ط©) ط£ظˆ ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ط¬ظ…ظٹط¹
// ظ…ط«ط§ظ„:
// CLIENT_ORIGIN=https://saepel.com,https://www.saepel.com,http://localhost:5173
// ط£ظˆ
// CLIENT_ORIGIN=*
const CLIENT_ORIGIN_RAW = String(process.env.CLIENT_ORIGIN || "").trim();
const ALLOWED_ORIGINS = CLIENT_ORIGIN_RAW
  ? CLIENT_ORIGIN_RAW.split(",").map((x) => x.trim()).filter(Boolean)
  : ["*"];

const ALLOW_ALL = ALLOWED_ORIGINS.includes("*");

// ظ†ط³ظ…ط­ ط¨ط·ظ„ط¨ط§طھ ط¨ط¯ظˆظ† Origin (ظ…ط«ظ„ Postman / ط§ظ„ط³ظٹط±ظپط±-طھظˆ-ط³ظٹط±ظپط±)
function isOriginAllowed(origin) {
  // ظ†ط³ظ…ط­ ط¨ط·ظ„ط¨ط§طھ ط¨ط¯ظˆظ† Origin (ظ…ط«ظ„ Postman / ط§ظ„ط³ظٹط±ظپط±-طھظˆ-ط³ظٹط±ظپط±) ط£ظˆ file://
  if (!origin) return true;

  const o = String(origin).toLowerCase();

  // âœ… Cloudflare Quick Tunnel ظٹطھط؛ظٹط± ظƒظ„ ظ…ط±ط© ظ„ظƒظ†ظ‡ ط¯ط§ط¦ظ…ظ‹ط§ ظٹظ†طھظ‡ظٹ ط¨ظ€ .trycloudflare.com
  // ظ„ط°ظ„ظƒ ظ†ط³ظ…ط­ ظ„ظ‡ طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ط¨ط¯ظˆظ† ظ…ط§ طھط­طھط§ط¬ ط¯ظˆظ…ظٹظ†
  if (o.endsWith(".trycloudflare.com")) return true;

  // âœ… ظ„ظˆ ط­ط¨ظٹطھ طھط³طھط®ط¯ظ… Cloudflare Access ظ„ط§ط­ظ‚ط§ظ‹
  if (o.endsWith(".cloudflareaccess.com")) return true;

  // ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ط¬ظ…ظٹط¹ ط¹ظ†ط¯ CLIENT_ORIGIN=*
  if (ALLOW_ALL) return true;

  return ALLOWED_ORIGINS.includes(origin);
}
// ================== Socket.io ظ„ظ„ط¯ط±ط¯ط´ط© ط§ظ„ظپظˆط±ظٹط© ==================
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // origin ظ‚ط¯ ظٹظƒظˆظ† undefined ط£ط­ظٹط§ظ†ط§ظ‹
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS (socket.io)"), false);
    },
    methods: ["GET", "POST"],
    credentials: !ALLOW_ALL, // ظ„ظˆ * ظ…ط§ ظپظٹ credentials
  },
});
// طھط®ط²ظٹظ† ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط§ظ„ظ…طھطµظ„ظٹظ† (ط¯ط¹ظ… ط£ظƒط«ط± ظ…ظ† socket ظ„ظ†ظپط³ ط§ظ„ظ…ط³طھط®ط¯ظ…)
const connectedUsers = new Map(); // userId -> Set(socketId)
const lastSeenByUser = new Map(); // userId -> ISO string

function isUserOnline(userId) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const sockets = connectedUsers.get(uid);
  return !!sockets && sockets.size > 0;
}

function emitPresence(userId, online) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const run = async () => {
    const user = await User.findById(uid).select("privacy").lean();
    const showLastSeen = user?.privacy?.showLastSeen !== false;
    const lastSeen = !showLastSeen
      ? null
      : online
        ? null
        : (lastSeenByUser.get(uid) || new Date().toISOString());
    io.emit("user:presence", {
      userId: uid,
      online: !!online,
      lastSeen,
      hideLastSeen: !showLastSeen,
    });
  };
  run().catch(() => {
    io.emit("user:presence", {
      userId: uid,
      online: !!online,
      lastSeen: null,
      hideLastSeen: true,
    });
  });
}

// ================== Helpers ظ„ظ„طµظˆطھ/ط§ظ„ظ…ط±ظپظ‚ط§طھ ط¹ط¨ط± DataURL ==================
const UPLOADS_DIR = uploadsDir; // âœ… ظ†ظپط³ ظ…ط³ط§ط± multer (ظٹط¯ط¹ظ… Render Persistent Disk)

async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  } catch {}
}

// âœ… ط£ظ†ط´ط¦ ظ…ط¬ظ„ط¯ uploads ط¹ظ†ط¯ طھط´ط؛ظٹظ„ ط§ظ„ط³ظٹط±ظپط± (ط­طھظ‰ ظ…ط§ ظٹطµظٹط± ENOENT ط£ظˆظ„ ظ…ط±ط©)
ensureUploadsDir().catch(() => {});

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

function detectKindFromMime(mime = "", fileName = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";

  const n = String(fileName).toLowerCase().split("?")[0].split("#")[0];
  if (/\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif)$/i.test(n)) return "image";
  if (/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(n)) return "video";
  if (/\.(mp3|m4a|aac|wav|ogg|oga|flac|opus|webm)$/i.test(n)) return "audio";
  return "file";
}

// ظٹط­ظˆظ‘ظ„ dataURL ط¥ظ„ظ‰ ظ…ظ„ظپ ط¯ط§ط®ظ„ uploads ظˆظٹط±ط¬ط¹ ظ…ط³ط§ط±ظ‡ /uploads/xxx.ext
async function saveDataUrlToUploads(dataUrl, fallbackMime = "", preferredName = "", userId = "") {
  if (!dataUrl || typeof dataUrl !== "string") return "";

  // ط¥ط°ط§ ط£طµظ„ط§ظ‹ ظ…ط³ط§ط± ط¬ط§ظ‡ط²
  if (dataUrl.startsWith("/uploads/")) return dataUrl;
  if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) return dataUrl;

  // ظ†طھظˆظ‚ط¹ data:*;base64,....
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return "";

  const mime = match[1] || fallbackMime || "application/octet-stream";
  const b64 = match[2] || "";
  const ext = safeExtFromMime(mime);

  const rand = crypto.randomBytes(16).toString("hex");
  const cleanBase = (preferredName || "").toString().trim().replace(/[^\w\-\.]+/g, "_");
  const fileName =
    (cleanBase ? cleanBase.replace(/\.[^/.]+$/, "") : `socket_${rand}`) + `_${rand}.${ext}`;

const uid = String(userId || "").trim();
const relPath = uid ? path.join("users", uid, fileName) : fileName;
const abs = path.join(UPLOADS_DIR, relPath);

  const buf = Buffer.from(b64, "base64");

await ensureUploadsDir();
if (uid) {
  try { await fs.mkdir(path.join(UPLOADS_DIR, "users", uid), { recursive: true }); } catch {}
}
await fs.writeFile(abs, buf);


  return `/uploads/${relPath.split(path.sep).join("/")}`;
}

// ظٹط¯ط¹ظ…:
// - ط¹ظ†طµط± ظ†طµظ‘ظٹ (dataURL ط£ظˆ /uploads/.. ط£ظˆ ط±ط§ط¨ط·)
// - ط£ظˆ ط¹ظ†طµط± ظƒط§ط¦ظ†: { url, mimeType, originalName, size, type }
async function normalizeIncomingAttachments(raw = [], userId = "") {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];

  for (const item of list) {
    if (!item) continue;

    // ظ„ظˆ String
    if (typeof item === "string") {
      const savedUrl = await saveDataUrlToUploads(item, "", "file", userId);
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

    // ظ„ظˆ Object
    const mimeType = item.mimeType || item.mimetype || "";
    const originalName = item.originalName || item.name || "file";
    const size = item.size || 0;

    const urlRaw = item.url || item.path || item.dataUrl || "";
    const savedUrl = await saveDataUrlToUploads(urlRaw, mimeType, originalName, userId);

    if (!savedUrl) continue;

    const kind = item.type || item.kind || detectKindFromMime(mimeType, originalName);

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

// ================== طھط­ط¯ظٹط¯ ظ†ظˆط¹ ط§ظ„ط±ط³ط§ظ„ط© ط¨ط´ظƒظ„ ظ…ظˆط­ظ‘ط¯ ظˆط¢ظ…ظ† ==================
// - ظ†طµ ظپظ‚ط· => text
// - ظ…ط±ظپظ‚ ظˆط§ط­ط¯ ط¨ط¯ظˆظ† ظ†طµ => ظ†ظˆط¹ ط§ظ„ظ…ط±ظپظ‚
// - ط¹ط¯ط© ظ…ط±ظپظ‚ط§طھ (ط£ظˆ ظ†طµ + ظ…ط±ظپظ‚ط§طھ) => mixed
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
// âœ… ظٹظ…ظ†ط¹ ط§ظ„طھط²ظˆظٹط± (ط¹ط¯ظ… ط§ظ„ط«ظ‚ط© ط¨ظ€ senderId ط§ظ„ظ‚ط§ط¯ظ… ظ…ظ† ط§ظ„ظپط±ظˆظ†طھ)
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.split(" ")?.[1] ||
      "";

    if (!token) return next(new Error("NO_TOKEN"));

    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) return next(new Error("BAD_TOKEN"));
    const sid = String(decoded.sid || "").trim();
    if (sid) {
      const session = await AuthSession.findOne({
        _id: sid,
        userId,
        isRevoked: false,
      }).select("_id");
      if (!session) return next(new Error("BAD_SESSION"));
    }

    socket.userId = String(userId);
    socket.sessionId = sid;
    next();
  } catch {
    next(new Error("BAD_TOKEN"));
  }
});



/* ===================================================================== */
/* ًں“‍ Call Logs (ط³ط¬ظ„ ط§ظ„ط§طھطµط§ظ„ط§طھ) â€” Backend */
/*  - طھط®ط²ظٹظ† ظ…ط­ط§ظˆظ„ط§طھ ط§ظ„ط§طھطµط§ظ„ (audio/video) + ط§ظ„ط­ط§ظ„ط© + ط§ظ„ظ…ط¯ط© */
/*  - ط§ظ„ط­ط°ظپ ظٹظƒظˆظ† per-user ط¹ط¨ط± deletedFor */
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

    // ظ„ط§ ظ†ط؛ظٹظ‘ط± ط­ط§ظ„ط© ظ†ظ‡ط§ط¦ظٹط© ط³ط§ط¨ظ‚ط§ظ‹ (ظ…ط«ظ„ط§ظ‹ rejected/cancelled) ط¥ظ„ط§ ط¥ط°ط§ ظƒط§ظ†طھ ringing/accepted
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

  // âœ… join-user ظ„ط§ط²ظ… ظٹط·ط§ط¨ظ‚ طھظˆظƒظ†
  socket.on("join-user", (userId) => {
    try {
      const uid = String(userId || "");
      if (!uid || uid !== String(socket.userId)) {
        console.warn("⚠️ join-user مرفوض: userId لا يطابق التوكن", { uid, tokenUser: socket.userId });
        return;
      }

      socket.join(`user-${uid}`);
      if (!connectedUsers.has(uid)) connectedUsers.set(uid, new Set());
      connectedUsers.get(uid).add(socket.id);
      socket.joinedUserId = uid;
      lastSeenByUser.delete(uid);
      emitPresence(uid, true);
      console.log(`ًں‘¤ ${uid} ط§ظ†ط¶ظ… ظ„ظ„ط¯ط±ط¯ط´ط© (socket: ${socket.id})`);
    } catch (e) {
      console.error("join-user error:", e);
    }
  });

  socket.on("presence:query", (payload = {}) => {
    try {
      const ids = Array.isArray(payload?.userIds) ? payload.userIds : [];
      const users = ids
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 100)
        .map((id) => ({
          userId: id,
          online: isUserOnline(id),
          lastSeen: lastSeenByUser.get(id) || null,
        }));
      socket.emit("presence:state", { users });
    } catch (e) {
      console.error("presence:query error:", e);
    }
  });

  // â­گâ­گ ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ط¹ط¨ط± Socket (ظٹط¯ط¹ظ… text + attachments + voiceNote ظƒظ€ DataURL) â­گâ­گ
  socket.on("send-message", async (data) => {
    try {
      const conversationId = data?.conversationId;
      if (!conversationId) {
        return socket.emit("message-error", { error: "conversationId مفقود" });
      }

      // âœ… ط§ظ„ظ…ط±ط³ظ„ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ظ…ظ† ط§ظ„طھظˆظƒظ† ظپظ‚ط·
      const senderId = String(socket.userId);

      // طھط£ظƒط¯ ظ…ظ† ط§ظ„ظ…ط­ط§ط¯ط«ط© + طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط±ط³ظ„
      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        return socket.emit("message-error", { error: "المحادثة غير موجودة" });
      }

      const isMember = (conv.participants || []).some((p) => String(p) === senderId);
      if (!isMember) {
        return socket.emit("message-error", { error: "لا تملك صلاحية على هذه المحادثة" });
      }

      // ط§ظ„ظ…ط³طھظ‚ط¨ظ„ (ظ„ظ…ط­ط§ط¯ط«ط© ط«ظ†ط§ط¦ظٹط©) â€” ظ„ط§ ظ†ط«ظ‚ ط¨ط§ظ„ظ€ receiverId ط§ظ„ظ‚ط§ط¯ظ…
      let receiverId = null;
      if (!conv.isGroup) {
        receiverId = (conv.participants || []).find((p) => String(p) !== senderId) || null;
        receiverId = receiverId ? String(receiverId) : null;
      }

      const text = typeof data?.text === "string" ? data.text.trim() : "";

      // ط¯ظ…ط¬: attachments + voiceNote (ظƒظ„ظ‡ ظٹطھط­ظˆظ„ ظ„ظ…طµظپظˆظپط© attachments)
      const rawAttachments = [];
      if (Array.isArray(data?.attachments) && data.attachments.length) rawAttachments.push(...data.attachments);
      if (data?.voiceNote) rawAttachments.push(data.voiceNote);

      const attachments = await normalizeIncomingAttachments(rawAttachments, senderId);
      // âœ… Reply / Forward (ط§ط®طھظٹط§ط±ظٹ)
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

      // previews (ظƒط§ط¦ظ†ط§طھ طµط؛ظٹط±ط© ظ„ظ„ط¹ط±ط¶ ط§ظ„ط³ط±ظٹط¹)
      const replyPreview = data?.replyPreview && typeof data.replyPreview === "object" ? data.replyPreview : null;
      let forwardPreview = data?.forwardPreview && typeof data.forwardPreview === "object" ? data.forwardPreview : null;

      // طھط¹ظ„ظٹظ‚ ط§ط®طھظٹط§ط±ظٹ ظ…ط¹ ط§ظ„ظپظˆط±ظˆط§ط±ط¯
      const forwardComment = typeof data?.forwardComment === "string" ? data.forwardComment.trim() : "";


      const hasText = !!text;
      const hasFiles = attachments.length > 0;
      const hasForward = !!forwardOf;
      // ظ…ظ„ط§ط­ط¸ط©: ط§ظ„ط±ط¯ ط¨ط¯ظˆظ† ظ†طµ/ظ…ط±ظپظ‚ ظ†طھط±ظƒظ‡ ط­ط³ط¨ ط³ظٹط§ط³طھظƒطŒ ط­ط§ظ„ظٹط§ظ‹ ظ…ط§ ظ†ط¹طھط¨ط±ظ‡ ظƒط§ظپظٹ ظ„ظˆط­ط¯ظ‡.
      const hasReply = !!replyTo && (hasText || hasFiles);

      if (!hasText && !hasFiles && !hasForward && !hasReply) {
        return socket.emit("message-error", { error: "يجب إرسال نص أو مرفق واحد على الأقل" });
      }
      // âœ… طھط¬ظ‡ظٹط² ظ…ط­طھظˆظ‰ ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„ظ†ظ‡ط§ط¦ظٹ (ط®طµظˆطµط§ظ‹ ظ„ظ„ظپظˆط±ظˆط§ط±ط¯)
      let finalText = text || "";
      let finalAttachments = attachments;

      // âœ… Forward: ط§ظ†ط³ط® ظ…ط­طھظˆظ‰ ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„ط£طµظ„ظٹط© (ظ†طµ/ظ…ط±ظپظ‚ط§طھ) ط­طھظ‰ طھط´طھط؛ظ„ (طµظˆطھ/طµظˆط±ط©/ظپظٹط¯ظٹظˆ) ط·ط¨ظٹط¹ظٹ
      if (hasForward) {
        const original = await Message.findById(forwardOf).lean();
        if (!original || original.deletedForAll) {
          return socket.emit("message-error", { error: "لا يمكن تحويل هذه الرسالة" });
        }

        // طھط£ظƒط¯ ط¥ظ† ط§ظ„ظ…ط±ط³ظ„ ظٹظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ظ„ظ„ط±ط³ط§ظ„ط© ط§ظ„ط£طµظ„ظٹط© (ط¹ط¶ظˆ ط¨ط§ظ„ظ…ط­ط§ط¯ط«ط© ط§ظ„ط£طµظ„ظٹط©)
        const canAccess = await Conversation.exists({ _id: original.conversation, participants: senderId });
        if (!canAccess) {
          return socket.emit("message-error", { error: "لا يمكن تحويل هذه الرسالة" });
        }

        const oText = String(original.text || "");
        const oAttachments = Array.isArray(original.attachments) ? original.attachments : [];

        // âœ… ط¨ط¹ط¶ ط§ظ„ظ†ط³ط® ط§ظ„ظ‚ط¯ظٹظ…ط© ظƒط§ظ†طھ طھط­ظپط¸ ط§ظ„ط±ظˆط§ط¨ط· ط®ط§ط±ط¬ attachments (audioUrl / imageUrl / videoUrl / fileUrl ...)
        // ظ†ط­ط§ظˆظ„ ط§ط³طھط®ط±ط§ط¬ظ‡ط§ ظ„ط­طھظ‰ ظٹطھط­ظˆظ„ ط§ظ„طµظˆطھ/ط§ظ„طµظˆط±ط©/ط§ظ„ظپظٹط¯ظٹظˆ ظƒظ€ ظ…ط±ظپظ‚ ظپط¹ظ„ظٹ ط¹ظ†ط¯ ط§ظ„ظ€ Forward
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


        // comment ط§ط®طھظٹط§ط±ظٹ
        const cmt = String(forwardComment || "").trim();

        // ظ„ظˆ ط§ظ„ط£طµظ„ ظ†طµ ظپظ‚ط·: ط§ظ†ظ‚ظ„ ط§ظ„ظ†طµ ظ†ظپط³ظ‡ (ظ…ط¹ طھط¹ظ„ظٹظ‚ ط§ط®طھظٹط§ط±ظٹ)
        if (oAttachments.length === 0 && derivedAttachments.length === 0) {
          finalAttachments = [];
          // ط¶ظ…ظ‘ ط§ظ„طھط¹ظ„ظٹظ‚ ظ…ط¹ ظ†طµ ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„ط£طµظ„ظٹط© ط¨ط³ط·ط± ط¬ط¯ظٹط¯
          finalText = (cmt ? cmt + "\n" : "") + oText;
        } else {
          // ظ„ظˆ ط§ظ„ط£طµظ„ ظپظٹظ‡ ظ…ط±ظپظ‚ط§طھ (طµظˆطھ/طµظˆط±ط©/ظپظٹط¯ظٹظˆ/ظ…ظ„ظپ): ط§ظ†ظ‚ظ„ ط§ظ„ظ…ط±ظپظ‚ط§طھطŒ ظˆط§ظ„ظ†طµ ظٹطµط¨ط­ طھط¹ظ„ظٹظ‚ ظپظ‚ط·
          finalAttachments = oAttachments.length ? oAttachments : derivedAttachments;
          // ظ„ظˆ ظپظٹ ظ…ط±ظپظ‚ط§طھطŒ ظ†ط®ظ„ظٹ ط§ظ„ظ†طµ: طھط¹ظ„ظٹظ‚ + (ظ†طµ ط£طµظ„ظٹ ظ„ظˆ ظƒط§ظ† ظ…ظپظٹط¯)
          const looksLikePlaceholder = oText.trim() === "رسالة صوتية" || oText.trim() === "رسالة" || oText.trim() === "";
          if (!looksLikePlaceholder) {
            finalText = cmt ? (cmt + "\n" + oText) : oText;
          } else {
            finalText = cmt;
          }
        }

        // ط¨ظ†ظٹظ†ط§ forwardPreview طھظ„ظ‚ط§ط¦ظٹط§ظ‹ ظ„ظˆ ظ…ظˆ ظ…ط¨ط¹ظˆط« ظ…ظ† ط§ظ„ظپط±ظˆظ†طھ
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

      // âœ… ظ†ظˆط¹ ط§ظ„ط±ط³ط§ظ„ط© ط¨ط´ظƒظ„ ظ…ظˆط­ظ‘ط¯ ظˆط¢ظ…ظ† (ط¨ط¹ط¯ طھط¹ط¯ظٹظ„ ط§ظ„ظ…ط­طھظˆظ‰ ط§ظ„ظ†ظ‡ط§ط¦ظٹ)
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
        // âœ… ظ„ظˆ ظƒط§ظ†طھ ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ…ط®ظپظٹط© ط¨ط³ط¨ط¨ Clear Chat ط¹ظ†ط¯ ط£ظٹ ط·ط±ظپطŒ ط±ط¬ظ‘ط¹ظ‡ط§ ظ„ظ„ط¸ظ‡ظˆط±
        $pull: { deletedFor: { $in: (conv.participants || []).map((p) => String(p)) } },
      });
const populatedMessage = await message.populate("sender", "username fullName avatar");

      const payload = populatedMessage.toObject();
      payload.conversation = conversationId;
      // طھظ…ط±ظٹط± clientTempId (ظ„ظ…ظ†ط¹ طھظƒط±ط§ط± ط§ظ„ط±ط³ط§ط¦ظ„ ط¨ط§ظ„ظˆط§ط¬ظ‡ط©)
      if (data?.clientTempId) payload.clientTempId = String(data.clientTempId);

      // ط¥ط±ط³ط§ظ„ ظ„ظ„ظ…ط±ط³ظ„ ط¯ط§ط¦ظ…ط§ظ‹
      io.to(`user-${senderId}`).emit("new-message", payload);

      // ط¥ط±ط³ط§ظ„ ظ„ظ„ظ…ط³طھظ‚ط¨ظ„/ط§ظ„ظ…ط¬ظ…ظˆط¹ط©
      const pushTargets = [];
      if (!conv.isGroup) {
        if (receiverId) {
          io.to(`user-${receiverId}`).emit("new-message", payload);
          pushTargets.push(String(receiverId));
        }
      } else {
        for (const p of conv.participants || []) {
          const pid = String(p);
          if (pid !== senderId) {
            io.to(`user-${pid}`).emit("new-message", payload);
            pushTargets.push(pid);
          }
        }
      }

      const senderName = String(
        payload?.sender?.fullName || payload?.sender?.username || "User"
      );
      const normalizedType = String(payload?.type || msgType || "text");
      const normalizedText = String(payload?.text || finalText || "");
      const normalizedAttachments = Array.isArray(payload?.attachments)
        ? payload.attachments
        : (Array.isArray(finalAttachments) ? finalAttachments : []);
      for (const targetUserId of pushTargets) {
        sendChatMessagePush({
          toUserId: targetUserId,
          fromUserId: senderId,
          fromName: senderName,
          conversationId,
          conversationTitle: String(conv?.title || ""),
          messageId: String(payload?._id || message?._id || ""),
          messageType: normalizedType,
          text: normalizedText,
          attachments: normalizedAttachments,
        }).catch((e) => {
          console.error("socket sendChatMessagePush error:", e?.message || e);
        });
      }

      socket.emit("message-sent", { success: true, messageId: message._id });

      console.log("\u2705 Socket message sent:", {
        conversationId,
        type: msgType,
        from: senderId,
        to: receiverId || "group",
        hasText: !!text,
        attachmentsCount: attachments.length,
      });
    } catch (error) {
      console.error("\u274c Socket send-message error:", error);
      socket.emit("message-error", { error: "فشل إرسال الرسالة" });
    }
  });

  // âœ… Typing: ط§ظ„ظ…ط±ط³ظ„ ظ…ظ† ط§ظ„طھظˆظƒظ†
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

  
  /* ================== Calls Signaling (ط¨ط¯ظˆظ† WebRTC) ================== */
  // ظ…ظ„ط§ط­ط¸ط©: ظ‡ط°ط§ ظپظ‚ط· طھط±ط­ظٹظ„ (relay) ط¨ظٹظ† ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط¹ط¨ط± ط؛ط±ظپ user-<id>.
  // ط§ظ„ظپط±ظˆظ†طھ ظٹط±ط³ظ„: call:invite / call:ringing / call:accept / call:reject / call:cancel / call:end / call:busy

  socket.on("call:invite", async (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      const type = payload.type === "video" ? "video" : "audio";
      if (!from || !to || !callId || to === from) return;
      const fromUser = await User.findById(from).select("fullName username").lean();
      const fromName = String(fromUser?.fullName || fromUser?.username || "User");

      // âœ… Call log: create/update ringing
      upsertCallLogRinging({ callId, from, to, type });

      // ط£ط±ط³ظ„ ظ„ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±
      io.to(`user-${to}`).emit("call:incoming", { callId, from, type, fromName });
      sendIncomingCallPush({
        toUserId: to,
        fromUserId: from,
        type,
        callId,
      });
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

      // âœ… Call log: accepted (start timer)
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

      // âœ… Call log: rejected
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

      // âœ… Call log: cancelled (caller cancelled before accept)
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

      // âœ… Call log: ended
      markCallLogEnded({ callId, status: "ended" });

      io.to(`user-${to}`).emit("call:ended", { callId, from });
    } catch (e) {
      console.error("call:end error:", e);
    }
  });

  /* ===================================================================== */
  /* âœ… WebRTC Signaling Relay (offer/answer/ice) â€” Actual Media (Stage 2)  */
  /* ===================================================================== */
  // ظ…ظ„ط§ط­ط¸ط©: ظ†ط­ظ† ظپظ‚ط· "نرحّل" SDP/ICE ط¹ط¨ط± Socket.io.  ظ„ط§ ظ†ط­ظپط¸ ط£ظٹ ط´ظٹط، ظپظٹ DB.
  // ط§ظ„ط؛ط±ظپط©: call:<callId> + ط¥ط±ط³ط§ظ„ ظ…ط¨ط§ط´ط± ط¹ط¨ط± user-<id> ط¥ظ† طھظˆظپظ‘ط± "to".

  
  // âœ… Alias ظ…ظˆط­ظ‘ط¯ (ظٹط¯ط¹ظ… call:signal) ظ„ط±ط§ط­ط© ط§ظ„ظپط±ظˆظ†طھ:
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

  // âœ… Alias ط¥ط¶ط§ظپظٹط© (ط§ط®طھظٹط§ط±ظٹ): call:start â†’ call:invite
  socket.on("call:start", async (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      const type = payload.type === "video" ? "video" : "audio";
      if (!from || !to || !callId || to === from) return;
      const fromUser = await User.findById(from).select("fullName username").lean();
      const fromName = String(fromUser?.fullName || fromUser?.username || "User");
      io.to(`user-${to}`).emit("call:incoming", { callId, from, type, fromName });
      sendIncomingCallPush({
        toUserId: to,
        fromUserId: from,
        type,
        callId,
      });
    } catch (e) {
      console.error("call:start error:", e);
    }
  });
socket.on("call:join", ({ callId } = {}) => {
    try {
      const cid = String(callId || "").trim();
      if (!cid) return;
      socket.join(`call:${cid}`);
      // ط®ط¨ط± ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط± (ط§ط®طھظٹط§ط±ظٹ)
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

      // âœ… Call log: busy
      markCallLogEnded({ callId, status: "busy" });

      io.to(`user-${to}`).emit("call:busy", { callId, from });
    } catch (e) {
      console.error("call:busy error:", e);
    }
  });


  socket.on("disconnect", () => {
    console.log("❌ مستخدم انقطع:", socket.id);
    const uid = String(socket.joinedUserId || socket.userId || "").trim();
    if (!uid) return;
    const sockets = connectedUsers.get(uid);
    if (!sockets) return;
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      connectedUsers.delete(uid);
      lastSeenByUser.set(uid, new Date().toISOString());
      emitPresence(uid, false);
    }
  });
});

// ================== ظ…ظٹط¯ظ„ظˆظٹط± ط¹ط§ظ… ==================
app.use(
  cors({
    origin: (origin, cb) => {
      if (isOriginAllowed(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: !ALLOW_ALL, // ظ„ظˆ * ظ…ط§ ظپظٹ credentials
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
// âœ… ظ…ظ‡ظ… ظ„ط¨ط¹ط¶ ط§ظ„ظ…طھطµظپط­ط§طھ ظ…ط¹ preflight
app.options(/.*/, cors()); // Express v5: ط§ط³طھط®ط¯ظ… Regex ط¨ط¯ظ„ "*"
app.use(express.json({ limit: "15mb" })); // âœ… ط­طھظ‰ ظ„ط§ ظٹظ†ظپط¬ط± ظ„ظˆ ظˆطµظ„ DataURL طµط؛ظٹط± (ظ„ظƒظ† ط§ظ„ط£ظپط¶ظ„ ط¯ط§ط¦ظ…ط§ظ‹ ط±ظپط¹ ظƒظ…ظ„ظپ)

// ✅ إعادة توجيه مسارات الدخول/التسجيل إذا كان المسار بدون /api
// يفيد إذا البروكسي/الهوست يحذف /api أو إذا العميل طلب /login مباشرة
app.use((req, res, next) => {
  if (
    req.path === "/login" ||
    req.path === "/register" ||
    req.path === "/auth/login" ||
    req.path === "/auth/register"
  ) {
    req.url = `/api${req.url}`;
  }
  next();
});

// ظ…ظ„ظپط§طھ ط§ظ„ط±ظپط¹ (ط§ظ„طµظˆط± / ط§ظ„ظپظٹط¯ظٹظˆ / ط§ظ„طµظˆطھ) ظƒظ€ static
// âœ… ط§ظ„ظ…ط³ط§ط± ط§ظ„ط­ظ‚ظٹظ‚ظٹ ط§ظ„ط°ظٹ ظٹط­ظپط¸ ظپظٹظ‡ multer (upload.js) â€” ظ…ظ‡ظ… ط¬ط¯ط§ظ‹ ط¹ظ„ظ‰ Render
const uploadsStaticOptions = {
  etag: true,
  maxAge: "7d",
  setHeaders: (res, filePath) => {
    const lower = String(filePath || "").toLowerCase();
    const mediaLike =
      /\.(png|jpe?g|gif|webp|heic|heif|mp4|mov|mkv|webm|avi|m4a|aac|ogg|wav|mp3|pdf|zip|rar|7z)$/i.test(
        lower
      );
    if (mediaLike) {
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
  },
};
// âœ… ظٹط¨ظ†ظٹ URL طµط­ظٹط­ ط­طھظ‰ ظ„ظˆ ط§ظ„ظ…ظ„ظپ ط¯ط§ط®ظ„ subfolder ظ…ط«ظ„: users/<id>/file.ext
function buildUploadsUrlFromMulterFile(f) {
  if (!f) return "";
  const absPath =
    f.path ||
    (f.destination ? path.join(f.destination, f.filename || "") : "") ||
    (f.filename ? path.join(uploadsDir, f.filename) : "");
  if (!absPath) return "";
  const rel = path.relative(uploadsDir, absPath);
  const relPosix = rel.split(path.sep).join("/");
  return `/uploads/${relPosix}`;
}



// âœ… ظٹط¯ط¹ظ… ط£ظƒط«ط± ظ…ظ† ظ…ط³ط§ط± ظ„ط£ظ† ط¨ط¹ط¶ ط§ظ„ظ†ط³ط® طھط®ط²ظ‘ظ† ط§ظ„ظ…ظ„ظپط§طھ ظپظٹ (backend/uploads) ط£ظˆ (backend/public/uploads) ط£ظˆ (projectRoot/uploads)
const UPLOADS_DIR_BACKEND = path.join(__dirname, "uploads");
const UPLOADS_DIR_PUBLIC = path.join(__dirname, "public", "uploads");
const UPLOADS_DIR_ROOT = path.join(process.cwd(), "uploads");

const uploadStaticCandidates = Array.from(
  new Set(
    [
      uploadsDir,
      UPLOADS_DIR_BACKEND,
      UPLOADS_DIR_PUBLIC,
      UPLOADS_DIR_ROOT,
    ].map((p) => path.resolve(p))
  )
);

for (const uploadPath of uploadStaticCandidates) {
  app.use("/uploads", express.static(uploadPath, uploadsStaticOptions));
}
// طھظ‚ط¯ظٹظ… ظ…ظ„ظپط§طھ ط§ظ„ظˆط§ط¬ظ‡ط© (HTML/CSS/JS) ظ…ظ† ظ…ط¬ظ„ط¯ public
app.use(express.static(path.join(__dirname, "public")));

// ================== Upload Auth Guard ==================
const ALLOW_PUBLIC_UPLOAD = String(process.env.ALLOW_PUBLIC_UPLOAD || "") === "1";
function uploadAuthGuard(req, res, next) {
  if (ALLOW_PUBLIC_UPLOAD) return next();

  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ msg: "\u0644\u0627 \u064a\u0648\u062c\u062f \u062a\u0648\u0643\u0646 \u0641\u064a \u0627\u0644\u0647\u064a\u062f\u0631" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "\u062A\u0646\u0633\u064A\u0642 \u0627\u0644\u062A\u0648\u0643\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) return res.status(401).json({ msg: "\u0627\u0644\u062A\u0648\u0643\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" });
    req.userId = userId;
    req.user = { id: userId };
    next();
  } catch {
    return res.status(401).json({ msg: "\u0627\u0644\u062A\u0648\u0643\u0646 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D \u0623\u0648 \u0645\u0646\u062A\u0647\u064A" });
  }
}

function uploadErrorMessage(err) {
  if (!err || typeof err !== "object") return "فشل رفع الملف";
  const code = String(err.code || "");
  if (code === "LIMIT_FILE_SIZE") return "حجم الملف كبير جدًا";
  if (code === "LIMIT_FILE_COUNT") return "عدد الملفات أكبر من المسموح";
  if (code === "LIMIT_UNEXPECTED_FILE") return "اسم حقل الملف غير مدعوم";
  return "فشل رفع الملف";
}

function runUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err?.name === "MulterError") {
        console.error("Upload middleware multer error:", err);
        return res.status(400).json({ msg: uploadErrorMessage(err), code: err.code || "MULTER_ERROR" });
      }
      console.error("Upload middleware error:", err);
      return res.status(500).json({ msg: "فشل رفع الملف", code: "UPLOAD_ERROR" });
    });
  };
}

/* ===================================================================== */
/* âœ…âœ…âœ…  ط±ط§ظˆطھ ط±ظپط¹ ط¹ط§ظ… (ظƒط§ظ† ظ†ط§ظ‚طµ ظˆظ‡ظˆ ط³ط¨ط¨ 404 /api/upload)  âœ…âœ…âœ… */
/* ===================================================================== */
// ظٹط±ظپط¹ ط£ظٹ ظ…ظ„ظپ via FormData (ط£ظˆظ„ ظ…ظ„ظپ ظ…ظˆط¬ظˆط¯) ظˆظٹط±ط¬ط¹ URL ط¬ط§ظ‡ط² ظ„ظ„ط§ط³طھط®ط¯ط§ظ…
app.post("/api/upload", uploadAuthGuard, runUpload(upload.any()), async (req, res) => {
  try {
    const f = Array.isArray(req.files) && req.files.length ? req.files[0] : null;
    if (!f) return res.status(400).json({ msg: "لا يوجد ملف مرفوع" });

    const url = buildUploadsUrlFromMulterFile(f);
    const kind = detectKindFromMime(f.mimetype, f.originalname || f.filename);

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

// ================== ظ…ظٹط¯ظ„ظˆظٹط± JWT ==================

// ظ…ظٹط¯ظ„ظˆظٹط± ط¥ط¬ط¨ط§ط±ظٹ
const authMiddleware = async (req, res, next) => {
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
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);

    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) {
      console.error("JWT payload بدون userId:", decoded);
      return res.status(401).json({ msg: "التوكن غير صالح" });
    }
    const sid = String(decoded.sid || "").trim();
    if (sid) {
      const session = await AuthSession.findOne({
        _id: sid,
        userId,
        isRevoked: false,
      }).select("_id");
      if (!session) {
        return res.status(401).json({ msg: "انتهت الجلسة. سجل الدخول من جديد" });
      }
      req.sessionId = sid;
      AuthSession.updateOne(
        { _id: sid },
        { $set: { lastSeenAt: new Date() } },
      ).catch(() => {});
    }

    req.userId = userId;
    req.user = { id: userId };
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ msg: "التوكن غير صالح أو منتهي" });
  }

};

/* ===================================================================== */
/* ✅ Notifications (FCM) */
/* ===================================================================== */
app.post("/api/notifications/register-token", authMiddleware, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ msg: "Token مطلوب" });

    const userId = req.userId;
    const doc = await NotificationToken.findOneAndUpdate(
      { userId },
      { $addToSet: { tokens: token } },
      { upsert: true, new: true }
    );

    return res.json({ msg: "تم حفظ التوكن", count: doc?.tokens?.length || 0 });
  } catch (err) {
    console.error("register-token error:", err);
    return res.status(500).json({ msg: "خطأ في حفظ التوكن" });
  }
});

// اختبار سريع للإشعارات
app.post("/api/notifications/test", authMiddleware, async (req, res) => {
  try {
    if (!firebaseReady) {
      return res.status(400).json({ msg: "Firebase Admin غير مفعّل" });
    }
    const userId = req.userId;
    const doc = await NotificationToken.findOne({ userId });
    const tokens = doc?.tokens || [];
    if (!tokens.length) {
      return res.status(400).json({ msg: "لا يوجد توكن محفوظ للمستخدم" });
    }
    const title = String(req.body?.title || "Saepel").trim();
    const body = String(req.body?.body || "Test Notification").trim();

    const message = {
      notification: { title, body },
      tokens,
    };
    const result = await admin.messaging().sendEachForMulticast(message);
    return res.json({
      msg: "تم الإرسال",
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
  } catch (err) {
    console.error("notifications test error:", err);
    return res.status(500).json({ msg: "فشل إرسال الإشعار" });
  }
});

/* ===================================================================== */
/* âœ… WebRTC RTC Config (STUN/TURN) â€” ظ„ظٹط´طھط؛ظ„ ط¹ظ„ظ‰ ظƒظ„ ط§ظ„ط´ط¨ظƒط§طھ */
/* ===================================================================== */
app.get("/api/calls/rtc-config", authMiddleware, (req, res) => {
  try {
    const iceServers = [
      { urls: ["stun:stun.l.google.com:19302"] },
    ];

    const turnUrlRaw = String(process.env.TURN_URL || "").trim();
    const turnUsername = String(process.env.TURN_USERNAME || "").trim();
    const turnCredential = String(process.env.TURN_CREDENTIAL || "").trim();
    const hasPlaceholderTurn = /YOUR_HOST/i.test(turnUrlRaw);

    const defaultMeteredTurnUrls = [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:80?transport=tcp",
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443?transport=tcp",
    ];

    if (turnUsername && turnCredential) {
      const urls = (turnUrlRaw && !hasPlaceholderTurn ? turnUrlRaw.split(",") : defaultMeteredTurnUrls)
        .map((s) => s.trim())
        .filter((s) => Boolean(s) && /^turns?:/i.test(s));

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


// ظ…ظٹط¯ظ„ظˆظٹط± ط§ط®طھظٹط§ط±ظٹ (ظ„ط§ ظٹط±ظ…ظٹ ط®ط·ط£ ظ„ظˆ ظ…ط§ ظپظٹ طھظˆظƒظ†)
const authMiddlewareOptional = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next();

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return next();

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (userId) {
      const sid = String(decoded.sid || "").trim();
      if (sid) {
        const session = await AuthSession.findOne({
          _id: sid,
          userId,
          isRevoked: false,
        }).select("_id");
        if (!session) return next();
        req.sessionId = sid;
      }
      req.userId = userId;
      req.user = { id: userId };
    }
  } catch {
    // طھط¬ط§ظ‡ظ„
  }
  next();
};



/* ===================================================================== */
/* âœ… ط±ظپط¹ طھط³ط¬ظٹظ„ طµظˆطھظٹ ظ…ط³طھظ‚ظ„ (ظ„طھظˆط§ظپظ‚ ظپط±ظˆظ†طھ /api/chat/upload-audio) âœ… */
/* ===================================================================== */
/*
  ظٹط¯ط¹ظ… ط­ط§ظ„طھظٹظ†:
  1) FormData: key = "audio" ط£ظˆ "voice" ط£ظˆ ط£ظٹ ظ…ظ„ظپ ط£ظˆظ„ ط¯ط§ط®ظ„ req.files
  2) JSON: { dataUrl, mimeType, originalName }  (ط§ط®طھظٹط§ط±ظٹ)
  ظˆظٹط±ط¬ط¹ ظ†ظپط³ ط´ظƒظ„ attachment ط§ظ„ط°ظٹ طھطھظˆظ‚ط¹ظ‡ ط§ظ„ظˆط§ط¬ظ‡ط©.
*/
app.post(
  "/api/chat/upload-audio",
  authMiddleware,
  runUpload(upload.any()),
  async (req, res) => {
    try {
      // 1) ظ…ظ„ظپ ظ…ط±ظپظˆط¹ (FormData)
      let f = null;
      if (req.file) f = req.file;
      if (!f && req.files) {
        if (Array.isArray(req.files) && req.files.length) f = req.files[0];
        else if (Array.isArray(req.files.audio) && req.files.audio.length) f = req.files.audio[0];
        else if (Array.isArray(req.files.voice) && req.files.voice.length) f = req.files.voice[0];
      }

      if (f) {
        const url = buildUploadsUrlFromMulterFile(f);
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

      // 2) DataURL ط¹ط¨ط± JSON (fallback)
      const dataUrl = typeof req.body?.dataUrl === "string" ? req.body.dataUrl : "";
      const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "audio/webm";
      const originalName =
        typeof req.body?.originalName === "string" && req.body.originalName.trim()
          ? req.body.originalName.trim()
          : "voice.webm";

      if (!dataUrl) {
        return res.status(400).json({ msg: "لا يوجد ملف صوتي مرفوع" });
      }

      const savedUrl = await saveDataUrlToUploads(dataUrl, mimeType, originalName, String(req.userId || ""));
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
/* âœ… ط±ظپط¹ ظ…ط±ظپظ‚ ط¹ط§ظ… (طµظˆط±ط©/ظپظٹط¯ظٹظˆ/ظ…ظ„ظپ/ظ…ظˆط³ظٹظ‚ظ‰) â€” /api/chat/upload/attachment */
/* ===================================================================== */
/*
  POST /api/chat/upload/attachment
  FormData:
    - file=<File>  (ظٹظپط¶ظ„)
  Returns:
    { attachment: { url, type, originalName, size, mimeType, filename } }
*/
app.post(
  "/api/chat/upload/attachment",
  authMiddleware,
  runUpload(upload.any()), // ظ†ظ‚ط¨ظ„ ط£ظٹ key ظ„ظ„ظ…ظ„ظپ (file / image / video ... ط¥ظ„ط®)
  async (req, res) => {
    try {
      let f = null;

      // multer ظ…ط¹ any(): ط§ظ„ظ…ظ„ظپط§طھ طھظƒظˆظ† ظپظٹ req.files
      if (req.file) f = req.file;
      if (!f && Array.isArray(req.files) && req.files.length) f = req.files[0];

      // ط¯ط¹ظ… ظ„ظˆ طµط§ط± req.files ظƒظ€ object (ط­ط³ط¨ ط¥ط¹ط¯ط§ط¯ط§طھ multer ط§ظ„ظ…ط®طھظ„ظپط©)
      if (!f && req.files && typeof req.files === "object") {
        const firstKey = Object.keys(req.files)[0];
        const arr = firstKey ? req.files[firstKey] : null;
        if (Array.isArray(arr) && arr.length) f = arr[0];
      }

      if (!f) return res.status(400).json({ msg: "الملف مطلوب" });

      const url = buildUploadsUrlFromMulterFile(f);
      const kind = detectKindFromMime(f.mimetype, f.originalname || f.filename);

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

// ================== ظ…ظٹط¯ظ„ظˆظٹط± ط§ظ„ظ…ط´ط±ظپ ==================
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

// ط¯ط§ظ„ط© ط¨ط³ظٹط·ط© ظ„ط¶ظ…ط§ظ† ط£ظ† ط§ظ„ظ‚ظٹظ…ط© ظ…طµظپظˆظپط©
const ensureArray = (v) => (Array.isArray(v) ? v : []);

// âœ… طھظˆط­ظٹط¯/طھظ†ط¸ظٹظپ ط§ظ„ط¥ط¯ط®ط§ظ„ط§طھ (ظ…ظ‡ظ… ظ„ظ…ظ†ط¹ ظ…ط´ظƒظ„ط©: ط§ظ„طھط³ط¬ظٹظ„ ظٹط­ظپط¸ Email ط¨ط­ط±ظˆظپ ظƒط¨ظٹط±ط© ط«ظ… طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ظٹط¨ط­ط« lowercase)
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeUsername = (u) =>
  String(u || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

// ===== Username (English only) + Public ID helpers =====
const ARABIC_MAP = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a",
  "ب": "b", "ت": "t", "ث": "th", "ج": "j",
  "ح": "h", "خ": "kh", "د": "d", "ذ": "dh",
  "ر": "r", "ز": "z", "س": "s", "ش": "sh",
  "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  "ع": "a", "غ": "gh", "ف": "f", "ق": "q",
  "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "و": "w", "ي": "y", "ى": "a",
  "ة": "h", "ؤ": "w", "ئ": "y", "ء": "",
  "٠": "0","١": "1","٢": "2","٣": "3","٤": "4","٥": "5","٦": "6","٧": "7","٨": "8","٩": "9",
  "۰": "0","۱": "1","۲": "2","۳": "3","۴": "4","۵": "5","۶": "6","۷": "7","۸": "8","۹": "9",
  " ": "_"
};

function toEnglishHandle(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    if (ARABIC_MAP[ch]) {
      out += ARABIC_MAP[ch];
      continue;
    }
    out += ch;
  }
  out = out
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!out) out = "user";
  if (/^[0-9]/.test(out)) out = "u" + out;
  if (out.length < 3) out = (out + "user").slice(0, 3);
  if (out.length > 20) out = out.slice(0, 20);
  return out;
}

async function ensureUniqueUsername(base, excludeId = null) {
  let candidate = base;
  let i = 1;
  while (true) {
    const exists = await User.exists({
      username: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!exists) return candidate;
    candidate = `${base}${i}`;
    i++;
  }
}

async function getNextPublicId() {
  const doc = await Counter.findByIdAndUpdate(
    "userPublicId",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const num = String(doc.seq || 0).padStart(4, "0");
  return `SA-${num}`;
}

async function ensurePublicIdForUser(user) {
  if (!user) return "";
  if (user.publicId) return user.publicId;
  // try a few times in case of collision
  for (let i = 0; i < 5; i++) {
    const pid = await getNextPublicId();
    try {
      user.publicId = pid;
      await user.save();
      return user.publicId;
    } catch (e) {
      // duplicate: retry
    }
  }
  return user.publicId || "";
}


// ================== ط§طھطµط§ظ„ MongoDB ==================
const FALLBACK_LOCAL_MONGO = "mongodb://127.0.0.1:27017/socialapp";

// âœ… ظ…ظ„ط§ط­ط¸ط© ظ…ظ‡ظ…ظ‘ط© (ط³ط¨ط¨ ط§ظ„ظ…ط´ظƒظ„ط© ط§ظ„ظ„ظٹ ط¹ظ†ط¯ظƒ ط؛ط§ظ„ط¨ط§ظ‹):
// ط¥ط°ط§ dotenv ظ…ط§ ظ‚ط±ط£ .env (ظ„ط£ظ†ظƒ ط´ط؛ظ‘ظ„طھ ط§ظ„ط³ظٹط±ظپط± ظ…ظ† ظ…ط³ط§ط± ظ…ط®طھظ„ظپ ط¨ط¹ط¯ ط¥ط¹ط§ط¯ط© ط§ظ„طھط´ط؛ظٹظ„)
// ظˆظ‚طھظ‡ط§ MONGO_URI ط¨طھظƒظˆظ† ظپط§ط¶ظٹط© ظˆط§ظ„ط³ظٹط±ظپط± ط¨ظٹظ‚ط¹ ط¹ظ„ظ‰ ظ‚ط§ط¹ط¯ط© ظ…ط­ظ„ظٹط© ظ…ط®طھظ„ظپط© â†’ ط§ظ„ظ…ظ†ط´ظˆط±ط§طھ "تختفي".
// ظ„ط°ظ„ظƒ: ط¥ظ…ظ‘ط§ طھط¶ط¨ط· MONGO_URI ط¯ط§ط¦ظ…ط§ظ‹طŒ ط£ظˆ ظپط¹ظ‘ظ„ ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ظ…ط­ظ„ظٹ طµط±ط§ط­ط©ظ‹ ط¹ط¨ط± ALLOW_LOCAL_MONGO=1.
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  (String(process.env.ALLOW_LOCAL_MONGO || "") === "1" ? FALLBACK_LOCAL_MONGO : "");

if (!MONGO_URI) {
  console.error(
    "❌ MONGO_URI غير موجودة. ضعها في ملف .env بجانب server.js أو فعّل ALLOW_LOCAL_MONGO=1 للسماح بالمحلي."
  );
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    const c = mongoose.connection;
    console.log("✅ تم الاتصال بقاعدة البيانات");
    console.log("\u2705 DB:", {
      name: c?.name,
      host: c?.host,
      port: c?.port,
      readyState: c?.readyState,
    });

    // طھط­ط°ظٹط± ظˆط§ط¶ط­ ظ„ظˆ ظƒظ†طھ ط¹ظ„ظ‰ ط§ظ„ظ‚ط§ط¹ط¯ط© ط§ظ„ظ…ط­ظ„ظٹط© (ظٹط³ظ‡ظ‘ظ„ ط§ظƒطھط´ط§ظپ ط³ط¨ط¨ ط§ط®طھظپط§ط، ط§ظ„ظ…ظ†ط´ظˆط±ط§طھ)
    if (String(MONGO_URI).includes("127.0.0.1") || String(MONGO_URI).includes("localhost")) {
      console.warn("⚠️ أنت متصل بقاعدة محلية. إذا كنت تتوقع بيانات Atlas تأكد من MONGO_URI في .env.");
    }
  })
  .catch((err) => console.error("\u274c MongoDB Error:", err));
// ================== ط±ط§ظˆطھ ط§ط®طھط¨ط§ط± ==================
app.get("/api/test", (req, res) => {
  res.json({ msg: "API working" });
});

// âœ… Debug: ظ…ط¹ط±ظپط© ط£ظٹ ظ‚ط§ط¹ط¯ط© ط¨ظٹط§ظ†ط§طھ ظ…طھطµظ„ ط¨ظ‡ط§ ط§ظ„ط³ظٹط±ظپط± (ط¨ط¯ظˆظ† ظƒط´ظپ URI)
// ط§ظپطھط­: GET /api/debug/db
if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/db", (req, res) => {
    const c = mongoose.connection;
    return res.json({
      readyState: c?.readyState,
      name: c?.name,
      host: c?.host,
      port: c?.port,
    });
  });
}

// ================== ط±ط§ظˆطھط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ظ‚ط¯ظٹظ…ط© ==================
app.post("/api/register", async (req, res) => {
  try {
    const { name, fullName, username, email, password, birthdate, birthDate } = req.body;
    const emailNorm = normalizeEmail(email);
    const displayName = String(fullName || name || "").trim();
    const baseUsername = toEnglishHandle(username || "");
    if (!baseUsername) {
      return res.status(400).json({ msg: "يرجى اختيار اسم مستخدم بالإنكليزي" });
    }
    const finalUsername = await ensureUniqueUsername(baseUsername);
    const finalBirthdate = birthdate || birthDate;

    if (!finalUsername || !emailNorm || !password) {
      return res.status(400).json({ msg: "يرجى تعبئة جميع البيانات" });
    }

    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(400).json({ msg: "هذا البريد مستخدم مسبقاً" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const publicId = await getNextPublicId();

    const newUser = new User({
      username: finalUsername,
      fullName: displayName,
      publicId,
      email: emailNorm,
      password: hashedPassword,
      birthdate: finalBirthdate,
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
    // âœ… ط¯ط¹ظ… ظ‚ط¯ظٹظ… ظˆط¬ط¯ظٹط¯:
    // - ظ‚ط¯ظٹظ…: { email, password }
    // - ط¬ط¯ظٹط¯: { identifier, password }  (email ط£ظˆ username)
    const { email, identifier, password } = req.body;

    const loginId = (identifier || email || "").toString().trim();
    if (!loginId || !password) {
      return res.status(400).json({ msg: "الرجاء إدخال البريد/اسم المستخدم وكلمة المرور" });
    }

    let query;
    if (loginId.includes("@") && !loginId.startsWith("@")) {
      query = { email: normalizeEmail(loginId) };
    } else {
      query = { username: normalizeUsername(loginId) };
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(400).json({ msg: "البريد أو اسم المستخدم غير مسجل" });
    }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "كلمة المرور غير صحيحة" });
      }

      await ensurePublicIdForUser(user);
      const { token, sessionId } = await createSessionAndToken(user._id, req);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            lastLoginAt: new Date(),
            lastLoginIp: _safeIp(req),
            lastLoginDevice: _safeUserAgent(req),
            accountStatus:
              String(user.accountStatus || "").trim() === "new"
                ? "active"
                : String(user.accountStatus || "active"),
          },
        },
      );

      res.json({
        msg: "تم تسجيل الدخول بنجاح",
        token,
        sessionId,
        user: {
          id: user._id,
          name: user.fullName || user.username,
          username: user.username,
          fullName: user.fullName || "",
          publicId: user.publicId || "",
          email: user.email,
          avatar: user.avatar || "",
        },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ================== ط±ط§ظˆطھط§طھ Saepel ط§ظ„ط¬ط¯ظٹط¯ط© ==================

// REGISTER ط¬ط¯ظٹط¯ /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, name, fullName, email, password, birthdate, birthDate } = req.body;
    const emailNorm = normalizeEmail(email);
    const displayName = String(fullName || name || "").trim();
    const baseUsername = toEnglishHandle(username || "");
    if (!baseUsername) {
      return res.status(400).json({ msg: "يرجى اختيار اسم مستخدم بالإنكليزي" });
    }
    const finalUsername = await ensureUniqueUsername(baseUsername);
    const finalBirthdate = birthdate || birthDate;
    if (!finalUsername || !emailNorm || !password) {
      return res.status(400).json({ msg: "يرجى تعبئة جميع البيانات" });
    }

    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(400).json({ msg: "هذا البريد مستخدم مسبقاً" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const publicId = await getNextPublicId();

    const newUser = new User({
      username: finalUsername,
      fullName: displayName,
      publicId,
      email: emailNorm,
      password: hashedPassword,
      birthdate: finalBirthdate,
    });

    await newUser.save();

    res.json({
      msg: "تم إنشاء الحساب بنجاح ✅ يمكنك تسجيل الدخول الآن. (التفعيل عبر البريد غير مفعّل حالياً)"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// LOGIN ط¬ط¯ظٹط¯ /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;

    const loginId = (identifier || email || username || "").toString().trim();

    if (!loginId || !password) {
      return res.status(400).json({ msg: "الرجاء إدخال البريد/اسم المستخدم وكلمة المرور" });
    }

    let query;
    if (loginId.includes("@") && !loginId.startsWith("@")) {
      query = { email: normalizeEmail(loginId) };
    } else {
      query = { username: normalizeUsername(loginId) };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({ msg: "البريد أو اسم المستخدم غير مسجل" });
    }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "كلمة المرور غير صحيحة" });
      }

      await ensurePublicIdForUser(user);
      const { token, sessionId } = await createSessionAndToken(user._id, req);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            lastLoginAt: new Date(),
            lastLoginIp: _safeIp(req),
            lastLoginDevice: _safeUserAgent(req),
            accountStatus:
              String(user.accountStatus || "").trim() === "new"
                ? "active"
                : String(user.accountStatus || "active"),
          },
        },
      );

      res.json({
        msg: "تم تسجيل الدخول بنجاح",
        token,
        sessionId,
        user: {
          id: user._id,
          _id: user._id,
          name: user.fullName || user.username,
          username: user.username,
          fullName: user.fullName || "",
          publicId: user.publicId || "",
          email: user.email,
          avatar: user.avatar || "",
        },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ط¥ط¹ط§ط¯ط© ط¥ط±ط³ط§ظ„ ط¨ط±ظٹط¯ ط§ظ„طھظپط¹ظٹظ„ (طھط¬ط±ظٹط¨ظٹ)
app.post("/api/auth/resend-verify-email", async (req, res) => {
  try {
    const { email } = req.body;

    const emailNorm = normalizeEmail(email);

    if (!emailNorm) {
      return res.status(400).json({ msg: "يرجى إرسال البريد الإلكتروني" });
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      return res.status(400).json({ msg: "هذا البريد غير مسجل لدينا" });
    }

    console.log("Verify email requested (not configured). Email:", emailNorm);

    return res.json({
      msg: "ميزة التفعيل عبر البريد غير مفعّلة حالياً. تم تسجيل طلبك فقط (تجريبياً)."
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

// ط¨ط±ظˆظپط§ظٹظ„ ط¹ط§ظ… ظ„ط£ظٹ ظ…ط³طھط®ط¯ظ… (ظ…ط¹ bio / location / website + isPrivate + ط­ط¸ط±)

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
      .select("_id publicId username fullName name avatar cover isVerified accountStatus profilePic photo")
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
    const idParam = String(req.params.id || "").trim();
    let u = null;
    if (mongoose.Types.ObjectId.isValid(idParam)) {
      u = await User.findById(idParam).select(
        "publicId username fullName avatar cover isVerified accountStatus privacy createdAt followers following bio location website isPrivate blockedUsers mutedUsers"
      );
    } else if (/^SA-\\d+$/i.test(idParam)) {
      u = await User.findOne({ publicId: idParam.toUpperCase() }).select(
        "publicId username fullName avatar cover isVerified accountStatus privacy createdAt followers following bio location website isPrivate blockedUsers mutedUsers"
      );
    } else {
      u = await User.findOne({ username: normalizeUsername(idParam) }).select(
        "publicId username fullName avatar cover isVerified accountStatus privacy createdAt followers following bio location website isPrivate blockedUsers mutedUsers"
      );
    }
    if (!u) return res.status(404).json({ msg: "المستخدم غير موجود" });
    await ensurePublicIdForUser(u);

    const postsCount = await Post.countDocuments({ user: u._id });
    const followersCount = u.followers ? u.followers.length : 0;
    const followingCount = u.following ? u.following.length : 0;

    let isFollowing = false;
    if (viewerId && u.followers && u.followers.length) {
      isFollowing = u.followers.some((id) => String(id) === String(viewerId));
    }

    // ًں”’ ط­ط§ظ„ط© ط§ظ„ط­ط¸ط± ط¨ظٹظ† ط§ظ„ظ…ط´ط§ظ‡ط¯ ظˆظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ…
    let isBlockedByMe = false;
    let hasBlockedMe = false;
    let isMutedByMe = false;

    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers mutedUsers");
      const viewerBlocked = ensureArray(viewer?.blockedUsers);
      const viewerMuted = ensureArray(viewer?.mutedUsers);
      const userBlocked = ensureArray(u.blockedUsers);

      isBlockedByMe = viewerBlocked.some((id) => String(id) === String(u._id));
      isMutedByMe = viewerMuted.some((id) => String(id) === String(u._id));
      hasBlockedMe = userBlocked.some((id) => String(id) === String(viewerId));
    }

    if (viewerId && String(viewerId) !== String(u._id) && !hasBlockedMe) {
      recordProfileView({ profileUserId: u._id, viewerUserId: viewerId });
    }

    const privacy = u.privacy || {};
    const messagePermission = _normalizeMessagePermission(
      privacy.messagePermission,
    );

    res.json({
      _id: u._id,
      publicId: u.publicId || "",
      username: u.username,
      fullName: u.fullName || "",
      avatar: u.avatar || "",
      cover: u.cover || "",
      isVerified: !!u.isVerified,
      accountStatus: u.accountStatus || "new",
      postsCount,
      followersCount,
      followingCount,
      isFollowing,
      createdAt: u.createdAt,
      bio: u.bio || "",
      location: u.location || "",
      website: u.website || "",
      isPrivate: !!u.isPrivate,
      privacy: {
        showLastSeen: privacy.showLastSeen !== false,
        hidePhone: privacy.hidePhone !== false,
        messagePermission,
      },
      isBlockedByMe,
      isMutedByMe,
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
    await ensurePublicIdForUser(user);

    const postsCount = await Post.countDocuments({ user: userId });
    const followersCount = user.followers ? user.followers.length : 0;
    const followingCount = user.following ? user.following.length : 0;

    const privacy = user.privacy || {};
    res.json({
      _id: user._id,
      publicId: user.publicId || "",
      username: user.username,
      fullName: user.fullName || "",
      email: user.email,
      avatar: user.avatar || "",
      cover: user.cover || "",
      isVerified: !!user.isVerified,
      accountStatus: user.accountStatus || "new",
      postsCount,
      followersCount,
      followingCount,
      createdAt: user.createdAt,
      isAdmin: !!user.isAdmin,
      bio: user.bio || "",
      location: user.location || "",
      website: user.website || "",
      isPrivate: !!user.isPrivate,
      privacy: {
        showLastSeen: privacy.showLastSeen !== false,
        hidePhone: privacy.hidePhone !== false,
        messagePermission: _normalizeMessagePermission(
          privacy.messagePermission,
        ),
      },
      lastLoginAt: user.lastLoginAt || null,
      lastLoginIp: user.lastLoginIp || "",
      lastLoginDevice: user.lastLoginDevice || "",
    });
  } catch (err) {
    console.error("ERROR in GET /api/profile:", err);
    res.status(500).json({ msg: "خطأ في الخادم" });
  }
});

app.get("/api/profile/insights", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "").trim();
    if (!userId) return res.status(401).json({ msg: "غير مصرح" });

    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [views7d, views30d, viewsTotal, followAgg7, followAgg30, posts] =
      await Promise.all([
        ProfileView.countDocuments({ profileUserId: userId, viewedAt: { $gte: d7 } }),
        ProfileView.countDocuments({ profileUserId: userId, viewedAt: { $gte: d30 } }),
        ProfileView.countDocuments({ profileUserId: userId }),
        FollowEvent.aggregate([
          {
            $match: {
              targetUserId: new mongoose.Types.ObjectId(userId),
              createdAt: { $gte: d7 },
            },
          },
          { $group: { _id: "$action", count: { $sum: 1 } } },
        ]),
        FollowEvent.aggregate([
          {
            $match: {
              targetUserId: new mongoose.Types.ObjectId(userId),
              createdAt: { $gte: d30 },
            },
          },
          { $group: { _id: "$action", count: { $sum: 1 } } },
        ]),
        Post.find({ user: userId })
          .select("_id text imageUrl videoUrl likes comments createdAt")
          .sort({ createdAt: -1 })
          .limit(60)
          .lean(),
      ]);

    const pullCount = (agg, key) => {
      const row = Array.isArray(agg) ? agg.find((x) => String(x?._id) === key) : null;
      return Number(row?.count || 0);
    };

    const follow7 = pullCount(followAgg7, "follow");
    const unfollow7 = pullCount(followAgg7, "unfollow");
    const follow30 = pullCount(followAgg30, "follow");
    const unfollow30 = pullCount(followAgg30, "unfollow");

    const topPosts = (posts || [])
      .map((p) => {
        const likesCount = Array.isArray(p?.likes) ? p.likes.length : 0;
        const commentsCount = Array.isArray(p?.comments) ? p.comments.length : 0;
        const score = likesCount * 2 + commentsCount * 3;
        return {
          _id: p?._id,
          text: p?.text || "",
          imageUrl: p?.imageUrl || "",
          videoUrl: p?.videoUrl || "",
          createdAt: p?.createdAt || null,
          likesCount,
          commentsCount,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    return res.json({
      profileViews: {
        total: viewsTotal,
        d7: views7d,
        d30: views30d,
      },
      followerGrowth: {
        d7: follow7 - unfollow7,
        d30: follow30 - unfollow30,
        follow7,
        unfollow7,
        follow30,
        unfollow30,
      },
      topPosts,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /api/profile/insights error:", err);
    return res.status(500).json({ msg: "تعذر جلب إحصائيات الحساب" });
  }
});

app.get("/api/security/sessions", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "").trim();
    const currentSessionId = String(req.sessionId || "").trim();
    const sessions = await AuthSession.find({
      userId,
      isRevoked: false,
    })
      .sort({ lastSeenAt: -1, createdAt: -1 })
      .lean();

    return res.json({
      currentSessionId,
      items: (sessions || []).map((s) => ({
        _id: s._id,
        userAgent: s.userAgent || "",
        ip: s.ip || "",
        platform: s.platform || "",
        appVersion: s.appVersion || "",
        createdAt: s.createdAt || null,
        updatedAt: s.updatedAt || null,
        lastSeenAt: s.lastSeenAt || null,
        isCurrent: String(s._id) === currentSessionId,
      })),
    });
  } catch (err) {
    console.error("GET /api/security/sessions error:", err);
    return res.status(500).json({ msg: "تعذر جلب الجلسات" });
  }
});

app.delete("/api/security/sessions/:id", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "").trim();
    const sessionId = String(req.params.id || "").trim();
    if (!sessionId) return res.status(400).json({ msg: "session id مطلوب" });

    const doc = await AuthSession.findOneAndUpdate(
      {
        _id: sessionId,
        userId,
      },
      { $set: { isRevoked: true } },
      { new: true },
    ).select("_id");

    if (!doc) return res.status(404).json({ msg: "الجلسة غير موجودة" });
    return res.json({ msg: "تم إلغاء الجلسة", sessionId });
  } catch (err) {
    console.error("DELETE /api/security/sessions/:id error:", err);
    return res.status(500).json({ msg: "تعذر إلغاء الجلسة" });
  }
});

app.delete("/api/security/sessions", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "").trim();
    const currentSessionId = String(req.sessionId || "").trim();
    const keepCurrent = String(req.query.keepCurrent || "1") !== "0";

    const query = {
      userId,
      isRevoked: false,
      ...(keepCurrent && currentSessionId ? { _id: { $ne: currentSessionId } } : {}),
    };
    const result = await AuthSession.updateMany(query, { $set: { isRevoked: true } });
    return res.json({
      msg: "تم تسجيل الخروج من الأجهزة الأخرى",
      updated: Number(result?.modifiedCount || 0),
      keepCurrent,
    });
  } catch (err) {
    console.error("DELETE /api/security/sessions error:", err);
    return res.status(500).json({ msg: "تعذر تنفيذ العملية" });
  }
});

app.get("/api/security/settings", authMiddleware, async (req, res) => {
  return res.json({
    twoFactorEnabled: false,
    twoFactorStatus: "coming_soon",
  });
});

// âœ… طھط؛ظٹظٹط± ط®طµظˆطµظٹط© ط§ظ„ط­ط³ط§ط¨
app.patch("/api/users/me/privacy", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const parseBool = (raw, fallback) => {
      if (raw === undefined || raw === null) return fallback;
      if (typeof raw === "boolean") return raw;
      const v = String(raw).trim().toLowerCase();
      if (v === "1" || v === "true" || v === "yes") return true;
      if (v === "0" || v === "false" || v === "no") return false;
      return fallback;
    };

    const existing = await User.findById(userId).select("isPrivate privacy");
    if (!existing) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const nextIsPrivate = parseBool(req.body?.isPrivate, !!existing.isPrivate);
    const oldPrivacy = existing.privacy || {};
    const nextPrivacy = {
      showLastSeen: parseBool(req.body?.showLastSeen, oldPrivacy.showLastSeen !== false),
      hidePhone: parseBool(req.body?.hidePhone, oldPrivacy.hidePhone !== false),
      messagePermission: _normalizeMessagePermission(
        req.body?.messagePermission || oldPrivacy.messagePermission,
      ),
    };

    const user = await User.findByIdAndUpdate(
      userId,
      {
        isPrivate: nextIsPrivate,
        privacy: nextPrivacy,
      },
      { new: true },
    ).select("username fullName email avatar isPrivate privacy");

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });

    res.json({
      msg: nextIsPrivate
        ? "تم ضبط الحساب كحساب خاص"
        : "تم ضبط الحساب كحساب عام",
      isPrivate: !!user.isPrivate,
      privacy: {
        showLastSeen: user.privacy?.showLastSeen !== false,
        hidePhone: user.privacy?.hidePhone !== false,
        messagePermission: _normalizeMessagePermission(
          user.privacy?.messagePermission,
        ),
      },
    });
  } catch (err) {
    console.error("ERROR in PATCH /api/users/me/privacy:", err);
    res.status(500).json({ msg: "خطأ في الخادم أثناء تعديل خصوصية الحساب" });
  }
});

app.get("/api/profile/check-username", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const raw = String(req.query?.username || "").trim();
    const normalized = toEnglishHandle(raw);
    if (!normalized || normalized.length < 3) {
      return res.status(400).json({
        msg: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل",
        available: false,
        normalized,
      });
    }
    const exists = await User.exists({
      username: normalized,
      _id: { $ne: userId },
    });
    return res.json({
      available: !exists,
      normalized,
    });
  } catch (err) {
    console.error("GET /api/profile/check-username error:", err);
    return res.status(500).json({ msg: "تعذر فحص اسم المستخدم" });
  }
});

// PUT /api/profile
app.put(
  "/api/profile",
  authMiddleware,
  runUpload(upload.fields([{ name: "avatar", maxCount: 1 }, { name: "cover", maxCount: 1 }])),
  async (req, res) => {
  try {
    const userId = req.userId;
    const { username, fullName, name, bio, location, website } = req.body;
    let avatarPath;
    let coverPath;

    const avatarFile = req.files?.avatar?.[0] || req.file || null;
    const coverFile = req.files?.cover?.[0] || null;
    if (avatarFile) avatarPath = buildUploadsUrlFromMulterFile(avatarFile);
    if (coverFile) coverPath = buildUploadsUrlFromMulterFile(coverFile);

    const updateData = {};
    if (typeof fullName === "string" || typeof name === "string") {
      const displayName = String(fullName || name || "").trim();
      updateData.fullName = displayName;
    }
    if (typeof username === "string" && username.trim()) {
      const base = toEnglishHandle(username);
      if (!base || base.length < 3) {
        return res.status(400).json({ msg: "اسم المستخدم غير صالح" });
      }
      const finalUsername = await ensureUniqueUsername(base, userId);
      updateData.username = finalUsername;
    }
    if (typeof bio === "string") updateData.bio = bio.trim();
    if (typeof location === "string") updateData.location = location.trim();
    if (typeof website === "string") updateData.website = website.trim();
    if (avatarPath) updateData.avatar = avatarPath;
    if (coverPath) updateData.cover = coverPath;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
    if (!updatedUser) return res.status(404).json({ msg: "المستخدم غير موجود" });
    await ensurePublicIdForUser(updatedUser);

      res.json({
        msg: "تم تحديث البروفايل بنجاح",
        user: {
          _id: updatedUser._id,
          publicId: updatedUser.publicId || "",
          username: updatedUser.username,
          fullName: updatedUser.fullName || "",
          email: updatedUser.email,
          avatar: updatedUser.avatar || "",
          cover: updatedUser.cover || "",
          isVerified: !!updatedUser.isVerified,
          accountStatus: updatedUser.accountStatus || "new",
          bio: updatedUser.bio || "",
          location: updatedUser.location || "",
        website: updatedUser.website || "",
        isPrivate: !!updatedUser.isPrivate,
        privacy: {
          showLastSeen: updatedUser.privacy?.showLastSeen !== false,
          hidePhone: updatedUser.privacy?.hidePhone !== false,
          messagePermission: _normalizeMessagePermission(
            updatedUser.privacy?.messagePermission,
          ),
        },
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
      FollowEvent.create({
        targetUserId,
        actorUserId: currentUserId,
        action: "unfollow",
      }).catch(() => {});

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
      FollowEvent.create({
        targetUserId,
        actorUserId: currentUserId,
        action: "follow",
      }).catch(() => {});
      if (targetUser.followers.length >= 100 && targetUser.accountStatus === "active") {
        User.updateOne(
          { _id: targetUserId },
          { $set: { accountStatus: "trusted" } },
        ).catch(() => {});
      }

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

/* âœ… ط­ط¸ط± / ط¥ظ„ط؛ط§ط، ط­ط¸ط± ظ…ط³طھط®ط¯ظ… */
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
/*  ظ‚ظˆط§ط¦ظ… ط§ظ„ظ…طھط§ط¨ط¹ظٹظ† / طھطھط§ط¨ظگط¹ */
/* ========================= */

app.post("/api/users/:id/mute-toggle", authMiddleware, async (req, res) => {
  try {
    const targetUserId = String(req.params.id || "").trim();
    const currentUserId = String(req.userId || "").trim();
    if (!targetUserId) return res.status(400).json({ msg: "user id مطلوب" });
    if (targetUserId === currentUserId) {
      return res.status(400).json({ msg: "لا يمكنك كتم نفسك" });
    }

    const currentUser = await User.findById(currentUserId).select("mutedUsers");
    if (!currentUser) return res.status(404).json({ msg: "المستخدم غير موجود" });
    currentUser.mutedUsers = ensureArray(currentUser.mutedUsers);

    const alreadyMuted = currentUser.mutedUsers.some(
      (id) => String(id) === targetUserId,
    );
    if (alreadyMuted) {
      currentUser.mutedUsers = currentUser.mutedUsers.filter(
        (id) => String(id) !== targetUserId,
      );
    } else {
      currentUser.mutedUsers.push(targetUserId);
    }
    await currentUser.save();
    return res.json({
      muted: !alreadyMuted,
      mutedCount: currentUser.mutedUsers.length,
      msg: !alreadyMuted ? "تم كتم المستخدم" : "تم إلغاء الكتم",
    });
  } catch (err) {
    console.error("POST /api/users/:id/mute-toggle error:", err);
    return res.status(500).json({ msg: "خطأ في تحديث الكتم" });
  }
});

app.get("/api/users/:id/followers", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;
    const viewerId = String(req.userId || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "30"), 10) || 30));
    const cursor = Math.max(0, Number.parseInt(String(req.query.cursor || "0"), 10) || 0);

    const user = await User.findById(userId)
      .populate("followers", "username fullName email avatar isVerified createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });
    const viewer = viewerId
      ? await User.findById(viewerId).select("following blockedUsers mutedUsers").lean()
      : null;
    const followingSet = new Set(ensureArray(viewer?.following).map((x) => String(x)));
    const blockedSet = new Set(ensureArray(viewer?.blockedUsers).map((x) => String(x)));
    const mutedSet = new Set(ensureArray(viewer?.mutedUsers).map((x) => String(x)));

    let items = (user.followers || []).map((u) => ({
      _id: u?._id,
      username: u?.username || "",
      fullName: u?.fullName || "",
      email: u?.email || "",
      avatar: u?.avatar || "",
      isVerified: !!u?.isVerified,
      createdAt: u?.createdAt || null,
      isFollowing: followingSet.has(String(u?._id || "")),
      isBlockedByMe: blockedSet.has(String(u?._id || "")),
      isMutedByMe: mutedSet.has(String(u?._id || "")),
    }));
    if (q) {
      items = items.filter((u) => {
        const a = String(u.username || "").toLowerCase();
        const b = String(u.fullName || "").toLowerCase();
        const c = String(u.email || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    const page = items.slice(cursor, cursor + limit);
    const nextCursor = cursor + page.length < items.length ? String(cursor + page.length) : null;
    return res.json({ items: page, nextCursor, total: items.length });
  } catch (err) {
    console.error("GET /api/users/:id/followers error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب قائمة المتابعين" });
  }
});

app.get("/api/users/:id/following", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;
    const viewerId = String(req.userId || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "30"), 10) || 30));
    const cursor = Math.max(0, Number.parseInt(String(req.query.cursor || "0"), 10) || 0);

    const user = await User.findById(userId)
      .populate("following", "username fullName email avatar isVerified createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "المستخدم غير موجود" });
    const viewer = viewerId
      ? await User.findById(viewerId).select("following blockedUsers mutedUsers").lean()
      : null;
    const followingSet = new Set(ensureArray(viewer?.following).map((x) => String(x)));
    const blockedSet = new Set(ensureArray(viewer?.blockedUsers).map((x) => String(x)));
    const mutedSet = new Set(ensureArray(viewer?.mutedUsers).map((x) => String(x)));

    let items = (user.following || []).map((u) => ({
      _id: u?._id,
      username: u?.username || "",
      fullName: u?.fullName || "",
      email: u?.email || "",
      avatar: u?.avatar || "",
      isVerified: !!u?.isVerified,
      createdAt: u?.createdAt || null,
      isFollowing: followingSet.has(String(u?._id || "")),
      isBlockedByMe: blockedSet.has(String(u?._id || "")),
      isMutedByMe: mutedSet.has(String(u?._id || "")),
    }));
    if (q) {
      items = items.filter((u) => {
        const a = String(u.username || "").toLowerCase();
        const b = String(u.fullName || "").toLowerCase();
        const c = String(u.email || "").toLowerCase();
        return a.includes(q) || b.includes(q) || c.includes(q);
      });
    }

    const page = items.slice(cursor, cursor + limit);
    const nextCursor = cursor + page.length < items.length ? String(cursor + page.length) : null;
    return res.json({ items: page, nextCursor, total: items.length });
  } catch (err) {
    console.error("GET /api/users/:id/following error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب قائمة تتابِع" });
  }
});

app.get("/api/users/:id/posts", authMiddlewareOptional, async (req, res) => {
  try {
    const profileId = String(req.params.id || "").trim();
    const viewerId = String(req.userId || "").trim();
    if (!profileId) return res.status(400).json({ msg: "user id مطلوب" });

    const tab = String(req.query.tab || "posts").trim().toLowerCase();
    const limit = Math.min(40, Math.max(1, Number.parseInt(String(req.query.limit || "18"), 10) || 18));
    const beforeRaw = String(req.query.before || "").trim();
    const beforeDate = beforeRaw ? new Date(beforeRaw) : null;

    const profileUser = await User.findById(profileId).select(
      "_id isPrivate followers",
    ).lean();
    if (!profileUser) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const isOwner = viewerId && String(profileUser._id) === viewerId;
    const isFollower = viewerId
      ? ensureArray(profileUser.followers).some((id) => String(id) === viewerId)
      : false;
    if (profileUser.isPrivate && !isOwner && !isFollower) {
      return res.status(403).json({ msg: "هذا الحساب خاص" });
    }

    if (tab === "tagged") {
      return res.json({ items: [], nextCursor: null });
    }

    const query = { user: profileId };
    if (tab === "reels") {
      query.videoUrl = { $exists: true, $nin: ["", null] };
    } else if (tab === "media") {
      query.$or = [
        { imageUrl: { $exists: true, $nin: ["", null] } },
        { videoUrl: { $exists: true, $nin: ["", null] } },
      ];
    }
    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    }

    const docs = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("user", "username fullName email avatar isPrivate followers")
      .populate("comments.user", "username fullName avatar")
      .populate("likes", "username fullName avatar")
      .lean();

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const last = items.length ? items[items.length - 1] : null;
    const nextCursor = hasMore && last?.createdAt
      ? new Date(last.createdAt).toISOString()
      : null;

    return res.json({ items, nextCursor });
  } catch (err) {
    console.error("GET /api/users/:id/posts error:", err);
    return res.status(500).json({ msg: "تعذر جلب منشورات الملف" });
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
    FollowEvent.create({
      targetUserId: profileOwnerId,
      actorUserId: followerId,
      action: "unfollow",
    }).catch(() => {});

    return res.json({
      msg: "تمت إزالة المتابع",
      followersCount: profileUser.followers.length,
    });
  } catch (err) {
    console.error("DELETE /api/users/:id/followers/:followerId error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إزالة المتابع" });
  }
});

// ================== ط§ظ„ظ‚طµطµ (Stories) ==================
app.get("/api/stories/feed", authMiddlewareOptional, async (req, res) => {
  try {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const stories = await Story.find({ createdAt: { $gte: since } })
      .populate("user", "username fullName avatar")
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
      mediaUrl = buildUploadsUrlFromMulterFile(req.file);
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

    const story = await Story.findById(storyId).populate("views.user", "username fullName email avatar");
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
/* ًں“‍ Call Logs API  /api/calls */
/* ===================================================================== */

// âœ… ط¬ظ„ط¨ ط³ط¬ظ„ ط§ظ„ط§طھطµط§ظ„ط§طھ ظ„ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط­ط§ظ„ظٹ (ط¢ط®ط± 50 ط§ظپطھط±ط§ط¶ظٹط§ظ‹)
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

    // ط¬ظ„ط¨ ظ…ط¹ظ„ظˆظ…ط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ… ط§ظ„ط¢ط®ط± (username/avatar/isVerified) ظپظ‚ط·
    const otherIds = Array.from(
      new Set(
        logs
          .map((l) => (Array.isArray(l.participants) ? l.participants.map(String) : []))
          .flat()
          .filter((id) => id && id !== userId)
      )
    );

    const users = await User.find({ _id: { $in: otherIds } }).select("username fullName avatar isVerified").lean();
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

// âœ… ط­ط°ظپ ط³ط¬ظ„ ط§طھطµط§ظ„ ظˆط§ط­ط¯ "عندي" ظپظ‚ط·
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

// âœ… ظ…ط³ط­ ظƒظ„ ط§ظ„ط³ط¬ظ„ "عندي" ظپظ‚ط·
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
/* ًں”µ ًں”µ ًں”µ  ظ‚ط³ظ… ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ ظˆط§ظ„ط±ط³ط§ط¦ظ„ /api/chat  ًں”µ ًں”µ ًں”µ */
/* ===================================================================== */

app.get("/api/chat/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const limit = Math.min(260, Math.max(20, parseInt(req.query.limit || "220", 10) || 220));
    const sinceRaw = String(req.query.since || req.query.updatedAfter || "").trim();
    let sinceDate = null;
    if (sinceRaw) {
      const d = new Date(sinceRaw);
      if (!isNaN(d.getTime())) sinceDate = d;
    }

    const membershipOr = [
      { participants: userId },
      { owner: userId },
      { admins: userId },
      { createdBy: userId },
    ];

    const query = sinceDate
      ? {
          deletedFor: { $ne: userId },
          $and: [
            { $or: membershipOr },
            {
              $or: [{ updatedAt: { $gte: sinceDate } }, { lastMessageAt: { $gte: sinceDate } }],
            },
          ],
        }
      : {
          deletedFor: { $ne: userId },
          $or: membershipOr,
        };

    const conversations = await Conversation.find(query)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(limit)
      .select(
        "_id type isGroup title avatar participants members owner admins createdBy lastMessage lastMessageAt updatedAt deletedFor"
      )
      .populate({
        path: "participants",
        select: "username fullName avatar isVerified",
        options: { lean: true },
      })
      .populate({
        path: "lastMessage",
        select: "_id conversation sender type text attachments createdAt seenBy deletedForAll",
        populate: {
          path: "sender",
          select: "username fullName avatar",
          options: { lean: true },
        },
        options: { lean: true },
      })
      .lean();

    if (sinceDate) {
      return res.json({
        conversations,
        delta: true,
        serverTime: new Date().toISOString(),
      });
    }

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

    const otherUser = await User.findById(otherUserId).select(
      "username fullName avatar privacy followers blockedUsers",
    );
    if (!otherUser) return res.status(404).json({ msg: "المستخدم غير موجود" });

    const me = await User.findById(userId).select("blockedUsers");
    const meBlocked = ensureArray(me?.blockedUsers);
    const otherBlocked = ensureArray(otherUser?.blockedUsers);
    if (
      meBlocked.some((id) => String(id) === String(otherUserId)) ||
      otherBlocked.some((id) => String(id) === String(userId))
    ) {
      return res.status(403).json({ msg: "لا يمكن بدء محادثة مع هذا المستخدم" });
    }

    const msgPermission = _normalizeMessagePermission(
      otherUser?.privacy?.messagePermission,
    );
    if (msgPermission === "none") {
      return res.status(403).json({ msg: "هذا المستخدم لا يستقبل رسائل جديدة" });
    }
    if (msgPermission === "followers") {
      const isFollower = ensureArray(otherUser?.followers).some(
        (id) => String(id) === String(userId),
      );
      if (!isFollower) {
        return res.status(403).json({ msg: "يمكن للمتابعين فقط مراسلة هذا المستخدم" });
      }
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


    // âœ… ط¶ظ…ط§ظ† ط£ظ† ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ„ط§ طھط¨ظ‚ظ‰ ظ…ط®ظپظٹط© ط¨ط¹ط¯ Clear Chat
    await Conversation.updateOne(
      { _id: conversation._id },
      { $pull: { deletedFor: { $in: [String(userId), String(otherUserId)] } } }
    );

    conversation = await conversation.populate({
      path: "participants",
      select: "username fullName avatar isVerified",
    });

    res.json(conversation);
  } catch (err) {
    console.error("POST /api/chat/conversations/start error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء إنشاء المحادثة" });
  }
});


// ================== List Spaces (Groups/Channels) ==================
// GET /api/chat/spaces
// ظٹط±ط¬ظ‘ط¹ ط§ظ„ظ‚ظ†ظˆط§طھ + ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط§ظ„طھظٹ ط£ظ†ط§ ط¶ظ…ظ†ظ‡ط§ (participants/owner/admins/createdBy)
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
      .populate({ path: "participants", select: "username fullName avatar isVerified" })
      .populate({ path: "lastMessage", populate: { path: "sender", select: "username fullName avatar" } });

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

    // âœ… ط­ظ…ط§ظٹط© ظ…ظ† ظ‚ظٹظ… ط؛ظٹط± طµط§ظ„ط­ط© طھط³ط¨ط¨ CastError (ظ…ط«ظ„ "undefined" ط£ظˆ "")
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
    const userId = String(req.userId || "");
    const conversationId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ msg: "conversationId غير صالح" });
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "30", 10) || 30, 120));
    const beforeRaw = (req.query.before || req.query.beforeCursor || "").toString().trim();
    const afterRaw = (req.query.after || req.query.afterCursor || "").toString().trim();

    const parseCursorDate = async (raw) => {
      if (!raw) return null;
      if (mongoose.Types.ObjectId.isValid(raw)) {
        const pivot = await Message.findOne({ _id: raw, conversation: conversationId })
          .select("createdAt")
          .lean();
        if (pivot?.createdAt) {
          return new Date(pivot.createdAt);
        }
      }
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    };

    const beforeDate = await parseCursorDate(beforeRaw);
    // If both before+after exist, keep "before" mode (pagination up).
    const afterDate = beforeDate ? null : await parseCursorDate(afterRaw);

    const conversation = await Conversation.findById(conversationId).select("_id participants");
    if (!conversation) return res.status(404).json({ msg: "المحادثة غير موجودة" });

    if (!conversation.participants.some((p) => String(p) === userId)) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    const mode = afterDate ? "after" : "before";
    const q = {
      conversation: conversationId,
      deletedFor: { $ne: userId },
    };
    if (afterDate) {
      q.createdAt = { $gt: afterDate };
    } else if (beforeDate) {
      q.createdAt = { $lt: beforeDate };
    }

    const rows = await Message.find(q)
      .sort(afterDate ? { createdAt: 1 } : { createdAt: -1 })
      .limit(limit + 1)
      .select(
        "_id conversation sender clientMsgId type text attachments createdAt updatedAt seenBy replyTo replyPreview forwardOf forwardPreview forwardComment editedAt editedBy deletedForAll reactions"
      )
      .populate({
        path: "sender",
        select: "username fullName avatar",
        options: { lean: true },
      })
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    let items = page;
    let nextCursor = null;

    if (mode === "after") {
      const newest = page.length ? page[page.length - 1] : null;
      nextCursor = newest?.createdAt ? new Date(newest.createdAt).toISOString() : null;
    } else {
      const oldest = page.length ? page[page.length - 1] : null;
      nextCursor = oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : null;
      items = page.slice().reverse();
    }

    return res.json({
      items,
      hasMore,
      nextCursor,
      mode,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /api/chat/conversations/:id/messages error:", err);
    res.status(500).json({ msg: "حدث خطأ أثناء جلب الرسائل" });
  }
});


// âœ… ظ…ط³ط­ ط§ظ„ظ…ط­ط§ط¯ط«ط© ط¹ظ†ط¯ظٹ ظپظ‚ط· (Soft delete ظ„ظƒظ„ ط§ظ„ط±ط³ط§ط¦ظ„) â€” POST /api/chat/conversations/:id/clear
// ظ„ط§ ظٹط¤ط«ط± ط¹ظ„ظ‰ ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±. (ظٹط³طھط®ط¯ظ… deletedFor)
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

    // âœ… ظ…ط³ط­ ظƒظ„ ط§ظ„ط±ط³ط§ط¦ظ„ ط¹ظ†ط¯ظٹ ظپظ‚ط·
    const result = await Message.updateMany(
      { conversation: conversationId, deletedFor: { $ne: userId } },
      { $addToSet: { deletedFor: userId } }
    );

    // âœ… ظ„ط§ ظ†ط­ط°ظپ/ظ†ط®ظپظٹ ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ†ظپط³ظ‡ط§ â€” ظپظ‚ط· ظ†ظ…ط³ط­ ط§ظ„ط±ط³ط§ط¦ظ„ ط¹ظ†ط¯ ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ…
    return res.json({ ok: true, modified: result?.modifiedCount || result?.nModified || 0 });
  } catch (e) {
    console.error("POST /api/chat/conversations/:id/clear error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء مسح المحادثة" });
  }
});

app.post(
  "/api/chat/conversations/:id/messages",
  authMiddleware,
  runUpload(
    upload.fields([
      { name: "attachments", maxCount: 5 },
      { name: "voice", maxCount: 1 },
    ])
  ),
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

      const bodyAttachmentsRaw =
        typeof req.body?.attachments === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(req.body.attachments);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : Array.isArray(req.body?.attachments)
            ? req.body.attachments
            : [];

      const detectKind = (mime, name = "") => detectKindFromMime(mime, name);

      // ط¯ط¹ظ… ظ…ط¯ط© ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„طµظˆطھظٹط© (ط«ظˆط§ظ†ظٹ) ط¥ط°ط§ ط£ط±ط³ظ„ظ‡ط§ ط§ظ„ظپط±ظˆظ†طھ
      const voiceDurationRaw = req.body?.voiceDuration ?? req.body?.duration ?? 0;
      const voiceDuration = Number.isFinite(Number(voiceDurationRaw)) ? Number(voiceDurationRaw) : 0;

      const fileAttachments = files.map((f) => {
        const kind = detectKind(f.mimetype, f.originalname || f.filename);
        const att = {
          url: buildUploadsUrlFromMulterFile(f),
          type: kind,
          originalName: f.originalname,
          size: f.size,
          mimeType: f.mimetype,
          duration: 0,
        };

        // ط¥ط°ط§ ظ‡ط°ط§ ط§ظ„ظ…ظ„ظپ طµظˆطھظٹ ظˆط¹ظ†ط¯ظ†ط§ ظ…ط¯ط© ظ…ط±ط³ظ„ط©
        if (kind === "audio" && voiceDuration > 0) {
          att.duration = voiceDuration;
        }

        return att;
      });

      const bodyAttachments = await normalizeIncomingAttachments(
        bodyAttachmentsRaw,
        String(userId || "")
      );
      const attachments = [...fileAttachments, ...bodyAttachments];


      // âœ… Reply / Forward (ظ…ظ† FormData)
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

      // âœ… ظ†ظˆط¹ ط§ظ„ط±ط³ط§ظ„ط© ط¨ط´ظƒظ„ ظ…ظˆط­ظ‘ط¯ ظˆط¢ظ…ظ†
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
      // âœ… ظ„ظˆ ظƒط§ظ†طھ ط§ظ„ظ…ط­ط§ط¯ط«ط© ظ…ط®ظپظٹط© ط¹ظ†ط¯ ط£ظٹ ط·ط±ظپ ط¨ط³ط¨ط¨ Clear ChatطŒ ط±ط¬ظ‘ط¹ظ‡ط§
      conversation.deletedFor = [];
      await conversation.save();

      const populatedMsg = await message.populate("sender", "username fullName avatar");

      // ================== ظ…ط²ط§ظ…ظ†ط© ط§ظ„ط·ط±ظپظٹظ† ط¹ط¨ط± Socket.io (ط­طھظ‰ ظ„ظˆ ط§ظ„ط¥ط±ط³ط§ظ„ طھظ… ط¹ط¨ط± REST) ==================
      try {
        const payload = populatedMsg.toObject();
        payload.conversation = conversationId;

        // ط¥ط±ط³ط§ظ„ ظ„ظ„ظ…ط±ط³ظ„ ط¯ط§ط¦ظ…ط§ظ‹
        io.to(`user-${String(userId)}`).emit("new-message", payload);

        // ط¥ط±ط³ط§ظ„ ظ„ط¨ط§ظ‚ظٹ ط§ظ„ظ…ط´ط§ط±ظƒظٹظ†
        const pushTargets = [];
        if (!conversation.isGroup) {
          const receiverId =
            (conversation.participants || []).find((p) => String(p) !== String(userId)) || null;
          if (receiverId) {
            io.to(`user-${String(receiverId)}`).emit("new-message", payload);
            pushTargets.push(String(receiverId));
          }
        } else {
          for (const p of conversation.participants || []) {
            const pid = String(p);
            if (pid !== String(userId)) {
              io.to(`user-${pid}`).emit("new-message", payload);
              pushTargets.push(pid);
            }
          }
        }

        const senderName = String(
          payload?.sender?.fullName || payload?.sender?.username || "User"
        );
        const normalizedType = String(payload?.type || msgType || "text");
        const normalizedText = String(payload?.text || text || "");
        const normalizedAttachments = Array.isArray(payload?.attachments)
          ? payload.attachments
          : (Array.isArray(attachments) ? attachments : []);
        for (const targetUserId of pushTargets) {
          sendChatMessagePush({
            toUserId: targetUserId,
            fromUserId: userId,
            fromName: senderName,
            conversationId,
            conversationTitle: String(conversation?.title || ""),
            messageId: String(payload?._id || message?._id || ""),
            messageType: normalizedType,
            text: normalizedText,
            attachments: normalizedAttachments,
          }).catch((e) => {
            console.error("rest sendChatMessagePush error:", e?.message || e);
          });
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

// ✅ Edit message text (sender only)
app.put("/api/chat/messages/:id", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const messageId = String(req.params.id || "");
    const nextText = typeof req.body?.text === "string" ? req.body.text.trim() : "";

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ msg: "messageId غير صالح" });
    }
    if (!nextText) {
      return res.status(400).json({ msg: "النص مطلوب للتعديل" });
    }

    const msg = await Message.findById(messageId).select(
      "_id conversation sender attachments deletedForAll"
    );
    if (!msg) return res.status(404).json({ msg: "الرسالة غير موجودة" });
    if (msg.deletedForAll) return res.status(400).json({ msg: "لا يمكن تعديل هذه الرسالة" });
    if (String(msg.sender) !== userId) {
      return res.status(403).json({ msg: "لا يمكنك تعديل رسالة لا تخصك" });
    }

    const conv = await Conversation.findById(msg.conversation).select("_id participants");
    if (!conv) return res.status(404).json({ msg: "المحادثة غير موجودة" });
    const isMember = Array.isArray(conv.participants) && conv.participants.some((p) => String(p) === userId);
    if (!isMember) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    msg.text = nextText;
    msg.type = computeMessageType(nextText, Array.isArray(msg.attachments) ? msg.attachments : []);
    msg.editedAt = new Date();
    msg.editedBy = userId;
    await msg.save();

    const populatedMsg = await msg.populate("sender", "username fullName avatar");
    const payload = populatedMsg.toObject();
    payload.conversation = String(msg.conversation);

    for (const p of conv.participants || []) {
      io.to(`user-${String(p)}`).emit("message-updated", payload);
    }

    return res.json(payload);
  } catch (e) {
    console.error("PUT /api/chat/messages/:id error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء تعديل الرسالة" });
  }
});

// ✅ Add / update / remove reaction
app.post("/api/chat/messages/:id/react", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const messageId = String(req.params.id || "");
    const emoji = typeof req.body?.emoji === "string" ? req.body.emoji.trim() : "";

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ msg: "messageId غير صالح" });
    }

    const msg = await Message.findById(messageId).select(
      "_id conversation deletedForAll reactions"
    );
    if (!msg) return res.status(404).json({ msg: "الرسالة غير موجودة" });
    if (msg.deletedForAll) return res.status(400).json({ msg: "لا يمكن التفاعل مع هذه الرسالة" });

    const conv = await Conversation.findById(msg.conversation).select("_id participants");
    if (!conv) return res.status(404).json({ msg: "المحادثة غير موجودة" });
    const isMember = Array.isArray(conv.participants) && conv.participants.some((p) => String(p) === userId);
    if (!isMember) {
      return res.status(403).json({ msg: "لا تملك صلاحية على هذه المحادثة" });
    }

    const next = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
    const idx = next.findIndex((r) => String(r?.user || "") === userId);
    if (!emoji) {
      if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
      next[idx].emoji = emoji;
      next[idx].at = new Date();
    } else {
      next.push({ user: userId, emoji, at: new Date() });
    }

    msg.reactions = next;
    await msg.save();

    const reactionPayload = {
      conversationId: String(msg.conversation),
      messageId: String(msg._id),
      reactions: (msg.reactions || []).map((r) => ({
        user: String(r.user || ""),
        emoji: String(r.emoji || ""),
        at: r.at || null,
      })),
    };

    for (const p of conv.participants || []) {
      io.to(`user-${String(p)}`).emit("message-reaction", reactionPayload);
    }

    return res.json({ ok: true, ...reactionPayload });
  } catch (e) {
    console.error("POST /api/chat/messages/:id/react error:", e);
    return res.status(500).json({ msg: "حدث خطأ أثناء التفاعل" });
  }
});


/* ===================================================================== */
/* ًں—‘ï¸ڈ ط­ط°ظپ ط§ظ„ط±ط³ط§ط¦ظ„ (ط­ط°ظپ ط¹ظ†ط¯ظٹ / ط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹) + ط­ط°ظپ ط¯ظپط¹ط© ظˆط§ط­ط¯ط© */
/* ===================================================================== */

// Helpers
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

// âœ… طµظ„ط§ط­ظٹط§طھ ط§ظ„ظ‚ظ†ظˆط§طھ/ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ (Telegram-like)
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


// âœ… ط­ط°ظپ ط¹ظ†ط¯ظٹ ظپظ‚ط· (soft delete) â€” endpoint ظ…ط·ط§ط¨ظ‚ ظ„ظ„ظپط±ظˆظ†طھ: POST /api/chat/messages/delete-for-me
// Body:
// - { id: "..." } ط£ظˆ { ids: ["..",".."] }
app.post("/api/chat/messages/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const idsRaw = req.body?.ids ?? req.body?.messageIds ?? null;
    const oneId = req.body?.id ?? req.body?.messageId ?? null;

    let ids = [];
    if (Array.isArray(idsRaw)) ids = idsRaw;
    else if (typeof oneId === "string") ids = [oneId];

    ids = ids.map((x) => String(x || "")).filter(Boolean);

    // طھط¬ط§ظ‡ظ„ ط£ظٹ temp-... ط£ظˆ ids ط؛ظٹط± طµط§ظ„ط­ط© (ط¨ط¯ظˆظ† 500)
    const validIds = ids.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) return res.json({ ok: true, deleted: 0 });

    // ط¬ظ„ط¨ ط§ظ„ط±ط³ط§ط¦ظ„ + ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ
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
      // âœ… ظ‚ظ†ظˆط§طھ: ط؛ظٹط± ط§ظ„ظ…ط´ط±ظپ ظ„ط§ ظٹط­ظ‚ ظ„ظ‡ ط­ط°ظپ ط­طھظ‰ ط¹ظ†ط¯ظ‡ ظپظ‚ط· (Telegram-like)
      if (isChannel(c) && !isConvAdmin(c, userId)) {
        return res.status(403).json({ msg: "لا يمكنك حذف رسائل داخل قناة إلا إذا كنت مشرفاً" });
      }
      allowedIds.push(String(m._id));
    }

    if (allowedIds.length === 0) return res.json({ ok: true, deleted: 0 });

    await Message.updateMany({ _id: { $in: allowedIds } }, { $addToSet: { deletedFor: userId } });

    // ظ…ط²ط§ظ…ظ†ط©: ظپظ‚ط· ظ„ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… (ط­طھظ‰ ظ…ط§ ظ†ط¹ظ…ظ„ طھط´ظˆظٹط´ ط¹ظ†ط¯ ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±)
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

// âœ… ط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹ (hard delete) â€” DELETE /api/chat/messages/:id
// ط­ط°ظپ ط¹ظ†ط¯ظٹ ظپظ‚ط· (Soft delete) â€” ظ„ط§ ظٹظ…ط³ ط§ظ„ط±ط³ط§ظ„ط© ط¹ظ†ط¯ ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±
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

    // ظ…ط²ط§ظ…ظ†ط© ظ„ظ„ط·ط±ظپظٹظ†/ط§ظ„ظ…ط¬ظ…ظˆط¹ط©
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

    // ظ„ط§ طھط±ظ…ظٹ 500 ظ„ظˆ temp-... ط£ظˆ ط؛ظٹط± طµط§ظ„ط­
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

    // طµظ„ط§ط­ظٹط©: ظپظ‚ط· ط§ظ„ظ…ط±ط³ظ„ ظٹط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹ (ط£ظˆ طھظˆط³ظ‘ط¹ظ‡ط§ ظ„ط§ط­ظ‚ط§ظ‹ ظ„ظ„ظ…ط´ط±ظپ/ظ…ط§ظ„ظƒ ط§ظ„ظ…ط¬ظ…ظˆط¹ط©)
    if (String(msg.sender) !== userId) {
      return res.status(403).json({ msg: "فقط مُرسل الرسالة يستطيع حذفها للجميع" });
    }

    // ط­ط°ظپ ظ…ظ„ظپط§طھ ط§ظ„ظ…ط±ظپظ‚ط§طھ ظ…ظ† uploads ط¥ظ† ظˆط¬ط¯طھ
    try {
      const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
      for (const a of atts) {
        const u = a?.url ? String(a.url) : "";
        if (u.startsWith("/uploads/")) {
          const filename = u.replace("/uploads/", "").replace(/^\/+/, "");
          const filePath = path.join(uploadsDir, filename);
          try {
            await fs.unlink(filePath);
          } catch {}
        }
      }
    } catch (e) {
      console.warn("unlink warn:", e?.message || e);
    }

    await Message.deleteOne({ _id: messageId });

    // ظ…ط²ط§ظ…ظ†ط© ظ„ظ„ط·ط±ظپظٹظ†/ط§ظ„ظ…ط¬ظ…ظˆط¹ط©
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

// âœ… ط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹ ط¯ظپط¹ط© ظˆط§ط­ط¯ط© (hard) â€” POST /api/chat/messages/bulk-delete
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

    // ظپظ‚ط· ط±ط³ط§ط¦ظ„ظٹ + ط¶ظ…ظ† ظ…ط­ط§ط¯ط«ط© ط£ظ†ط§ ظ…ط´ط§ط±ظƒ ظپظٹظ‡ط§
    // âœ… ظ‚ظ†ظˆط§طھ: ط§ظ„ط­ط°ظپ (ط­طھظ‰ ظ„ظ„ط¬ظ…ظٹط¹) ظ„ظ„ظ…ط´ط±ظپظٹظ† ظپظ‚ط·. ط§ظ„ظ…ط´ط±ظپ ط¯ط§ط®ظ„ ظ‚ظ†ط§ط© ظٹط³طھط·ظٹط¹ ط­ط°ظپ ط£ظٹ ط±ط³ط§ظ„ط©.
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

      // chat/group: ظ„ط§ طھط­ط°ظپ ط¥ظ„ط§ ط±ط³ط§ط¦ظ„ظƒ
      if (String(m.sender) !== userId) continue;
      deletable.push(m);
    }

    if (!deletable.length) return res.json({ ok: true, deleted: 0 });

    // ط­ط°ظپ ط§ظ„ظ…ظ„ظپط§طھ
    for (const m of deletable) {
      try {
        const atts = Array.isArray(m.attachments) ? m.attachments : [];
        for (const a of atts) {
          const u = a?.url ? String(a.url) : "";
          if (u.startsWith("/uploads/")) {
            const filename = u.replace("/uploads/", "").replace(/^\/+/, "");
            const filePath = path.join(uploadsDir, filename);
            try {
              await fs.unlink(filePath);
            } catch {}
          }
        }
      } catch {}
    }

    const deletableIds = deletable.map((m) => String(m._id));
    await Message.deleteMany({ _id: { $in: deletableIds } });

    // ظ…ط²ط§ظ…ظ†ط© ظ…ط¬ظ…ظ‘ط¹ط© ظ„ظƒظ„ ظ…ط­ط§ط¯ط«ط© ظ„طھظ‚ظ„ظٹظ„ ط§ظ„طھط±ط§ظپظٹظƒ
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
        sender: { $ne: userId }, // âœ… ظ„ط§ طھظ„ظ…ط³ ط±ط³ط§ط¦ظ„ظٹ
        deletedFor: { $ne: userId },
        seenBy: { $ne: userId },
      },
      { $addToSet: { seenBy: userId } }
    );

    // âœ… ظ…ط²ط§ظ…ظ†ط© ط§ظ„ظ‚ط±ط§ط،ط© ظ„ظ„ط·ط±ظپظٹظ† (ظٹط¸ظ‡ط± âœ…âœ… ط¹ظ†ط¯ ط§ظ„ظ…ط±ط³ظ„ ظپظ‚ط· ط¨ط¹ط¯ ظپطھط­ ط§ظ„ظ…ط³طھظ„ظ… ظ„ظ„ظ…ط­ط§ط¯ط«ط©)
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
/* ًں”¶ ط±ط§ظˆطھ ظ…ظˆط­ظ‘ط¯ ظ„ظ„ط¨ظ„ط§ط؛ط§طھ (ظ…ظ†ط´ظˆط±ط§طھ + ظ‚طµطµ) + ط¨ط§ظ‚ظٹ ط±ط§ظˆطھط§طھ ط§ظ„ط¨ظˆط³طھط§طھ ظˆط§ظ„ط¥ط¯ط§ط±ط© */
/* ===================================================================== */

// ====================== ط§ظ„ط¨ظˆط³طھط§طھ ======================
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
        { path: "user", select: "username fullName email avatar isPrivate followers" },
        { path: "comments.user", select: "username fullName avatar" },
        { path: "likes", select: "username fullName avatar" },
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
      const filePath = buildUploadsUrlFromMulterFile(req.file);
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
    await newPost.populate("user", "username fullName email avatar isPrivate followers");

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
      .populate("user", "username fullName email avatar isPrivate followers")
      .populate("comments.user", "username fullName avatar")
      .populate("likes", "username fullName avatar")
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
      .populate("user", "username fullName email avatar isPrivate followers")
      .populate("comments.user", "username fullName avatar")
      .populate("likes", "username fullName avatar");

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

// ================== Search Posts ==================
// GET /api/posts/search?q=term
app.get("/api/posts/search", authMiddlewareOptional, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ posts: [] });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const viewerId = req.userId ? String(req.userId) : "";

    const baseQuery = {
      $or: [{ text: regex }, { link: regex }],
    };

    if (viewerId) {
      baseQuery.$and = [
        {
          $or: [{ privacy: "public" }, { user: viewerId }, { privacy: { $exists: false } }],
        },
      ];
    } else {
      baseQuery.$and = [{ $or: [{ privacy: "public" }, { privacy: { $exists: false } }] }];
    }

    const posts = await Post.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("user", "username fullName avatar");

    return res.json({ posts });
  } catch (err) {
    console.error("GET /api/posts/search error:", err);
    return res.status(500).json({ msg: "حدث خطأ أثناء البحث" });
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
      const filePath = buildUploadsUrlFromMulterFile(req.file);
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
    await post.populate("user", "username fullName email avatar isPrivate followers");

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

    const post = await Post.findById(req.params.id).populate("comments.user", "username fullName avatar");
    if (!post) return res.status(404).json({ msg: "المنشور غير موجود" });

    const comment = { text: trimmed, user: req.userId, createdAt: new Date() };
    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "username fullName avatar");

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
      console.error("\u274c invalid postId:", e);
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

// ================== طھط­ظˆظٹظ„ ط­ط³ط§ط¨ظƒ ط¥ظ„ظ‰ ظ…ط´ط±ظپ ==================
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

// ================== ط±ظˆطھط§طھ ط§ظ„ظ…ط´ط±ظپ (Admin) ==================
app.get("/api/admin/reports", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reports = await Report.find()
      .sort({ createdAt: -1 })
      .populate({
        path: "post",
        select: "text imageUrl videoUrl link privacy createdAt user",
        populate: { path: "user", select: "username fullName email avatar" },
      })
      .populate({
        path: "story",
        select: "mediaUrl mediaType text createdAt user",
        populate: { path: "user", select: "username fullName email avatar" },
      })
      .populate("reporter", "username fullName email avatar");

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

// ================== ط¥ط¯ط§ط±ط© ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ظˆط§ظ„ظ…ط´ط±ظپظٹظ† ==================
app.get("/api/admin/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({})
      .select("username fullName email avatar isAdmin createdAt isPrivate")
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

// ======================== ط­ظ…ط§ظٹط© 404 ظ„ظ„ظ€ API (ط­طھظ‰ ظ…ط§ ظٹط±ط¬ط¹ HTML) ========================
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.use("/api", (req, res) => res.status(404).json({ msg: "API route not found" }));

// ======================== ظˆط§ط¬ظ‡ط© ط§ظ„ظ…ظˆظ‚ط¹ ========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ======================== طھط´ط؛ظٹظ„ ط§ظ„ط³ظٹط±ظپط± ========================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`âœ… ط§ظ„ط³ظٹط±ظپط± ط´ط؛ط§ظ„ ط¹ظ„ظ‰ ط§ظ„ظ…ظ†ظپط° ${PORT}`);
  console.log(`ًں”Œ Socket.io ط¬ط§ظ‡ط² ظ„ظ„ط¯ط±ط¯ط´ط© ط§ظ„ظپظˆط±ظٹط©`);
});



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

import { createServer } from "http";
import { Server } from "socket.io";
import fs from "fs/promises";
import crypto from "crypto";

import User from "./models/User.js";
import Post from "./models/Post.js";
import Report from "./models/Report.js";
import Story from "./models/Story.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ظ‚طµطµ
import upload, { uploadsDir } from "./upload.js";
import Conversation from "./models/Conversation.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ
import Message from "./models/Message.js"; // â­گ ظ…ظˆط¯ظٹظ„ ط§ظ„ط±ط³ط§ط¦ظ„
import CallLog from "./models/CallLog.js"; // â­گ ط³ط¬ظ„ ط§ظ„ط§طھطµط§ظ„ط§طھ
mongoose.set("strictPopulate", false);

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
    console.error("â‌Œ JWT_SECRET ط؛ظٹط± ظ…ط¶ط¨ظˆط·. ظ…ط·ظ„ظˆط¨ ظپظٹ ط§ظ„ط¥ظ†طھط§ط¬.");
    process.exit(1);
  } else {
    console.warn("âڑ ï¸ڈ JWT_SECRET ط؛ظٹط± ظ…ط¶ط¨ظˆط·. ط³ظٹطھظ… ط§ط³طھط®ط¯ط§ظ… ظ‚ظٹظ…ط© طھط·ظˆظٹط± ظ…ط¤ظ‚طھط©.");
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
// طھط®ط²ظٹظ† ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ† ط§ظ„ظ…طھطµظ„ظٹظ†
const connectedUsers = new Map();

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

function detectKindFromMime(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
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
io.use((socket, next) => {
  try {
    const token =
      socket.handshake?.auth?.token ||
      socket.handshake?.headers?.authorization?.split(" ")?.[1] ||
      "";

    if (!token) return next(new Error("NO_TOKEN"));

    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) return next(new Error("BAD_TOKEN"));

    socket.userId = String(userId);
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
  console.log("ًں”Œ ظ…ط³طھط®ط¯ظ… ظ…طھطµظ„:", socket.id, "userId:", socket.userId);

  // âœ… join-user ظ„ط§ط²ظ… ظٹط·ط§ط¨ظ‚ طھظˆظƒظ†
  socket.on("join-user", (userId) => {
    try {
      const uid = String(userId || "");
      if (!uid || uid !== String(socket.userId)) {
        console.warn("âڑ ï¸ڈ join-user ظ…ط±ظپظˆط¶: userId ظ„ط§ ظٹط·ط§ط¨ظ‚ ط§ظ„طھظˆظƒظ†", { uid, tokenUser: socket.userId });
        return;
      }

      socket.join(`user-${uid}`);
      connectedUsers.set(uid, socket.id);
      console.log(`ًں‘¤ ${uid} ط§ظ†ط¶ظ… ظ„ظ„ط¯ط±ط¯ط´ط© (socket: ${socket.id})`);
    } catch (e) {
      console.error("join-user error:", e);
    }
  });

  // â­گâ­گ ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ط¹ط¨ط± Socket (ظٹط¯ط¹ظ… text + attachments + voiceNote ظƒظ€ DataURL) â­گâ­گ
  socket.on("send-message", async (data) => {
    try {
      const conversationId = data?.conversationId;
      if (!conversationId) {
        return socket.emit("message-error", { error: "conversationId ظ…ظپظ‚ظˆط¯" });
      }

      // âœ… ط§ظ„ظ…ط±ط³ظ„ ط§ظ„ط­ظ‚ظٹظ‚ظٹ ظ…ظ† ط§ظ„طھظˆظƒظ† ظپظ‚ط·
      const senderId = String(socket.userId);

      // طھط£ظƒط¯ ظ…ظ† ط§ظ„ظ…ط­ط§ط¯ط«ط© + طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط±ط³ظ„
      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        return socket.emit("message-error", { error: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });
      }

      const isMember = (conv.participants || []).some((p) => String(p) === senderId);
      if (!isMember) {
        return socket.emit("message-error", { error: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
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
        return socket.emit("message-error", { error: "ظٹط¬ط¨ ط¥ط±ط³ط§ظ„ ظ†طµ ط£ظˆ ظ…ط±ظپظ‚ ظˆط§ط­ط¯ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" });
      }
      // âœ… طھط¬ظ‡ظٹط² ظ…ط­طھظˆظ‰ ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„ظ†ظ‡ط§ط¦ظٹ (ط®طµظˆطµط§ظ‹ ظ„ظ„ظپظˆط±ظˆط§ط±ط¯)
      let finalText = text || "";
      let finalAttachments = attachments;

      // âœ… Forward: ط§ظ†ط³ط® ظ…ط­طھظˆظ‰ ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„ط£طµظ„ظٹط© (ظ†طµ/ظ…ط±ظپظ‚ط§طھ) ط­طھظ‰ طھط´طھط؛ظ„ (طµظˆطھ/طµظˆط±ط©/ظپظٹط¯ظٹظˆ) ط·ط¨ظٹط¹ظٹ
      if (hasForward) {
        const original = await Message.findById(forwardOf).lean();
        if (!original || original.deletedForAll) {
          return socket.emit("message-error", { error: "ظ„ط§ ظٹظ…ظƒظ† طھط­ظˆظٹظ„ ظ‡ط°ظ‡ ط§ظ„ط±ط³ط§ظ„ط©" });
        }

        // طھط£ظƒط¯ ط¥ظ† ط§ظ„ظ…ط±ط³ظ„ ظٹظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ظ„ظ„ط±ط³ط§ظ„ط© ط§ظ„ط£طµظ„ظٹط© (ط¹ط¶ظˆ ط¨ط§ظ„ظ…ط­ط§ط¯ط«ط© ط§ظ„ط£طµظ„ظٹط©)
        const canAccess = await Conversation.exists({ _id: original.conversation, participants: senderId });
        if (!canAccess) {
          return socket.emit("message-error", { error: "ظ„ط§ ظٹظ…ظƒظ† طھط­ظˆظٹظ„ ظ‡ط°ظ‡ ط§ظ„ط±ط³ط§ظ„ط©" });
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
          const looksLikePlaceholder = oText.trim() === "ط±ط³ط§ظ„ط© طµظˆطھظٹط©" || oText.trim() === "ط±ط³ط§ظ„ط©" || oText.trim() === "";
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
      if (!conv.isGroup) {
        if (receiverId) io.to(`user-${receiverId}`).emit("new-message", payload);
      } else {
        for (const p of conv.participants || []) {
          const pid = String(p);
          if (pid !== senderId) io.to(`user-${pid}`).emit("new-message", payload);
        }
      }

      socket.emit("message-sent", { success: true, messageId: message._id });

      console.log("âœ… Socket message sent:", {
        conversationId,
        type: msgType,
        from: senderId,
        to: receiverId || "group",
        hasText: !!text,
        attachmentsCount: attachments.length,
      });
    } catch (error) {
      console.error("â‌Œ Socket send-message error:", error);
      socket.emit("message-error", { error: "ظپط´ظ„ ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط³ط§ظ„ط©" });
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

  socket.on("call:invite", (payload = {}) => {
    try {
      const from = String(socket.userId || "");
      const to = String(payload.to || "");
      const callId = String(payload.callId || "");
      const type = payload.type === "video" ? "video" : "audio";
      if (!from || !to || !callId || to === from) return;

      // âœ… Call log: create/update ringing
      upsertCallLogRinging({ callId, from, to, type });

      // ط£ط±ط³ظ„ ظ„ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±
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
  // ظ…ظ„ط§ط­ط¸ط©: ظ†ط­ظ† ظپظ‚ط· "ظ†ط±ط­ظ‘ظ„" SDP/ICE ط¹ط¨ط± Socket.io.  ظ„ط§ ظ†ط­ظپط¸ ط£ظٹ ط´ظٹط، ظپظٹ DB.
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
    console.log("â‌Œ ظ…ط³طھط®ط¯ظ… ط§ظ†ظ‚ط·ط¹:", socket.id);
    for (const [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(userId);
        break;
      }
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

// ظ…ظ„ظپط§طھ ط§ظ„ط±ظپط¹ (ط§ظ„طµظˆط± / ط§ظ„ظپظٹط¯ظٹظˆ / ط§ظ„طµظˆطھ) ظƒظ€ static
// âœ… ط§ظ„ظ…ط³ط§ط± ط§ظ„ط­ظ‚ظٹظ‚ظٹ ط§ظ„ط°ظٹ ظٹط­ظپط¸ ظپظٹظ‡ multer (upload.js) â€” ظ…ظ‡ظ… ط¬ط¯ط§ظ‹ ط¹ظ„ظ‰ Render
app.use("/uploads", express.static(uploadsDir));
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

app.use("/uploads", express.static(UPLOADS_DIR_BACKEND));
if (UPLOADS_DIR_PUBLIC !== UPLOADS_DIR_BACKEND) app.use("/uploads", express.static(UPLOADS_DIR_PUBLIC));
if (UPLOADS_DIR_ROOT !== UPLOADS_DIR_BACKEND && UPLOADS_DIR_ROOT !== UPLOADS_DIR_PUBLIC) {
  app.use("/uploads", express.static(UPLOADS_DIR_ROOT));
}
// طھظ‚ط¯ظٹظ… ظ…ظ„ظپط§طھ ط§ظ„ظˆط§ط¬ظ‡ط© (HTML/CSS/JS) ظ…ظ† ظ…ط¬ظ„ط¯ public
app.use(express.static(path.join(__dirname, "public")));

// ================== Upload Auth Guard ==================
const ALLOW_PUBLIC_UPLOAD = String(process.env.ALLOW_PUBLIC_UPLOAD || "") === "1";
function uploadAuthGuard(req, res, next) {
  if (ALLOW_PUBLIC_UPLOAD) return next();

  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ msg: "ط¸â€‍ط·آ§ ط¸ظ¹ط¸ث†ط·آ¬ط·آ¯ ط·ع¾ط¸ث†ط¸ئ’ط¸â€  ط¸ظ¾ط¸ظ¹ ط·آ§ط¸â€‍ط¸â€،ط¸ظ¹ط·آ¯ط·آ±" });

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "ط·ع¾ط¸â€ ط·آ³ط¸ظ¹ط¸â€ڑ ط·آ§ط¸â€‍ط·ع¾ط¸ث†ط¸ئ’ط¸â€  ط·ط›ط¸ظ¹ط·آ± ط·آµط·آ§ط¸â€‍ط·آ­" });
  }

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) return res.status(401).json({ msg: "ط·آ§ط¸â€‍ط·ع¾ط¸ث†ط¸ئ’ط¸â€  ط·ط›ط¸ظ¹ط·آ± ط·آµط·آ§ط¸â€‍ط·آ­" });
    req.userId = userId;
    req.user = { id: userId };
    next();
  } catch {
    return res.status(401).json({ msg: "ط·آ§ط¸â€‍ط·ع¾ط¸ث†ط¸ئ’ط¸â€  ط·ط›ط¸ظ¹ط·آ± ط·آµط·آ§ط¸â€‍ط·آ­ ط·آ£ط¸ث† ط¸â€¦ط¸â€ ط·ع¾ط¸â€،ط¸ظ¹" });
  }
}

/* ===================================================================== */
/* âœ…âœ…âœ…  ط±ط§ظˆطھ ط±ظپط¹ ط¹ط§ظ… (ظƒط§ظ† ظ†ط§ظ‚طµ ظˆظ‡ظˆ ط³ط¨ط¨ 404 /api/upload)  âœ…âœ…âœ… */
/* ===================================================================== */
// ظٹط±ظپط¹ ط£ظٹ ظ…ظ„ظپ via FormData (ط£ظˆظ„ ظ…ظ„ظپ ظ…ظˆط¬ظˆط¯) ظˆظٹط±ط¬ط¹ URL ط¬ط§ظ‡ط² ظ„ظ„ط§ط³طھط®ط¯ط§ظ…
app.post("/api/upload", uploadAuthGuard, upload.any(), async (req, res) => {
  try {
    const f = Array.isArray(req.files) && req.files.length ? req.files[0] : null;
    if (!f) return res.status(400).json({ msg: "ظ„ط§ ظٹظˆط¬ط¯ ظ…ظ„ظپ ظ…ط±ظپظˆط¹" });

    const url = buildUploadsUrlFromMulterFile(f);
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
    return res.status(500).json({ msg: "ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ" });
  }
});

// ================== ظ…ظٹط¯ظ„ظˆظٹط± JWT ==================

// ظ…ظٹط¯ظ„ظˆظٹط± ط¥ط¬ط¨ط§ط±ظٹ
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ msg: "ظ„ط§ ظٹظˆط¬ط¯ طھظˆظƒظ† ظپظٹ ط§ظ„ظ‡ظٹط¯ط±" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "طھظ†ط³ظٹظ‚ ط§ظ„طھظˆظƒظ† ط؛ظٹط± طµط§ظ„ط­" });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);

    const userId = decoded.id || decoded.userId || decoded._id;
    if (!userId) {
      console.error("JWT payload ط¨ط¯ظˆظ† userId:", decoded);
      return res.status(401).json({ msg: "ط§ظ„طھظˆظƒظ† ط؛ظٹط± طµط§ظ„ط­" });
    }

    req.userId = userId;
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ msg: "ط§ظ„طھظˆظƒظ† ط؛ظٹط± طµط§ظ„ط­ ط£ظˆ ظ…ظ†طھظ‡ظٹ" });
  }

};

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
    return res.status(500).json({ msg: "ط®ط·ط£ ط£ط«ظ†ط§ط، طھط¬ظ‡ظٹط² RTC config" });
  }
});


// ظ…ظٹط¯ظ„ظˆظٹط± ط§ط®طھظٹط§ط±ظٹ (ظ„ط§ ظٹط±ظ…ظٹ ط®ط·ط£ ظ„ظˆ ظ…ط§ ظپظٹ طھظˆظƒظ†)
const authMiddlewareOptional = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return next();

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return next();

  const token = parts[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET_EFFECTIVE);
    const userId = decoded.id || decoded.userId || decoded._id;
    if (userId) {
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
  upload.any(),
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
        return res.status(400).json({ msg: "ظ„ط§ ظٹظˆط¬ط¯ ظ…ظ„ظپ طµظˆطھظٹ ظ…ط±ظپظˆط¹" });
      }

      const savedUrl = await saveDataUrlToUploads(dataUrl, mimeType, originalName, String(req.userId || ""));
      if (!savedUrl) {
        return res.status(400).json({ msg: "طµظٹط؛ط© ط§ظ„طµظˆطھ ط؛ظٹط± ظ…ط¯ط¹ظˆظ…ط©" });
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
      return res.status(500).json({ msg: "ظپط´ظ„ ط±ظپط¹ ط§ظ„طµظˆطھ" });
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
  upload.any(), // ظ†ظ‚ط¨ظ„ ط£ظٹ key ظ„ظ„ظ…ظ„ظپ (file / image / video ... ط¥ظ„ط®)
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

      if (!f) return res.status(400).json({ msg: "ط§ظ„ظ…ظ„ظپ ظ…ط·ظ„ظˆط¨" });

      const url = buildUploadsUrlFromMulterFile(f);
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
      return res.status(500).json({ msg: "ظپط´ظ„ ط±ظپط¹ ط§ظ„ظ…ظ„ظپ" });
    }
  }
);

// ================== ظ…ظٹط¯ظ„ظˆظٹط± ط§ظ„ظ…ط´ط±ظپ ==================
const adminMiddleware = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
    }

    if (!user.isAdmin) {
      return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط§ظ„ط¯ط®ظˆظ„ (ظ‡ط°ط§ ط§ظ„ط­ط³ط§ط¨ ظ„ظٹط³ ظ…ط´ط±ظپط§ظ‹)" });
    }

    req.currentUser = user;
    next();
  } catch (err) {
    console.error("adminMiddleware error:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† طµظ„ط§ط­ظٹط§طھ ط§ظ„ظ…ط´ط±ظپ" });
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
  "ط§": "a", "ط£": "a", "ط¥": "i", "ط¢": "a",
  "ط¨": "b", "طھ": "t", "ط«": "th", "ط¬": "j",
  "ط­": "h", "ط®": "kh", "ط¯": "d", "ط°": "dh",
  "ط±": "r", "ط²": "z", "ط³": "s", "ط´": "sh",
  "طµ": "s", "ط¶": "d", "ط·": "t", "ط¸": "z",
  "ط¹": "a", "ط؛": "gh", "ظپ": "f", "ظ‚": "q",
  "ظƒ": "k", "ظ„": "l", "ظ…": "m", "ظ†": "n",
  "ظ‡": "h", "ظˆ": "w", "ظٹ": "y", "ظ‰": "a",
  "ط©": "h", "ط¤": "w", "ط¦": "y", "ط،": "",
  "ظ ": "0","ظ،": "1","ظ¢": "2","ظ£": "3","ظ¤": "4","ظ¥": "5","ظ¦": "6","ظ§": "7","ظ¨": "8","ظ©": "9",
  "غ°": "0","غ±": "1","غ²": "2","غ³": "3","غ´": "4","غµ": "5","غ¶": "6","غ·": "7","غ¸": "8","غ¹": "9",
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
// ظˆظ‚طھظ‡ط§ MONGO_URI ط¨طھظƒظˆظ† ظپط§ط¶ظٹط© ظˆط§ظ„ط³ظٹط±ظپط± ط¨ظٹظ‚ط¹ ط¹ظ„ظ‰ ظ‚ط§ط¹ط¯ط© ظ…ط­ظ„ظٹط© ظ…ط®طھظ„ظپط© â†’ ط§ظ„ظ…ظ†ط´ظˆط±ط§طھ "طھط®طھظپظٹ".
// ظ„ط°ظ„ظƒ: ط¥ظ…ظ‘ط§ طھط¶ط¨ط· MONGO_URI ط¯ط§ط¦ظ…ط§ظ‹طŒ ط£ظˆ ظپط¹ظ‘ظ„ ط§ظ„ط³ظ…ط§ط­ ظ„ظ„ظ…ط­ظ„ظٹ طµط±ط§ط­ط©ظ‹ ط¹ط¨ط± ALLOW_LOCAL_MONGO=1.
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  (String(process.env.ALLOW_LOCAL_MONGO || "") === "1" ? FALLBACK_LOCAL_MONGO : "");

if (!MONGO_URI) {
  console.error(
    "â‌Œ MONGO_URI ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©. ط¶ط¹ظ‡ط§ ظپظٹ ظ…ظ„ظپ .env ط¨ط¬ط§ظ†ط¨ server.js ط£ظˆ ظپط¹ظ‘ظ„ ALLOW_LOCAL_MONGO=1 ظ„ظ„ط³ظ…ط§ط­ ط¨ط§ظ„ظ…ط­ظ„ظٹ."
  );
  process.exit(1);
}

mongoose
  .connect(MONGO_URI)
  .then(() => {
    const c = mongoose.connection;
    console.log("âœ… طھظ… ط§ظ„ط§طھطµط§ظ„ ط¨ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ");
    console.log("ًں—„ï¸ڈ DB:", {
      name: c?.name,
      host: c?.host,
      port: c?.port,
      readyState: c?.readyState,
    });

    // طھط­ط°ظٹط± ظˆط§ط¶ط­ ظ„ظˆ ظƒظ†طھ ط¹ظ„ظ‰ ط§ظ„ظ‚ط§ط¹ط¯ط© ط§ظ„ظ…ط­ظ„ظٹط© (ظٹط³ظ‡ظ‘ظ„ ط§ظƒطھط´ط§ظپ ط³ط¨ط¨ ط§ط®طھظپط§ط، ط§ظ„ظ…ظ†ط´ظˆط±ط§طھ)
    if (String(MONGO_URI).includes("127.0.0.1") || String(MONGO_URI).includes("localhost")) {
      console.warn("âڑ ï¸ڈ ط£ظ†طھ ظ…طھطµظ„ ط¨ظ‚ط§ط¹ط¯ط© ظ…ط­ظ„ظٹط©. ط¥ط°ط§ ظƒظ†طھ طھطھظˆظ‚ط¹ ط¨ظٹط§ظ†ط§طھ Atlas طھط£ظƒط¯ ظ…ظ† MONGO_URI ظپظٹ .env.");
    }
  })
  .catch((err) => console.error("â‌Œ MongoDB Error:", err));
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
      return res.status(400).json({ msg: "ظٹط±ط¬ظ‰ ط§ط®طھظٹط§ط± ط§ط³ظ… ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ط¥ظ†ظƒظ„ظٹط²ظٹ" });
    }
    const finalUsername = await ensureUniqueUsername(baseUsername);
    const finalBirthdate = birthdate || birthDate;

    if (!finalUsername || !emailNorm || !password) {
      return res.status(400).json({ msg: "ظٹط±ط¬ظ‰ طھط¹ط¨ط¦ط© ط¬ظ…ظٹط¹ ط§ظ„ط¨ظٹط§ظ†ط§طھ" });
    }

    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(400).json({ msg: "ظ‡ط°ط§ ط§ظ„ط¨ط±ظٹط¯ ظ…ط³طھط®ط¯ظ… ظ…ط³ط¨ظ‚ط§ظ‹" });
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

    res.json({ msg: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨ ط¨ظ†ط¬ط§ط­" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
      return res.status(400).json({ msg: "ط§ظ„ط±ط¬ط§ط، ط¥ط¯ط®ط§ظ„ ط§ظ„ط¨ط±ظٹط¯/ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ظˆظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±" });
    }

    let query;
    if (loginId.includes("@") && !loginId.startsWith("@")) {
      query = { email: normalizeEmail(loginId) };
    } else {
      query = { username: normalizeUsername(loginId) };
    }

    const user = await User.findOne(query);
    if (!user) {
      return res.status(400).json({ msg: "ط§ظ„ط¨ط±ظٹط¯ ط£ظˆ ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ط³ط¬ظ„" });
    }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©" });
      }

      await ensurePublicIdForUser(user);

      const token = jwt.sign({ id: user._id }, JWT_SECRET_EFFECTIVE, { expiresIn: "7d" });

      res.json({
        msg: "طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ظ†ط¬ط§ط­",
        token,
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
      return res.status(400).json({ msg: "ظٹط±ط¬ظ‰ ط§ط®طھظٹط§ط± ط§ط³ظ… ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ط¥ظ†ظƒظ„ظٹط²ظٹ" });
    }
    const finalUsername = await ensureUniqueUsername(baseUsername);
    const finalBirthdate = birthdate || birthDate;
    if (!finalUsername || !emailNorm || !password) {
      return res.status(400).json({ msg: "ظٹط±ط¬ظ‰ طھط¹ط¨ط¦ط© ط¬ظ…ظٹط¹ ط§ظ„ط¨ظٹط§ظ†ط§طھ" });
    }

    const exists = await User.findOne({ email: emailNorm });
    if (exists) {
      return res.status(400).json({ msg: "ظ‡ط°ط§ ط§ظ„ط¨ط±ظٹط¯ ظ…ط³طھط®ط¯ظ… ظ…ط³ط¨ظ‚ط§ظ‹" });
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
      msg: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ط­ط³ط§ط¨ ط¨ظ†ط¬ط§ط­ âœ… ظٹظ…ظƒظ†ظƒ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط§ظ„ط¢ظ†. (ط§ظ„طھظپط¹ظٹظ„ ط¹ط¨ط± ط§ظ„ط¨ط±ظٹط¯ ط؛ظٹط± ظ…ظپط¹ظ‘ظ„ ط­ط§ظ„ظٹط§ظ‹)"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

// LOGIN ط¬ط¯ظٹط¯ /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, email, username, password } = req.body;

    const loginId = (identifier || email || username || "").toString().trim();

    if (!loginId || !password) {
      return res.status(400).json({ msg: "ط§ظ„ط±ط¬ط§ط، ط¥ط¯ط®ط§ظ„ ط§ظ„ط¨ط±ظٹط¯/ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ظˆظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط±" });
    }

    let query;
    if (loginId.includes("@") && !loginId.startsWith("@")) {
      query = { email: normalizeEmail(loginId) };
    } else {
      query = { username: normalizeUsername(loginId) };
    }

    const user = await User.findOne(query);

    if (!user) {
      return res.status(400).json({ msg: "ط§ظ„ط¨ط±ظٹط¯ ط£ظˆ ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ط³ط¬ظ„" });
    }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ msg: "ظƒظ„ظ…ط© ط§ظ„ظ…ط±ظˆط± ط؛ظٹط± طµط­ظٹط­ط©" });
      }

      await ensurePublicIdForUser(user);

      const token = jwt.sign({ id: user._id }, JWT_SECRET_EFFECTIVE, { expiresIn: "7d" });

      res.json({
        msg: "طھظ… طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ظ†ط¬ط§ط­",
        token,
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

// ط¥ط¹ط§ط¯ط© ط¥ط±ط³ط§ظ„ ط¨ط±ظٹط¯ ط§ظ„طھظپط¹ظٹظ„ (طھط¬ط±ظٹط¨ظٹ)
app.post("/api/auth/resend-verify-email", async (req, res) => {
  try {
    const { email } = req.body;

    const emailNorm = normalizeEmail(email);

    if (!emailNorm) {
      return res.status(400).json({ msg: "ظٹط±ط¬ظ‰ ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ" });
    }

    const user = await User.findOne({ email: emailNorm });
    if (!user) {
      return res.status(400).json({ msg: "ظ‡ط°ط§ ط§ظ„ط¨ط±ظٹط¯ ط؛ظٹط± ظ…ط³ط¬ظ„ ظ„ط¯ظٹظ†ط§" });
    }

    console.log("Verify email requested (not configured). Email:", emailNorm);

    return res.json({
      msg: "ظ…ظٹط²ط© ط§ظ„طھظپط¹ظٹظ„ ط¹ط¨ط± ط§ظ„ط¨ط±ظٹط¯ ط؛ظٹط± ظ…ظپط¹ظ‘ظ„ط© ط­ط§ظ„ظٹط§ظ‹. طھظ… طھط³ط¬ظٹظ„ ط·ظ„ط¨ظƒ ظپظ‚ط· (طھط¬ط±ظٹط¨ظٹط§ظ‹)."
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
      .select("_id publicId username fullName name avatar profilePic photo")
      .limit(20)
      .lean();

    return res.json({ users });
  } catch (e) {
    console.error("GET /api/users/search error:", e);
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ظپظٹ ط§ظ„ط¨ط­ط«" });
  }
});

app.get("/api/users/:id", authMiddlewareOptional, async (req, res) => {
  try {
    const viewerId = req.userId || null;
    const idParam = String(req.params.id || "").trim();
    let u = null;
    if (mongoose.Types.ObjectId.isValid(idParam)) {
      u = await User.findById(idParam).select(
        "publicId username fullName avatar createdAt followers following bio location website isPrivate blockedUsers"
      );
    } else if (/^SA-\\d+$/i.test(idParam)) {
      u = await User.findOne({ publicId: idParam.toUpperCase() }).select(
        "publicId username fullName avatar createdAt followers following bio location website isPrivate blockedUsers"
      );
    } else {
      u = await User.findOne({ username: normalizeUsername(idParam) }).select(
        "publicId username fullName avatar createdAt followers following bio location website isPrivate blockedUsers"
      );
    }
    if (!u) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
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

    if (viewerId) {
      const viewer = await User.findById(viewerId).select("blockedUsers");
      const viewerBlocked = ensureArray(viewer?.blockedUsers);
      const userBlocked = ensureArray(u.blockedUsers);

      isBlockedByMe = viewerBlocked.some((id) => String(id) === String(u._id));
      hasBlockedMe = userBlocked.some((id) => String(id) === String(viewerId));
    }

    res.json({
      _id: u._id,
      publicId: u.publicId || "",
      username: u.username,
      fullName: u.fullName || "",
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

// GET /api/profile
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ msg: "ط؛ظٹط± ظ…طµط±ط­" });

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
    await ensurePublicIdForUser(user);

    const postsCount = await Post.countDocuments({ user: userId });
    const followersCount = user.followers ? user.followers.length : 0;
    const followingCount = user.following ? user.following.length : 0;

      res.json({
        _id: user._id,
        publicId: user.publicId || "",
        username: user.username,
        fullName: user.fullName || "",
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

// âœ… طھط؛ظٹظٹط± ط®طµظˆطµظٹط© ط§ظ„ط­ط³ط§ط¨
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
      "username fullName email avatar isPrivate"
    );

    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    res.json({
      msg: isPrivate ? "طھظ… ط¶ط¨ط· ط§ظ„ط­ط³ط§ط¨ ظƒط­ط³ط§ط¨ ط®ط§طµ" : "طھظ… ط¶ط¨ط· ط§ظ„ط­ط³ط§ط¨ ظƒط­ط³ط§ط¨ ط¹ط§ظ…",
      isPrivate: !!user.isPrivate,
    });
  } catch (err) {
    console.error("ERROR in PATCH /api/users/me/privacy:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ… ط£ط«ظ†ط§ط، طھط¹ط¯ظٹظ„ ط®طµظˆطµظٹط© ط§ظ„ط­ط³ط§ط¨" });
  }
});

// PUT /api/profile
app.put("/api/profile", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    const userId = req.userId;
    const { username, fullName, name, bio, location, website } = req.body;
    let avatarPath;

    if (req.file) avatarPath = buildUploadsUrlFromMulterFile(req.file);

    const updateData = {};
    if (typeof fullName === "string" || typeof name === "string") {
      const displayName = String(fullName || name || "").trim();
      updateData.fullName = displayName;
    }
    if (typeof username === "string" && username.trim()) {
      const base = toEnglishHandle(username);
      if (!base || base.length < 3) {
        return res.status(400).json({ msg: "ط§ط³ظ… ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± طµط§ظ„ط­" });
      }
      const finalUsername = await ensureUniqueUsername(base, userId);
      updateData.username = finalUsername;
    }
    if (typeof bio === "string") updateData.bio = bio.trim();
    if (typeof location === "string") updateData.location = location.trim();
    if (typeof website === "string") updateData.website = website.trim();
    if (avatarPath) updateData.avatar = avatarPath;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
    if (!updatedUser) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
    await ensurePublicIdForUser(updatedUser);

      res.json({
        msg: "طھظ… طھط­ط¯ظٹط« ط§ظ„ط¨ط±ظˆظپط§ظٹظ„ ط¨ظ†ط¬ط§ط­",
        user: {
          _id: updatedUser._id,
          publicId: updatedUser.publicId || "",
          username: updatedUser.username,
          fullName: updatedUser.fullName || "",
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ… ط£ط«ظ†ط§ط، طھط­ط¯ظٹط« ط§ظ„ط¨ط±ظˆظپط§ظٹظ„" });
  }
});

// FOLLOW / UNFOLLOW
app.post("/api/users/:id/follow", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetUserId) === String(currentUserId)) {
      return res.status(400).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ظ…طھط§ط¨ط¹ط© ظ†ظپط³ظƒ" });
    }

    const targetUser = await User.findById(targetUserId);
    const currentUser = await User.findById(currentUserId);

    if (!targetUser || !currentUser) {
      return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
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
        msg: "طھظ… ط¥ظ„ط؛ط§ط، ط§ظ„ظ…طھط§ط¨ط¹ط©",
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
        msg: "طھظ…طھ ط§ظ„ظ…طھط§ط¨ط¹ط©",
        following: true,
        followersCount: targetUser.followers.length,
        followingCount: currentUser.following.length,
      });
    }
  } catch (err) {
    console.error("ERROR in /api/users/:id/follow:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

/* âœ… ط­ط¸ط± / ط¥ظ„ط؛ط§ط، ط­ط¸ط± ظ…ط³طھط®ط¯ظ… */
app.post("/api/users/:id/block-toggle", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetUserId) === String(currentUserId)) {
      return res.status(400).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط­ط¸ط± ط­ط³ط§ط¨ظƒ ط§ظ„ط´ط®طµظٹ" });
    }

    const currentUser = await User.findById(currentUserId);
    const targetUser = await User.findById(targetUserId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
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
      msg: blocked ? "طھظ… ط­ط¸ط± ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ…طŒ ظ„ظ† ظٹط³طھط·ظٹط¹ ط§ظ„طھظپط§ط¹ظ„ ظ…ط¹ظƒ âœ…" : "طھظ… ط¥ظ„ط؛ط§ط، ط­ط¸ط± ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… âœ…",
      blocked,
      blockedCount: currentUser.blockedUsers.length,
    });
  } catch (err) {
    console.error("ERROR in /api/users/:id/block-toggle:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ… ط£ط«ظ†ط§ط، طھط­ط¯ظٹط« ط§ظ„ط­ط¸ط±" });
  }
});

/* ========================= */
/*  ظ‚ظˆط§ط¦ظ… ط§ظ„ظ…طھط§ط¨ط¹ظٹظ† / طھطھط§ط¨ظگط¹ */
/* ========================= */

app.get("/api/users/:id/followers", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate("followers", "username fullName email avatar createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    return res.json(user.followers || []);
  } catch (err) {
    console.error("GET /api/users/:id/followers error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ظ‚ط§ط¦ظ…ط© ط§ظ„ظ…طھط§ط¨ط¹ظٹظ†" });
  }
});

app.get("/api/users/:id/following", authMiddlewareOptional, async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId)
      .populate("following", "username fullName email avatar createdAt")
      .select("_id");

    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    return res.json(user.following || []);
  } catch (err) {
    console.error("GET /api/users/:id/following error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ظ‚ط§ط¦ظ…ط© طھطھط§ط¨ظگط¹" });
  }
});

app.delete("/api/users/:id/followers/:followerId", authMiddleware, async (req, res) => {
  try {
    const profileOwnerId = req.params.id;
    const followerId = req.params.followerId;
    const currentUserId = req.userId;

    if (String(profileOwnerId) !== String(currentUserId)) {
      return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ ط¥ط²ط§ظ„ط© ظ…طھط§ط¨ط¹ ظ…ظ† ط­ط³ط§ط¨ ط´ط®طµ ط¢ط®ط±" });
    }

    const profileUser = await User.findById(profileOwnerId);
    const followerUser = await User.findById(followerId);

    if (!profileUser || !followerUser) {
      return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
    }

    const ensureArr = (v) => (Array.isArray(v) ? v : []);
    profileUser.followers = ensureArr(profileUser.followers);
    followerUser.following = ensureArr(followerUser.following);

    const beforeCount = profileUser.followers.length;

    profileUser.followers = profileUser.followers.filter((id) => String(id) !== String(followerId));
    followerUser.following = followerUser.following.filter((id) => String(id) !== String(profileOwnerId));

    if (profileUser.followers.length === beforeCount) {
      return res.status(400).json({
        msg: "ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ„ظٹط³ ط¶ظ…ظ† ظ…طھط§ط¨ط¹ظٹظƒ",
        followersCount: profileUser.followers.length,
      });
    }

    await profileUser.save();
    await followerUser.save();

    return res.json({
      msg: "طھظ…طھ ط¥ط²ط§ظ„ط© ط§ظ„ظ…طھط§ط¨ط¹",
      followersCount: profileUser.followers.length,
    });
  } catch (err) {
    console.error("DELETE /api/users/:id/followers/:followerId error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط²ط§ظ„ط© ط§ظ„ظ…طھط§ط¨ط¹" });
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
        userName: s.user?.username || "ظ…ط³طھط®ط¯ظ… Saepel",
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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ظ‚طµطµ" });
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

    if (!mediaUrl) return res.status(400).json({ msg: "ظٹط¬ط¨ ط¥ط±ظپط§ظ‚ طµظˆط±ط© ط£ظˆ ظپظٹط¯ظٹظˆ" });

    const text = (req.body.text || "").trim();

    const story = await Story.create({
      user: userId,
      mediaUrl,
      mediaType,
      text,
    });

    res.status(201).json({ msg: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ‚طµط© ط¨ظ†ط¬ط§ط­", id: story._id });
  } catch (err) {
    console.error("POST /api/stories error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ظ†ط´ط§ط، ط§ظ„ظ‚طµط©" });
  }
});

app.post("/api/stories/:id/view", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    const already = (story.views || []).some((v) => v.user && v.user.toString() === userId.toString());
    if (!already) {
      story.views.push({ user: userId });
      await story.save();
    }

    res.json({ msg: "طھظ… طھط³ط¬ظٹظ„ ط§ظ„ظ…ط´ط§ظ‡ط¯ط©", viewsCount: story.views.length });
  } catch (err) {
    console.error("POST /api/stories/:id/view error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط³ط¬ظٹظ„ ط§ظ„ظ…ط´ط§ظ‡ط¯ط©" });
  }
});

app.get("/api/stories/:id/viewers", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId).populate("views.user", "username fullName email avatar");
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ ظ„ظƒ ط¨ط¹ط±ط¶ ظ…ط´ط§ظ‡ط¯ط§طھ ظ‚طµطµ ط§ظ„ط¢ط®ط±ظٹظ†" });
    }

    const viewers = (story.views || []).map((v) => ({
      id: v.user?._id,
      username: v.user?.username || v.user?.email || "ظ…ط³طھط®ط¯ظ… Saepel",
      avatar: v.user?.avatar || "",
      viewedAt: v.at,
    }));

    res.json({ viewers });
  } catch (err) {
    console.error("GET /api/stories/:id/viewers error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ظ…ط´ط§ظ‡ط¯ط§طھ" });
  }
});

app.delete("/api/stories/:id", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (story.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ ط¨ط­ط°ظپ ظ‚طµط© ط´ط®طµ ط¢ط®ط±" });
    }

    await story.deleteOne();
    res.json({ msg: "طھظ… ط­ط°ظپ ط§ظ„ظ‚طµط© ط¨ظ†ط¬ط§ط­" });
  } catch (err) {
    console.error("DELETE /api/stories/:id error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط­ط°ظپ ط§ظ„ظ‚طµط©" });
  }
});

app.post("/api/stories/:id/report", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ‚طµط© ط؛ظٹط± طµط§ظ„ط­" });
    }

    const userId = req.userId;

    let reason = "";
    if (req.body && typeof req.body.reason === "string") reason = req.body.reason.trim();
    if (!reason) reason = "ظ…ط­طھظˆظ‰ ط؛ظٹط± ظ„ط§ط¦ظ‚";

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    const existingReport = await Report.findOne({
      targetType: "story",
      story: story._id,
      reporter: userId,
    });

    if (existingReport) return res.json({ msg: "ط³ط¨ظ‚ ظˆظ‚ظ…طھ ط¨ط§ظ„ط¥ط¨ظ„ط§ط؛ ط¹ظ† ظ‡ط°ظ‡ ط§ظ„ظ‚طµط©" });

    const rep = await Report.create({
      targetType: "story",
      story: story._id,
      reporter: userId,
      reason,
      details: "",
      status: "pending",
    });

    return res.json({
      msg: "طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ظ„ط§ط؛طŒ ط³ظٹطھظ… ظ…ط±ط§ط¬ط¹طھظ‡ ظ…ظ† ط§ظ„ط¥ط¯ط§ط±ط© âœ…",
      reportId: rep._id,
    });
  } catch (err) {
    console.error("POST /api/stories/:id/report error:", err);
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ظ„ط§ط؛" });
  }
});

app.post("/api/stories/:id/react", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ msg: "ط§ظ„ط±ظ…ط² ط§ظ„طھط¹ط¨ظٹط±ظٹ ظ…ط·ظ„ظˆط¨" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!Array.isArray(story.reactions)) story.reactions = [];
    story.reactions.push({ user: userId, emoji });
    await story.save();

    res.json({ msg: "طھظ… ط¥ط±ط³ط§ظ„ ط±ط¯ ط§ظ„ظپط¹ظ„", emoji });
  } catch (err) {
    console.error("POST /api/stories/:id/react error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط±ط¯ ط§ظ„ظپط¹ظ„" });
  }
});

app.post("/api/stories/:id/reply", authMiddleware, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.userId;
    const { message } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ msg: "ط§ظ„ط±ط³ط§ظ„ط© ظ…ط·ظ„ظˆط¨ط©" });

    const story = await Story.findById(storyId);
    if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!Array.isArray(story.replies)) story.replies = [];
    story.replies.push({ user: userId, message: message.trim() });
    await story.save();

    res.json({ msg: "طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط¯ ط¨ظ†ط¬ط§ط­" });
  } catch (err) {
    console.error("POST /api/stories/:id/reply error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط¯" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط³ط¬ظ„ ط§ظ„ط§طھطµط§ظ„ط§طھ" });
  }
});

// âœ… ط­ط°ظپ ط³ط¬ظ„ ط§طھطµط§ظ„ ظˆط§ط­ط¯ "ط¹ظ†ط¯ظٹ" ظپظ‚ط·
app.post("/api/calls/logs/:id/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const id = String(req.params.id || "");
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط؛ظٹط± طµط§ظ„ط­" });

    const log = await CallLog.findById(id).select("_id participants");
    if (!log) return res.json({ ok: true });

    const isMember = Array.isArray(log.participants) && log.participants.some((p) => String(p) === userId);
    if (!isMember) return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­" });

    await CallLog.updateOne({ _id: id }, { $addToSet: { deletedFor: userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/calls/logs/:id/delete-for-me error:", e);
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط­ط°ظپ ط§ظ„ط³ط¬ظ„" });
  }
});

// âœ… ظ…ط³ط­ ظƒظ„ ط§ظ„ط³ط¬ظ„ "ط¹ظ†ط¯ظٹ" ظپظ‚ط·
app.post("/api/calls/logs/clear-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    await CallLog.updateMany({ participants: userId }, { $addToSet: { deletedFor: userId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/calls/logs/clear-for-me error:", e);
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ظ…ط³ط­ ط§ظ„ط³ط¬ظ„" });
  }
});


/* ===================================================================== */
/* ًں”µ ًں”µ ًں”µ  ظ‚ط³ظ… ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ ظˆط§ظ„ط±ط³ط§ط¦ظ„ /api/chat  ًں”µ ًں”µ ًں”µ */
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
        select: "username fullName avatar isVerified",
      })
      .populate({
        path: "lastMessage",
        populate: { path: "sender", select: "username fullName avatar" },
      });

    res.json(conversations);
  } catch (err) {
    console.error("GET /api/chat/conversations error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ظ…ط­ط§ط¯ط«ط§طھ" });
  }
});

app.post("/api/chat/conversations/start", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { otherUserId } = req.body;

    if (!otherUserId) return res.status(400).json({ msg: "otherUserId ظ…ط·ظ„ظˆط¨" });
    if (String(otherUserId) === String(userId)) {
      return res.status(400).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط¨ط¯ط، ظ…ط­ط§ط¯ط«ط© ظ…ط¹ ظ†ظپط³ظƒ ط­ط§ظ„ظٹط§ظ‹" });
    }

    const otherUser = await User.findById(otherUserId).select("username fullName avatar");
    if (!otherUser) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ظ‚ظ†ظˆط§طھ/ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ" });
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
      return res.status(400).json({ msg: "type ط؛ظٹط± طµط§ظ„ط­" });
    }
    if (title.length < 2) {
      return res.status(400).json({ msg: "ط§ط³ظ… ط§ظ„ظ…ط¬ظ…ظˆط¹ط©/ط§ظ„ظ‚ظ†ط§ط© ظ‚طµظٹط± ط¬ط¯ط§ظ‹" });
    }
    if (!["public", "private"].includes(visibility)) {
      return res.status(400).json({ msg: "visibility ط؛ظٹط± طµط§ظ„ط­ط©" });
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
        return res.status(400).json({ msg: "username ظ…ط·ظ„ظˆط¨ ظ„ظ„ظ‚ظ†ظˆط§طھ/ط§ظ„ظ…ط¬ظ…ظˆط¹ط§طھ ط§ظ„ط¹ط§ظ…ط©" });
      }
      const taken = await Conversation.findOne({ username: username }).select("_id").lean();
      if (taken) return res.status(409).json({ msg: "ظ‡ط°ط§ ط§ظ„ظ€ username ظ…ط³طھط®ط¯ظ… ط¨ط§ظ„ظپط¹ظ„" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ظ†ط´ط§ط، ط§ظ„ظ…ط¬ظ…ظˆط¹ط©/ط§ظ„ظ‚ظ†ط§ط©" });
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

    // ظ„ظˆ before ظ‡ظˆ ObjectId â†’ ط®ط° createdAt ظ„ظ„ط±ط³ط§ظ„ط© ظ†ظپط³ظ‡ط§ ظƒظ€ cursor
    if (beforeRaw && mongoose.Types.ObjectId.isValid(beforeRaw)) {
      const pivot = await Message.findOne({ _id: beforeRaw, conversation: conversationId })
        .select("createdAt")
        .lean();
      if (pivot?.createdAt) beforeDate = new Date(pivot.createdAt);
    }

    // ظ„ظˆ before طھط§ط±ظٹط® ISO
    if (!beforeDate && beforeRaw) {
      const d = new Date(beforeRaw);
      if (!isNaN(d.getTime())) beforeDate = d;
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
    }

    const q = {
      conversation: conversationId,
      deletedFor: { $ne: userId },
    };
    if (beforeDate) {
      q.createdAt = { $lt: beforeDate };
    }

    // ظ†ط¬ظٹط¨ +1 ظ„ظ…ط¹ط±ظپط© hasMore
    const rows = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate("sender", "username fullName avatar");

    const hasMore = rows.length > limit;
    const itemsDesc = hasMore ? rows.slice(0, limit) : rows;

    // nextCursor = ط£ظ‚ط¯ظ… ط¹ظ†طµط± ظپظٹ ظ‡ط°ظ‡ ط§ظ„ط¯ظپط¹ط© (ط¢ط®ط± ط¹ظ†طµط± ط¨ط§ظ„ظ€ desc)
    const oldest = itemsDesc.length ? itemsDesc[itemsDesc.length - 1] : null;
    const nextCursor = oldest?.createdAt ? new Date(oldest.createdAt).toISOString() : null;

    // ظ„ظ„ظˆط§ط¬ظ‡ط©: ظ„ط§ط²ظ… طھظƒظˆظ† طھطµط§ط¹ط¯ظٹ (ط§ظ„ط£ظ‚ط¯ظ… ظپظˆظ‚)
    const items = itemsDesc.slice().reverse();

    return res.json({ items, hasMore, nextCursor });
  } catch (err) {
    console.error("GET /api/chat/conversations/:id/messages error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ط±ط³ط§ط¦ظ„" });
  }
});


// âœ… ظ…ط³ط­ ط§ظ„ظ…ط­ط§ط¯ط«ط© ط¹ظ†ط¯ظٹ ظپظ‚ط· (Soft delete ظ„ظƒظ„ ط§ظ„ط±ط³ط§ط¦ظ„) â€” POST /api/chat/conversations/:id/clear
// ظ„ط§ ظٹط¤ط«ط± ط¹ظ„ظ‰ ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±. (ظٹط³طھط®ط¯ظ… deletedFor)
app.post("/api/chat/conversations/:id/clear", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const conversationId = String(req.params.id || "");

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ msg: "conversationId ط؛ظٹط± طµط§ظ„ط­" });
    }

    const conversation = await Conversation.findById(conversationId).select("_id participants type owner admins isGroup");
    if (!conversation) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    const isMember = Array.isArray(conversation.participants) && conversation.participants.some((p) => String(p) === userId);
    if (!isMember) return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });

    if (isChannel(conversation) && !isConvAdmin(conversation, userId)) {
      return res.status(403).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ظ…ط³ط­ ظ‚ظ†ط§ط© ط¥ظ„ط§ ط¥ط°ط§ ظƒظ†طھ ظ…ط´ط±ظپط§ظ‹" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ظ…ط³ط­ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
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
      if (!conversation) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

      if (!conversation.participants.some((p) => String(p) === String(userId))) {
        return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
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

      // ط¯ط¹ظ… ظ…ط¯ط© ط§ظ„ط±ط³ط§ظ„ط© ط§ظ„طµظˆطھظٹط© (ط«ظˆط§ظ†ظٹ) ط¥ط°ط§ ط£ط±ط³ظ„ظ‡ط§ ط§ظ„ظپط±ظˆظ†طھ
      const voiceDurationRaw = req.body?.voiceDuration ?? req.body?.duration ?? 0;
      const voiceDuration = Number.isFinite(Number(voiceDurationRaw)) ? Number(voiceDurationRaw) : 0;

      const attachments = files.map((f) => {
        const kind = detectKind(f.mimetype);
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
        return res.status(400).json({ msg: "ظٹط¬ط¨ ط¥ط±ط³ط§ظ„ ظ†طµ ط£ظˆ ظ…ط±ظپظ‚ ظˆط§ط­ط¯ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„" });
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
      res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط§ظ„ط±ط³ط§ظ„ط©" });
    }
  }
);


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
        return res.status(403).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط­ط°ظپ ط±ط³ط§ط¦ظ„ ط¯ط§ط®ظ„ ظ‚ظ†ط§ط© ط¥ظ„ط§ ط¥ط°ط§ ظƒظ†طھ ظ…ط´ط±ظپط§ظ‹" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط­ط°ظپ" });
  }
});

// âœ… ط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹ (hard delete) â€” DELETE /api/chat/messages/:id
// ط­ط°ظپ ط¹ظ†ط¯ظٹ ظپظ‚ط· (Soft delete) â€” ظ„ط§ ظٹظ…ط³ ط§ظ„ط±ط³ط§ظ„ط© ط¹ظ†ط¯ ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط±
app.post("/api/chat/messages/:id/delete-for-me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const messageId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ msg: "messageId ط؛ظٹط± طµط§ظ„ط­" });
    }

    const msg = await Message.findById(messageId).select("conversation");
    if (!msg) return res.status(404).json({ msg: "ط§ظ„ط±ط³ط§ظ„ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    const conv = await Conversation.findById(msg.conversation).select("participants isGroup type owner admins");
    if (!conv) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!conv.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
    }

    if (isChannel(conv) && !isConvAdmin(conv, userId)) {
      return res.status(403).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط­ط°ظپ ط±ط³ط§ط¦ظ„ ط¯ط§ط®ظ„ ظ‚ظ†ط§ط© ط¥ظ„ط§ ط¥ط°ط§ ظƒظ†طھ ظ…ط´ط±ظپط§ظ‹" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط­ط°ظپ" });
  }
});

app.delete("/api/chat/messages/:id", authMiddleware, async (req, res) => {
  try {
    const userId = String(req.userId || "");
    const messageId = String(req.params.id || "");

    // ظ„ط§ طھط±ظ…ظٹ 500 ظ„ظˆ temp-... ط£ظˆ ط؛ظٹط± طµط§ظ„ط­
    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ط±ط³ط§ظ„ط© ط؛ظٹط± طµط§ظ„ط­" });
    }

    const msg = await Message.findById(messageId).lean();
    if (!msg) return res.status(404).json({ msg: "ط§ظ„ط±ط³ط§ظ„ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    const conv = await Conversation.findById(msg.conversation).select("participants isGroup type owner admins");
    if (!conv) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!Array.isArray(conv.participants) || !conv.participants.some((p) => String(p) === userId)) {
      return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
    }

    // طµظ„ط§ط­ظٹط©: ظپظ‚ط· ط§ظ„ظ…ط±ط³ظ„ ظٹط­ط°ظپ ظ„ظ„ط¬ظ…ظٹط¹ (ط£ظˆ طھظˆط³ظ‘ط¹ظ‡ط§ ظ„ط§ط­ظ‚ط§ظ‹ ظ„ظ„ظ…ط´ط±ظپ/ظ…ط§ظ„ظƒ ط§ظ„ظ…ط¬ظ…ظˆط¹ط©)
    if (String(msg.sender) !== userId) {
      return res.status(403).json({ msg: "ظپظ‚ط· ظ…ظڈط±ط³ظ„ ط§ظ„ط±ط³ط§ظ„ط© ظٹط³طھط·ظٹط¹ ط­ط°ظپظ‡ط§ ظ„ظ„ط¬ظ…ظٹط¹" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط­ط°ظپ" });
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
          return res.status(403).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط­ط°ظپ ط±ط³ط§ط¦ظ„ ط¯ط§ط®ظ„ ظ‚ظ†ط§ط© ط¥ظ„ط§ ط¥ط°ط§ ظƒظ†طھ ظ…ط´ط±ظپط§ظ‹" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط­ط°ظپ" });
  }
});
app.post("/api/chat/conversations/:id/seen", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const conversationId = req.params.id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return res.status(404).json({ msg: "ط§ظ„ظ…ط­ط§ط¯ط«ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

    if (!conversation.participants.some((p) => String(p) === String(userId))) {
      return res.status(403).json({ msg: "ظ„ط§ طھظ…ظ„ظƒ طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ظ‡ط°ظ‡ ط§ظ„ظ…ط­ط§ط¯ط«ط©" });
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

    res.json({ msg: "طھظ… طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ظ‚ط±ط§ط،ط©" });
  } catch (err) {
    console.error("POST /api/chat/conversations/:id/seen error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط­ط¯ظٹط« ط­ط§ظ„ط© ط§ظ„ظ‚ط±ط§ط،ط©" });
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
      return res.status(400).json({ msg: "ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± ظƒط§ظ…ظ„ط© (ط§ظ„ظ†ظˆط¹ ط£ظˆ ط§ظ„ظ…ط¹ط±ظ‘ظپ ظ…ظپظ‚ظˆط¯)" });
    }

    let finalReason = (reason || "").trim();
    const finalDetails = (details || "").trim();
    if (!finalReason) finalReason = "ط³ط¨ط¨ ط؛ظٹط± ظ…ط­ط¯ط¯";

    if (type === "post") {
      if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± طµط§ظ„ط­" });

      const post = await Post.findById(targetId);
      if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

      const existing = await Report.findOne({ targetType: "post", post: post._id, reporter: userId });
      if (existing) return res.json({ msg: "ط³ط¨ظ‚ ظˆظ‚ظ…طھ ط¨ط§ظ„ط¥ط¨ظ„ط§ط؛ ط¹ظ† ظ‡ط°ط§ ط§ظ„ظ…ظ†ط´ظˆط±" });

      const finalReasonForPost = finalReason === "other" ? "ط³ط¨ط¨ ط¢ط®ط±" : finalReason;

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

      return res.json({ msg: "طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ظ„ط§ط؛ ط¹ظ„ظ‰ ط§ظ„ظ…ظ†ط´ظˆط±طŒ ط³ظٹطھظ… ظ…ط±ط§ط¬ط¹طھظ‡ ظ…ظ† ط§ظ„ط¥ط¯ط§ط±ط© âœ…", reportId: rep._id });
    }

    if (type === "story") {
      if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ‚طµط© ط؛ظٹط± طµط§ظ„ط­" });

      const story = await Story.findById(targetId);
      if (!story) return res.status(404).json({ msg: "ط§ظ„ظ‚طµط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©" });

      const existing = await Report.findOne({ targetType: "story", story: story._id, reporter: userId });
      if (existing) return res.json({ msg: "ط³ط¨ظ‚ ظˆظ‚ظ…طھ ط¨ط§ظ„ط¥ط¨ظ„ط§ط؛ ط¹ظ† ظ‡ط°ظ‡ ط§ظ„ظ‚طµط©" });

      const rep = await Report.create({
        targetType: "story",
        story: story._id,
        reporter: userId,
        reason: finalReason,
        details: finalDetails,
        status: "pending",
      });

      return res.json({ msg: "طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ظ„ط§ط؛ ط¹ظ„ظ‰ ط§ظ„ظ‚طµط©طŒ ط³ظٹطھظ… ظ…ط±ط§ط¬ط¹طھظ‡ ظ…ظ† ط§ظ„ط¥ط¯ط§ط±ط© âœ…", reportId: rep._id });
    }

    return res.status(400).json({ msg: "ظ†ظˆط¹ ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± ظ…ط¯ط¹ظˆظ… (post ط£ظˆ story ظپظ‚ط·)" });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط§ظ„ط¨ظ„ط§ط؛طŒ ط­ط§ظˆظ„ ظ…ط±ط© ط£ط®ط±ظ‰" });
  }
});

app.post("/api/posts/report/:id", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;
    const { reason, other } = req.body || {};

    if (!reason && !other) return res.status(400).json({ msg: "ظٹط¬ط¨ طھط­ط¯ظٹط¯ ط³ط¨ط¨ ظ„ظ„ط¥ط¨ظ„ط§ط؛" });

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± طµط§ظ„ط­" });
    }

    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const alreadyReported = (post.reports || []).some((r) => r.user && r.user.toString() === userId.toString());
    if (alreadyReported) return res.status(400).json({ msg: "ظ„ظ‚ط¯ ظ‚ظ…طھ ط¨ط§ظ„ط¥ط¨ظ„ط§ط؛ ط¹ظ† ظ‡ط°ط§ ط§ظ„ظ…ظ†ط´ظˆط± ظ…ظ† ظ‚ط¨ظ„" });

    const finalReason = reason === "other" ? "ط³ط¨ط¨ ط¢ط®ط±" : reason || "ط³ط¨ط¨ ط؛ظٹط± ظ…ط­ط¯ط¯";

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

    return res.json({ msg: "طھظ… ط¥ط±ط³ط§ظ„ ط§ظ„ط¥ط¨ظ„ط§ط؛طŒ ط³ظٹطھظ… ظ…ط±ط§ط¬ط¹طھظ‡ ظ…ظ† ط§ظ„ط¥ط¯ط§ط±ط© âœ…", reportsCount: post.reports.length });
  } catch (err) {
    console.error("POST /api/posts/report/:id error:", err);
    return res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ… ط£ط«ظ†ط§ط، ط¥ط±ط³ط§ظ„ ط§ظ„ط¥ط¨ظ„ط§ط؛" });
  }
});

app.post("/api/posts/:id/save", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.userId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

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
      msg: saved ? "طھظ… ط­ظپط¸ ط§ظ„ظ…ظ†ط´ظˆط±" : "طھظ… ط¥ظ„ط؛ط§ط، ط­ظپط¸ ط§ظ„ظ…ظ†ط´ظˆط±",
      saved,
      savedCount: user.savedPosts.length,
    });
  } catch (err) {
    console.error("ERROR in /api/posts/:id/save:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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

    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
      return res.status(400).json({ msg: "ظٹط¬ط¨ ط£ظ† ظٹط­طھظˆظٹ ط§ظ„ظ…ظ†ط´ظˆط± ط¹ظ„ظ‰ ظ†طµ ط£ظˆ طµظˆط±ط© ط£ظˆ ظپظٹط¯ظٹظˆ ط£ظˆ ط±ط§ط¨ط·" });
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

    res.json({ msg: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ…ظ†ط´ظˆط±", post: newPost });
  } catch (err) {
    console.error("ERROR in /api/posts:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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

    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (post.user && post.user.isPrivate) {
      const ownerId = post.user._id?.toString?.();
      const viewerIdStr = viewerId ? viewerId.toString() : null;
      const isOwner = viewerIdStr && ownerId === viewerIdStr;

      const followers = ensureArray(post.user.followers);
      const isFollower = viewerIdStr && followers.some((id) => id.toString() === viewerIdStr);

      if (!viewerIdStr || (!isOwner && !viewerIsAdmin && !isFollower)) {
        return res.status(403).json({ msg: "ظ‡ط°ط§ ط§ظ„ط­ط³ط§ط¨ ط®ط§طµطŒ ظٹظ…ظƒظ† ظ„ظ„ظ…طھط§ط¨ط¹ظٹظ† ظپظ‚ط· ط±ط¤ظٹط© ظ…ظ†ط´ظˆط±ط§طھظ‡" });
      }
    }

    if (
      post.privacy === "private" &&
      (!viewerId || (post.user._id.toString() !== viewerId.toString() && !viewerIsAdmin))
    ) {
      return res.status(403).json({ msg: "ظ‡ط°ط§ ط§ظ„ظ…ظ†ط´ظˆط± ط®ط§طµ" });
    }

    res.json(post);
  } catch (err) {
    console.error("ERROR in GET /api/posts/:id:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
    return res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط§ظ„ط¨ط­ط«" });
  }
});

app.put("/api/posts/:id", authMiddleware, upload.single("media"), async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (String(post.user) !== String(req.userId)) {
      return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ طھط¹ط¯ظٹظ„ ظ…ظ†ط´ظˆط± ط´ط®طµ ط¢ط®ط±" });
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
      return res.status(400).json({ msg: "ظٹط¬ط¨ ط£ظ† ظٹط­طھظˆظٹ ط§ظ„ظ…ظ†ط´ظˆط± ط¹ظ„ظ‰ ظ†طµ ط£ظˆ طµظˆط±ط© ط£ظˆ ظپظٹط¯ظٹظˆ ط£ظˆ ط±ط§ط¨ط·" });
    }

    await post.save();
    await post.populate("user", "username fullName email avatar isPrivate followers");

    res.json({ msg: "طھظ… طھط¹ط¯ظٹظ„ ط§ظ„ظ…ظ†ط´ظˆط±", post });
  } catch (err) {
    console.error("ERROR in PUT /api/posts/:id:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

app.post("/api/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

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
      msg: liked ? "طھظ… ط¥ط¶ط§ظپط© ط¥ط¹ط¬ط§ط¨" : "طھظ… ط¥ط²ط§ظ„ط© ط§ظ„ط¥ط¹ط¬ط§ط¨",
      liked,
      likesCount: post.likes.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

app.post("/api/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    const trimmed = text?.trim();
    if (!trimmed) return res.status(400).json({ msg: "ظ†طµ ط§ظ„طھط¹ظ„ظٹظ‚ ظ…ط·ظ„ظˆط¨" });

    const post = await Post.findById(req.params.id).populate("comments.user", "username fullName avatar");
    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const comment = { text: trimmed, user: req.userId, createdAt: new Date() };
    post.comments.push(comment);
    await post.save();
    await post.populate("comments.user", "username fullName avatar");

    const lastComment = post.comments[post.comments.length - 1];

    res.json({
      msg: "طھظ… ط¥ط¶ط§ظپط© ط§ظ„طھط¹ظ„ظٹظ‚",
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
    res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

app.put("/api/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { text } = req.body;
    const trimmed = text?.trim();
    if (!trimmed) return res.status(400).json({ msg: "ظ†طµ ط§ظ„طھط¹ظ„ظٹظ‚ ظ…ط·ظ„ظˆط¨" });

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± طµط§ظ„ط­" });
    }

    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ msg: "ط§ظ„طھط¹ظ„ظٹظ‚ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const userId = req.userId.toString();
    const isOwner = comment.user && comment.user.toString() === userId;
    if (!isOwner) return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ طھط¹ط¯ظٹظ„ ظ‡ط°ط§ ط§ظ„طھط¹ظ„ظٹظ‚" });

    comment.text = trimmed;
    await post.save();

    return res.json({
      msg: "طھظ… طھط¹ط¯ظٹظ„ ط§ظ„طھط¹ظ„ظٹظ‚",
      comment: { _id: comment._id, text: comment.text, createdAt: comment.createdAt },
    });
  } catch (err) {
    console.error("ERROR update comment:", err);
    return res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

app.delete("/api/posts/:postId/comments/:commentId", authMiddleware, async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    let post;
    try {
      post = await Post.findById(postId);
    } catch {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظپ ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± طµط§ظ„ط­" });
    }

    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ msg: "ط§ظ„طھط¹ظ„ظٹظ‚ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    const userId = req.userId.toString();
    const isCommentOwner = comment.user && comment.user.toString() === userId;
    const isPostOwner = post.user && post.user.toString() === userId;

    if (!isCommentOwner && !isPostOwner) return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ ط­ط°ظپ ظ‡ط°ط§ ط§ظ„طھط¹ظ„ظٹظ‚" });

    comment.deleteOne();
    await post.save();

    return res.json({ msg: "طھظ… ط­ط°ظپ ط§ظ„طھط¹ظ„ظٹظ‚", commentsCount: post.comments.length });
  } catch (err) {
    console.error("ERROR delete comment:", err);
    return res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
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
      console.error("â‌Œ invalid postId:", e);
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± طµط§ظ„ط­" });
    }

    if (!post) return res.status(404).json({ msg: "ط§ظ„ظ…ظ†ط´ظˆط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });
    if (!post.user) return res.status(403).json({ msg: "ظ„ط§ ظٹظ…ظƒظ† ط­ط°ظپ ظ‡ط°ط§ ط§ظ„ظ…ظ†ط´ظˆط± (ظ…ط§ظ„ظƒ ط؛ظٹط± ظ…ط¹ط±ظˆظپ)" });

    if (post.user.toString() !== userId.toString()) {
      return res.status(403).json({ msg: "ط؛ظٹط± ظ…ط³ظ…ظˆط­ ط­ط°ظپ ظ…ظ†ط´ظˆط± ط´ط®طµ ط¢ط®ط±" });
    }

    await post.deleteOne();
    return res.json({ msg: "طھظ… ط­ط°ظپ ط§ظ„ظ…ظ†ط´ظˆط±" });
  } catch (err) {
    console.error("ERROR in DELETE /api/posts/:id", err);
    return res.status(500).json({ msg: "ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…" });
  }
});

// ================== طھط­ظˆظٹظ„ ط­ط³ط§ط¨ظƒ ط¥ظ„ظ‰ ظ…ط´ط±ظپ ==================
app.get("/make-me-admin", async (req, res) => {
  try {
    const email = "ahmadhjhmod4@gmail.com";

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯", email });

    user.isAdmin = true;
    await user.save();

    res.json({
      msg: "طھظ… طھط­ظˆظٹظ„ ظ‡ط°ط§ ط§ظ„ط­ط³ط§ط¨ ط¥ظ„ظ‰ ظ…ط´ط±ظپ (Admin) ط¨ظ†ط¬ط§ط­ âœ…",
      email: user.email,
      isAdmin: user.isAdmin,
    });
  } catch (err) {
    console.error("make-me-admin error:", err);
    res.status(500).json({ msg: "ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ط¹ظ„ ط§ظ„ط­ط³ط§ط¨ ظ…ط´ط±ظپط§ظ‹" });
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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ط¨ظ„ط§ط؛ط§طھ" });
  }
});

app.post("/api/admin/reports/:id/accept", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± طµط§ظ„ط­" });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ msg: "ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (report.status !== "pending") {
      return res.status(400).json({ msg: "طھظ…طھ ظ…ط¹ط§ظ„ط¬ط© ظ‡ط°ط§ ط§ظ„ط¨ظ„ط§ط؛ ظ…ط³ط¨ظ‚ط§ظ‹" });
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

    res.json({ msg: "طھظ… ظ‚ط¨ظˆظ„ ط§ظ„ط¨ظ„ط§ط؛ ظˆظ…ط¹ط§ظ„ط¬ط© ط§ظ„ظ…ط­طھظˆظ‰", report });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/accept error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ظ‚ط¨ظˆظ„ ط§ظ„ط¨ظ„ط§ط؛" });
  }
});

app.post("/api/admin/reports/:id/reject", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const reportId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(reportId)) {
      return res.status(400).json({ msg: "ظ…ط¹ط±ظ‘ظپ ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± طµط§ظ„ط­" });
    }

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ msg: "ط§ظ„ط¨ظ„ط§ط؛ ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (report.status !== "pending") {
      return res.status(400).json({ msg: "طھظ…طھ ظ…ط¹ط§ظ„ط¬ط© ظ‡ط°ط§ ط§ظ„ط¨ظ„ط§ط؛ ظ…ط³ط¨ظ‚ط§ظ‹" });
    }

    report.status = "rejected";
    await report.save();

    res.json({ msg: "طھظ… ط±ظپط¶ ط§ظ„ط¨ظ„ط§ط؛", report });
  } catch (err) {
    console.error("POST /api/admin/reports/:id/reject error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط±ظپط¶ ط§ظ„ط¨ظ„ط§ط؛" });
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
        const reason = embeddedReport.reason || "ظ…ط­طھظˆظ‰ ط؛ظٹط± ظ„ط§ط¦ظ‚";
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

    res.json({ msg: "طھظ…طھ ظ‡ط¬ط±ط© ط¨ظ„ط§ط؛ط§طھ ط§ظ„ط³طھظˆط±ظٹ ط¨ظ†ط¬ط§ط­", created: createdCount, skipped: skippedCount });
  } catch (err) {
    console.error("migrate-story-reports error:", err);
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ظ‡ط¬ط±ط© ط¨ظ„ط§ط؛ط§طھ ط§ظ„ط³طھظˆط±ظٹ" });
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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، ط¬ظ„ط¨ ط§ظ„ظ…ط³طھط®ط¯ظ…ظٹظ†" });
  }
});

app.post("/api/admin/users/:id/make-admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (user.isAdmin) return res.status(400).json({ msg: "ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ…ط´ط±ظپ ط¨ط§ظ„ظپط¹ظ„" });

    user.isAdmin = true;
    await user.save();

    res.json({
      msg: "طھظ… طھط±ظ‚ظٹط© ط§ظ„ظ…ط³طھط®ط¯ظ… ط¥ظ„ظ‰ ظ…ط´ط±ظپ âœ…",
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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط±ظ‚ظٹط© ط§ظ„ظ…ط³طھط®ط¯ظ…" });
  }
});

app.post("/api/admin/users/:id/remove-admin", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    const currentUserId = req.userId;

    if (String(targetId) === String(currentUserId)) {
      return res.status(400).json({ msg: "ظ„ط§ ظٹظ…ظƒظ†ظƒ ط¥ط²ط§ظ„ط© طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط´ط±ظپ ط¹ظ† ظ†ظپط³ظƒ" });
    }

    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ msg: "ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯" });

    if (!user.isAdmin) return res.status(400).json({ msg: "ظ‡ط°ط§ ط§ظ„ظ…ط³طھط®ط¯ظ… ظ„ظٹط³ ظ…ط´ط±ظپط§ظ‹ ط£طµظ„ط§ظ‹" });

    user.isAdmin = false;
    await user.save();

    res.json({
      msg: "طھظ… ط¥ط²ط§ظ„ط© طµظ„ط§ط­ظٹط© ط§ظ„ظ…ط´ط±ظپ ط¹ظ† ط§ظ„ظ…ط³طھط®ط¯ظ…",
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
    res.status(500).json({ msg: "ط­ط¯ط« ط®ط·ط£ ط£ط«ظ†ط§ط، طھط¹ط¯ظٹظ„ طµظ„ط§ط­ظٹط§طھ ط§ظ„ظ…ط³طھط®ط¯ظ…" });
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



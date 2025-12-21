// models/Conversation.js
import mongoose from "mongoose";

const { Schema } = mongoose;

// ===== Member sub-schema (Telegram-like roles) =====
const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // owner/admin/member
    role: { type: String, enum: ["owner", "admin", "member"], default: "member", index: true },
    // joined/pending (للـ public join request مستقبلاً)
    status: { type: String, enum: ["joined", "pending"], default: "joined", index: true },
    joinedAt: { type: Date, default: Date.now },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

const conversationSchema = new Schema(
  {
    // المشاركون في المحادثة (لـ chat/group/channel) — للحفاظ على التوافق مع الكود القديم
    participants: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],

    // أعضاء الغرفة مع أدوارهم (الجديد)
    // ملاحظة: أغلب الكود القديم سيستمر باستخدام participants،
    // لكن members يسمح لنا بتطبيق صلاحيات مثل Telegram بدون كسر القديم.
    members: { type: [memberSchema], default: [] },

    // ====== Space fields (Telegram-like) ======
    // chat | group | channel
    type: {
      type: String,
      enum: ["chat", "group", "channel"],
      default: "chat",
      index: true,
    },

    // اسم المجموعة/القناة
    title: { type: String, default: "", trim: true, maxlength: 120, index: true },

    // نبذة
    about: { type: String, default: "", trim: true, maxlength: 400 },

    // صورة المجموعة/القناة (مسار/URL)
    avatar: { type: String, default: "", trim: true },

    // public | private
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true,
    },

    // username للعام (t.me/username) — للمجموعات/القنوات
    username: { type: String, default: "", trim: true, lowercase: true, index: true },

    // دعوة خاصة (للـ private)
    inviteCode: { type: String, default: "", trim: true, index: true },

    // توافق مع الكود القديم
    isGroup: { type: Boolean, default: false, index: true },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },

    admins: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // صلاحيات بسيطة قابلة للتوسع
    permissions: {
      // من يرسل؟ (channels عادة admins)
      canSend: { type: String, enum: ["all", "admins"], default: "all" },
      // من يضيف أعضاء؟
      canAddMembers: { type: String, enum: ["all", "admins"], default: "admins" },
      // من يغيّر المعلومات؟
      canEditInfo: { type: String, enum: ["owner", "admins"], default: "admins" },
    },

    // للحذف من طرف واحد
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // آخر رسالة
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message", default: null, index: true },

    // وقت آخر رسالة
    lastMessageAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// ===== Indexes for speed =====
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ type: 1, lastMessageAt: -1 });
conversationSchema.index({ username: 1 }, { unique: false }); // uniqueness enforced in server for now
conversationSchema.index({ title: "text", about: "text" });
conversationSchema.index({ "members.user": 1, lastMessageAt: -1 });

// ===== Helpers =====
function uniqObjectIds(arr) {
  if (!Array.isArray(arr)) return [];
  const uniq = Array.from(new Set(arr.map((id) => String(id)))).filter(Boolean);
  return uniq.map((id) => new mongoose.Types.ObjectId(id));
}

function normalizeMembers(members) {
  if (!Array.isArray(members)) return [];
  const map = new Map();
  for (const m of members) {
    if (!m || !m.user) continue;
    const key = String(m.user);
    if (!key) continue;
    const existing = map.get(key);
    // لو في تكرار، خذ الأعلى صلاحية (owner > admin > member) وحافظ على joinedAt الأقدم
    if (!existing) {
      map.set(key, {
        user: new mongoose.Types.ObjectId(key),
        role: m.role || "member",
        status: m.status || "joined",
        joinedAt: m.joinedAt || Date.now(),
        addedBy: m.addedBy || null,
      });
    } else {
      const rank = (r) => (r === "owner" ? 3 : r === "admin" ? 2 : 1);
      const bestRole = rank(m.role) > rank(existing.role) ? m.role : existing.role;
      map.set(key, {
        ...existing,
        role: bestRole || existing.role,
        status: existing.status || m.status || "joined",
        joinedAt: existing.joinedAt || m.joinedAt || Date.now(),
        addedBy: existing.addedBy || m.addedBy || null,
      });
    }
  }
  return Array.from(map.values());
}

// ===== Normalize before save =====
/**
 * ملاحظة مهمة:
 * - Mongoose يدعم نمطين للميدلوير: callback(next) أو Promise/throw
 * - لتفادي خطأ: next is not a function (عندما يعتبر Mongoose الميدلوير Promise-style)
 *   استخدمنا Promise-style (بدون next) بشكل آمن.
 */
conversationSchema.pre("save", function () {
  // Sync isGroup for backward-compatibility
  this.isGroup = this.type === "group" || this.type === "channel";

  // In channels: default posting is admins only (Telegram-like)
  if (this.type === "channel") {
    if (!this.permissions) this.permissions = {};
    // لا نكسر أي إعداد موجود يدويًا، لكن نخلي الافتراضي "admins"
    if (!this.permissions.canSend) this.permissions.canSend = "admins";
    if (this.permissions.canSend === "all") this.permissions.canSend = "admins";
  }

  // Ensure owner/admins
  if (!this.owner && this.createdBy) this.owner = this.createdBy;
  if (this.owner) {
    const o = String(this.owner);
    const a = Array.isArray(this.admins) ? this.admins.map((x) => String(x)) : [];
    if (!a.includes(o)) this.admins = [...(this.admins || []), this.owner];
  }

  // uniq admins
  if (Array.isArray(this.admins)) {
    this.admins = uniqObjectIds(this.admins);
  }

  // members normalization + role sync
  this.members = normalizeMembers(this.members);

  // ensure owner/admin/member presence in members
  const ownerId = this.owner ? String(this.owner) : "";
  const adminIds = Array.isArray(this.admins) ? this.admins.map((x) => String(x)) : [];

  const memberMap = new Map(this.members.map((m) => [String(m.user), m]));
  // ensure participants exist too (legacy)
  const legacyParticipants = Array.isArray(this.participants) ? this.participants.map((x) => String(x)) : [];

  // Seed members from participants if members empty
  if (this.members.length === 0 && legacyParticipants.length > 0) {
    for (const pid of legacyParticipants) {
      memberMap.set(pid, {
        user: new mongoose.Types.ObjectId(pid),
        role: "member",
        status: "joined",
        joinedAt: Date.now(),
        addedBy: this.createdBy || null,
      });
    }
  }

  // ensure owner in map
  if (ownerId) {
    const existing = memberMap.get(ownerId);
    memberMap.set(ownerId, {
      user: new mongoose.Types.ObjectId(ownerId),
      role: "owner",
      status: "joined",
      joinedAt: existing?.joinedAt || Date.now(),
      addedBy: existing?.addedBy || this.createdBy || null,
    });
  }

  // ensure admins in map
  for (const aid of adminIds) {
    const existing = memberMap.get(aid);
    // owner wins
    const role = ownerId && aid === ownerId ? "owner" : "admin";
    memberMap.set(aid, {
      user: new mongoose.Types.ObjectId(aid),
      role,
      status: "joined",
      joinedAt: existing?.joinedAt || Date.now(),
      addedBy: existing?.addedBy || this.createdBy || null,
    });
  }

  // ensure all members exist in participants
  const finalMembers = normalizeMembers(Array.from(memberMap.values()));
  this.members = finalMembers;

  // participants should be unique list of members.user (keeps legacy endpoints working)
  this.participants = uniqObjectIds(finalMembers.map((m) => m.user));

  // normalize username
  if (typeof this.username === "string") {
    this.username = this.username.trim().toLowerCase().replace(/\s+/g, "");
  }
});

// ===== Instance methods =====
conversationSchema.methods.getMemberRole = function (userId) {
  const uid = String(userId || "");
  if (!uid) return null;
  const m = (this.members || []).find((x) => String(x.user) === uid);
  return m ? m.role : null;
};

conversationSchema.methods.canUserPost = function (userId) {
  const uid = String(userId || "");
  if (!uid) return false;

  // chats/groups: default allow all participants unless permissions says admins
  const canSend = this.permissions?.canSend || "all";
  if (canSend === "all") return true;

  const role = this.getMemberRole(uid);
  return role === "owner" || role === "admin";
};

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;

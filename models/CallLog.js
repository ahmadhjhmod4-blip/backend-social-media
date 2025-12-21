// models/CallLog.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const callLogSchema = new Schema(
  {
    callId: { type: String, index: true, required: true }, // نفس callId المستخدم بالـ signaling
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true, required: true }],
    caller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    callee: { type: Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: ["audio", "video"], default: "audio" },

    // status life-cycle:
    // ringing -> accepted -> ended
    // ringing -> rejected/cancelled/busy/missed
    status: {
      type: String,
      enum: ["ringing", "accepted", "ended", "rejected", "cancelled", "busy", "missed"],
      default: "ringing",
      index: true,
    },

    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0 },

    // حذف لكل مستخدم (حتى ما نحذف عند الطرف الثاني)
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
  },
  { timestamps: true }
);

// منع تكرار callId لنفس الاتصال
callLogSchema.index({ callId: 1 }, { unique: true });

export default mongoose.model("CallLog", callLogSchema);

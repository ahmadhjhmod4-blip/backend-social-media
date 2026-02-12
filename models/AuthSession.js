import mongoose from "mongoose";

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    ip: {
      type: String,
      default: "",
    },
    platform: {
      type: String,
      default: "",
    },
    appVersion: {
      type: String,
      default: "",
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

const AuthSession =
  mongoose.models.AuthSession || mongoose.model("AuthSession", authSessionSchema);

export default AuthSession;

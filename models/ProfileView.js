import mongoose from "mongoose";

const profileViewSchema = new mongoose.Schema(
  {
    profileUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    viewerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      index: true,
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

profileViewSchema.index(
  { profileUserId: 1, viewerUserId: 1, dayKey: 1 },
  { unique: true },
);

const ProfileView =
  mongoose.models.ProfileView || mongoose.model("ProfileView", profileViewSchema);

export default ProfileView;

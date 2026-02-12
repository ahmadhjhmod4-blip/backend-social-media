import mongoose from "mongoose";

const followEventSchema = new mongoose.Schema(
  {
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["follow", "unfollow"],
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

const FollowEvent =
  mongoose.models.FollowEvent || mongoose.model("FollowEvent", followEventSchema);

export default FollowEvent;

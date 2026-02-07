import mongoose from "mongoose";

const notificationTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true,
    },
    tokens: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

const NotificationToken = mongoose.model("NotificationToken", notificationTokenSchema);

export default NotificationToken;

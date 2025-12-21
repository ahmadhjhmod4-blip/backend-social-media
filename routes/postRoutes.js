// routes/postRoutes.js
import express from "express";
import Post from "../models/Post.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

/**
 * 🛡️ الإبلاغ عن منشور
 * POST /api/posts/report/:id
 * body: { reason, other }
 */
router.post("/report/:id", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id; // من التوكن
    const { reason, other } = req.body || {};

    // لازم يكون فيه سبب أو وصف
    if (!reason && !other) {
      return res.status(400).json({ msg: "يجب تحديد سبب للإبلاغ" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: "المنشور غير موجود" });
    }

    // منع الإبلاغ المكرر من نفس المستخدم لنفس المنشور
    const alreadyReported = (post.reports || []).some(
      (r) => r.user && r.user.toString() === userId.toString()
    );

    if (alreadyReported) {
      return res
        .status(400)
        .json({ msg: "لقد قمت بالإبلاغ عن هذا المنشور من قبل" });
    }

    const finalReason =
      reason === "other"
        ? "سبب آخر"
        : reason || "سبب غير محدد";

    post.reports.push({
      user: userId,
      reason: finalReason,
      other: other || "",
    });

    await post.save();

    return res.json({
      msg: "تم إرسال الإبلاغ، سيتم مراجعته من الإدارة ✅",
      reportsCount: post.reports.length,
    });
  } catch (err) {
    console.error("POST /api/posts/report/:id error:", err);
    res.status(500).json({ msg: "خطأ في السيرفر أثناء إرسال الإبلاغ" });
  }
});

/**
 * 🔥 حذف منشور
 * DELETE /api/posts/:id
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id; // جاي من التوكن في authMiddleware

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ msg: "المنشور غير موجود" });
    }

    // يسمح فقط لصاحب المنشور
    if (post.user.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ msg: "لا تملك صلاحية حذف هذا المنشور" });
    }

    await Post.deleteOne({ _id: postId });

    return res.json({ msg: "تم حذف المنشور بنجاح 🗑️" });
  } catch (err) {
    console.error("DELETE /api/posts/:id error:", err);
    res.status(500).json({ msg: "خطأ في السيرفر أثناء حذف المنشور" });
  }
});

export default router;

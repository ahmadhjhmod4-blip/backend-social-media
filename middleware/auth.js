import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "DEV_SECRET_CHANGE_ME";

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"]; // Bearer token

  if (!authHeader) {
    return res.status(401).json({ msg: "لا يوجد توكن في الهيدر" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ msg: "تنسيق التوكن غير صالح" });
  }
  const token = parts[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id || decoded.userId || decoded._id;
    req.userId = userId;
    req.user = { id: userId };
    next();
  } catch (err) {
    return res.status(403).json({ msg: "توكن منتهي أو غير صالح" });
  }
};

export default authMiddleware;

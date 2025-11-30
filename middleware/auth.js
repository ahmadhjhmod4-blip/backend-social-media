import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"]; // Bearer token

  if (!authHeader) {
    return res.status(401).json({ msg: "لا يوجد توكن في الهيدر" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "توكن غير صالح" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id };
    next();
  } catch (err) {
    return res.status(403).json({ msg: "توكن منتهي أو غير صالح" });
  }
};

export default authMiddleware;

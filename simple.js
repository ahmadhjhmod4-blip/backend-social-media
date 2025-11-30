// simple.js  (اختبار فقط)

import express from "express";

const app = express();

app.get("/api/test", (req, res) => {
  res.json({ msg: "API working" });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Simple server on port ${PORT}`);
});

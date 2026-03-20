const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const adminApi = require("./admin_api");
const { printRootCredentials } = require("./users");

const router = express.Router();
router.use(bodyParser.json());

// Serve admin panel
router.get("/", (req, res) => {
  printRootCredentials();
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Safe admin function caller
router.post("/call", async (req, res) => {
  const { functionName, args } = req.body;
  const func = adminApi[functionName];
  if (!func) return res.status(400).json({ error: "Function not allowed" });

  try {
    console.log(`[admin/call] ${new Date().toISOString()} function=${functionName}`);
    const result = await func(...args);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

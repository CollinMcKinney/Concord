// server.js
const express = require("express");
const bodyParser = require("body-parser");
const http = require("http");
const { initStorage, saveState, loadState, startAutoSaveDynamic } = require("./datastore");
const { initializeRoot } = require("./users");
const { attachToServer, broadcast } = require("./runelite_router"); // WS server module
const adminRouter = require("./admin_router");
require("./discord_bot"); // auto-start Discord bot

// --- Express setup ---
const app = express();
app.use(bodyParser.json());

// Example admin route to broadcast a message to all RuneLite clients
app.use("/admin", adminRouter);

// Optional: simple broadcast endpoint for testing
app.post("/broadcast", (req, res) => {
  const { event, data } = req.body;
  if (!event || !data) return res.status(400).json({ error: "Missing event or data" });

  broadcast(event, data);
  return res.json({ success: true, event, data });
});

// --- Create HTTP server for both Express and WebSocket ---
const server = http.createServer(app);

// --- Attach RuneLite WebSocket server ---
const wss = attachToServer(server);

// --- Start services and listen ---
async function start() {
  await initStorage();
  await loadState();
  await initializeRoot();
  startAutoSaveDynamic();
  await saveState();

  server.listen(process.env.API_PORT, () => {
    console.log(`Concord API + RuneLite WS running at http://localhost:${process.env.API_PORT}`);
  });
}

start();
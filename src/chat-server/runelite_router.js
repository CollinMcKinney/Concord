const WebSocket = require("ws");
const runeliteApi = require("./runelite-api");

// WebSocket server listens on a port (or attach to your existing HTTP server)
const wss = new WebSocket.Server({ port: process.env.API_PORT });

console.log(`RuneLite WebSocket server running on ws://localhost:${process.env.API_PORT}`);

// Keep track of connected clients
const clients = new Set();

wss.on("connection", (ws, req) => {
  // Optionally get client IP
  const clientIp = req.socket.remoteAddress;
  console.log(`RuneLite client connected from ${clientIp}`);

  clients.add(ws);

  ws.on("message", async (rawMessage) => {
    try {
      const { functionName, args } = JSON.parse(rawMessage);

      // Only call allowed functions from runelite-api
      const func = runeliteApi[functionName];
      if (!func) {
        ws.send(JSON.stringify({ error: "Function not allowed" }));
        return;
      }

      // Call the function
      const result = await func(...args);

      // Send back the result
      ws.send(JSON.stringify({ result }));
    } catch (err) {
      console.error("RuneLite WS error:", err);
      ws.send(JSON.stringify({ error: err.message }));
    }
  });

  ws.on("close", () => {
    console.log(`RuneLite client disconnected: ${clientIp}`);
    clients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error(`RuneLite WS error from ${clientIp}:`, err);
  });
});

// Optional helper: broadcast to all connected clients
function broadcast(event, data) {
  const payload = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

module.exports = { wss, broadcast };
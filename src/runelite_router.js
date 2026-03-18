// runelite_router.js
const WebSocket = require("ws");
const runeliteApi = require("./runelite_api");

const clients = new Set();

function attachToServer(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`RuneLite client connected from ${clientIp}`);
    clients.add(ws);

    ws.on("message", async (rawMessage) => {
      try {
        const { functionName, args } = JSON.parse(rawMessage);
        const func = runeliteApi[functionName];
        if (!func) return ws.send(JSON.stringify({ error: "Function not allowed" }));

        const result = await func(...args);
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

  return wss;
}

function broadcast(event, data) {
  const payload = JSON.stringify({ event, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

module.exports = { attachToServer, broadcast };
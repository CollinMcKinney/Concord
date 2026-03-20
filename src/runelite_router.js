// runelite_router.js
const WebSocket = require("ws");
const { Packet, addPacket } = require("./packet");

// Keep track of connected RuneLite clients
const clients = new Set();

/**
 * Attach the RuneLite WebSocket server to an existing HTTP server.
 * @param {http.Server} httpServer
 */
function attachToServer(httpServer) {
  const webSocketServer = new WebSocket.Server({ server: httpServer });

  webSocketServer.on("connection", (webSocket, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`RuneLite client connected from ${clientIp}`);
    clients.add(webSocket);

    webSocket.on("message", async (rawPacket) => {
      try {
        console.log(rawPacket); // rawPacket is empty?
        // Convert incoming JSON string into Packet
        const packet = Packet.fromJson(rawPacket); // TODO: empty message coming back from fromJson
        console.log(packet.data.body);

        // Add packet to datastore (emits packetAdded event)
        const success = await addPacket(packet);
        console.log(packet.data.body);
        if (!success) {
          console.warn("Failed to add packet from RuneLite client:", packet.serialize());
          return;
        }

        console.log(`Received and stored packet from ${packet.actor.name}: "${packet.data.body}"`);
      } catch (err) {
        console.error("RuneLite WS error processing packet:", err);
        webSocket.send(JSON.stringify({ error: err.message }));
      }
    });

    webSocket.on("close", () => {
      console.log(`RuneLite client disconnected: ${clientIp}`);
      clients.delete(webSocket);
    });

    webSocket.on("error", (err) => {
      console.error(`RuneLite WS error from ${clientIp}:`, err);
    });
  });

  return webSocketServer;
}

/**
 * Broadcast a payload to all connected RuneLite clients
 * @param {string} event - event name
 * @param {object} data - payload
 */
function broadcast(event, data) {
  const  _data = data;

  const payload = JSON.stringify({ event, data });

  
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      //console.log(`Concord → RuneLite: ${payload.data.body}`);
    }
  }
}

module.exports = { attachToServer, broadcast };
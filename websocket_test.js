const WebSocket = require("ws");
const readline = require("readline");

const WS_URL = `ws://localhost:${process.env.API_PORT || 8080}`;

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log(`Connected to RuneLite WebSocket server at ${WS_URL}\n`);
    promptFunctionCall(ws);
  }); 

  ws.on("message", (data) => {
    try {
      const response = JSON.parse(data.toString());
      console.log("\nServer response:", response);
      promptFunctionCall(ws);
    } catch (err) {
      console.error("Error parsing server message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Disconnected from server. Retrying in 2s...");
    setTimeout(connect, 2000);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
    ws.close();
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function promptFunctionCall(ws) {
  rl.question(
    "\nEnter function name and args as JSON (e.g. {\"functionName\":\"exampleFunction\",\"args\":[\"arg1\",123]}):\n> ",
    (input) => {
      try {
        const request = JSON.parse(input);
        if (!request.functionName || !Array.isArray(request.args)) {
          console.log("Invalid input. Make sure to include functionName and args array.");
        } else if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(request));
        } else {
          console.log("WebSocket not open. Waiting to reconnect...");
        }
      } catch (err) {
        console.log("Invalid JSON input:", err.message);
      }
    }
  );
}

// Start connection
connect();
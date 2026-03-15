// server.js
const { initStorage, saveState, loadState } = require("./datastore");
const auth = require("./auth");
const users = require("./users");
const messages = require("./messages");
const notifications = require("./notification");

async function start() {
  await initStorage();
  console.log("Server ready!");

  // Example usage:
  // const session = await auth.AuthService.authenticate({ userId, token });
  // await messages.addMessage(userId, session, { content: "Hello!" });
  // await notifications.addNotification(userId, session, { type: notifications.NotificationType.EVENT, content: "Clan event tonight!" });

  // Save / load full state
  // const state = await saveState();
  // await loadState(state);
}

start();
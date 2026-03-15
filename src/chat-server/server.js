// server.js
const { initStorage, saveState, loadState, client } = require("./datastore");
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


  //await loadState(state);

  const root = await users.createUserInternal({ 
    osrs_name: "ROOT", 
    disc_name: "ROOT#0000", 
    forum_name: "ROOT", 
    role: users.Roles.ROOT, 
    hashedPass: users.hashToken("password") 
  });

  const sessionToken = await auth.AuthService.authenticate({ userId: root.id, hashedPass: root.hashedPass });
  console.log("Session token for ROOT user:", sessionToken);

  const verifiedUserId = await auth.AuthService.verifySession(root.id, sessionToken);
  console.log("Verified user ID from session token:", verifiedUserId);


  // Save / load full state
  //const state = await saveState();
}

start();
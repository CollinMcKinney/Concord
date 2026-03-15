// notification.js
const crypto = require("crypto");
const datastore = require("./datastore");
const { AuthService } = require("./auth");

const NotificationType = Object.freeze({
  ACHIEVEMENT: "achievement",
  EVENT: "event",
  SYSTEM: "system",
});

async function addNotification(actorId, actorSessionToken, notification) {
  const verified = await AuthService.verifySession(actorId, actorSessionToken);
  if (!verified) return false;

  const id = notification.id || crypto.randomUUID();
  const stored = {
    id,
    actorId,
    type: notification.type,
    content: notification.content,
    targetUsers: notification.targetUsers || [],
    timestamp: Date.now()
  };

  await datastore.set(`notification:${id}`, stored);
  await datastore.zAdd("notifications", { score: stored.timestamp, value: id });

  return true;
}

async function getNotifications(userId, limit = 50) {
  const ids = await datastore.zRange("notifications", -limit, -1);
  const notifications = [];

  for (const id of ids) {
    const notification = await datastore.get(`notification:${id}`);
    if (!notification) continue;

    if (notification.targetUsers.length === 0 || notification.targetUsers.includes(userId)) {
      notifications.push(notification);
    }
  }

  return notifications;
}

module.exports = { 
    NotificationType,
    addNotification, 
    getNotifications
};
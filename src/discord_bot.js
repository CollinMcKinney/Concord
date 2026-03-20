require('dotenv').config();
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');
const { Packet, packetEvents, addPacket } = require('./packet');
const { broadcast } = require('./runelite_router');

// ---------------- Discord Bot Setup ----------------
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const webhook = new WebhookClient({
  id: process.env.WEBHOOK_ID,
  token: process.env.WEBHOOK_TOKEN,
});

// ---------------- Discord → Concord ----------------
bot.on('messageCreate', async (discordMsg) => {
  if (discordMsg.author.bot) return;

  try {
    const attachments = [];

    // Uploaded files
    discordMsg.attachments.forEach(att => {
      const type = att.contentType?.startsWith('image') ? 'image'
                 : att.contentType?.startsWith('video') ? 'video'
                 : 'file';
      attachments.push({ type, url: att.url });
    });

    // URLs typed in message body
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = discordMsg.content.match(urlRegex) || [];
    urls.forEach(url => {
      if (!attachments.find(a => a.url === url)) {
        const ext = url.split('.').pop().toLowerCase();
        const type = ['png','jpg','jpeg','gif','webp'].includes(ext) ? 'image'
                   : ['mp4','mov','webm'].includes(ext) ? 'video'
                   : 'link';
        attachments.push({ type, url });
      }
    });

    const packet = new Packet(
      discordMsg.author.id,
      discordMsg.content,
      { name: discordMsg.author.username },
      undefined,
      Date.now(),
      'discord',
      { attachments }
    );

    await addPacket(packet);

    console.log(`Discord → Concord: ${packet.data.body} (${attachments.length} attachments)`);

  } catch (err) {
    console.error('Failed to relay Discord message:', err);
  }
});

// ---------------- Concord → Discord + RuneLite ----------------
packetEvents.on('packetAdded', async (packetJson) => {
  console.log(packetJson)
  const packet = Packet.fromJson(packetJson);
  if (packet.deleted) return;

  // Always send to RuneLite clients
  broadcast('chat_message', packet);

  // Don't echo Discord-origin packets back to Discord
  if (packet.origin === 'discord') return;

  try {
    await webhook.send({
      content: packet.data.body,
      username: `User:${packet.actor.name}`,
    });
    console.log(`Concord → Discord: ${packet.data.body}`);
  } catch (err) {
    console.error('Webhook send failed:', err);
  }
});

// ---------------- Startup ----------------
async function startBot() {
  bot.once('clientReady', () => {
    console.log(`Bot logged in as ${bot.user.tag}`);
  });

  await bot.login(process.env.BOT_TOKEN).catch(console.error);
}

startBot();
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

// ---------------- Discord -> Concord ----------------
bot.on('messageCreate', async (discordMsg) => {
  if (discordMsg.author.bot) return;
  if (discordMsg.webhookId) return;
  if (bot.user && discordMsg.author.id === bot.user.id) return;

  try {
    const attachments = [];

    discordMsg.attachments.forEach(att => {
      const type = att.contentType?.startsWith('image') ? 'image'
                 : att.contentType?.startsWith('video') ? 'video'
                 : 'file';
      attachments.push({ type, url: att.url });
    });

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = discordMsg.content.match(urlRegex) || [];
    urls.forEach(url => {
      if (!attachments.find(a => a.url === url)) {
        const ext = url.split('.').pop().toLowerCase();
        const type = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'image'
                   : ['mp4', 'mov', 'webm'].includes(ext) ? 'video'
                   : 'link';
        attachments.push({ type, url });
      }
    });

    const packet = new Packet({
      type: 'chat.message',
      origin: 'discord',
      actor: {
        id: discordMsg.author.id,
        name: discordMsg.author.username,
      },
      data: {
        body: discordMsg.content,
        attachments,
      },
    });

    await addPacket(packet);
    console.log(`Discord -> Concord: ${packet.data.body} (${attachments.length} attachments)`);
  } catch (err) {
    console.error('Failed to relay Discord message:', err);
  }
});

// ---------------- Concord -> Discord + RuneLite ----------------
packetEvents.on('packetAdded', async (packetJson) => {
  const packet = Packet.fromJson(packetJson);
  if (packet.deleted) return;
  console.log(`[discord_bot.packetAdded] ${new Date().toISOString()} packetId=${packet.id} origin=${packet.origin} body=${JSON.stringify(packet.data.body)}`);

  broadcast(packet);

  if (packet.type !== 'chat.message') return;
  if (String(packet.origin).toLowerCase() === 'discord') return;

  try {
    console.log(`[discord_bot.webhookSend] ${new Date().toISOString()} packetId=${packet.id}`);
    await webhook.send({
      content: packet.data.body,
      username: `${packet.actor.name}`,
    });
    console.log(`Concord -> Discord: ${packet.data.body}`);
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

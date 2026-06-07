import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { REST } from '@discordjs/rest';
import { loadCommands, registerCommands } from './handlers/commandLoader.js';
import { loadEvents } from './handlers/eventLoader.js';
import { GameScheduler } from './handlers/gameScheduler.js';
import { ConfigService } from './services/configService.js';

// ─── Validate environment ──────────────────────────────────────────────────────
if (!process.env.DISCORD_TOKEN) {
  console.error('[ERROR] DISCORD_TOKEN is missing!');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.error('[ERROR] CLIENT_ID is missing!');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('[ERROR] MONGODB_URI is missing — data will not persist!');
  process.exit(1);
}

// ─── Create client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Attach shared state ───────────────────────────────────────────────────────
client.commands       = new Collection();
client.config         = new ConfigService();
client.scheduler      = new GameScheduler(client);
client.recentActivity = new Map();

client.rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// ─── Boot ──────────────────────────────────────────────────────────────────────
async function start() {
  try {
    console.log('[Takina] Connecting to MongoDB...');
    await client.config.connect();

    console.log('[Takina] Initializing booster module...');
    const { initBooster } = await import('./booster/index.js');
    await initBooster(client);

    console.log('[Takina] Loading commands...');
    await loadCommands(client);

    console.log('[Takina] Loading events...');
    await loadEvents(client);

    console.log('[Takina] Logging into Discord...');
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('[Takina] Fatal startup error:', err);
    process.exit(1);
  }
}

start();

export default client;

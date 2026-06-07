import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Routes } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  const files = (await fs.readdir(commandsPath)).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const mod = await import(pathToFileURL(filePath).href);
    const command = mod.default ?? mod;
    if (!command?.data || !command?.execute) {
      console.warn(`[CommandLoader] ${file} is missing data or execute, skipping.`);
      continue;
    }
    client.commands.set(command.data.name, command);
    console.log(`[CommandLoader] Loaded /${command.data.name}`);
  }
}

export async function registerCommands(client) {
  const body = client.commands.map(c => c.data.toJSON());
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    // Instant guild-level registration (dev)
    await client.rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
      { body }
    );
    console.log(`[CommandLoader] Registered ${body.length} commands to guild ${guildId}`);
  } else {
    // Global registration (up to 1 hour)
    await client.rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body }
    );
    console.log(`[CommandLoader] Registered ${body.length} commands globally`);
  }
}

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '../events');
  const files = (await fs.readdir(eventsPath)).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const filePath = path.join(eventsPath, file);
    const mod = await import(pathToFileURL(filePath).href);
    const event = mod.default ?? mod;

    if (!event?.name || !event?.execute) {
      console.warn(`[EventLoader] ${file} is missing name or execute, skipping.`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[EventLoader] Listening for ${event.name}`);
  }
}

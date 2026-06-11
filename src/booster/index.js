import { seedTemplates } from './services/settingsService.js';
import { log } from './utils/logger.js';

export async function initBooster(client) {
  await seedTemplates().catch(err => log('error', 'Booster', `Template seed failed: ${err.message}`));
  log('info', 'Booster', '✅ Booster module initialized');
}

export { handleBoosterInteraction } from './handlers/interactions.js';
export { handleBoostChange }        from './handlers/memberUpdate.js';

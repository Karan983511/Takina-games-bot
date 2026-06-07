import { seedTemplates } from './services/settingsService.js';
import { startScheduler } from './services/schedulerService.js';
import { startCleanupService } from './services/cleanupService.js';
import { startRotationService } from './services/rotationService.js';
import { log } from './utils/logger.js';

export async function initBooster(client) {
  await seedTemplates().catch(err =>
    log('error', 'Booster', `Template seed failed: ${err.message}`)
  );

  startCleanupService(client);
  startRotationService(client);
  startScheduler(client);

  log('info', 'Booster', '✅ Booster module initialized (cleanup + rotation + scheduler active)');
}

export { handleBoosterInteraction } from './handlers/interactions.js';
export { handleBoostChange, handleMemberLeave } from './handlers/memberUpdate.js';

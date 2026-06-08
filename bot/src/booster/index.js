import { startCleanupService } from './services/cleanupService.js';
import { startRotationService } from './services/rotationService.js';
import { log } from './utils/logger.js';

export async function initBooster(client) {
  startCleanupService(client);
  startRotationService(client);
  log('info', 'Booster', '✅ Booster module initialized (cleanup + rotation active)');
}

export { handleBoostChange, handleEligibilityLost, handleMemberLeave } from './handlers/memberUpdate.js';

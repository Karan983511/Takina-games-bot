import { startCleanupService, runGraceExpirySweep } from './services/cleanupService.js';
import { startRotationService } from './services/rotationService.js';
import { log } from './utils/logger.js';

export async function initBooster(client) {
  startCleanupService(client);
  startRotationService(client);

  // Restore grace period timers lost during downtime — must wait until guilds are cached
  if (client.isReady()) {
    runGraceExpirySweep(client).catch(err =>
      log('error', 'Booster', `Grace sweep failed: ${err.message}`)
    );
  } else {
    client.once('ready', () =>
      runGraceExpirySweep(client).catch(err =>
        log('error', 'Booster', `Grace sweep failed: ${err.message}`)
      )
    );
  }

  log('info', 'Booster', '✅ Booster module initialized (cleanup + rotation + grace sweep active)');
}

export { handleBoostChange, handleEligibilityLost, handleMemberLeave } from './handlers/memberUpdate.js';

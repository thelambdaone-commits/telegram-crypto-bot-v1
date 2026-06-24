import { App } from './bootstrap.js';
import { logger } from './shared/logger.js';

const app = new App();

// A failed startup must crash the process (exit 1) so the supervisor restarts a
// clean instance. Never let the rejection fall through to the unhandledRejection
// guard, which only logs — that would leave the bot "online" but not polling.
try {
  await app.start();
} catch (error) {
  logger.logError(error, { context: 'startup' });
  process.exit(1);
}

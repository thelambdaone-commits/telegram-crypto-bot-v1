import { registerConfirmActions, confirmFlow, getConfirmPendingCount } from './confirm-flow.js';
import { registerTextHandlers, inputPrompt, getPromptPendingCount } from './input-prompt.js';
import { createPaginator } from './paginate.js';

export { registerConfirmActions, confirmFlow, getConfirmPendingCount };
export { registerTextHandlers, inputPrompt, getPromptPendingCount };
export { createPaginator };

/**
 * Initialize all patterns — registers global actions and text handlers on the bot.
 * Call once during app startup.
 */
export function initPatterns(bot, sessions) {
  registerConfirmActions(bot);
  registerTextHandlers(bot, sessions);
}

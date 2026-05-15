/**
 * Utility functions for bot handlers
 * Re-exporting from centralized telegram utils
 */

export { 
  safeAnswerCbQuery, 
  safeEditMessage, 
  sendLoadingMessage, 
  deleteLoadingMessage,
  escapeMarkdown
} from '../shared/utils/telegram.js';

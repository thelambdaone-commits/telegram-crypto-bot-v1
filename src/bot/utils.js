/**
 * Utility functions for bot handlers
 */

/**
 * Safely answer callback query - ignores timeout errors
 */
export async function safeAnswerCbQuery(ctx, text) {
  try {
    await ctx.answerCbQuery(text)
  } catch (e) {
    // Ignore "query is too old" errors - they're harmless
    if (!e.message?.includes("query is too old")) {
      console.error("Error answering callback query:", e.message)
    }
  }
}

/**
 * Safely edit message - ignores "message not modified" errors
 */
export async function safeEditMessage(ctx, text, options = {}) {
  try {
    await ctx.editMessageText(text, options)
  } catch (e) {
    // Ignore "message is not modified" errors - they're harmless
    if (!e.message?.includes("message is not modified")) {
      throw e
    }
  }
}

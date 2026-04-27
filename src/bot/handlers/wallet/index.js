import { setupWalletCreate } from "./create.js"
import { setupWalletList } from "./list.js"
import { setupWalletDelete } from "./delete.js"
import { setupWalletTextInput } from "./text-input.js"

/**
 * Setup all wallet-related handlers
 */
export function setupWalletHandlers(bot, storage, walletService, sessions) {
  setupWalletCreate(bot, storage, walletService, sessions)
  setupWalletList(bot, storage, walletService)
  setupWalletDelete(bot, storage)
  setupWalletTextInput(bot, storage, walletService, sessions)
}

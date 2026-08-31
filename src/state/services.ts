/**
 * The long-lived stores.
 *
 * Both are backed by this browser's IndexedDB and hold no configuration, so
 * unlike the network clients they replaced there is nothing to re-point when a
 * setting changes — they are created once and used everywhere.
 */

import { AssetStore } from '../integrations/assets/store'
import { LocalWorkspace } from '../integrations/local/workspace'

export const assets = new AssetStore()
export const workspace = new LocalWorkspace()

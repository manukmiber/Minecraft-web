/**
 * Remembering which slot was open.
 *
 * With the saves living in this browser rather than in a repo, reopening the
 * app should land where you left off instead of on an empty project you then
 * have to go and find. Only the slot *name* is remembered — the model itself
 * always comes from the slot, so a restore can never resurrect a stale copy of
 * work that was saved somewhere else since.
 */

import { workspace } from '../../state/services'
import { useProject } from '../../state/project'

const LAST_SLOT_KEY = 'mmmmmmmmmmmmm.lastSlot'

export function rememberSlot(slot: string): void {
  try {
    localStorage.setItem(LAST_SLOT_KEY, slot)
  } catch {
    // Private mode or a storage-blocking setting; restoring is a convenience,
    // not something worth failing a save over.
  }
}

function lastSlot(): string | null {
  try {
    return localStorage.getItem(LAST_SLOT_KEY)
  } catch {
    return null
  }
}

/**
 * Reopens the last slot on boot. Skipped if the project has already been
 * touched — a restore that overwrote work typed during the first second would
 * be far worse than starting empty.
 */
export async function restoreLastSession(): Promise<void> {
  const name = lastSlot()
  if (!name) return

  const store = useProject.getState()
  if (store.dirty || store.project.nodes.length > 0) return

  const loaded = await workspace.readSlot(name)
  if (!loaded) return

  store.replaceProject(loaded.project, name)
  store.toast({
    tone: 'info',
    title: `Reopened "${name}"`,
    detail: `${loaded.project.nodes.length} pieces of content, saved in this browser`,
  })
}

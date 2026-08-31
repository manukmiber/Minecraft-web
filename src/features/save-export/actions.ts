/**
 * Save, Export and load.
 *
 * Nothing here crosses the network. A Save writes the model into a slot in this
 * browser's IndexedDB, an Export builds the `.mcaddon` in the page and hands it
 * straight to the download. Both still insist on a changelog entry: the history
 * is worth as much locally as it was in a repo, and a note written at the
 * moment of the change beats one reconstructed later.
 */

import { buildMcaddon, downloadBlob } from '../../core/export/mcaddon'
import { normalizeSlotName } from '../../integrations/local/workspace'
import { assets, workspace } from '../../state/services'
import { useProject } from '../../state/project'
import { rememberSlot } from './session'

export async function saveToSlot(slot: string, changelog: string): Promise<void> {
  const store = useProject.getState()
  if (!changelog.trim()) throw new Error('Write a changelog entry before saving.')

  const name = normalizeSlotName(slot)
  store.setBusy(`Saving to ${name}…`)
  try {
    const record = await workspace.writeSlot(name, store.project, changelog)
    store.markSaved(name)
    rememberSlot(name)
    store.toast({
      tone: 'success',
      title: `Saved to ${name}`,
      detail: `${record.project.nodes.length} piece${
        record.project.nodes.length === 1 ? '' : 's'
      } of content · ${record.project.assets.length} textures · stored in this browser`,
    })
  } finally {
    store.setBusy(null)
  }
}

export async function loadSlot(slot: string): Promise<void> {
  const store = useProject.getState()

  store.setBusy(`Loading ${slot}…`)
  try {
    const loaded = await workspace.readSlot(slot)
    if (!loaded) throw new Error(`Save "${slot}" is no longer in this browser's storage.`)

    store.replaceProject(loaded.project, slot)
    rememberSlot(slot)
    store.toast({
      tone: 'success',
      title: `Opened ${slot}`,
      detail: `${loaded.project.nodes.length} pieces of content, ${loaded.project.assets.length} textures`,
    })
  } finally {
    store.setBusy(null)
  }
}

export async function deleteSlot(slot: string): Promise<void> {
  const store = useProject.getState()
  store.setBusy(`Deleting ${slot}…`)
  try {
    await workspace.deleteSlot(slot)
    store.toast({ tone: 'info', title: `Deleted ${slot}` })
  } finally {
    store.setBusy(null)
  }
}

export interface ExportOutcome {
  fileName: string
  entryCount: number
  bytes: number
}

/**
 * Zips the pack in the browser, hands it to the user, then records the export
 * in the local changelog. The download happens first so nothing can come
 * between you and the file you were after.
 */
export async function exportAddon(changelog: string): Promise<ExportOutcome> {
  const store = useProject.getState()
  if (!changelog.trim()) throw new Error('Write a changelog entry before exporting.')

  store.setBusy('Building .mcaddon…')
  try {
    const built = await buildMcaddon(store.project, (id) => {
      const asset = store.project.assets.find((a) => a.id === id)
      return asset ? assets.read(asset) : Promise.resolve(null)
    })

    const blocking = built.problems.filter((p) => p.severity === 'error')
    if (blocking.length > 0) {
      throw new Error(
        `Export stopped — fix these first:\n${blocking.map((p) => `• ${p.message}`).join('\n')}`,
      )
    }

    downloadBlob(built.blob, built.fileName)

    await workspace.appendChangelog(`Export · ${built.fileName}`, changelog, [
      `version ${store.project.version.join('.')}, namespace ${store.project.namespace}`,
      `${built.entries.length} files, ${(built.bytes / 1024).toFixed(0)} KB`,
    ])

    store.toast({
      tone: 'success',
      title: `Exported ${built.fileName}`,
      detail: `${built.entries.length} files · ${(built.bytes / 1024).toFixed(0)} KB`,
    })

    return { fileName: built.fileName, entryCount: built.entries.length, bytes: built.bytes }
  } finally {
    store.setBusy(null)
  }
}

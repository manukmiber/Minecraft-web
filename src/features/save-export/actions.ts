/**
 * Save, Export and load — the operations that cross the network.
 *
 * Both Save and Export insist on a changelog entry. That is deliberate: the
 * project repo is the history, and an entry written at the moment of the change
 * is worth more than one reconstructed later.
 */

import { buildMcaddon, downloadBlob } from '../../core/export/mcaddon'
import type { AssetRef } from '../../core/model/types'
import { assets, projectRepo } from '../../state/services'
import { useProject } from '../../state/project'
import { useSettings, repoConfigured } from '../../state/settings'

function requireRepo(): void {
  if (!repoConfigured(useSettings.getState())) {
    throw new Error(
      'The project repository is not configured yet. Open Settings and fill in the GitHub token, owner, repo and branch.',
    )
  }
}

const readAssetBytes = (asset: AssetRef) => assets.read(asset)

export async function saveToSlot(slot: string, changelog: string): Promise<void> {
  const store = useProject.getState()
  requireRepo()
  if (!changelog.trim()) throw new Error('Write a changelog entry before saving.')

  store.setBusy(`Saving to ${slot}…`)
  try {
    const result = await projectRepo.saveSlot(slot, store.project, changelog, readAssetBytes)
    store.markSaved(slot)
    store.toast({
      tone: 'success',
      title: `Saved to ${slot}`,
      detail: `${result.assetCount} textures committed · ${result.sha.slice(0, 7)}`,
    })
  } finally {
    store.setBusy(null)
  }
}

export async function loadSlot(slot: string): Promise<void> {
  const store = useProject.getState()
  requireRepo()

  store.setBusy(`Loading ${slot}…`)
  try {
    const loaded = await projectRepo.loadSave(slot)
    // Warm the local cache so previews and export do not have to round-trip.
    for (const [assetId, bytes] of loaded.assets) {
      await assets.prime(assetId, bytes)
    }
    store.replaceProject(loaded.project, slot)
    store.toast({
      tone: 'success',
      title: `Opened ${slot}`,
      detail: `${loaded.project.nodes.length} pieces of content, ${loaded.assets.size} textures`,
    })
  } finally {
    store.setBusy(null)
  }
}

export interface ExportOutcome {
  fileName: string
  entryCount: number
  bytes: number
  committed: boolean
}

/**
 * Zips the pack in the browser, hands it to the user, then records the export
 * in the repo. The download happens first so a GitHub hiccup never costs you
 * the file you were after.
 */
export async function exportAddon(changelog: string, commit: boolean): Promise<ExportOutcome> {
  const store = useProject.getState()
  if (commit) requireRepo()
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

    let committed = false
    if (commit) {
      store.setBusy('Recording the export…')
      const bytes = await built.blob.arrayBuffer()
      await projectRepo.commitExport(built.fileName, bytes, changelog, store.project)
      committed = true
    }

    store.toast({
      tone: 'success',
      title: `Exported ${built.fileName}`,
      detail: `${built.entries.length} files · ${(built.bytes / 1024).toFixed(0)} KB${
        committed ? ' · committed to the repo' : ''
      }`,
    })

    return {
      fileName: built.fileName,
      entryCount: built.entries.length,
      bytes: built.bytes,
      committed,
    }
  } finally {
    store.setBusy(null)
  }
}

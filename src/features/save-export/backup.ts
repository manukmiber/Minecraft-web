/**
 * Backup bundles.
 *
 * With the project repo gone, a save slot lives in one browser's IndexedDB and
 * nowhere else — clearing site data would take it with it. A backup is the way
 * out: a plain zip holding the same layout a save slot used to occupy in the
 * repo, which means it is readable without this app and importable into any
 * other browser running it.
 *
 *   project.json        the model
 *   assets/<id>.png     every texture the model references
 *   CHANGELOG.md        the log at the time of the backup, for reading
 */

import JSZip from 'jszip'

import { downloadBlob } from '../../core/export/mcaddon'
import { migrateProject } from '../../core/model/project'
import type { ProjectModel } from '../../core/model/types'
import { normalizeSlotName } from '../../integrations/local/workspace'
import { assets, workspace } from '../../state/services'

export interface BackupOutcome {
  fileName: string
  assetCount: number
  bytes: number
}

/** Builds and downloads a backup of one stored slot. */
export async function downloadSlotBackup(slot: string): Promise<BackupOutcome> {
  const loaded = await workspace.readSlot(slot)
  if (!loaded) throw new Error(`Save "${slot}" is no longer in this browser's storage.`)
  return buildBackup(slot, loaded.project)
}

/** Builds and downloads a backup of whatever is open right now. */
export async function downloadProjectBackup(
  slot: string,
  project: ProjectModel,
): Promise<BackupOutcome> {
  return buildBackup(slot, project)
}

async function buildBackup(slot: string, project: ProjectModel): Promise<BackupOutcome> {
  const zip = new JSZip()
  zip.file('project.json', JSON.stringify(project, null, 2) + '\n')

  let assetCount = 0
  for (const asset of project.assets) {
    const bytes = await assets.read(asset)
    // A missing texture is not worth failing the whole backup over; the import
    // side reports what it could not find.
    if (!bytes) continue
    zip.file(`assets/${asset.id}.png`, bytes, { binary: true })
    assetCount++
  }

  zip.file('CHANGELOG.md', await workspace.changelogMarkdown())

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const fileName = `${normalizeSlotName(slot)}-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.zip`
  downloadBlob(blob, fileName)

  return { fileName, assetCount, bytes: blob.size }
}

export interface ImportOutcome {
  slot: string
  project: ProjectModel
  assetCount: number
  /** Assets the model references that the archive did not carry. */
  missing: string[]
}

/**
 * Reads a backup back in. The textures are restored first so that the moment
 * the slot exists it is complete — a half-imported slot that renders empty
 * squares would be worse than a failed import.
 */
export async function importBackup(file: File, slotName?: string): Promise<ImportOutcome> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error(`${file.name} is not a readable zip archive.`)
  }

  const projectFile = zip.file('project.json')
  if (!projectFile) {
    throw new Error(`${file.name} has no project.json, so it is not a backup from this app.`)
  }

  const project = migrateProject(JSON.parse(await projectFile.async('string')))

  let assetCount = 0
  const missing: string[] = []
  for (const asset of project.assets) {
    const entry = zip.file(`assets/${asset.id}.png`)
    if (!entry) {
      missing.push(asset.fileName)
      continue
    }
    await assets.prime(asset.id, await entry.async('arraybuffer'))
    assetCount++
  }

  const slot = normalizeSlotName(slotName || file.name.replace(/(-backup-\d{4}-\d{2}-\d{2})?\.zip$/i, ''))
  await workspace.writeSlot(slot, project, `Imported from ${file.name}.`)

  return { slot, project, assetCount, missing }
}

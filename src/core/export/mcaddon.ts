/**
 * `.mcaddon` packaging.
 *
 * Runs entirely in the browser. A Worker would be the obvious place for this,
 * but zipping a pack with textures blows past the CPU budget of an edge
 * request — and there is nothing the server needs to see anyway.
 */

import JSZip from 'jszip'

import type { ProjectModel } from '../model/types'
import { emitProject } from '../generators/emit'
import type { EmitProblem } from '../generators/emit'
import { serializeBody } from '../vfs/types'

/** Resolves an asset id to its bytes. Backed by IndexedDB, then R2. */
export type AssetResolver = (assetId: string) => Promise<ArrayBuffer | null>

export interface ExportResult {
  blob: Blob
  fileName: string
  /** Every file that made it into the archive, for the export summary. */
  entries: string[]
  problems: EmitProblem[]
  bytes: number
}

function safeFileName(name: string, version: [number, number, number]): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'addon'
  return `${base}-v${version.join('.')}.mcaddon`
}

/**
 * Builds the archive. A `.mcaddon` is a plain zip whose root holds the pack
 * folders, which is exactly the layout the generator already produces.
 */
export async function buildMcaddon(
  project: ProjectModel,
  resolveAsset: AssetResolver,
): Promise<ExportResult> {
  const { files, problems } = emitProject(project)
  const zip = new JSZip()
  const entries: string[] = []
  const localProblems: EmitProblem[] = [...problems]

  for (const file of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.body.type === 'asset') {
      const bytes = await resolveAsset(file.body.assetId)
      if (!bytes) {
        localProblems.push({
          severity: 'error',
          path: file.path,
          message: `Could not read the image for ${file.path}. Re-upload the texture and export again.`,
        })
        continue
      }
      zip.file(file.path, bytes, { binary: true })
    } else {
      zip.file(file.path, serializeBody(file.body))
    }
    entries.push(file.path)
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return {
    blob,
    fileName: safeFileName(project.name, project.version),
    entries,
    problems: localProblems,
    bytes: blob.size,
  }
}

/** Hands the archive to the browser's downloads. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the download a tick to start before the object URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

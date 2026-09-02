/**
 * Building every artifact an export asks for.
 *
 * The old exporter had one job: zip the Bedrock pack tree into a `.mcaddon`.
 * With two platforms and five delivery routes there are now up to six files in
 * a single export, and the interesting problem is no longer zipping — it is
 * making sure a partial failure is visible.
 *
 * So each artifact is built independently and carries its own problem list. One
 * loader failing to generate does not cost you the other four, and the export
 * summary says exactly which of the six came out and which did not, rather than
 * an all-or-nothing error at the end.
 *
 * Everything runs in the browser, deliberately. A Worker would be the obvious
 * home for zipping, but a pack with textures blows past the CPU budget of an
 * edge request, and there is nothing here a server needs to see.
 */

import JSZip from 'jszip'

import type { ProjectModel } from '../model/types'
import type { EmitProblem } from '../generators/emit'
import { emitProject } from '../generators/emit'
import { emitJava } from '../generators/java/emitJava'
import { serializeBody } from '../vfs/types'
import type { VirtualFs } from '../vfs/types'
import type { ModLoader, Platform } from '../targets/platforms'
import { LOADERS } from '../targets/platforms'

/** Resolves an asset id to its bytes. Backed by IndexedDB, then R2. */
export type AssetResolver = (assetId: string) => Promise<ArrayBuffer | null>

/** What a single built file is, for the release notes and the summary. */
export type ArtifactKind = 'mcaddon' | 'datapack' | 'resourcepack' | 'mod-source'

export interface BuiltArtifact {
  kind: ArtifactKind
  platform: Platform
  loader: ModLoader | null
  fileName: string
  /** One line for the release body, saying what a player does with this file. */
  description: string
  blob: Blob
  entries: string[]
  bytes: number
  problems: EmitProblem[]
}

export interface BuildSelection {
  /** The Bedrock `.mcaddon`. */
  bedrock: boolean
  /** Java delivery routes to build. `datapack` produces two files, not one. */
  javaLoaders: ModLoader[]
  /** Which Java version profile the Java routes target. */
  javaProfileId: string
}

export interface BuildOutcome {
  artifacts: BuiltArtifact[]
  /** Problems that stopped an artifact being produced at all. */
  blocking: EmitProblem[]
  /** Everything worth mentioning, across every artifact. */
  warnings: EmitProblem[]
}

export function safeBaseName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'addon'
  )
}

/** Zips one virtual tree, resolving asset bodies to their bytes as it goes. */
async function zipTree(
  fs: VirtualFs,
  resolveAsset: AssetResolver,
): Promise<{ blob: Blob; entries: string[]; problems: EmitProblem[] }> {
  const zip = new JSZip()
  const entries: string[] = []
  const problems: EmitProblem[] = []

  for (const file of [...fs.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    if (file.body.type === 'asset') {
      const bytes = await resolveAsset(file.body.assetId)
      if (!bytes) {
        problems.push({
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

  return { blob, entries, problems }
}

export async function buildArtifacts(
  project: ProjectModel,
  selection: BuildSelection,
  resolveAsset: AssetResolver,
): Promise<BuildOutcome> {
  const base = safeBaseName(project.name)
  const version = project.version.join('.')
  const artifacts: BuiltArtifact[] = []
  const blocking: EmitProblem[] = []
  const warnings: EmitProblem[] = []

  if (selection.bedrock) {
    const { files, problems } = emitProject(project)
    const errors = problems.filter((p) => p.severity === 'error')
    if (errors.length > 0) {
      blocking.push(...errors)
    } else {
      const zipped = await zipTree(files, resolveAsset)
      const zipErrors = zipped.problems.filter((p) => p.severity === 'error')
      if (zipErrors.length > 0) {
        blocking.push(...zipErrors)
      } else {
        artifacts.push({
          kind: 'mcaddon',
          platform: 'bedrock',
          loader: null,
          fileName: `${base}-v${version}.mcaddon`,
          description:
            'Bedrock add-on. Open it and the game imports both packs; enable them on a world.',
          blob: zipped.blob,
          entries: zipped.entries,
          bytes: zipped.blob.size,
          problems: problems.filter((p) => p.severity === 'warning'),
        })
      }
      warnings.push(...problems.filter((p) => p.severity === 'warning'))
    }
  }

  for (const loader of selection.javaLoaders) {
    const result = emitJava(project, { loader, profileId: selection.javaProfileId })
    const errors = result.problems.filter((p) => p.severity === 'error')
    if (errors.length > 0) {
      blocking.push(...errors)
      continue
    }
    warnings.push(...result.problems.filter((p) => p.severity === 'warning'))

    for (const [name, fs] of result.artifacts) {
      const zipped = await zipTree(fs, resolveAsset)
      const zipErrors = zipped.problems.filter((p) => p.severity === 'error')
      if (zipErrors.length > 0) {
        blocking.push(...zipErrors)
        continue
      }
      artifacts.push({
        ...describeJavaArtifact(name, loader),
        fileName: `${base}-v${version}-${name}.zip`,
        blob: zipped.blob,
        entries: zipped.entries,
        bytes: zipped.blob.size,
        problems: result.problems.filter((p) => p.severity === 'warning'),
      })
    }
  }

  return { artifacts, blocking, warnings }
}

/** The three shapes a Java artifact comes in, and what a player does with each. */
function describeJavaArtifact(
  name: string,
  loader: ModLoader,
): Pick<BuiltArtifact, 'kind' | 'platform' | 'loader' | 'description'> {
  if (name === 'datapack') {
    return {
      kind: 'datapack',
      platform: 'java',
      loader: 'datapack',
      description:
        'Java data pack. Drop it in `<world>/datapacks/`. Adds recipes, loot and world generation; it cannot add new blocks or items.',
    }
  }
  if (name === 'resourcepack') {
    return {
      kind: 'resourcepack',
      platform: 'java',
      loader: 'datapack',
      description:
        'Java resource pack, the other half of the data pack. Drop it in `resourcepacks/` and enable it.',
    }
  }
  return {
    kind: 'mod-source',
    platform: 'java',
    loader,
    description: `${LOADERS[loader].label} mod **source project** — not a jar. Unzip it and run \`gradle wrapper && ./gradlew build\`; the jar lands in \`build/libs/\`.`,
  }
}

/** Hands one artifact to the browser's downloads. */
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

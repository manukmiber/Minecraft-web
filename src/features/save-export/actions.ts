/**
 * Save, Export and load — the operations that cross the network.
 *
 * Both Save and Export insist on a changelog entry. That is deliberate: the
 * project repo is the history, and an entry written at the moment of the change
 * is worth more than one reconstructed later.
 *
 * Export changed shape when releases arrived. It used to build one `.mcaddon`
 * and optionally commit it; it now builds up to six artifacts across two
 * platforms and publishes them as a tagged GitHub release. The order inside
 * `exportBuild` matters and is worth stating: **the files are handed to the
 * browser's downloads before anything is published**, so a GitHub outage, an
 * expired token or a rate limit never costs you the build you just waited for.
 */

import { buildArtifacts, downloadBlob } from '../../core/export/bundle'
import type { BuildSelection, BuiltArtifact } from '../../core/export/bundle'
import {
  CHANNELS,
  nextBuildNumber,
  releaseBody,
  releaseName,
  releaseTag,
} from '../../core/export/release'
import type { ReleaseChannel } from '../../core/export/release'
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

export interface ExportRequest {
  changelog: string
  selection: BuildSelection
  /** Publish the build as a GitHub release. Off means download only. */
  publish: boolean
  channel: ReleaseChannel
}

export interface ExportOutcome {
  artifacts: Array<{ fileName: string; bytes: number; kind: string }>
  totalBytes: number
  /** Set when the export was published; the release page to link to. */
  releaseUrl: string | null
  releaseTag: string | null
  warnings: string[]
}

/**
 * Builds every selected artifact, downloads them, then publishes the release.
 *
 * A build that produces nothing is an error rather than an empty release: an
 * export with no targets ticked is a mis-click, and a release with no files is
 * a tag that has to be deleted by hand before it can be retried.
 */
export async function exportBuild(request: ExportRequest): Promise<ExportOutcome> {
  const store = useProject.getState()
  const settings = useSettings.getState()

  if (!request.changelog.trim()) throw new Error('Write a changelog entry before exporting.')
  if (request.publish) requireRepo()

  const targetCount = (request.selection.bedrock ? 1 : 0) + request.selection.javaLoaders.length
  if (targetCount === 0) {
    throw new Error('Pick at least one target to export.')
  }

  store.setBusy('Building…')
  try {
    const built = await buildArtifacts(store.project, request.selection, (id) => {
      const asset = store.project.assets.find((a) => a.id === id)
      return asset ? assets.read(asset) : Promise.resolve(null)
    })

    if (built.blocking.length > 0) {
      throw new Error(
        `Export stopped — fix these first:\n${built.blocking
          .map((problem) => `• ${problem.message}`)
          .join('\n')}`,
      )
    }
    if (built.artifacts.length === 0) {
      throw new Error('Nothing was built. Check the Problems panel for why.')
    }

    // Downloads first, always. Whatever happens to GitHub afterwards, the
    // files are already on disk.
    for (const artifact of built.artifacts) {
      downloadBlob(artifact.blob, artifact.fileName)
    }

    const warnings = [...new Set(built.warnings.map((problem) => problem.message))]
    const outcome: ExportOutcome = {
      artifacts: built.artifacts.map((artifact) => ({
        fileName: artifact.fileName,
        bytes: artifact.bytes,
        kind: artifact.kind,
      })),
      totalBytes: built.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
      releaseUrl: null,
      releaseTag: null,
      warnings,
    }

    if (request.publish) {
      const published = await publish(built.artifacts, request, warnings, settings.githubBranch)
      outcome.releaseUrl = published.htmlUrl
      outcome.releaseTag = published.tag
    }

    store.toast({
      tone: 'success',
      title: outcome.releaseTag
        ? `Released ${outcome.releaseTag}`
        : `Exported ${built.artifacts.length} file${built.artifacts.length === 1 ? '' : 's'}`,
      detail: `${built.artifacts.map((a) => a.fileName).join(', ')} · ${(
        outcome.totalBytes / 1024
      ).toFixed(0)} KB`,
    })

    return outcome
  } finally {
    store.setBusy(null)
  }
}

async function publish(
  artifacts: BuiltArtifact[],
  request: ExportRequest,
  warnings: string[],
  branch: string,
): Promise<{ htmlUrl: string; tag: string }> {
  const store = useProject.getState()
  const project = store.project

  store.setBusy('Working out the release number…')
  // Read the build number from the tags that exist rather than from a counter
  // in this browser, so two people exporting cannot both claim alpha.3.
  const existingTags = await projectRepo.listReleaseTags()
  const build = nextBuildNumber(existingTags, project.version, request.channel)
  const tag = releaseTag(project.version, request.channel, build)

  if (existingTags.includes(tag)) {
    throw new Error(
      `The tag ${tag} already exists. Bump the pack version in Settings, or delete that release first.`,
    )
  }

  const channel = CHANNELS[request.channel]
  store.setBusy(`Publishing ${tag}…`)

  const published = await projectRepo.publishRelease({
    tag,
    name: releaseName(project.name, project.version, request.channel, build),
    body: releaseBody({
      changelog: request.changelog,
      channel: request.channel,
      artifacts: artifacts.map((artifact) => ({
        fileName: artifact.fileName,
        description: artifact.description,
      })),
      warnings,
    }),
    prerelease: channel.prerelease,
    makeLatest: channel.latest,
    branch,
    artifacts: await Promise.all(
      artifacts.map(async (artifact) => ({
        fileName: artifact.fileName,
        bytes: await artifact.blob.arrayBuffer(),
        description: artifact.description,
      })),
    ),
    changelog: request.changelog,
    project,
  })

  return { htmlUrl: published.htmlUrl, tag: published.tag }
}

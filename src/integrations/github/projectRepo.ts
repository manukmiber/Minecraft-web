/**
 * The layout of the project repo, and the operations the app performs on it.
 *
 *   saves/<slot>/project.json     the model for one save version
 *   saves/<slot>/assets/<id>.png  the textures that model references
 *   preset/*.preset.json          the inbox other tools (Claude Code) write to
 *   preset/applied/               presets already merged, kept for history
 *   exports/<tag>/                every artifact from one export, by release tag
 *   CHANGELOG.md                  one entry per Save and per Export
 *
 * Nothing here is implicit: a preset stays in the inbox until it is applied,
 * and applying it moves the file rather than deleting it, so the history of
 * what came in from where is preserved in git.
 *
 * Exports are the one place the layout changed when releases arrived. They used
 * to be loose files in `exports/`, which was fine for one `.mcaddon` per build
 * and useless once a single export produced six files across two platforms. They
 * are now grouped under the release tag that published them, so the folder and
 * the GitHub release page tell the same story.
 */

import { migrateProject } from '../../core/model/project'
import type { AssetRef, ProjectModel, SaveSlot } from '../../core/model/types'
import { GitHubClient } from './client'
import type { PendingFile, ReleaseSummary } from './client'

export const SAVES_DIR = 'saves'
export const PRESET_DIR = 'preset'
export const PRESET_APPLIED_DIR = 'preset/applied'
export const EXPORTS_DIR = 'exports'
export const CHANGELOG_PATH = 'CHANGELOG.md'

/** One built file on its way into a release. */
export interface ReleaseArtifact {
  fileName: string
  bytes: ArrayBuffer
  description: string
}

export interface PublishedRelease {
  tag: string
  htmlUrl: string
  commitSha: string
  commitUrl: string
  uploaded: string[]
}

export interface PresetFile {
  name: string
  path: string
  sha: string
  size: number
}

export interface LoadedSave {
  project: ProjectModel
  /** Texture bytes pulled alongside the model, keyed by asset id. */
  assets: Map<string, ArrayBuffer>
}

export type AssetByteProvider = (asset: AssetRef) => Promise<ArrayBuffer | null>

function slotPath(slot: string): string {
  return `${SAVES_DIR}/${slot}`
}

function stamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

export class ProjectRepo {
  constructor(private github: GitHubClient) {}

  setClient(github: GitHubClient): void {
    this.github = github
  }

  // -- save slots ------------------------------------------------------------

  async listSaveSlots(): Promise<SaveSlot[]> {
    const entries = await this.github.listDirectory(SAVES_DIR)
    return entries
      .filter((entry) => entry.type === 'dir')
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        updatedAt: null,
        sha: entry.sha,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async loadSave(slot: string): Promise<LoadedSave> {
    const raw = await this.github.readText(`${slotPath(slot)}/project.json`)
    if (!raw) throw new Error(`Save "${slot}" has no project.json.`)

    const project = migrateProject(JSON.parse(raw))
    const assets = new Map<string, ArrayBuffer>()

    // Only fetch the textures this model actually references — an old slot may
    // still hold images that were pruned since.
    for (const asset of project.assets) {
      const bytes = await this.github.readBinary(`${slotPath(slot)}/assets/${asset.id}.png`)
      if (bytes) assets.set(asset.id, bytes)
    }

    return { project, assets }
  }

  /**
   * Writes a save slot: the model, every referenced texture, and a changelog
   * entry, all in one commit.
   */
  async saveSlot(
    slot: string,
    project: ProjectModel,
    changelog: string,
    getBytes: AssetByteProvider,
  ): Promise<{ sha: string; url: string; assetCount: number }> {
    const files: PendingFile[] = [
      {
        path: `${slotPath(slot)}/project.json`,
        content: JSON.stringify(project, null, 2) + '\n',
      },
    ]

    let assetCount = 0
    for (const asset of project.assets) {
      const bytes = await getBytes(asset)
      if (!bytes) continue
      files.push({ path: `${slotPath(slot)}/assets/${asset.id}.png`, content: bytes })
      assetCount++
    }

    files.push(
      await this.changelogEntry(`Save · ${slot}`, changelog, [
        `${project.nodes.length} pieces of content, ${assetCount} textures`,
      ]),
    )

    const result = await this.github.commit(`Save ${slot}: ${firstLine(changelog)}`, files)
    return { ...result, assetCount }
  }

  // -- exports ---------------------------------------------------------------

  /** Every release tag already in the repo, used to pick the next build number. */
  async listReleaseTags(): Promise<string[]> {
    return this.github.listReleaseTags()
  }

  async listReleases(limit = 30): Promise<ReleaseSummary[]> {
    return this.github.listReleases(limit)
  }

  /**
   * Commits an export and publishes it as a release, in that order.
   *
   * The order is not incidental. A GitHub release is a tag plus files, and the
   * tag has to point at a commit — so the artifacts are committed first and the
   * release is cut from the resulting commit, which means the release page and
   * the repository agree about what shipped. Doing it the other way round tags
   * whatever happened to be on the branch beforehand.
   *
   * If an asset upload fails the release is deleted again rather than left
   * half-populated: a release missing its files still owns the tag, which would
   * block the retry with a confusing "already exists".
   */
  async publishRelease(options: {
    tag: string
    name: string
    body: string
    prerelease: boolean
    makeLatest: boolean
    branch: string
    artifacts: ReleaseArtifact[]
    changelog: string
    project: ProjectModel
  }): Promise<PublishedRelease> {
    if (options.artifacts.length === 0) {
      throw new Error('There is nothing to release — no artifact was built.')
    }

    const files: PendingFile[] = options.artifacts.map((artifact) => ({
      path: `${EXPORTS_DIR}/${options.tag}/${artifact.fileName}`,
      content: artifact.bytes,
    }))

    files.push(
      await this.changelogEntry(`Release · ${options.tag}`, options.changelog, [
        `version ${options.project.version.join('.')}, namespace ${options.project.namespace}`,
        `${options.artifacts.length} artifacts: ${options.artifacts.map((a) => a.fileName).join(', ')}`,
      ]),
    )

    const commit = await this.github.commit(
      `Release ${options.tag}: ${firstLine(options.changelog)}`,
      files,
    )

    const release = await this.github.createRelease({
      tagName: options.tag,
      name: options.name,
      body: options.body,
      prerelease: options.prerelease,
      makeLatest: options.makeLatest,
      // Tag the commit that was just made, not the branch head, so a push that
      // lands between the two does not end up inside this release.
      targetCommitish: commit.sha,
    })

    const uploaded: string[] = []
    try {
      for (const artifact of options.artifacts) {
        const asset = await this.github.uploadReleaseAsset(
          release.id,
          artifact.fileName,
          artifact.bytes,
        )
        uploaded.push(asset.name)
      }
    } catch (failure) {
      await this.github.deleteRelease(release.id).catch(() => {
        // The upload failure is the useful error; a failed cleanup on top of it
        // would only bury it.
      })
      throw failure
    }

    return {
      tag: options.tag,
      htmlUrl: release.htmlUrl,
      commitSha: commit.sha,
      commitUrl: commit.url,
      uploaded,
    }
  }

  // -- preset inbox ----------------------------------------------------------

  async listPresets(): Promise<PresetFile[]> {
    const entries = await this.github.listDirectory(PRESET_DIR)
    return entries
      .filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'))
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        sha: entry.sha,
        size: entry.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async readPreset(path: string): Promise<unknown> {
    const raw = await this.github.readText(path)
    if (!raw) throw new Error(`Could not read ${path}.`)
    return JSON.parse(raw)
  }

  /**
   * Moves an applied preset out of the inbox. The content is rewritten under
   * `preset/applied/` and the original deleted in the same commit, so the inbox
   * only ever shows work that is still outstanding.
   */
  async archivePreset(preset: PresetFile, note: string): Promise<{ sha: string; url: string }> {
    const raw = await this.github.readText(preset.path)
    if (raw === null) throw new Error(`Could not read ${preset.path}.`)

    const applied = `${PRESET_APPLIED_DIR}/${stamp().replace(/[:]/g, '-')}-${preset.name}`
    return this.github.commit(`Apply preset ${preset.name}`, [
      { path: applied, content: raw },
      { path: preset.path, content: null },
      await this.changelogEntry(`Preset applied · ${preset.name}`, note, []),
    ])
  }

  // -- changelog -------------------------------------------------------------

  /**
   * Builds the updated CHANGELOG.md. New entries go at the top so the most
   * recent work is the first thing visible in the repo.
   */
  private async changelogEntry(
    title: string,
    body: string,
    details: string[],
  ): Promise<PendingFile> {
    const existing = (await this.github.readText(CHANGELOG_PATH)) ?? '# Changelog\n'
    const header = existing.startsWith('#')
      ? existing.slice(0, existing.indexOf('\n') + 1)
      : '# Changelog\n'
    const rest = existing.slice(header.length)

    const lines = [
      `## ${stamp()} — ${title}`,
      '',
      body.trim() || '_No description given._',
      ...(details.length > 0 ? ['', ...details.map((d) => `- ${d}`)] : []),
      '',
    ]

    return {
      path: CHANGELOG_PATH,
      content: `${header}\n${lines.join('\n')}\n${rest.replace(/^\n+/, '')}`,
    }
  }
}

function firstLine(text: string): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > 68 ? `${line.slice(0, 65)}...` : line || 'no description'
}

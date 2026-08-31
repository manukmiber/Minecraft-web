/**
 * The layout of the project repo, and the operations the app performs on it.
 *
 *   saves/<slot>/project.json     the model for one save version
 *   saves/<slot>/assets/<id>.png  the textures that model references
 *   preset/*.preset.json          the inbox other tools (Claude Code) write to
 *   preset/applied/               presets already merged, kept for history
 *   exports/                      .mcaddon files that were exported
 *   CHANGELOG.md                  one entry per Save and per Export
 *
 * Nothing here is implicit: a preset stays in the inbox until it is applied,
 * and applying it moves the file rather than deleting it, so the history of
 * what came in from where is preserved in git.
 */

import { migrateProject } from '../../core/model/project'
import type { AssetRef, ProjectModel, SaveSlot } from '../../core/model/types'
import { GitHubClient } from './client'
import type { PendingFile } from './client'

export const SAVES_DIR = 'saves'
export const PRESET_DIR = 'preset'
export const PRESET_APPLIED_DIR = 'preset/applied'
export const EXPORTS_DIR = 'exports'
export const CHANGELOG_PATH = 'CHANGELOG.md'

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

  async commitExport(
    fileName: string,
    archive: ArrayBuffer,
    changelog: string,
    project: ProjectModel,
  ): Promise<{ sha: string; url: string; path: string }> {
    const path = `${EXPORTS_DIR}/${fileName}`
    const files: PendingFile[] = [
      { path, content: archive },
      await this.changelogEntry(`Export · ${fileName}`, changelog, [
        `version ${project.version.join('.')}, namespace ${project.namespace}`,
      ]),
    ]
    const result = await this.github.commit(`Export ${fileName}: ${firstLine(changelog)}`, files)
    return { ...result, path }
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

/**
 * The local workspace — this app's entire database.
 *
 * Everything that used to live in a project repo now lives in this browser's
 * IndexedDB: save slots, the changelog, and the preset inbox. Nothing leaves
 * the machine unless you ask for it (an export, or a backup .zip), which is why
 * the app deploys as plain static files on Cloudflare Pages with no Worker, no
 * bucket and no credentials to configure.
 *
 * Layout inside the `workspace` store:
 *
 *   slot:<name>     one complete save slot: the project model plus a timestamp
 *   preset:<id>     a preset dropped into the inbox, pending or applied
 *   changelog       the entry list, newest first
 *
 * Texture bytes are the one thing kept elsewhere — `AssetStore` owns them in
 * the default idb-keyval store, keyed by asset id, so a slot only ever records
 * which assets it references rather than copying them.
 */

import { createStore, del, get, keys, set } from 'idb-keyval'
import type { UseStore } from 'idb-keyval'

import { migrateProject } from '../../core/model/project'
import type { ProjectModel, SaveSlot } from '../../core/model/types'
import { nodeId } from '../../core/util/id'

/**
 * Opened on first use rather than at import time: `createStore` opens an
 * IndexedDB connection immediately, and this module is imported by code that
 * runs in tests and other places where `indexedDB` does not exist.
 */
let cachedStore: UseStore | null = null
function db(): UseStore {
  cachedStore ??= createStore('mmmmmmmmmmmmm', 'workspace')
  return cachedStore
}

const SLOT_PREFIX = 'slot:'
const PRESET_PREFIX = 'preset:'
const CHANGELOG_KEY = 'changelog'

/** Keeps the log from growing without bound in a store the user cannot prune. */
const CHANGELOG_LIMIT = 500

/** What a slot record looks like on disk. */
interface SlotRecord {
  name: string
  project: ProjectModel
  updatedAt: string
  /** The note written when this slot was last saved. */
  changelog: string
}

export interface ChangelogEntry {
  id: string
  at: string
  title: string
  body: string
  details: string[]
}

export interface InboxPreset {
  id: string
  name: string
  addedAt: string
  size: number
  raw: unknown
  /** Set once the preset has been merged into a save; it then leaves the inbox. */
  appliedAt: string | null
  note: string
}

export interface StorageUsage {
  slots: number
  presets: number
  changelogEntries: number
}

function slotKey(name: string): string {
  return SLOT_PREFIX + name
}

function stamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z')
}

/**
 * Slot names become part of a filename on backup, so they are constrained the
 * same way identifiers are rather than trusted as typed. A single dot is kept
 * because `v2.1` is a name people actually use; a run of them is not, and
 * `..` has no business in a suggested download filename.
 */
export function normalizeSlotName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.slice(0, 64) || 'main'
}

export class LocalWorkspace {
  // -- save slots ------------------------------------------------------------

  async listSlots(): Promise<SaveSlot[]> {
    const all = await keys(db())
    const slots: SaveSlot[] = []
    for (const key of all) {
      if (typeof key !== 'string' || !key.startsWith(SLOT_PREFIX)) continue
      const record = await get<SlotRecord>(key, db())
      if (!record) continue
      slots.push({
        name: record.name,
        updatedAt: record.updatedAt,
        nodeCount: record.project.nodes.length,
        assetCount: record.project.assets.length,
        changelog: record.changelog,
      })
    }
    return slots.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  async readSlot(name: string): Promise<{ project: ProjectModel; updatedAt: string } | null> {
    const record = await get<SlotRecord>(slotKey(name), db())
    if (!record) return null
    // Migrating on read rather than on write means a slot written by an older
    // build opens correctly without needing a rewrite pass over the store.
    return { project: migrateProject(record.project), updatedAt: record.updatedAt }
  }

  /** Writes the slot and records the note in the changelog, as one operation. */
  async writeSlot(name: string, project: ProjectModel, changelog: string): Promise<SlotRecord> {
    const record: SlotRecord = {
      name,
      project,
      updatedAt: stamp(),
      changelog: changelog.trim(),
    }
    await set(slotKey(name), record, db())
    await this.appendChangelog(`Save · ${name}`, changelog, [
      `${project.nodes.length} pieces of content, ${project.assets.length} textures`,
    ])
    return record
  }

  async deleteSlot(name: string): Promise<void> {
    await del(slotKey(name), db())
    await this.appendChangelog(`Deleted save · ${name}`, 'Slot removed from local storage.', [])
  }

  /**
   * Every asset id referenced by any stored slot. The asset cache is shared
   * between slots, so sweeping has to know about all of them, not just the one
   * currently open.
   */
  async referencedAssetIds(): Promise<Set<string>> {
    const ids = new Set<string>()
    const all = await keys(db())
    for (const key of all) {
      if (typeof key !== 'string' || !key.startsWith(SLOT_PREFIX)) continue
      const record = await get<SlotRecord>(key, db())
      for (const asset of record?.project.assets ?? []) ids.add(asset.id)
    }
    return ids
  }

  // -- changelog -------------------------------------------------------------

  async readChangelog(): Promise<ChangelogEntry[]> {
    return (await get<ChangelogEntry[]>(CHANGELOG_KEY, db())) ?? []
  }

  /** Newest first, so the most recent work is the first thing shown. */
  async appendChangelog(title: string, body: string, details: string[]): Promise<ChangelogEntry> {
    const entry: ChangelogEntry = {
      id: nodeId('log'),
      at: stamp(),
      title,
      body: body.trim() || 'No description given.',
      details,
    }
    const existing = await this.readChangelog()
    await set(CHANGELOG_KEY, [entry, ...existing].slice(0, CHANGELOG_LIMIT), db())
    return entry
  }

  async clearChangelog(): Promise<void> {
    await del(CHANGELOG_KEY, db())
  }

  /** The log as a CHANGELOG.md, for download and for backup archives. */
  async changelogMarkdown(): Promise<string> {
    const entries = await this.readChangelog()
    const body = entries
      .map((entry) =>
        [
          `## ${entry.at} — ${entry.title}`,
          '',
          entry.body,
          ...(entry.details.length > 0 ? ['', ...entry.details.map((d) => `- ${d}`)] : []),
          '',
        ].join('\n'),
      )
      .join('\n')
    return `# Changelog\n\n${body}`
  }

  // -- preset inbox ----------------------------------------------------------

  async listPresets(): Promise<InboxPreset[]> {
    const all = await keys(db())
    const presets: InboxPreset[] = []
    for (const key of all) {
      if (typeof key !== 'string' || !key.startsWith(PRESET_PREFIX)) continue
      const preset = await get<InboxPreset>(key, db())
      if (preset) presets.push(preset)
    }
    return presets.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }

  /** Parses and files a `.json` preset dropped into the inbox. */
  async addPreset(file: File): Promise<InboxPreset> {
    const text = await file.text()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error(`${file.name} is not valid JSON.`)
    }

    const preset: InboxPreset = {
      id: nodeId('preset'),
      name: file.name,
      addedAt: stamp(),
      size: file.size,
      raw,
      appliedAt: null,
      note: '',
    }
    await set(PRESET_PREFIX + preset.id, preset, db())
    return preset
  }

  /**
   * Marks a preset applied instead of deleting it, so the record of what came
   * in from where survives — the same reason the repo version moved the file to
   * `preset/applied/` in the old repo layout rather than dropping it.
   */
  async markPresetApplied(id: string, note: string): Promise<void> {
    const preset = await get<InboxPreset>(PRESET_PREFIX + id, db())
    if (!preset) return
    await set(PRESET_PREFIX + id, { ...preset, appliedAt: stamp(), note }, db())
    await this.appendChangelog(`Preset applied · ${preset.name}`, note, [])
  }

  async removePreset(id: string): Promise<void> {
    await del(PRESET_PREFIX + id, db())
  }

  /** Clears the applied history, leaving anything still pending alone. */
  async clearAppliedPresets(): Promise<number> {
    const presets = await this.listPresets()
    let removed = 0
    for (const preset of presets) {
      if (!preset.appliedAt) continue
      await del(PRESET_PREFIX + preset.id, db())
      removed++
    }
    return removed
  }

  // -- housekeeping ----------------------------------------------------------

  async usage(): Promise<StorageUsage> {
    const all = await keys(db())
    let slots = 0
    let presets = 0
    for (const key of all) {
      if (typeof key !== 'string') continue
      if (key.startsWith(SLOT_PREFIX)) slots++
      else if (key.startsWith(PRESET_PREFIX)) presets++
    }
    return { slots, presets, changelogEntries: (await this.readChangelog()).length }
  }

  /** Wipes the whole workspace. The caller is responsible for confirming. */
  async clearAll(): Promise<void> {
    for (const key of await keys(db())) await del(key, db())
  }
}

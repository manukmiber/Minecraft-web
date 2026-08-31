/**
 * The project model.
 *
 * One JSON object describes an entire add-on. It is the single source of truth:
 * the whole `behavior_pack/` + `resource_pack/` tree is regenerated from it on
 * every change, which is what makes cross-pack references impossible to get out
 * of sync. It is also exactly what a save slot stores, and what a backup .zip
 * carries as `project.json`.
 */

/** Bumped whenever the shape changes; `migrateProject` upgrades older saves. */
export const MODEL_VERSION = 1

export interface PackUuids {
  behaviorHeader: string
  behaviorModule: string
  resourceHeader: string
  resourceModule: string
  /** Only written into the manifest when the project actually needs scripts. */
  scriptModule: string
}

/**
 * A binary the project references. Bytes live in this browser's IndexedDB,
 * keyed by `id`; the model only ever carries the metadata.
 */
export interface AssetRef {
  id: string
  fileName: string
  mime: string
  size: number
  width: number | null
  height: number | null
  addedAt: string
}

/** One piece of content — a block, an item, an entity, a recipe, ... */
export interface ContentNode {
  id: string
  /** Matches a `ContentKind.id` in the registry. */
  kind: string
  /** Identifier name part; the namespace is project-wide. */
  name: string
  /** Human-facing name, written into the `.lang` file. */
  displayName: string
  /** Kind-specific field values, shaped by that kind's `fields`. */
  data: Record<string, unknown>
  /** Texture slot key -> asset id. */
  textures: Record<string, string | null>
  /** Which preset created this node, if any. Purely informational. */
  presetId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectMeta {
  createdAt: string
  updatedAt: string
  author: string
  /** Free-form; shown in the status bar. */
  tagline: string
}

export interface ProjectModel {
  modelVersion: number
  id: string
  /** Pack display name, used for both manifests. */
  name: string
  description: string
  /** Project-wide identifier namespace, e.g. `mmm`. */
  namespace: string
  targetProfileId: string
  /** Pack semantic version, shared by BP and RP. */
  version: [number, number, number]
  uuids: PackUuids
  nodes: ContentNode[]
  assets: AssetRef[]
  /**
   * Raw hand-edits from Code View, keyed by generated file path. A path present
   * here is served from the override instead of the generator, and is flagged
   * in the explorer so the detachment is never silent.
   */
  overrides: Record<string, string>
  meta: ProjectMeta
}

/** A stored save slot, as the Versions panel lists it. */
export interface SaveSlot {
  name: string
  updatedAt: string
  nodeCount: number
  assetCount: number
  /** The note written when the slot was last saved. */
  changelog: string
}

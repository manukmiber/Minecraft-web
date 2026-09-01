/**
 * The content-kind registry.
 *
 * This is what keeps the builder generic. A kind declares its form fields, its
 * texture slots and how it turns into pack files; the wizard UI, the inspector,
 * the drag-and-drop zones, the explorer grouping and the 3D preview are all
 * derived from that declaration. Adding a new kind of content later means
 * adding one entry here, not touching the UI.
 */

import type { UvRegion } from '../generators/geometry'
import type { ContentNode, ProjectModel } from '../model/types'
import type { TargetProfile } from '../targets/profiles'
import type { VirtualFile } from '../vfs/types'

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'slider'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'color'
  | 'identifier'
  /** Reference to another node in this project, filtered by kind. */
  | 'node-ref'
  /** Vanilla or custom item identifier, with autocomplete. */
  | 'item-ref'
  | 'block-ref'
  /** Ordered list of growth stages, each with its own texture slot. */
  | 'stage-list'
  /** The visual crafting-station builder: tabs, slots, item browser, preview. */
  | 'recipe-station'
  /** The plant checklist of a biome, with per-plant density and placement. */
  | 'biome-scatter'
  /** A biome tag, autocompleted from this project's biomes plus the vanilla set. */
  | 'biome-ref'
  /** Free list of strings (families, tags, ...). */
  | 'string-list'
  /** Identifiers with a relative weight each — "plant A 3 times out of 4". */
  | 'weighted-list'
  /** A small box of blocks, painted one Y layer at a time. */
  | 'layer-grid'

export interface FieldOption {
  value: string
  label: string
  hint?: string
}

export interface FieldSpec {
  key: string
  label: string
  type: FieldType
  help?: string
  /** Section heading in the wizard; fields without one land in "General". */
  group?: string
  placeholder?: string
  options?: FieldOption[]
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Which node kinds a `node-ref` field may point at. */
  refKinds?: string[]
  /** Hide the field unless this predicate passes — keeps forms uncluttered. */
  when?: (data: Record<string, unknown>) => boolean
  /** Returns an error string, or null when the value is acceptable. */
  validate?: (value: unknown, data: Record<string, unknown>) => string | null
}

export interface TextureSlot {
  key: string
  label: string
  help?: string
  /** Which resource-pack atlas / folder the PNG belongs to. */
  target: 'item' | 'terrain' | 'entity'
  required?: boolean
  /** Recommended square size, surfaced as a warning not an error. */
  recommended?: number
  /**
   * Named regions of the texture sheet, for slots whose PNG is a UV map rather
   * than a plain square — an entity skin, say. The pixel editor draws them as a
   * template so you can see which patch is the head and which is a wing.
   */
  uvTemplate?: (node: ContentNode) => UvRegion[] | null
}

export type PreviewSpec =
  /** Six-sided cube driven by the kind's terrain texture slots. */
  | { type: 'block'; faceSlots: Partial<Record<'up' | 'down' | 'north' | 'south' | 'east' | 'west', string>>; fallbackSlot?: string }
  /** Flat sprite, billboarded — items and seeds. */
  | { type: 'item'; slot: string }
  /** Crossed-planes plant, one instance per growth stage. */
  | { type: 'crop'; stagesKey: string; slotPrefix: string }
  /** Bedrock geometry rendered from a `.geo.json`, textured by an entity slot. */
  | { type: 'entity'; textureSlot: string; geometryKey?: string }
  /** Voxel box from a `layer-grid` field, drawn with the project's own textures. */
  | { type: 'structure'; gridKey: string }
  /** Flat ambience panel: biome colours, the plants in it and the crow estimate. */
  | { type: 'biome' }
  /** Nothing meaningful to show in 3D (recipes, loot tables). */
  | { type: 'none' }

/**
 * Everything a generator is allowed to reach for. Generators are pure functions
 * of `(node, ctx)`; all cross-file wiring (atlases, lang, dependencies) happens
 * by calling back into the context, which is what guarantees the behaviour pack
 * and resource pack always agree.
 */
export interface EmitContext {
  project: ProjectModel
  target: TargetProfile
  namespace: string

  /** `namespace:name` for a node. */
  identifier(node: ContentNode): string
  /** `namespace:name` for an arbitrary name in this project. */
  ownIdentifier(name: string): string

  /**
   * Registers the PNG behind a texture slot in the right atlas and returns the
   * short atlas key to reference. Returns null when the slot is empty, so
   * generators can fall back gracefully instead of emitting a broken path.
   */
  texture(node: ContentNode, slotKey: string): string | null
  /** Same, for the per-stage slots of a `stage-list` field. */
  stageTexture(node: ContentNode, slotPrefix: string, index: number): string | null
  /** Entity textures are referenced by path, not by atlas key. */
  entityTexturePath(node: ContentNode, slotKey: string): string | null

  /** Adds a `key=value` line to the pack's `.lang` file. */
  lang(key: string, value: string): void

  /** Look-ups used by generators that reference sibling content. */
  nodeById(id: string): ContentNode | undefined
  nodesOfKind(kind: string): ContentNode[]

  /** Emits an extra file that is not tied to the node's main output. */
  extra(file: VirtualFile): void

  /**
   * Requests a scripted custom block component. Bedrock removed data-driven
   * block events with the modern parser, so anything that has to change a block
   * over time (crop growth, for one) needs a script. Registering here makes the
   * emitter assemble a single `scripts/main.js` and add the script module to the
   * behaviour manifest — but only for projects that actually use one.
   *
   * `componentBody` is the JS object literal passed to
   * `registerCustomComponent`, e.g. `{ onRandomTick: (e, a) => { ... } }`.
   */
  registerScriptComponent(id: string, componentBody: string): void

  /** Records a non-fatal problem shown in the Problems panel. */
  warn(message: string): void
}

export interface ContentKind {
  id: string
  label: string
  plural: string
  /** lucide-react icon name. */
  icon: string
  /** Accent token used for the kind's badge. */
  accent: 'accent' | 'mint' | 'amber' | 'rose' | 'violet'
  description: string
  /** Sidebar grouping. */
  group: 'world' | 'creatures' | 'crafting' | 'systems'
  fields: FieldSpec[]
  textureSlots: (node: ContentNode) => TextureSlot[]
  defaults: () => Record<string, unknown>
  emit: (node: ContentNode, ctx: EmitContext) => VirtualFile[]
  preview: PreviewSpec
  /**
   * Optional reverse-parse: given the raw JSON a user hand-edited in Code View,
   * pull recognisable values back into the node so the wizard stays in sync.
   * Returning null means "not recognised" and the edit becomes an override.
   */
  absorb?: (path: string, json: unknown, node: ContentNode) => Partial<ContentNode> | null
}

const registry = new Map<string, ContentKind>()

export function registerKind(kind: ContentKind): void {
  registry.set(kind.id, kind)
}

export function getKind(id: string): ContentKind | undefined {
  return registry.get(id)
}

export function allKinds(): ContentKind[] {
  return [...registry.values()]
}

export function kindsByGroup(): Record<ContentKind['group'], ContentKind[]> {
  const out: Record<ContentKind['group'], ContentKind[]> = {
    world: [],
    creatures: [],
    crafting: [],
    systems: [],
  }
  for (const kind of registry.values()) out[kind.group].push(kind)
  return out
}

/**
 * Shared world-generation plumbing.
 *
 * Bedrock splits world generation in two: a *feature* says what to build, and a
 * *feature rule* says where and how often to build it. Every kind in this file's
 * orbit — scatter, tree, structure — produces its own feature and then reuses
 * the exact same placement block: scatter chance, per-chunk iterations, a height
 * range, a biome filter and a placement pass.
 *
 * So the placement half lives here once, as a field factory plus an emitter,
 * rather than being copy-pasted into three kinds. A new world-gen kind only has
 * to describe its feature and spread `placementFields()` into its own `fields`.
 */

import type { EmitContext, FieldOption, FieldSpec } from '../registry/types'
import type { ContentNode } from '../model/types'
import type { VirtualFile } from '../vfs/types'
import { BP } from '../generators/emit'
import { bool, clamp, compact, list, num, str } from './shared'

/** Where features and their rules are written inside the behaviour pack. */
export const FEATURE_DIR = `${BP}/features`
export const FEATURE_RULE_DIR = `${BP}/feature_rules`

/**
 * Generation passes, in the order the game runs them. The pass decides what the
 * world already looks like when the feature is placed: `underground_pass` runs
 * while the terrain is still solid stone, `surface_pass` after the surface has
 * been carved, which is where anything plant-shaped belongs.
 */
export const PLACEMENT_PASS_OPTIONS: FieldOption[] = [
  { value: 'pregeneration_pass', label: 'Pregeneration', hint: 'Before anything else exists' },
  { value: 'first_pass', label: 'First', hint: 'Raw terrain' },
  { value: 'before_underground_pass', label: 'Before underground' },
  { value: 'underground_pass', label: 'Underground', hint: 'Ores and caves — the world is still solid' },
  { value: 'after_underground_pass', label: 'After underground' },
  { value: 'before_surface_pass', label: 'Before surface' },
  { value: 'surface_pass', label: 'Surface', hint: 'Plants, trees, decoration — the usual choice' },
  { value: 'after_surface_pass', label: 'After surface' },
  { value: 'final_pass', label: 'Final', hint: 'Last, after everything else has generated' },
  { value: 'sky_pass', label: 'Sky', hint: 'Floating features above the terrain' },
]

/**
 * Vanilla biome tags worth one click. Anything else can be typed into the
 * custom-tag list — the filter is a plain tag test either way, so there is
 * nothing special about the ones listed here.
 */
export const BIOME_TAG_OPTIONS: FieldOption[] = [
  { value: 'plains', label: 'Plains' },
  { value: 'forest', label: 'Forest' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'taiga', label: 'Taiga' },
  { value: 'savanna', label: 'Savanna' },
  { value: 'desert', label: 'Desert' },
  { value: 'swamp', label: 'Swamp' },
  { value: 'mountains', label: 'Mountains' },
  { value: 'mesa', label: 'Mesa' },
  { value: 'beach', label: 'Beach' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'river', label: 'River' },
  { value: 'mushroom_island', label: 'Mushroom island' },
  { value: 'cold', label: 'Cold' },
  { value: 'warm', label: 'Warm' },
  { value: 'overworld', label: 'Any overworld' },
  { value: 'nether', label: 'Nether' },
  { value: 'the_end', label: 'The End' },
]

export const Y_ANCHOR_OPTIONS: FieldOption[] = [
  { value: 'absolute', label: 'Absolute Y', hint: 'Plain world coordinates — 2 means Y=2' },
  { value: 'above_bottom', label: 'Above world bottom', hint: 'Survives a change of world height' },
  { value: 'below_top', label: 'Below world top' },
]

export const Y_MODE_OPTIONS: FieldOption[] = [
  { value: 'uniform', label: 'Even across the range', hint: 'Every height in the band equally likely' },
  { value: 'triangle', label: 'Bunched in the middle', hint: 'Rare at the edges of the band' },
  { value: 'fixed', label: 'One exact height' },
  { value: 'surface', label: 'On the surface', hint: 'Let the game pick — follows the terrain height' },
]

/** Field keys the placement block owns, so kinds can avoid clashing with them. */
export const PLACEMENT_KEYS = [
  'worldPlace',
  'scatterPercent',
  'iterations',
  'placementPass',
  'yMode',
  'yAnchor',
  'yMin',
  'yMax',
  'biomeMatch',
  'biomeTags',
  'biomeTagsCustom',
] as const

export interface PlacementOptions {
  /** Wizard section the controls land in. */
  group?: string
  /** Wording for the on/off switch, which differs per kind. */
  enableLabel?: string
  enableHelp?: string
  defaults?: Partial<{
    worldPlace: boolean
    scatterPercent: number
    iterations: number
    placementPass: string
    yMode: string
    yAnchor: string
    yMin: number
    yMax: number
    biomeTags: string[]
  }>
}

/**
 * The placement half of a world-gen kind's form. Spread into `fields`.
 *
 * Every control is hidden behind the `worldPlace` switch, so a feature you only
 * want to place by hand (from a script, a command, or as part of a bigger
 * structure) does not drag a wall of irrelevant settings into the wizard.
 */
export function placementFields(options: PlacementOptions = {}): FieldSpec[] {
  const group = options.group ?? 'World placement'
  const on = (data: Record<string, unknown>) => bool(data, 'worldPlace', true)

  return [
    {
      key: 'worldPlace',
      label: options.enableLabel ?? 'Generate in new chunks',
      type: 'boolean',
      group,
      help:
        options.enableHelp ??
        'Writes a feature rule so the world generator places this on its own. Turn off to keep the feature but place it yourself.',
    },
    {
      key: 'scatterPercent',
      label: 'Scatter chance',
      type: 'slider',
      group,
      min: 0,
      max: 100,
      step: 0.5,
      unit: '%',
      when: on,
      help: 'Chance that a single attempt actually places anything. 100% places on every attempt; 5% makes it a rare find.',
    },
    {
      key: 'iterations',
      label: 'Attempts per chunk',
      type: 'number',
      group,
      min: 1,
      max: 256,
      step: 1,
      when: on,
      help: 'How many times the game tries per chunk. Density is roughly attempts × chance.',
    },
    {
      key: 'placementPass',
      label: 'Placement pass',
      type: 'select',
      group,
      options: PLACEMENT_PASS_OPTIONS,
      when: on,
    },
    {
      key: 'yMode',
      label: 'Height',
      type: 'select',
      group,
      options: Y_MODE_OPTIONS,
      when: on,
      help: 'Restricts the band of Y values the feature may be placed at.',
    },
    {
      key: 'yAnchor',
      label: 'Height measured from',
      type: 'select',
      group,
      options: Y_ANCHOR_OPTIONS,
      when: (data) => on(data) && str(data, 'yMode', 'surface') !== 'surface',
    },
    {
      key: 'yMin',
      label: 'Lowest Y',
      type: 'number',
      group,
      step: 1,
      when: (data) => on(data) && ['uniform', 'triangle'].includes(str(data, 'yMode', 'surface')),
      help: 'Bottom of the band. For a block that should only appear deep down, this is the setting you want.',
      validate: (value, data) => {
        const min = typeof value === 'number' ? value : 0
        return min > num(data, 'yMax', min) ? 'Lowest Y is above the highest Y.' : null
      },
    },
    {
      key: 'yMax',
      label: 'Highest Y',
      type: 'number',
      group,
      step: 1,
      when: (data) => on(data) && ['uniform', 'triangle'].includes(str(data, 'yMode', 'surface')),
    },
    {
      key: 'yMin',
      label: 'Exact Y',
      type: 'number',
      group,
      step: 1,
      when: (data) => on(data) && str(data, 'yMode', 'surface') === 'fixed',
    },
    {
      key: 'biomeMatch',
      label: 'Biomes',
      type: 'select',
      group,
      options: [
        { value: 'any', label: 'Anywhere', hint: 'No biome filter at all' },
        { value: 'anyOf', label: 'In any of these biomes' },
        { value: 'allOf', label: 'Only where every tag matches' },
        { value: 'noneOf', label: 'Everywhere except these biomes' },
      ],
      when: on,
    },
    {
      key: 'biomeTags',
      label: 'Biome tags',
      type: 'multiselect',
      group,
      options: BIOME_TAG_OPTIONS,
      when: (data) => on(data) && str(data, 'biomeMatch', 'any') !== 'any',
    },
    {
      key: 'biomeTagsCustom',
      label: 'Other biome tags',
      type: 'string-list',
      group,
      placeholder: 'bamboo, monster, animal, …',
      when: (data) => on(data) && str(data, 'biomeMatch', 'any') !== 'any',
      help: 'Any tag the game knows, including a custom biome from this add-on — its tag is <namespace>_<biome name>. Tags are what biomes are actually matched on; there is no biome-name test.',
    },
  ]
}

/** Matching defaults, spread into a kind's `defaults()`. */
export function placementDefaults(options: PlacementOptions = {}): Record<string, unknown> {
  const d = options.defaults ?? {}
  return {
    worldPlace: d.worldPlace ?? true,
    scatterPercent: d.scatterPercent ?? 20,
    iterations: d.iterations ?? 1,
    placementPass: d.placementPass ?? 'surface_pass',
    yMode: d.yMode ?? 'surface',
    yAnchor: d.yAnchor ?? 'absolute',
    yMin: d.yMin ?? 0,
    yMax: d.yMax ?? 64,
    biomeMatch: 'any',
    biomeTags: d.biomeTags ?? [],
    biomeTagsCustom: [],
  }
}

/** Every biome tag a node asks for, from both the chips and the free list. */
function biomeTags(data: Record<string, unknown>): string[] {
  const chosen = [...list(data, 'biomeTags'), ...list(data, 'biomeTagsCustom')]
  return [...new Set(chosen.map((tag) => tag.trim()).filter(Boolean))]
}

/**
 * `conditions.minecraft:biome_filter`.
 *
 * Entries in the array are AND-ed, so "any of these biomes" has to be wrapped in
 * a single `any_of` rather than listed flat — a flat list of three tags would
 * mean a biome carrying all three at once, which is almost never what someone
 * picking three biomes meant.
 */
export function biomeFilter(data: Record<string, unknown>): unknown[] | undefined {
  const mode = str(data, 'biomeMatch', 'any')
  if (mode === 'any') return undefined

  const tags = biomeTags(data)
  if (tags.length === 0) return undefined

  const test = (value: string, negate = false) => ({
    test: 'has_biome_tag',
    operator: negate ? '!=' : '==',
    value,
  })

  if (mode === 'allOf') return tags.map((tag) => test(tag))
  if (mode === 'noneOf') return tags.map((tag) => test(tag, true))
  return tags.length === 1 ? [test(tags[0])] : [{ any_of: tags.map((tag) => test(tag)) }]
}

/** One end of the Y band, expressed against the chosen anchor. */
function yValue(value: number, anchor: string): number | Record<string, number> {
  const rounded = Math.round(value)
  if (anchor === 'above_bottom') return { above_bottom_most: rounded }
  if (anchor === 'below_top') return { below_top_most: rounded }
  return rounded
}

/**
 * The `y` half of a scatter distribution.
 *
 * Returning `undefined` for "surface" is deliberate: omitting `y` entirely is
 * what makes the game place the feature on the terrain height, and an explicit
 * full-world range is not the same thing — it would bury most attempts inside
 * solid stone.
 */
export function heightDistribution(data: Record<string, unknown>): unknown {
  const mode = str(data, 'yMode', 'surface')
  const anchor = str(data, 'yAnchor', 'absolute')

  if (mode === 'surface') return undefined
  if (mode === 'fixed') return yValue(num(data, 'yMin', 0), anchor)

  const min = num(data, 'yMin', 0)
  const max = Math.max(min, num(data, 'yMax', min))
  return {
    distribution: mode === 'triangle' ? 'triangle' : 'uniform',
    extent: [yValue(min, anchor), yValue(max, anchor)],
  }
}

/** Chunk-relative spread on the horizontal axes; always the full 16 blocks. */
const CHUNK_EXTENT = { distribution: 'uniform', extent: [0, 15] }

export interface FeatureRuleOptions {
  /** Identifier of the feature the rule places. */
  featureId: string
  /** Suffix for the rule's own identifier and file name. */
  suffix?: string
  label: string
}

/**
 * Writes `feature_rules/<name>.json` for a node, or returns null when the node
 * has world placement switched off.
 *
 * The distribution here *is* the scatter: chance, attempts and the height band
 * all live on the rule, so no intermediate scatter feature is needed for the
 * common case of "place this thing around the world".
 */
export function emitFeatureRule(
  node: ContentNode,
  ctx: EmitContext,
  options: FeatureRuleOptions,
): VirtualFile | null {
  const data = node.data
  if (!bool(data, 'worldPlace', true)) return null

  const suffix = options.suffix ?? 'rule'
  const fileName = `${node.name}_${suffix}`
  const chance = clamp(num(data, 'scatterPercent', 20), 0, 100)

  if (chance === 0) {
    ctx.warn(
      `"${node.displayName}" is set to generate in the world but its scatter chance is 0%, so it will never appear.`,
    )
  }

  const distribution = compact({
    iterations: Math.max(1, Math.round(num(data, 'iterations', 1))),
    // Bedrock reads this as a percentage; a float is accepted and lets a
    // deliberately rare feature go below one percent.
    scatter_chance: chance,
    coordinate_eval_order: 'zyx',
    x: CHUNK_EXTENT,
    y: heightDistribution(data),
    z: CHUNK_EXTENT,
  })

  return {
    path: `${FEATURE_RULE_DIR}/${fileName}.json`,
    origin: { nodeId: node.id, kind: node.kind, label: `Rule · ${options.label}` },
    body: {
      type: 'json',
      value: {
        format_version: ctx.target.formats.featureRules,
        'minecraft:feature_rules': {
          description: {
            identifier: ctx.ownIdentifier(fileName),
            places_feature: options.featureId,
          },
          conditions: compact({
            placement_pass: str(data, 'placementPass', 'surface_pass'),
            'minecraft:biome_filter': biomeFilter(data),
          }),
          distribution,
        },
      },
    },
  }
}

/** A block list field's value, with vanilla air as the sensible empty answer. */
export function blockList(data: Record<string, unknown>, key: string, fallback: string[]): string[] {
  const values = list(data, key)
  return values.length > 0 ? values : fallback
}

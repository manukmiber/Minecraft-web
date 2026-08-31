/**
 * A custom biome and the plants that scatter through it.
 *
 * One node produces everything a themed patch of world needs: the behaviour-pack
 * biome, the client-side biome that carries its colours, a fog definition, and
 * the feature / feature-rule chain that scatters this project's crops through
 * it — scoped by biome tag, so a rice paddy never seeds rice into the desert
 * next door.
 *
 * The scatter chain is three layers because Bedrock only lets one feature live
 * in one file:
 *
 *   single_block_feature   one per assigned plant — where it may sit
 *   weighted_random_feature  picks between them by weight (only when >1)
 *   scatter_feature        spreads the choice over the chunk
 *   feature_rules          runs the scatter, but only inside this biome
 *
 * Nothing here needs a script: world generation is still fully data-driven.
 */

import type { ContentKind, EmitContext, FieldOption } from '../registry/types'
import type { ContentNode, ProjectModel } from '../model/types'
import type { VirtualFile } from '../vfs/types'
import { BP, RP } from '../generators/emit'
import { bool, clamp, compact, list, num, str } from './shared'

// -- scatter assignments -----------------------------------------------------

export type ScatterMaturity = 'ripe' | 'half' | 'sprout'

/** One plant assigned to a biome, with how densely and where it may appear. */
export interface ScatterEntry {
  /** Node id of the crop (or block) to scatter. `#crop:name` inside a preset. */
  plant: string
  /** Frequency relative to the other plants in the same biome. */
  weight: number
  /** Ground blocks it may sit on. Empty means "whatever the crop plants on". */
  placeOn: string[]
  /** Requires at least one horizontally adjacent water block. */
  needsWater: boolean
  /** How grown a scattered plant is when the world generates it. */
  maturity: ScatterMaturity
}

export const MATURITY_OPTIONS: FieldOption[] = [
  { value: 'ripe', label: 'Fully grown', hint: 'Generates ready to harvest' },
  { value: 'half', label: 'Half grown', hint: 'Mid growth stage' },
  { value: 'sprout', label: 'Sprout', hint: 'Stage 0 — has to grow first' },
]

export const MIN_WEIGHT = 1
export const MAX_WEIGHT = 20

/**
 * Reads the `plants` field tolerantly. Presets, hand-edits and older saves all
 * write into `node.data`, so nothing about the shape is assumed.
 */
export function readScatterEntries(data: Record<string, unknown>): ScatterEntry[] {
  const raw = data.plants
  if (!Array.isArray(raw)) return []

  const out: ScatterEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Partial<ScatterEntry>
    if (typeof entry.plant !== 'string' || entry.plant === '') continue
    out.push({
      plant: entry.plant,
      weight: clamp(
        typeof entry.weight === 'number' && Number.isFinite(entry.weight)
          ? Math.round(entry.weight)
          : 3,
        MIN_WEIGHT,
        MAX_WEIGHT,
      ),
      placeOn: Array.isArray(entry.placeOn)
        ? entry.placeOn.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        : [],
      needsWater: entry.needsWater === true,
      maturity:
        entry.maturity === 'half' || entry.maturity === 'sprout' ? entry.maturity : 'ripe',
    })
  }
  return out
}

// -- tags --------------------------------------------------------------------

/**
 * The tag that identifies one biome. Namespaced by hand — biome tags are plain
 * strings with no namespace of their own, so `rice_paddy` from two different
 * add-ons would otherwise be the same tag.
 */
export function biomeTag(namespace: string, name: string): string {
  return `${namespace}_${name}`
}

/** The shared tag every "this is farmland" biome carries. */
export function farmlandTag(namespace: string): string {
  return `${namespace}_farmland`
}

/**
 * Every tag one biome carries: its own, whatever the user added, and the shared
 * farmland tag when it is marked as farmland. Spawn rules match on any of them,
 * so this is also the answer to "can this mob reach this biome".
 */
export function biomeTagsFor(namespace: string, name: string, data: Record<string, unknown>): string[] {
  const tags = new Set(list(data, 'tags'))
  tags.add(biomeTag(namespace, name))
  if (bool(data, 'farmlandBiome')) tags.add(farmlandTag(namespace))
  return [...tags]
}

/** Biome tags a project offers elsewhere — entity spawn rules, mostly. */
export function projectBiomeTags(project: ProjectModel): FieldOption[] {
  const options: FieldOption[] = []
  let anyFarmland = false

  for (const node of project.nodes) {
    if (node.kind !== 'biome') continue
    options.push({
      value: biomeTag(project.namespace, node.name),
      label: node.displayName,
      hint: 'Custom biome in this add-on',
    })
    if (bool(node.data, 'farmlandBiome')) anyFarmland = true
  }

  if (anyFarmland) {
    options.push({
      value: farmlandTag(project.namespace),
      label: 'All farmland biomes',
      hint: 'Every biome in this add-on marked as farmland',
    })
  }

  return options
}

// -- crow density ------------------------------------------------------------

/**
 * How many plants one crow is assumed to live off. Pulled out as a constant
 * because it is a design choice, not a Bedrock rule: it sets how quickly a
 * denser field attracts more birds.
 */
export const PLANTS_PER_CROW = 12

export interface CrowEstimate {
  /** Expected plants generated per chunk from the scatter settings. */
  plantsPerChunk: number
  /** Suggested crows per chunk for that much food. */
  crowsPerChunk: number
  /** What to put in the crow's spawn-rule density limit — a whole number. */
  densityLimit: number
}

/**
 * Turns scatter settings into a crow population. Deliberately simple and
 * monotonic: denser planting means more birds, up to a cap that stops a
 * 48-iteration field from turning into a swarm.
 */
export function estimateCrows(
  attempts: number,
  chancePercent: number,
  entryCount: number,
): CrowEstimate {
  if (entryCount <= 0) return { plantsPerChunk: 0, crowsPerChunk: 0, densityLimit: 0 }

  const plantsPerChunk = Math.max(0, attempts) * (clamp(chancePercent, 0, 100) / 100)
  if (plantsPerChunk <= 0) return { plantsPerChunk: 0, crowsPerChunk: 0, densityLimit: 0 }

  const crowsPerChunk = clamp(Math.round((plantsPerChunk / PLANTS_PER_CROW) * 10) / 10, 0.1, 6)
  return {
    plantsPerChunk: Math.round(plantsPerChunk * 10) / 10,
    crowsPerChunk,
    densityLimit: Math.max(1, Math.ceil(crowsPerChunk)),
  }
}

/** The crow density this biome actually asks for — the override wins. */
export function effectiveCrowDensity(data: Record<string, unknown>): CrowEstimate {
  const estimate = estimateCrows(
    num(data, 'scatterAttempts', 12),
    num(data, 'scatterChance', 70),
    readScatterEntries(data).length,
  )
  const override = num(data, 'crowDensity', 0)
  if (override <= 0) return estimate
  return {
    ...estimate,
    crowsPerChunk: override,
    densityLimit: Math.max(1, Math.ceil(override)),
  }
}

// -- generation --------------------------------------------------------------

/** Climate category the overworld generator sorts this biome into. */
function climateCategory(temperature: number): string {
  if (temperature < 0.15) return 'frozen'
  if (temperature < 0.35) return 'cold'
  if (temperature < 0.75) return 'medium'
  if (temperature < 1.05) return 'lukewarm'
  return 'warm'
}

const HEIGHT_NOISE_OPTIONS: FieldOption[] = [
  { value: 'default', label: 'Gentle plains', hint: 'Flat-ish ground — the safe default' },
  { value: 'lowlands', label: 'Lowlands', hint: 'Slightly below the surrounding land' },
  { value: 'swamp', label: 'Swamp', hint: 'Low and waterlogged' },
  { value: 'river', label: 'River', hint: 'Carved channel' },
  { value: 'beach', label: 'Beach', hint: 'Shoreline slope' },
  { value: 'mountains', label: 'Mountains', hint: 'Tall and uneven' },
]

/**
 * The growth stage a scattered plant generates at. Crops carry their stage in a
 * block state, so this becomes `places_block.states`; a plain block has no
 * stages and is placed as-is.
 */
function stageFor(target: ContentNode, maturity: ScatterMaturity): number | null {
  if (target.kind !== 'crop') return null
  const stages = Math.round(clamp(num(target.data, 'stages', 4), 2, 8))
  const maxAge = stages - 1
  if (maturity === 'sprout') return 0
  if (maturity === 'half') return Math.floor(maxAge / 2)
  return maxAge
}

/** Blocks a scattered plant may stand on, falling back to the crop's own rule. */
function groundFor(entry: ScatterEntry, target: ContentNode): string[] {
  if (entry.placeOn.length > 0) return entry.placeOn
  const plantOn = str(target.data, 'plantOn', '').trim()
  return plantOn ? [plantOn] : ['minecraft:grass_block', 'minecraft:dirt']
}

interface ScatterFiles {
  files: VirtualFile[]
  /** Identifier the scatter feature should place, or null when nothing is assigned. */
  placesFeature: string | null
}

function buildScatterFeatures(node: ContentNode, ctx: EmitContext): ScatterFiles {
  const entries = readScatterEntries(node.data)
  const files: VirtualFile[] = []
  const placed: Array<[string, number]> = []

  for (const entry of entries) {
    const target = ctx.nodeById(entry.plant)
    if (!target) {
      ctx.warn(`Biome "${node.displayName}" scatters a plant that no longer exists.`)
      continue
    }

    const featureId = ctx.ownIdentifier(`${node.name}_${target.name}_feature`)
    const stage = stageFor(target, entry.maturity)
    const blockId = ctx.identifier(target)

    // `may_attach_to` reads as a placement contract: the ground below has to be
    // one of these blocks, and — when the plant wants water — at least one of
    // the four sides has to be water. That is as close to "needs water nearby"
    // as world generation gets without a script.
    const attach: Record<string, unknown> = compact({
      min_sides_must_attach: 1,
      top: groundFor(entry, target),
      sides: entry.needsWater ? ['minecraft:water'] : undefined,
    })

    files.push({
      path: `${BP}/features/${node.name}_${target.name}_feature.json`,
      origin: {
        nodeId: node.id,
        kind: node.kind,
        label: `Feature · ${target.displayName} in ${node.displayName}`,
      },
      body: {
        type: 'json' as const,
        value: {
          format_version: ctx.target.formats.feature,
          'minecraft:single_block_feature': {
            description: { identifier: featureId },
            places_block:
              stage === null
                ? blockId
                : {
                    name: blockId,
                    states: { [ctx.ownIdentifier(`${target.name}_age`)]: stage },
                  },
            enforce_placement_rules: true,
            enforce_survivability_rules: true,
            may_attach_to: attach,
            may_replace: ['minecraft:air'],
          },
        },
      },
    })

    placed.push([featureId, entry.weight])
  }

  if (placed.length === 0) return { files, placesFeature: null }
  if (placed.length === 1) return { files, placesFeature: placed[0][0] }

  // More than one plant: a weighted pick between them is what makes "twice as
  // much rice as taro" mean something.
  const choiceId = ctx.ownIdentifier(`${node.name}_choice`)
  files.push({
    path: `${BP}/features/${node.name}_choice.json`,
    origin: { nodeId: node.id, kind: node.kind, label: `Feature · ${node.displayName} mix` },
    body: {
      type: 'json' as const,
      value: {
        format_version: ctx.target.formats.feature,
        'minecraft:weighted_random_feature': {
          description: { identifier: choiceId },
          features: placed.map(([id, weight]) => [id, weight]),
        },
      },
    },
  })

  return { files, placesFeature: choiceId }
}

/** Fields that only mean anything for a biome generating its own region. */
const standalone = (data: Record<string, unknown>): boolean =>
  str(data, 'placement', 'standalone') !== 'nested'

export const biomeKind: ContentKind = {
  id: 'biome',
  label: 'Biome',
  plural: 'Biomes',
  icon: 'Trees',
  accent: 'mint',
  group: 'world',
  description:
    'A custom biome with its own colours and climate, and the plants that grow wild in it.',
  preview: { type: 'biome' },

  fields: [
    // -- where it generates ---------------------------------------------------
    {
      key: 'placement',
      label: 'Biome type',
      type: 'select',
      group: 'General',
      options: [
        {
          value: 'standalone',
          label: 'Overworld biome',
          hint: 'A new biome the world generator places on its own, by climate',
        },
        {
          value: 'nested',
          label: 'Inside an existing biome',
          hint: 'No new biome is generated — the plants scatter through a biome that already exists',
        },
      ],
      help: 'A standalone biome carries its own colours. A nested one borrows the look of its host and only adds plants.',
    },
    {
      key: 'hostBiome',
      label: 'Host biome tag',
      type: 'text',
      group: 'General',
      placeholder: 'plains',
      when: (data) => str(data, 'placement', 'standalone') === 'nested',
      help: 'Vanilla biome tag the plants scatter into, e.g. plains, swamp, jungle.',
      validate: (value, data) =>
        str(data, 'placement', 'standalone') === 'nested' &&
        (typeof value !== 'string' || value.trim() === '')
          ? 'A nested biome needs a host biome tag to scatter into.'
          : null,
    },
    {
      key: 'rarity',
      label: 'How often it generates',
      type: 'slider',
      group: 'General',
      min: 1,
      max: 20,
      step: 1,
      when: (data) => str(data, 'placement', 'standalone') === 'standalone',
      help: 'Weight against the vanilla biomes in the same climate. Vanilla biomes sit around 1–5.',
    },

    // -- climate & colour -----------------------------------------------------
    {
      key: 'temperature',
      label: 'Temperature',
      type: 'slider',
      group: 'Climate & colour',
      min: 0,
      max: 2,
      step: 0.05,
      help: '0 freezes and accumulates snow, 0.8 is plains, above 1 is desert-hot.',
    },
    {
      key: 'downfall',
      label: 'Downfall',
      type: 'slider',
      group: 'Climate & colour',
      min: 0,
      max: 1,
      step: 0.05,
      help: 'How wet the biome is. 0 never rains.',
    },
    // Colours belong to a biome that owns a region of world. A nested one takes
    // its host's look, so the palette is hidden rather than quietly ignored.
    {
      key: 'grassColor',
      label: 'Grass colour',
      type: 'color',
      group: 'Climate & colour',
      when: standalone,
    },
    {
      key: 'foliageColor',
      label: 'Foliage colour',
      type: 'color',
      group: 'Climate & colour',
      when: standalone,
    },
    {
      key: 'waterColor',
      label: 'Water colour',
      type: 'color',
      group: 'Climate & colour',
      when: standalone,
      help: 'Used for the water surface and for the fog you see under it.',
    },
    {
      key: 'fogColor',
      label: 'Fog colour',
      type: 'color',
      group: 'Climate & colour',
      when: standalone,
      help: 'Emitted as a fog definition and referenced by the biome.',
    },

    // -- ground ---------------------------------------------------------------
    {
      key: 'topBlock',
      label: 'Surface block',
      type: 'block-ref',
      group: 'Terrain',
      placeholder: 'minecraft:grass_block',
    },
    {
      key: 'midBlock',
      label: 'Block underneath',
      type: 'block-ref',
      group: 'Terrain',
      placeholder: 'minecraft:dirt',
    },
    {
      key: 'heightNoise',
      label: 'Terrain shape',
      type: 'select',
      group: 'Terrain',
      options: HEIGHT_NOISE_OPTIONS,
    },

    // -- plants ---------------------------------------------------------------
    {
      key: 'plants',
      label: 'Plants that grow wild here',
      type: 'biome-scatter',
      group: 'Plants',
      help: 'Tick the crops that scatter in this biome, then set how common each one is.',
    },
    {
      key: 'scatterAttempts',
      label: 'Planting attempts per chunk',
      type: 'slider',
      group: 'Plants',
      min: 1,
      max: 48,
      step: 1,
      help: 'How many times the generator tries to place a plant in each chunk. This is the absolute density; the per-plant weights split it up.',
    },
    {
      key: 'scatterChance',
      label: 'Chance each attempt succeeds',
      type: 'slider',
      group: 'Plants',
      min: 5,
      max: 100,
      step: 5,
      unit: '%',
    },

    // -- crows ----------------------------------------------------------------
    {
      key: 'farmlandBiome',
      label: 'Counts as farmland',
      type: 'boolean',
      group: 'Crows',
      help: 'Tags this biome as farmland so crows and other pests can target it by tag rather than by name.',
    },
    {
      key: 'crowEntity',
      label: 'Crow',
      type: 'node-ref',
      group: 'Crows',
      refKinds: ['entity'],
      when: (data) => bool(data, 'farmlandBiome'),
      help: 'The pest that raids this biome. Its spawn rules stay its own — the preview can copy the estimate across.',
    },
    {
      key: 'crowDensity',
      label: 'Crows per chunk (manual)',
      type: 'number',
      group: 'Crows',
      min: 0,
      step: 0.5,
      when: (data) => bool(data, 'farmlandBiome'),
      help: 'Leave at 0 to use the estimate from the planting density above.',
    },
    {
      key: 'scarecrowEntity',
      label: 'Scarecrow',
      type: 'node-ref',
      group: 'Crows',
      refKinds: ['entity'],
      when: (data) => bool(data, 'farmlandBiome'),
      help: 'Reference only. The radius it keeps pests out of is set on the entity itself, under Avoidance.',
    },

    // -- advanced -------------------------------------------------------------
    {
      key: 'tags',
      label: 'Extra biome tags',
      type: 'string-list',
      group: 'Advanced',
      help: 'The biome always carries its own tag; these are added on top. "overworld" is what makes vanilla systems treat it as a normal surface biome.',
    },
  ],

  textureSlots: () => [],

  defaults: () => ({
    placement: 'standalone',
    hostBiome: 'plains',
    rarity: 3,
    temperature: 0.8,
    downfall: 0.8,
    grassColor: '#79c05a',
    foliageColor: '#59ae30',
    waterColor: '#44aff5',
    fogColor: '#c9dfff',
    topBlock: 'minecraft:grass_block',
    midBlock: 'minecraft:dirt',
    heightNoise: 'default',
    plants: [],
    scatterAttempts: 12,
    scatterChance: 70,
    farmlandBiome: false,
    crowEntity: '',
    crowDensity: 0,
    scarecrowEntity: '',
    tags: ['overworld'],
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const identifier = ctx.identifier(node)
    const nested = str(data, 'placement', 'standalone') === 'nested'
    const files: VirtualFile[] = []

    const ownTag = biomeTag(ctx.namespace, node.name)
    const tags = biomeTagsFor(ctx.namespace, node.name, data)

    const temperature = clamp(num(data, 'temperature', 0.8), 0, 2)
    const downfall = clamp(num(data, 'downfall', 0.8), 0, 1)

    // -- behaviour pack: the biome itself -------------------------------------

    const components: Record<string, unknown> = {
      'minecraft:climate': compact({
        temperature,
        downfall,
        // Only cold biomes accumulate snow; on a warm one the field is noise.
        snow_accumulation: temperature < 0.15 ? [0, 0.125] : undefined,
      }),
      'minecraft:overworld_height': { noise_type: str(data, 'heightNoise', 'default') },
      'minecraft:surface_parameters': {
        top_material: str(data, 'topBlock', 'minecraft:grass_block').trim() || 'minecraft:grass_block',
        mid_material: str(data, 'midBlock', 'minecraft:dirt').trim() || 'minecraft:dirt',
        foundation_material: 'minecraft:stone',
        sea_floor_material: 'minecraft:clay',
        sea_material: 'minecraft:water',
        sea_floor_depth: 5,
      },
      'minecraft:tags': { tags },
    }

    // A nested biome gets no generation rules at all: it is somewhere to hang
    // tags and features off, not a region the generator has to find room for.
    if (!nested) {
      components['minecraft:overworld_generation_rules'] = {
        generate_for_climates: [[climateCategory(temperature), Math.round(num(data, 'rarity', 3))]],
      }
    }

    files.push({
      path: `${BP}/biomes/${node.name}.biome.json`,
      origin: { nodeId: node.id, kind: node.kind, label: `Biome · ${node.displayName}` },
      body: {
        type: 'json' as const,
        value: {
          format_version: target.formats.biome,
          'minecraft:biome': {
            description: { identifier },
            components,
          },
        },
      },
    })

    // -- resource pack: what it looks like ------------------------------------

    if (!nested) {
      const fogId = ctx.ownIdentifier(`${node.name}_fog`)
      const fogColor = str(data, 'fogColor', '#c9dfff')
      const waterColor = str(data, 'waterColor', '#44aff5')

      files.push({
        path: `${RP}/fogs/${node.name}.fog.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Fog · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: {
            format_version: target.formats.fog,
            'minecraft:fog_settings': {
              description: { identifier: fogId },
              distance: {
                air: {
                  fog_start: 0.7,
                  fog_end: 1,
                  fog_color: fogColor,
                  render_distance_type: 'render',
                },
                water: {
                  fog_start: 0,
                  fog_end: 0.8,
                  fog_color: waterColor,
                  render_distance_type: 'fixed',
                },
              },
            },
          },
        },
      })

      files.push({
        path: `${RP}/biomes/${node.name}.client_biome.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Colours · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: {
            format_version: target.formats.clientBiome,
            'minecraft:client_biome': {
              description: { identifier },
              components: {
                'minecraft:grass_appearance': { color: str(data, 'grassColor', '#79c05a') },
                'minecraft:foliage_appearance': { color: str(data, 'foliageColor', '#59ae30') },
                'minecraft:water_appearance': { surface_color: waterColor },
                'minecraft:fog_appearance': { fog_identifier: fogId },
              },
            },
          },
        },
      })
    }

    // -- the scatter chain ----------------------------------------------------

    const scatter = buildScatterFeatures(node, ctx)
    files.push(...scatter.files)

    if (!scatter.placesFeature) {
      ctx.warn(
        `Biome "${node.displayName}" has no plants assigned, so it generates empty. Tick a crop under Plants.`,
      )
      return files
    }

    const scatterId = ctx.ownIdentifier(`${node.name}_scatter`)
    const chance = clamp(Math.round(num(data, 'scatterChance', 70)), 5, 100)

    files.push({
      path: `${BP}/features/${node.name}_scatter.json`,
      origin: { nodeId: node.id, kind: node.kind, label: `Scatter · ${node.displayName}` },
      body: {
        type: 'json' as const,
        value: {
          format_version: target.formats.feature,
          'minecraft:scatter_feature': compact({
            description: { identifier: scatterId },
            places_feature: scatter.placesFeature,
            iterations: Math.round(clamp(num(data, 'scatterAttempts', 12), 1, 48)),
            // Omitted at 100% so the common case stays a plain scatter.
            scatter_chance: chance < 100 ? chance : undefined,
            project_input_to_floor: false,
            x: { distribution: 'uniform', extent: [0, 15] },
            // The surface, wherever it happens to be — the same expression
            // vanilla flower scatters use.
            y: 'q.heightmap(v.worldx, v.worldz)',
            z: { distribution: 'uniform', extent: [0, 15] },
          }),
        },
      },
    })

    const filterTag = nested ? str(data, 'hostBiome', 'plains').trim() || 'plains' : ownTag

    files.push({
      path: `${BP}/feature_rules/${node.name}_scatter_rule.json`,
      origin: { nodeId: node.id, kind: node.kind, label: `Feature rule · ${node.displayName}` },
      body: {
        type: 'json' as const,
        value: {
          format_version: target.formats.featureRules,
          'minecraft:feature_rules': {
            description: {
              identifier: ctx.ownIdentifier(`${node.name}_scatter_rule`),
              places_feature: scatterId,
            },
            // The biome filter is what scopes the whole chain: without it the
            // scatter would run in every biome in the world.
            conditions: {
              placement_pass: 'surface_pass',
              'minecraft:biome_filter': [
                { test: 'has_biome_tag', operator: '==', value: filterTag },
              ],
            },
          },
        },
      },
    })

    // -- the crow link --------------------------------------------------------

    if (bool(data, 'farmlandBiome')) {
      const crow = str(data, 'crowEntity') ? ctx.nodeById(str(data, 'crowEntity')) : undefined
      if (crow) {
        const crowTag = str(crow.data, 'spawnBiomeTag', '').trim()
        if (!bool(crow.data, 'spawnEnabled')) {
          ctx.warn(
            `"${crow.displayName}" does not spawn naturally, so it will never appear in ${node.displayName}.`,
          )
        } else if (!tags.includes(crowTag)) {
          // A crow on the "overworld" tag already reaches this biome, so the
          // warning fires only when its tag is genuinely not one of these.
          ctx.warn(
            `"${crow.displayName}" spawns on biome tag "${crowTag || 'none'}", which ${node.displayName} does not carry (${tags.join(', ')}), so it will not find this biome.`,
          )
        }
      }
    }

    return files
  },
}

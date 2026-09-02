/**
 * World generation, Java side.
 *
 * Bedrock and Java arrive at the same result down two different roads, and the
 * translation is the interesting part of this file:
 *
 *   Bedrock  a *feature* says what to build and a *feature rule* says where.
 *            The rule carries a percentage chance, an iteration count, a height
 *            band and a biome filter, all in one file.
 *   Java     a *configured feature* says what to build and a *placed feature*
 *            says where, as an ordered list of placement modifiers that each
 *            filter or multiply the positions the one before produced.
 *
 * So a Bedrock rule becomes a Java modifier list, and the percentage becomes a
 * `rarity_filter` — "one chunk in N" rather than "N per cent of chunks", which
 * is the conversion most hand-written ports get backwards.
 *
 * Attaching a feature to a biome is where the platforms genuinely part company.
 * Bedrock's rule names the biome tag and the game does the rest. Java has no
 * such hook in vanilla: a data pack has to overwrite the whole biome file.
 * Forge and NeoForge each added a data-driven biome modifier, and Fabric does
 * it from code. All three routes are generated — see `biomeModifierFiles`.
 */

import type { ContentNode } from '../../model/types'
import type { VirtualFile } from '../../vfs/types'
import { bool, list, num, str } from '../../kinds/shared'
import { weightedEntries } from '../../kinds/weighted'
import { readScatterEntries } from '../../kinds/biome'
import type { JavaContext } from './context'
import { dataPath } from './context'
import { placementModifiers, stepIndexFor, GENERATION_STEPS } from './datapack'
import { toJavaIdentifier } from './ids'

/** A block state, as world generation wants it written. */
function blockState(identifier: string): unknown {
  return { Name: identifier }
}

function weightedProvider(entries: Array<{ id: string; weight: number }>): unknown {
  if (entries.length === 1) {
    return { type: 'minecraft:simple_state_provider', state: blockState(entries[0].id) }
  }
  return {
    type: 'minecraft:weighted_state_provider',
    entries: entries.map((entry) => ({ weight: entry.weight, data: blockState(entry.id) })),
  }
}

/**
 * The predicate a scattered block has to satisfy to be placed: it replaces one
 * of these blocks, and stands on one of those.
 */
function placementPredicates(mayReplace: string[], mayPlaceOn: string[]): unknown[] {
  const predicates: unknown[] = []
  if (mayReplace.length > 0) {
    predicates.push({
      type: 'minecraft:block_predicate_filter',
      predicate: { type: 'minecraft:matching_blocks', blocks: mayReplace },
    })
  }
  if (mayPlaceOn.length > 0) {
    predicates.push({
      type: 'minecraft:block_predicate_filter',
      predicate: {
        type: 'minecraft:matching_blocks',
        offset: [0, -1, 0],
        blocks: mayPlaceOn,
      },
    })
  }
  return predicates
}

export interface WorldgenOutput {
  files: VirtualFile[]
  /** Placed feature ids, grouped by the generation step they belong in. */
  placements: Array<{ id: string; step: number; biomeTags: string[] }>
}

export function emitWorldgen(ctx: JavaContext): WorldgenOutput {
  const files: VirtualFile[] = []
  const placements: WorldgenOutput['placements'] = []

  const configured = (name: string, value: unknown, node: ContentNode): void => {
    files.push({
      path: dataPath(ctx, 'worldgen/configured_feature', `${name}.json`),
      origin: { nodeId: node.id, kind: node.kind, label: `Feature · ${node.displayName}` },
      body: { type: 'json', value },
    })
  }

  const placed = (name: string, node: ContentNode, modifiers: unknown[]): void => {
    files.push({
      path: dataPath(ctx, 'worldgen/placed_feature', `${name}.json`),
      origin: { nodeId: node.id, kind: node.kind, label: `Placement · ${node.displayName}` },
      body: {
        type: 'json',
        value: { feature: `${ctx.modId}:${name}`, placement: modifiers },
      },
    })
    placements.push({
      id: `${ctx.modId}:${name}`,
      step: stepIndexFor(str(node.data, 'placementPass', 'surface_pass')),
      biomeTags: biomeTagsOf(node),
    })
  }

  for (const node of ctx.project.nodes) {
    if (node.kind === 'scatter') emitScatter(ctx, node, configured, placed)
    if (node.kind === 'tree') emitTree(ctx, node, configured, placed)
    if (node.kind === 'structure') {
      // Java places structures from binary .nbt files, which this builder does
      // not write. The mod export handles the painted grid in generated code
      // instead, so only the data-pack route loses anything here.
      if (ctx.loader === 'datapack') {
        ctx.warn(
          `Structure "${node.displayName}" is not written to the data pack: Java reads structures from .nbt files. Export a mod loader target to place it.`,
          node.id,
        )
      }
    }
  }

  for (const node of ctx.project.nodes.filter((n) => n.kind === 'biome')) {
    files.push(...emitBiome(ctx, node, placements))
  }

  return { files, placements }
}

function biomeTagsOf(node: ContentNode): string[] {
  const tags = [...list(node.data, 'biomeTags'), ...list(node.data, 'biomeTagsCustom')]
  return tags.length > 0 ? tags : ['overworld']
}

type ConfiguredWriter = (name: string, value: unknown, node: ContentNode) => void
type PlacedWriter = (name: string, node: ContentNode, modifiers: unknown[]) => void

function emitScatter(
  ctx: JavaContext,
  node: ContentNode,
  configured: ConfiguredWriter,
  placed: PlacedWriter,
): void {
  if (!bool(node.data, 'worldPlace', true)) return

  const blocks = weightedEntries(node.data.blocks).map((entry) => ({
    id: toJavaIdentifier(ctx.project, entry.id),
    weight: entry.weight,
  }))
  if (blocks.length === 0) {
    ctx.warn(`Scatter "${node.displayName}" has no blocks to place.`, node.id)
    return
  }

  const mayReplace = list(node.data, 'mayReplace').map((b) => toJavaIdentifier(ctx.project, b))
  const mayPlaceOn = list(node.data, 'mayPlaceOn').map((b) => toJavaIdentifier(ctx.project, b))

  configured(
    node.name,
    {
      type: 'minecraft:random_patch',
      config: {
        tries: Math.max(1, Math.round(num(node.data, 'patchSize', 1)) * 4),
        xz_spread: Math.max(0, Math.round(num(node.data, 'patchRadius', 3))),
        y_spread: 3,
        feature: {
          feature: {
            type: 'minecraft:simple_block',
            config: { to_place: weightedProvider(blocks) },
          },
          placement: placementPredicates(mayReplace, mayPlaceOn),
        },
      },
    },
    node,
  )

  placed(node.name, node, placementModifiers(node.data))
}

/** Bedrock's tree shapes, mapped onto Java's trunk and foliage placers. */
const TRUNK_PLACERS: Record<string, string> = {
  classic: 'minecraft:straight_trunk_placer',
  fancy: 'minecraft:fancy_trunk_placer',
  mega: 'minecraft:giant_trunk_placer',
  acacia: 'minecraft:forking_trunk_placer',
  bending: 'minecraft:bending_trunk_placer',
  cherry: 'minecraft:cherry_trunk_placer',
}

const FOLIAGE_PLACERS: Record<string, string> = {
  classic: 'minecraft:blob_foliage_placer',
  fancy: 'minecraft:fancy_foliage_placer',
  mega: 'minecraft:mega_pine_foliage_placer',
  acacia: 'minecraft:acacia_foliage_placer',
  bending: 'minecraft:random_spread_foliage_placer',
  cherry: 'minecraft:cherry_foliage_placer',
}

function emitTree(
  ctx: JavaContext,
  node: ContentNode,
  configured: ConfiguredWriter,
  placed: PlacedWriter,
): void {
  if (!bool(node.data, 'worldPlace', true)) return

  const shape = str(node.data, 'shape', 'classic')
  const trunkPlacer = TRUNK_PLACERS[shape] ?? TRUNK_PLACERS.classic
  const foliagePlacer = FOLIAGE_PLACERS[shape] ?? FOLIAGE_PLACERS.classic
  const heightMin = Math.max(1, Math.round(num(node.data, 'heightMin', 4)))
  const heightMax = Math.max(heightMin, Math.round(num(node.data, 'heightMax', 6)))

  const trunk: Record<string, unknown> = {
    type: trunkPlacer,
    base_height: heightMin,
    height_rand_a: Math.max(0, heightMax - heightMin),
    height_rand_b: 0,
  }
  // The fancy and cherry placers carry extra required fields; leaving them out
  // fails the codec rather than falling back to a default.
  if (shape === 'bending') {
    trunk.min_height_for_leaves = Math.max(1, heightMin - 1)
    trunk.bend_length = { type: 'minecraft:uniform', value: { min_inclusive: 1, max_inclusive: 3 } }
  }
  if (shape === 'cherry') {
    trunk.branch_count = { type: 'minecraft:uniform', value: { min_inclusive: 1, max_inclusive: 3 } }
    trunk.branch_horizontal_length = {
      type: 'minecraft:uniform',
      value: { min_inclusive: 2, max_inclusive: 4 },
    }
    trunk.branch_start_offset_from_top = {
      type: 'minecraft:uniform',
      value: { min_inclusive: -4, max_inclusive: -2 },
    }
    trunk.branch_end_offset_from_top = {
      type: 'minecraft:uniform',
      value: { min_inclusive: -1, max_inclusive: 0 },
    }
  }

  const foliage: Record<string, unknown> = {
    type: foliagePlacer,
    radius: Math.max(0, Math.round(num(node.data, 'canopyWidth', 2))),
    offset: 0,
  }
  if (shape === 'classic' || shape === 'acacia') {
    foliage.height = Math.max(1, Math.round(num(node.data, 'canopyHeight', 3)))
  }
  if (shape === 'bending') {
    foliage.foliage_height = Math.max(1, Math.round(num(node.data, 'canopyHeight', 3)))
    delete foliage.radius
    foliage.radius = Math.max(1, Math.round(num(node.data, 'canopyWidth', 2)))
  }
  if (shape === 'cherry') {
    foliage.height = Math.max(1, Math.round(num(node.data, 'canopyHeight', 3)))
    foliage.wide_bottom_layer_hole_chance = 0.2
    foliage.corner_hole_chance = 0.2
    foliage.hanging_leaves_chance = 0.25
    foliage.hanging_leaves_extension_chance = 0.5
  }

  configured(
    node.name,
    {
      type: 'minecraft:tree',
      config: {
        trunk_provider: {
          type: 'minecraft:simple_state_provider',
          state: blockState(toJavaIdentifier(ctx.project, str(node.data, 'trunkBlock', 'minecraft:oak_log'))),
        },
        foliage_provider: {
          type: 'minecraft:simple_state_provider',
          state: blockState(toJavaIdentifier(ctx.project, str(node.data, 'leafBlock', 'minecraft:oak_leaves'))),
        },
        dirt_provider: {
          type: 'minecraft:simple_state_provider',
          state: blockState(
            toJavaIdentifier(ctx.project, list(node.data, 'baseBlock')[0] ?? 'minecraft:dirt'),
          ),
        },
        trunk_placer: trunk,
        foliage_placer: foliage,
        minimum_size: {
          type: 'minecraft:two_layers_feature_size',
          limit: 1,
          lower_size: 0,
          upper_size: Math.max(1, Math.round(num(node.data, 'canopyWidth', 2))),
        },
        decorators: [],
        ignore_vines: true,
        force_dirt: false,
      },
    },
    node,
  )

  const modifiers = placementModifiers(node.data)
  // A tree needs somewhere legal to stand, which scattered grass does not.
  modifiers.push({
    type: 'minecraft:block_predicate_filter',
    predicate: {
      type: 'minecraft:would_survive',
      state: blockState(toJavaIdentifier(ctx.project, str(node.data, 'trunkBlock', 'minecraft:oak_log'))),
    },
  })
  placed(node.name, node, modifiers)
}

/** `#8a7d5c` -> the packed integer Java biome effects want. */
export function packColor(hex: string, fallback: number): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  return match ? parseInt(match[1], 16) : fallback
}

function emitBiome(
  ctx: JavaContext,
  node: ContentNode,
  placements: WorldgenOutput['placements'],
): VirtualFile[] {
  const files: VirtualFile[] = []
  const data = node.data

  // A "nested" biome adds plants to a host biome rather than being a biome of
  // its own, so there is no biome file to write — only the features, which the
  // plant loop below produces either way.
  const standalone = str(data, 'placement', 'standalone') === 'standalone'

  const plantFeatureIds: string[] = []
  const entries = readScatterEntries(data)
  if (entries.length > 0) {
    const blocks = entries
      .map((entry) => {
        const target = ctx.project.nodes.find((n) => n.id === entry.plant)
        if (!target) return null
        return { id: `${ctx.modId}:${target.name}`, weight: entry.weight }
      })
      .filter((entry): entry is { id: string; weight: number } => entry !== null)

    if (blocks.length > 0) {
      const featureName = `${node.name}_plants`
      const placeOn = entries.flatMap((entry) => entry.placeOn)
      files.push({
        path: dataPath(ctx, 'worldgen/configured_feature', `${featureName}.json`),
        origin: { nodeId: node.id, kind: node.kind, label: `Feature · ${node.displayName} plants` },
        body: {
          type: 'json',
          value: {
            type: 'minecraft:random_patch',
            config: {
              tries: Math.max(1, Math.round(num(data, 'scatterAttempts', 6))),
              xz_spread: 7,
              y_spread: 3,
              feature: {
                feature: {
                  type: 'minecraft:simple_block',
                  config: { to_place: weightedProvider(blocks) },
                },
                placement: placementPredicates(
                  ['minecraft:air'],
                  placeOn.length > 0
                    ? [...new Set(placeOn.map((b) => toJavaIdentifier(ctx.project, b)))]
                    : ['minecraft:farmland', 'minecraft:grass_block', 'minecraft:dirt'],
                ),
              },
            },
          },
        },
      })

      const chance = Math.max(1, Math.min(100, num(data, 'scatterChance', 35)))
      files.push({
        path: dataPath(ctx, 'worldgen/placed_feature', `${featureName}.json`),
        origin: { nodeId: node.id, kind: node.kind, label: `Placement · ${node.displayName} plants` },
        body: {
          type: 'json',
          value: {
            feature: `${ctx.modId}:${featureName}`,
            placement: [
              { type: 'minecraft:rarity_filter', chance: Math.max(1, Math.round(100 / chance)) },
              { type: 'minecraft:count', count: 1 },
              { type: 'minecraft:in_square' },
              { type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' },
              { type: 'minecraft:biome' },
            ],
          },
        },
      })
      plantFeatureIds.push(`${ctx.modId}:${featureName}`)

      // A nested biome scatters into a host biome that already exists, so the
      // feature is registered against that host's tag instead of a new biome.
      if (!standalone) {
        placements.push({
          id: `${ctx.modId}:${featureName}`,
          step: 9,
          biomeTags: [str(data, 'hostBiome', 'plains')],
        })
      }
    }
  }

  if (!standalone) return files

  const features: string[][] = GENERATION_STEPS.map(() => [])
  for (const id of plantFeatureIds) features[9].push(id)

  const carvers = ctx.profile.biomeCarversAsList
    ? []
    : { air: [] as string[], liquid: [] as string[] }

  files.push({
    path: dataPath(ctx, 'worldgen/biome', `${node.name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Biome · ${node.displayName}` },
    body: {
      type: 'json',
      value: {
        temperature: num(data, 'temperature', 0.8),
        downfall: num(data, 'downfall', 0.4),
        has_precipitation: num(data, 'downfall', 0.4) > 0,
        effects: {
          sky_color: packColor(str(data, 'fogColor', '#79a6ff'), 0x79a6ff),
          fog_color: packColor(str(data, 'fogColor', '#c0d8ff'), 0xc0d8ff),
          water_color: packColor(str(data, 'waterColor', '#3f76e4'), 0x3f76e4),
          water_fog_color: packColor(str(data, 'waterColor', '#050533'), 0x050533),
          grass_color: packColor(str(data, 'grassColor', '#79c05a'), 0x79c05a),
          foliage_color: packColor(str(data, 'foliageColor', '#59ae30'), 0x59ae30),
        },
        spawners: {},
        spawn_costs: {},
        carvers,
        features,
      },
    },
  })

  return files
}

/**
 * The loader-specific glue that attaches a placed feature to biomes that
 * already exist.
 *
 * Forge and NeoForge both read a biome modifier from the data pack, so those
 * two are pure JSON and need no code at all. Fabric and Quilt have no such
 * file — they go through `BiomeModifications` in the generated `ModWorldgen`
 * class instead — and a plain data pack has neither, which is exactly the
 * "partial" the capability matrix reports for scattering.
 */
export function biomeModifierFiles(
  ctx: JavaContext,
  placements: WorldgenOutput['placements'],
): VirtualFile[] {
  if (ctx.loader !== 'forge' && ctx.loader !== 'neoforge') return []
  if (placements.length === 0) return []

  const namespace = ctx.loader === 'forge' ? 'forge' : 'neoforge'
  return placements.map((placement) => {
    const name = placement.id.split(':')[1]
    return {
      path: `data/${ctx.modId}/${namespace}/biome_modifier/${name}.json`,
      origin: { label: `${namespace} · biome modifier` },
      body: {
        type: 'json',
        value: {
          type: `${namespace}:add_features`,
          // A tag reference reaches every biome carrying it, which is the
          // closest thing Java has to Bedrock's biome-tag filter.
          biomes: placement.biomeTags.map((tag) =>
            tag === 'overworld' ? '#minecraft:is_overworld' : `#minecraft:is_${tag}`,
          ),
          features: placement.id,
          step: GENERATION_STEPS[placement.step] ?? 'vegetal_decoration',
        },
      },
    }
  })
}

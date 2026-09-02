/**
 * The data pack half of a Java export.
 *
 * Everything here works on vanilla Java with no mod loader — recipes, loot
 * tables, tags and world generation are exactly what data packs are for. That
 * is also the boundary: nothing in this file can register a *new* block or
 * item, so a project whose content is mostly custom blocks will produce a
 * correct but nearly empty data pack. `capabilities.ts` says so up front, and
 * the export dialog repeats it before you build.
 *
 * The same files are reused verbatim inside a mod jar, which is why this module
 * knows nothing about loaders: a mod's `src/main/resources/data/` is a data
 * pack, so generating it twice would be generating it wrong.
 */

import type { ContentNode } from '../../model/types'
import type { VirtualFile } from '../../vfs/types'
import { bool, list, num, str } from '../../kinds/shared'
import { resolveStation } from '../../recipes/stations'
import { gridToPattern } from '../../kinds/recipe'
import { gridCellIndexes } from '../../recipes/stations'
import type { JavaContext } from './context'
import { dataPath, vanillaDataPath } from './context'
import { langKey, splitId, toJavaIdentifier } from './ids'

/** Java's eleven generation steps, in order. A biome must list all of them. */
export const GENERATION_STEPS = [
  'raw_generation',
  'lakes',
  'local_modifications',
  'underground_structures',
  'surface_structures',
  'strongholds',
  'underground_ores',
  'underground_decoration',
  'fluid_springs',
  'vegetal_decoration',
  'top_layer_modification',
] as const

/** Which of the eleven a Bedrock placement pass corresponds to. */
const PASS_TO_STEP: Record<string, number> = {
  pregeneration_pass: 0,
  first_pass: 0,
  before_underground_pass: 2,
  underground_pass: 6,
  after_underground_pass: 7,
  before_surface_pass: 8,
  surface_pass: 9,
  after_surface_pass: 9,
  final_pass: 10,
  sky_pass: 10,
}

export function stepIndexFor(pass: string): number {
  return PASS_TO_STEP[pass] ?? 9
}

// -- recipes ----------------------------------------------------------------

/** Maps a builder station onto the Java recipe type it becomes. */
const STATION_RECIPE_TYPE: Record<string, string> = {
  furnace: 'minecraft:smelting',
  blast_furnace: 'minecraft:blasting',
  smoker: 'minecraft:smoking',
  campfire: 'minecraft:campfire_cooking',
  soul_campfire: 'minecraft:campfire_cooking',
  stonecutter: 'minecraft:stonecutting',
}

/** Default cook time in ticks, per station. Vanilla furnace is 200. */
const STATION_COOK_TIME: Record<string, number> = {
  furnace: 200,
  blast_furnace: 100,
  smoker: 100,
  campfire: 600,
  soul_campfire: 600,
}

/**
 * An ingredient, written the way this Minecraft version wants it.
 *
 * 1.21 dropped the wrapper object: `{"item": "minecraft:stick"}` became the
 * bare string `"minecraft:stick"`. Tags kept an object on both.
 */
function ingredient(ctx: JavaContext, identifier: string): unknown {
  const mapped = toJavaIdentifier(ctx.project, identifier)
  if (mapped.startsWith('#')) return { tag: mapped.slice(1) }
  return ctx.profile.recipeSyntax === 'modern' ? mapped : { item: mapped }
}

/** A crafting result, which changed key names in the same release. */
function craftingResult(ctx: JavaContext, identifier: string, count: number): unknown {
  const mapped = toJavaIdentifier(ctx.project, identifier)
  return ctx.profile.recipeSyntax === 'modern'
    ? { id: mapped, count }
    : { item: mapped, count }
}

/** A cooking result. 1.20.1 wrote a bare string here; 1.21 writes an object. */
function cookingResult(ctx: JavaContext, identifier: string): unknown {
  const mapped = toJavaIdentifier(ctx.project, identifier)
  return ctx.profile.recipeSyntax === 'modern' ? { id: mapped } : mapped
}

export interface RecipeSplit {
  /** Recipes a data pack can express, as files. */
  files: VirtualFile[]
  /**
   * Recipes made at one of the project's own stations. A data pack has no way
   * to express these, so they are handed to the mod generator instead, which
   * bakes them into the station's matcher.
   */
  stationRecipes: ContentNode[]
}

export function emitRecipes(ctx: JavaContext): RecipeSplit {
  const files: VirtualFile[] = []
  const stationRecipes: ContentNode[] = []
  const folder = ctx.profile.registryFolders.recipe

  for (const node of ctx.project.nodes.filter((n) => n.kind === 'recipe')) {
    const data = node.data
    const { station } = resolveStation(ctx.project, data)
    const result = str(data, 'result').trim()
    if (!result) continue

    // A station backed by one of this project's blocks has no vanilla recipe
    // type to become, so it takes the other route entirely.
    if (station.blockNodeId) {
      stationRecipes.push(node)
      continue
    }

    const count = Math.max(1, Math.round(num(data, 'resultCount', 1)))
    let value: Record<string, unknown> | null = null

    if (station.layout.kind === 'cook') {
      const input = str(data, 'input').trim()
      if (!input) continue
      const type = STATION_RECIPE_TYPE[station.id]
      if (!type) continue
      value = {
        type,
        category: 'food',
        ingredient: ingredient(ctx, input),
        result: cookingResult(ctx, result),
        experience: 0.35,
        cookingtime: STATION_COOK_TIME[station.id] ?? 200,
      }
      if (str(data, 'fuel').trim()) {
        // Java smelting takes no fuel either — same story as Bedrock, and worth
        // saying once rather than letting the slot vanish without explanation.
        ctx.warn(
          `The fuel slot on "${node.displayName}" is not written to Java: what burns is decided by the fuel item, not the recipe.`,
          node.id,
        )
      }
    } else if (station.id === 'stonecutter') {
      const cells = Array.isArray(data.grid) ? (data.grid as unknown[]) : []
      const input = typeof cells[0] === 'string' ? cells[0].trim() : ''
      if (!input) continue
      value =
        ctx.profile.recipeSyntax === 'modern'
          ? {
              type: 'minecraft:stonecutting',
              ingredient: ingredient(ctx, input),
              result: craftingResult(ctx, result, count),
            }
          : {
              type: 'minecraft:stonecutting',
              ingredient: ingredient(ctx, input),
              result: toJavaIdentifier(ctx.project, result),
              count,
            }
    } else {
      const layout = station.layout
      const cells = Array.isArray(data.grid)
        ? (data.grid as unknown[]).map((cell) => (typeof cell === 'string' ? cell : ''))
        : []
      const shapeless = str(data, 'recipeType', 'shaped') === 'shapeless'

      if (shapeless) {
        const visible = gridCellIndexes(layout)
          .map((index) => (cells[index] ?? '').trim())
          .filter(Boolean)
        if (visible.length === 0) continue
        value = {
          type: 'minecraft:crafting_shapeless',
          category: 'misc',
          ingredients: visible.map((item) => ingredient(ctx, item)),
          result: craftingResult(ctx, result, count),
        }
      } else {
        const grid = gridToPattern(cells, {
          rows: layout.rows,
          cols: layout.cols,
          trim: data.trimPattern !== false,
        })
        if (!grid) continue
        value = {
          type: 'minecraft:crafting_shaped',
          category: 'misc',
          pattern: grid.pattern,
          key: Object.fromEntries(
            Object.entries(grid.key).map(([letter, entry]) => [
              letter,
              ingredient(ctx, entry.item),
            ]),
          ),
          result: craftingResult(ctx, result, count),
        }
      }
    }

    if (!value) continue
    files.push({
      path: dataPath(ctx, folder, `${node.name}.json`),
      origin: { nodeId: node.id, kind: node.kind, label: `Recipe · ${node.displayName}` },
      body: { type: 'json', value },
    })
  }

  return { files, stationRecipes }
}

// -- loot tables -------------------------------------------------------------

function survivesExplosion(): unknown {
  return { condition: 'minecraft:survives_explosion' }
}

export function emitLootTables(ctx: JavaContext): VirtualFile[] {
  const files: VirtualFile[] = []
  const folder = ctx.profile.registryFolders.lootTable

  for (const node of ctx.project.nodes) {
    if (node.kind === 'block') {
      if (!bool(node.data, 'lootSelf', true)) {
        files.push({
          path: dataPath(ctx, folder, `blocks/${node.name}.json`),
          origin: { nodeId: node.id, kind: node.kind, label: `Loot · ${node.displayName}` },
          body: { type: 'json', value: { type: 'minecraft:block', pools: [] } },
        })
        continue
      }
      files.push({
        path: dataPath(ctx, folder, `blocks/${node.name}.json`),
        origin: { nodeId: node.id, kind: node.kind, label: `Loot · ${node.displayName}` },
        body: {
          type: 'json',
          value: {
            type: 'minecraft:block',
            pools: [
              {
                rolls: 1,
                bonus_rolls: 0,
                entries: [{ type: 'minecraft:item', name: `${ctx.modId}:${node.name}` }],
                conditions: [survivesExplosion()],
              },
            ],
          },
        },
      })
    }

    if (node.kind === 'crop') {
      files.push(emitCropLoot(ctx, node, folder))
    }
  }

  return files
}

/**
 * A crop's drops, in the vanilla shape: seeds always, produce only at full
 * growth, and a fortune-boosted second seed roll on top. Writing this by hand
 * is the single most error-prone part of adding a Java crop, which is exactly
 * why it is generated.
 */
function emitCropLoot(ctx: JavaContext, node: ContentNode, folder: string): VirtualFile {
  const stages = Math.max(2, Math.round(num(node.data, 'stages', 4)))
  const maxAge = stages - 1
  const blockId = `${ctx.modId}:${node.name}`
  const seedName = str(node.data, 'seedName').trim() || `${node.name}_seeds`
  const seedId = bool(node.data, 'generateSeed', true) ? `${ctx.modId}:${seedName}` : blockId
  const produce = str(node.data, 'produce').trim()
  const produceId = produce ? toJavaIdentifier(ctx.project, produce) : seedId

  const ripe = {
    condition: 'minecraft:block_state_property',
    block: blockId,
    properties: { age: String(maxAge) },
  }

  return {
    path: dataPath(ctx, folder, `blocks/${node.name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Loot · ${node.displayName}` },
    body: {
      type: 'json',
      value: {
        type: 'minecraft:block',
        pools: [
          {
            // Produce when ripe, otherwise a single seed back.
            rolls: 1,
            bonus_rolls: 0,
            entries: [
              {
                type: 'minecraft:alternatives',
                children: [
                  { type: 'minecraft:item', name: produceId, conditions: [ripe] },
                  { type: 'minecraft:item', name: seedId },
                ],
              },
            ],
          },
          {
            // The extra seeds, which only a ripe plant gives and which fortune
            // improves — the same binomial the vanilla wheat table uses.
            rolls: 1,
            bonus_rolls: 0,
            conditions: [ripe],
            entries: [
              {
                type: 'minecraft:item',
                name: seedId,
                functions: [
                  {
                    function: 'minecraft:apply_bonus',
                    enchantment: 'minecraft:fortune',
                    formula: 'minecraft:binomial_with_bonus_count',
                    parameters: { extra: 3, probability: 0.5714286 },
                  },
                  {
                    function: 'minecraft:limit_count',
                    limit: { max: Math.max(1, Math.round(num(node.data, 'seedDropMax', 2))) },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  }
}

// -- tags --------------------------------------------------------------------

/**
 * Tags come from two places: the block's own `tags` field, which becomes a tag
 * file under this mod's namespace, and the mining tags every Java block needs
 * if it is not to take forever to break with the wrong tool.
 */
export function emitTags(ctx: JavaContext): VirtualFile[] {
  const files: VirtualFile[] = []
  const { tagBlock, tagItem } = ctx.profile.registryFolders

  const own = new Map<string, string[]>()
  const pickaxe: string[] = []
  const hoe: string[] = []
  const crops: string[] = []

  for (const node of ctx.project.nodes) {
    if (node.kind === 'block') {
      const id = `${ctx.modId}:${node.name}`
      // Anything harder than a plant wants a pickaxe; below that, breaking by
      // hand is already instant and a mining tag would be noise.
      if (num(node.data, 'destroyTime', 1.5) > 0.2) pickaxe.push(id)
      for (const tag of list(node.data, 'tags')) {
        const { namespace, path } = splitId(tag)
        if (namespace !== 'minecraft') continue
        const key = path
        own.set(key, [...(own.get(key) ?? []), id])
      }
    }
    if (node.kind === 'crop') {
      const id = `${ctx.modId}:${node.name}`
      crops.push(id)
      hoe.push(id)
    }
  }

  const tagFile = (path: string, values: string[]): VirtualFile => ({
    path,
    origin: { label: 'Data pack · tags' },
    body: { type: 'json', value: { replace: false, values } },
  })

  if (pickaxe.length > 0) {
    files.push(tagFile(vanillaDataPath(tagBlock, 'mineable/pickaxe.json'), pickaxe))
  }
  if (hoe.length > 0) {
    files.push(tagFile(vanillaDataPath(tagBlock, 'mineable/hoe.json'), hoe))
  }
  if (crops.length > 0) {
    files.push(tagFile(vanillaDataPath(tagBlock, 'crops.json'), crops))
  }
  for (const [path, values] of own) {
    files.push(tagFile(vanillaDataPath(tagBlock, `${path}.json`), values))
  }

  // Every block this project adds is also an item, so it earns an item tag the
  // add-on's own recipes can point at instead of listing identifiers.
  const items = ctx.project.nodes
    .filter((node) => node.kind === 'item' || node.kind === 'block')
    .map((node) => `${ctx.modId}:${node.name}`)
  if (items.length > 0) {
    files.push(
      tagFile(dataPath(ctx, tagItem, `${ctx.modId}_content.json`), items),
    )
  }

  return files
}

// -- world generation --------------------------------------------------------

function heightPlacement(data: Record<string, unknown>): unknown[] {
  const mode = str(data, 'yMode', 'surface')
  if (mode === 'surface') {
    return [{ type: 'minecraft:heightmap', heightmap: 'MOTION_BLOCKING' }]
  }
  const min = Math.round(num(data, 'yMin', 0))
  const max = Math.round(num(data, 'yMax', 64))
  if (mode === 'fixed') {
    return [{ type: 'minecraft:height_range', height: { absolute: min } }]
  }
  const distribution = mode === 'triangle' ? 'minecraft:trapezoid' : 'minecraft:uniform'
  return [
    {
      type: 'minecraft:height_range',
      height: {
        type: distribution,
        min_inclusive: { absolute: Math.min(min, max) },
        max_inclusive: { absolute: Math.max(min, max) },
      },
    },
  ]
}

/**
 * Bedrock places a feature with a percentage chance per chunk plus an iteration
 * count. Java counts placements per chunk and filters with a rarity modifier,
 * so the two are reconciled here rather than in each kind.
 */
export function placementModifiers(data: Record<string, unknown>): unknown[] {
  const percent = Math.max(0, Math.min(100, num(data, 'scatterPercent', 20)))
  const iterations = Math.max(1, Math.round(num(data, 'iterations', 1)))
  const modifiers: unknown[] = []

  if (percent < 100) {
    // `rarity_filter` is "one chunk in N", so a 25% chance is one in four.
    modifiers.push({ type: 'minecraft:rarity_filter', chance: Math.max(1, Math.round(100 / Math.max(1, percent))) })
  }
  modifiers.push({ type: 'minecraft:count', count: iterations })
  modifiers.push({ type: 'minecraft:in_square' })
  modifiers.push(...heightPlacement(data))
  modifiers.push({ type: 'minecraft:biome' })
  return modifiers
}

export function langFileFor(ctx: JavaContext): VirtualFile | null {
  if (ctx.lang.size === 0) return null
  const value = Object.fromEntries([...ctx.lang.entries()].sort(([a], [b]) => a.localeCompare(b)))
  return {
    path: `assets/${ctx.modId}/lang/en_us.json`,
    origin: { label: 'Resource pack · language' },
    body: { type: 'json', value },
  }
}

/** Adds the display-name keys every Java block and item needs. */
export function collectLang(ctx: JavaContext): void {
  for (const node of ctx.project.nodes) {
    if (node.kind === 'block' || node.kind === 'crop') {
      ctx.lang.set(langKey('block', ctx.project, node.name), node.displayName)
    }
    if (node.kind === 'item' || node.kind === 'block') {
      ctx.lang.set(langKey('item', ctx.project, node.name), node.displayName)
    }
    if (node.kind === 'crop' && bool(node.data, 'generateSeed', true)) {
      const seedName = str(node.data, 'seedName').trim() || `${node.name}_seeds`
      const seedLabel = str(node.data, 'seedDisplayName').trim() || `${node.displayName} Seeds`
      ctx.lang.set(langKey('item', ctx.project, seedName), seedLabel)
    }
    if (node.kind === 'entity') {
      ctx.lang.set(langKey('entity', ctx.project, node.name), node.displayName)
    }
  }
  ctx.lang.set(`itemGroup.${ctx.modId}.main`, ctx.project.name)
}

/**
 * Crafting stations.
 *
 * A station is the *shape* of a recipe: how many ingredient slots it has, how
 * they are arranged, and which `tags` the generated recipe carries so the game
 * knows where it can be crafted. The Recipe builder draws one tab per station
 * straight from this list, so adding a smithing bench or a cauldron later is an
 * entry here rather than a new screen.
 *
 * Two sources feed the list:
 *
 *   - the built-ins below, which mirror the vanilla stations, and
 *   - every block in the project that declares itself a crafting station,
 *     which is how a mod's own cooking pot or frying pan gets its own tab
 *     without anything being hardcoded.
 */

import type { ProjectModel } from '../model/types'
import { bool, list, num, str } from '../kinds/shared'
import { BEDROCK_CRAFTING_TABLE_LIMITS } from './stationLimits'

/** How a station arranges its ingredient slots. */
export type StationLayout =
  /**
   * A rows x cols arrangement. Cells are addressed in the same 3x3 coordinate
   * space whatever the size, so narrowing a station never re-shuffles a recipe
   * that was already laid out.
   */
  | { kind: 'grid'; rows: number; cols: number }
  /** One input, an optional fuel slot, one output — the furnace family. */
  | { kind: 'cook'; fuel: boolean }

export interface CraftingStation {
  id: string
  label: string
  /** lucide-react icon name, resolved by the UI. */
  icon: string
  hint: string
  /** Written into the recipe's `tags`, which is what makes it craftable here. */
  tags: string[]
  layout: StationLayout
  /** Stations that only accept an unordered ingredient list (the stonecutter). */
  forceShapeless?: boolean
  /** Set for stations that come from a block in this project. */
  blockNodeId?: string
  /**
   * Text drawn at the top of the station's screen. Bedrock writes this into
   * `table_name`; the Java export uses it as the menu title.
   */
  screenTitle?: string
}

/** The prefix that marks a station backed by one of the project's own blocks. */
export const NODE_STATION_PREFIX = 'node:'

const builtins = new Map<string, CraftingStation>()

export function registerStation(station: CraftingStation): void {
  builtins.set(station.id, station)
}

const BUILTIN_STATIONS: CraftingStation[] = [
  {
    id: 'crafting_table',
    label: 'Crafting Table',
    icon: 'Grid3x3',
    hint: 'The 3x3 grid. Shaped or shapeless.',
    tags: ['crafting_table'],
    layout: { kind: 'grid', rows: 3, cols: 3 },
  },
  {
    id: 'furnace',
    label: 'Furnace',
    icon: 'Flame',
    hint: 'Smelts one item, burning fuel underneath.',
    tags: ['furnace'],
    layout: { kind: 'cook', fuel: true },
  },
  {
    id: 'blast_furnace',
    label: 'Blast Furnace',
    icon: 'Factory',
    hint: 'Twice as fast as a furnace, ores and metals only.',
    tags: ['blast_furnace'],
    layout: { kind: 'cook', fuel: true },
  },
  {
    id: 'smoker',
    label: 'Smoker',
    icon: 'CookingPot',
    hint: 'Twice as fast as a furnace, food only.',
    tags: ['smoker'],
    layout: { kind: 'cook', fuel: true },
  },
  {
    id: 'campfire',
    label: 'Campfire',
    icon: 'Tent',
    hint: 'Slow cooking, no fuel slot — the fire is the fuel.',
    tags: ['campfire'],
    layout: { kind: 'cook', fuel: false },
  },
  {
    id: 'soul_campfire',
    label: 'Soul Campfire',
    icon: 'Ghost',
    hint: 'Same as a campfire, soul-fire flavoured.',
    tags: ['soul_campfire'],
    layout: { kind: 'cook', fuel: false },
  },
  {
    id: 'stonecutter',
    label: 'Stonecutter',
    icon: 'Scissors',
    hint: 'One block in, one block out.',
    tags: ['stonecutter'],
    layout: { kind: 'grid', rows: 1, cols: 1 },
    forceShapeless: true,
  },
]

for (const station of BUILTIN_STATIONS) registerStation(station)

export function builtinStations(): CraftingStation[] {
  return [...builtins.values()]
}

/**
 * Turns a block that declares `isCraftingStation` into a station tab.
 *
 * The in-game screen a `minecraft:crafting_table` component opens is always
 * 3x3; the rows/cols below only constrain the shape of the recipe, which is
 * what lets a two-slot cooking pot feel like a two-slot cooking pot.
 */
export function stationFromBlock(project: ProjectModel, nodeId: string): CraftingStation | null {
  const node = project.nodes.find((n) => n.id === nodeId)
  if (!node || node.kind !== 'block') return null
  if (!bool(node.data, 'isCraftingStation')) return null
  const tag = str(node.data, 'craftingTag').trim()
  if (!tag) return null

  // Extra tags let one block double as, say, both a cooking pot and a normal
  // crafting table. Bedrock caps the list, so it is trimmed here rather than
  // being rejected by the game after export.
  const extra = list(node.data, 'craftingExtraTags')
    .map((entry) => entry.trim())
    .filter((entry) => entry && entry !== tag)
  const tags = [tag, ...extra].slice(0, BEDROCK_CRAFTING_TABLE_LIMITS.maxTags)

  return {
    id: `${NODE_STATION_PREFIX}${node.id}`,
    label: node.displayName,
    icon: 'Box',
    hint: `Custom station from this add-on — recipes tagged "${tag}".`,
    tags,
    layout: {
      kind: 'grid',
      rows: Math.min(3, Math.max(1, Math.round(num(node.data, 'craftingGridRows', 3)))),
      cols: Math.min(3, Math.max(1, Math.round(num(node.data, 'craftingGridCols', 3)))),
    },
    blockNodeId: node.id,
    screenTitle: str(node.data, 'craftingScreenTitle').trim() || node.displayName,
  }
}

/** Every station this project can craft at: the vanilla ones plus its own. */
export function stationsFor(project: ProjectModel): CraftingStation[] {
  const own = project.nodes
    .filter((node) => node.kind === 'block')
    .map((node) => stationFromBlock(project, node.id))
    .filter((station): station is CraftingStation => station !== null)
  return [...builtinStations(), ...own]
}

export function stationById(project: ProjectModel, id: string): CraftingStation | undefined {
  if (id.startsWith(NODE_STATION_PREFIX)) {
    return stationFromBlock(project, id.slice(NODE_STATION_PREFIX.length)) ?? undefined
  }
  return builtins.get(id)
}

export const DEFAULT_STATION_ID = 'crafting_table'

export interface ResolvedStation {
  station: CraftingStation
  /**
   * True when the saved station could not be found — a deleted cookware block,
   * or a preset written for a station this build does not know. The recipe
   * falls back to the crafting table rather than silently emitting nothing.
   */
  fallback: boolean
}

/**
 * Works out which station a recipe belongs to.
 *
 * Recipes saved before stations existed only carry a `stations` tag list, so
 * that is matched back onto a station rather than being thrown away.
 */
export function resolveStation(project: ProjectModel, data: Record<string, unknown>): ResolvedStation {
  const explicit = str(data, 'station').trim()
  if (explicit) {
    const found = stationById(project, explicit)
    if (found) return { station: found, fallback: false }
  }

  const legacy = Array.isArray(data.stations)
    ? (data.stations as unknown[]).filter((t): t is string => typeof t === 'string')
    : []
  for (const tag of legacy) {
    const match = stationsFor(project).find((station) => station.tags.includes(tag))
    if (match) return { station: match, fallback: false }
  }

  const fallbackStation = builtins.get(DEFAULT_STATION_ID)!
  return { station: fallbackStation, fallback: Boolean(explicit) || legacy.length > 0 }
}

/** Grid stations address their cells in a fixed 3x3 space; this is the window. */
export function gridCellIndexes(layout: Extract<StationLayout, { kind: 'grid' }>): number[] {
  const out: number[] = []
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) out.push(row * 3 + col)
  }
  return out
}

/** True for station ids that lay ingredients out on a grid. */
export function isGridStationId(id: string): boolean {
  if (!id || id.startsWith(NODE_STATION_PREFIX)) return true
  const station = builtins.get(id)
  return station ? station.layout.kind === 'grid' : true
}

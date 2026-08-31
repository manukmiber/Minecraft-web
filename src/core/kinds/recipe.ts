/**
 * Crafting recipes.
 *
 * A recipe is authored against a *station* (see `core/recipes/stations`): the
 * station decides how many ingredient slots there are, how they are arranged
 * and which `tags` the recipe carries. The generator then works out the pattern
 * string, the key map and which rows/columns to trim — so what the builder
 * stores is the arrangement, never the JSON.
 *
 * A custom cookware block from this add-on is a station too, which is how a
 * cooking pot gets its own tab without a scripted crafting screen.
 */

import type { ContentKind } from '../registry/types'
import { BP } from '../generators/emit'
import {
  DEFAULT_STATION_ID,
  gridCellIndexes,
  isGridStationId,
  resolveStation,
} from '../recipes/stations'
import { compact, list, num, str } from './shared'

/** Letters used for pattern keys, in assignment order. */
const KEY_LETTERS = 'ABCDEFGHI'

export interface GridResult {
  pattern: string[]
  key: Record<string, { item: string }>
}

export interface GridOptions {
  /** Ingredient rows/columns the station exposes. Defaults to the full 3x3. */
  rows?: number
  cols?: number
  trim?: boolean
}

/**
 * Turns grid cells into a Bedrock pattern + key. Cells are always addressed in
 * a 3x3 space — a 2x2 station reads the top-left corner of it — so narrowing a
 * station never re-shuffles an arrangement that already exists.
 *
 * Empty rows and columns are trimmed by default so a small recipe is not
 * accidentally pinned to one corner of the crafting grid.
 */
export function gridToPattern(cells: string[], options: boolean | GridOptions = true): GridResult | null {
  const opts: GridOptions = typeof options === 'boolean' ? { trim: options } : options
  const rows = Math.min(3, Math.max(1, opts.rows ?? 3))
  const cols = Math.min(3, Math.max(1, opts.cols ?? 3))
  const trim = opts.trim !== false

  const grid = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => (cells[row * 3 + col] ?? '').trim()),
  )

  if (grid.every((row) => row.every((cell) => cell === ''))) return null

  let rowStart = 0
  let rowEnd = rows - 1
  let colStart = 0
  let colEnd = cols - 1

  if (trim) {
    while (rowStart < rows && grid[rowStart].every((c) => c === '')) rowStart++
    while (rowEnd >= 0 && grid[rowEnd].every((c) => c === '')) rowEnd--
    while (colStart < cols && grid.every((row) => row[colStart] === '')) colStart++
    while (colEnd >= 0 && grid.every((row) => row[colEnd] === '')) colEnd--
  }

  const key: Record<string, { item: string }> = {}
  const letterFor = new Map<string, string>()
  const pattern: string[] = []

  for (let row = rowStart; row <= rowEnd; row++) {
    let line = ''
    for (let col = colStart; col <= colEnd; col++) {
      const item = grid[row][col]
      if (!item) {
        line += ' '
        continue
      }
      let letter = letterFor.get(item)
      if (!letter) {
        letter = KEY_LETTERS[letterFor.size]
        if (!letter) return null
        letterFor.set(item, letter)
        key[letter] = { item }
      }
      line += letter
    }
    pattern.push(line)
  }

  return { pattern, key }
}

export const recipeKind: ContentKind = {
  id: 'recipe',
  label: 'Recipe',
  plural: 'Recipes',
  icon: 'Hammer',
  accent: 'amber',
  group: 'crafting',
  description:
    'A crafting, cooking or smelting recipe. Pick a station, drag ingredients onto its slots and the pattern writes itself.',
  preview: { type: 'none' },

  fields: [
    {
      key: 'station',
      label: 'Station and ingredients',
      // Renders the whole visual builder: station tabs, the slots, the item
      // browser and the in-game preview.
      type: 'recipe-station',
      group: 'Recipe',
    },
    {
      key: 'trimPattern',
      label: 'Trim empty rows and columns',
      type: 'boolean',
      group: 'Recipe',
      when: (data) =>
        isGridStationId(str(data, 'station', DEFAULT_STATION_ID)) &&
        str(data, 'recipeType', 'shaped') === 'shaped',
      help: 'On, the arrangement can be placed anywhere in the grid. Off, it must match position exactly.',
    },
    {
      key: 'result',
      label: 'Result item',
      type: 'item-ref',
      group: 'Result',
      help: 'Identifier of what gets crafted. Set it here or by filling the output slot above.',
    },
    {
      key: 'resultCount',
      label: 'Result count',
      type: 'number',
      group: 'Result',
      min: 1,
      max: 64,
      step: 1,
    },
    {
      key: 'unlockItems',
      label: 'Unlocked by',
      type: 'string-list',
      group: 'Result',
      help: 'Items that reveal this recipe in the recipe book. Leave empty to unlock it immediately.',
    },
    {
      key: 'priority',
      label: 'Priority',
      type: 'number',
      group: 'Advanced',
      step: 1,
      help: 'Lower wins when several recipes match the same ingredients.',
    },
  ],

  textureSlots: () => [],

  defaults: () => ({
    station: DEFAULT_STATION_ID,
    recipeType: 'shaped',
    grid: ['', '', '', '', '', '', '', '', ''],
    trimPattern: true,
    input: '',
    fuel: '',
    result: '',
    resultCount: 1,
    unlockItems: [],
    priority: 0,
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const identifier = ctx.identifier(node)

    const { station, fallback } = resolveStation(ctx.project, data)
    if (fallback) {
      ctx.warn(
        `Recipe "${node.displayName}" was made at a station that no longer exists, so it is emitted for the crafting table.`,
      )
    }

    const result = str(data, 'result').trim()
    if (!result) {
      ctx.warn(`Recipe "${node.displayName}" has no result item.`)
      return []
    }

    const unlock = list(data, 'unlockItems').map((item) => ({ item }))
    const priority = Math.round(num(data, 'priority', 0))
    const count = Math.max(1, Math.round(num(data, 'resultCount', 1)))

    const shared = compact({
      description: { identifier },
      tags: station.tags,
      priority: priority !== 0 ? priority : undefined,
      unlock: unlock.length > 0 ? unlock : undefined,
    })

    let value: unknown

    if (station.layout.kind === 'cook') {
      const input = str(data, 'input').trim()
      if (!input) {
        ctx.warn(`Cooking recipe "${node.displayName}" has no input item.`)
        return []
      }
      // Bedrock's furnace recipe carries no fuel: what burns is decided by the
      // fuel item's own `minecraft:fuel` component. The builder still shows a
      // fuel slot, and this is where an item that cannot actually burn is
      // caught rather than failing silently in-game.
      const fuel = str(data, 'fuel').trim()
      if (fuel && station.layout.fuel) {
        const own = ctx
          .nodesOfKind('item')
          .find((candidate) => ctx.identifier(candidate) === fuel)
        if (own && own.data.isFuel !== true) {
          ctx.warn(
            `"${own.displayName}" sits in the fuel slot of "${node.displayName}" but is not marked as usable fuel, so it will not burn.`,
          )
        }
      }

      value = {
        format_version: target.formats.recipe,
        'minecraft:recipe_furnace': {
          ...shared,
          input: { item: input },
          output: { item: result },
        },
      }
    } else {
      const layout = station.layout
      const cells = Array.isArray(data.grid)
        ? (data.grid as unknown[]).map((cell) => (typeof cell === 'string' ? cell : ''))
        : []
      const visible = gridCellIndexes(layout)
        .map((index) => (cells[index] ?? '').trim())
        .filter((cell) => cell !== '')

      const shapeless =
        station.forceShapeless === true || str(data, 'recipeType', 'shaped') === 'shapeless'

      if (shapeless) {
        if (visible.length === 0) {
          ctx.warn(`Recipe "${node.displayName}" has no ingredients.`)
          return []
        }
        value = {
          format_version: target.formats.recipe,
          'minecraft:recipe_shapeless': {
            ...shared,
            ingredients: visible.map((item) => ({ item })),
            result: { item: result, count },
          },
        }
      } else {
        const grid = gridToPattern(cells, {
          rows: layout.rows,
          cols: layout.cols,
          trim: data.trimPattern !== false,
        })
        if (!grid) {
          ctx.warn(`Recipe "${node.displayName}" has an empty crafting grid.`)
          return []
        }
        value = {
          format_version: target.formats.recipe,
          'minecraft:recipe_shaped': {
            ...shared,
            pattern: grid.pattern,
            key: grid.key,
            result: { item: result, count },
          },
        }
      }
    }

    return [
      {
        path: `${BP}/recipes/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Recipe · ${node.displayName}` },
        body: { type: 'json', value },
      },
    ]
  },
}

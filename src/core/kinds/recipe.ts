/**
 * Crafting recipes.
 *
 * The interesting one is the shaped recipe: you arrange ingredients on a 3x3
 * grid in the UI and the generator works out the pattern string, the key map
 * and which rows/columns to trim. A "cooking" recipe is simply a shaped recipe
 * with a cookware block sitting in one of the slots — no custom crafting UI is
 * involved, which is what keeps it working without a scripted interface.
 */

import type { ContentKind } from '../registry/types'
import { BP } from '../generators/emit'
import { compact, list, num, str } from './shared'

/** Letters used for pattern keys, in assignment order. */
const KEY_LETTERS = 'ABCDEFGHI'

export interface GridResult {
  pattern: string[]
  key: Record<string, { item: string }>
}

/**
 * Turns a 9-cell grid into a Bedrock pattern + key. Empty rows and columns are
 * trimmed so a small recipe is not accidentally pinned to one corner of the
 * crafting grid.
 */
export function gridToPattern(cells: string[], trim = true): GridResult | null {
  const grid = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 3 }, (_, col) => (cells[row * 3 + col] ?? '').trim()),
  )

  if (grid.every((row) => row.every((cell) => cell === ''))) return null

  let rowStart = 0
  let rowEnd = 2
  let colStart = 0
  let colEnd = 2

  if (trim) {
    while (rowStart < 3 && grid[rowStart].every((c) => c === '')) rowStart++
    while (rowEnd >= 0 && grid[rowEnd].every((c) => c === '')) rowEnd--
    while (colStart < 3 && grid.every((row) => row[colStart] === '')) colStart++
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
    'A crafting, cooking or smelting recipe. Drop ingredients onto the grid and the pattern writes itself.',
  preview: { type: 'none' },

  fields: [
    {
      key: 'recipeType',
      label: 'Recipe type',
      type: 'select',
      group: 'General',
      options: [
        { value: 'shaped', label: 'Shaped', hint: 'Ingredients must sit in a specific arrangement' },
        { value: 'shapeless', label: 'Shapeless', hint: 'Order does not matter' },
        { value: 'furnace', label: 'Smelting', hint: 'Furnace, smoker or blast furnace' },
      ],
    },
    {
      key: 'grid',
      label: 'Ingredients',
      type: 'recipe-grid',
      group: 'Ingredients',
      help: 'Place a cookware block in a slot to make it a required tool for the dish.',
      when: (data) => str(data, 'recipeType', 'shaped') !== 'furnace',
    },
    {
      key: 'trimPattern',
      label: 'Trim empty rows and columns',
      type: 'boolean',
      group: 'Ingredients',
      when: (data) => str(data, 'recipeType', 'shaped') === 'shaped',
      help: 'On, the arrangement can be placed anywhere in the grid. Off, it must match position exactly.',
    },
    {
      key: 'input',
      label: 'Input item',
      type: 'item-ref',
      group: 'Ingredients',
      when: (data) => str(data, 'recipeType') === 'furnace',
    },
    {
      key: 'result',
      label: 'Result item',
      type: 'item-ref',
      group: 'Result',
      help: 'Identifier of what gets crafted, e.g. mmm:fried_egg.',
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
      key: 'stations',
      label: 'Crafted at',
      type: 'multiselect',
      group: 'Result',
      options: [
        { value: 'crafting_table', label: 'Crafting table' },
        { value: 'furnace', label: 'Furnace' },
        { value: 'smoker', label: 'Smoker' },
        { value: 'blast_furnace', label: 'Blast furnace' },
        { value: 'campfire', label: 'Campfire' },
        { value: 'soul_campfire', label: 'Soul campfire' },
        { value: 'stonecutter', label: 'Stonecutter' },
      ],
      help: 'Vanilla stations only. A custom cookware block belongs in the grid as an ingredient, not here.',
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
    recipeType: 'shaped',
    grid: ['', '', '', '', '', '', '', '', ''],
    trimPattern: true,
    input: '',
    result: '',
    resultCount: 1,
    stations: ['crafting_table'],
    unlockItems: [],
    priority: 0,
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const identifier = ctx.identifier(node)
    const type = str(data, 'recipeType', 'shaped')

    const result = str(data, 'result').trim()
    if (!result) {
      ctx.warn(`Recipe "${node.displayName}" has no result item.`)
      return []
    }

    const stations = list(data, 'stations')
    const tags = stations.length > 0 ? stations : ['crafting_table']
    const unlock = list(data, 'unlockItems').map((item) => ({ item }))
    const priority = Math.round(num(data, 'priority', 0))
    const count = Math.max(1, Math.round(num(data, 'resultCount', 1)))

    const shared = compact({
      description: { identifier },
      tags,
      priority: priority !== 0 ? priority : undefined,
      unlock: unlock.length > 0 ? unlock : undefined,
    })

    let value: unknown

    if (type === 'furnace') {
      const input = str(data, 'input').trim()
      if (!input) {
        ctx.warn(`Smelting recipe "${node.displayName}" has no input item.`)
        return []
      }
      value = {
        format_version: target.formats.recipe,
        'minecraft:recipe_furnace': {
          ...shared,
          input: { item: input },
          output: { item: result },
        },
      }
    } else if (type === 'shapeless') {
      const cells = (Array.isArray(data.grid) ? (data.grid as unknown[]) : [])
        .map((cell) => (typeof cell === 'string' ? cell.trim() : ''))
        .filter((cell) => cell !== '')
      if (cells.length === 0) {
        ctx.warn(`Recipe "${node.displayName}" has no ingredients.`)
        return []
      }
      value = {
        format_version: target.formats.recipe,
        'minecraft:recipe_shapeless': {
          ...shared,
          ingredients: cells.map((item) => ({ item })),
          result: { item: result, count },
        },
      }
    } else {
      const cells = Array.isArray(data.grid)
        ? (data.grid as unknown[]).map((cell) => (typeof cell === 'string' ? cell : ''))
        : []
      const grid = gridToPattern(cells, data.trimPattern !== false)
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

    return [
      {
        path: `${BP}/recipes/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Recipe · ${node.displayName}` },
        body: { type: 'json', value },
      },
    ]
  },
}

import { beforeAll, describe, expect, it } from 'vitest'

import { installBuiltinKinds } from './index'
import { emitProject } from '../generators/emit'
import { createNode, createProject, upsertNode } from '../model/project'
import type { ProjectModel } from '../model/types'
import { NODE_STATION_PREFIX } from '../recipes/stations'
import { gridToPattern } from './recipe'

beforeAll(() => {
  installBuiltinKinds()
})

function recipeJson(project: ProjectModel, name: string): any {
  const { files } = emitProject(project)
  const file = files.get(`behavior_pack/recipes/${name}.json`)
  return file ? (file.body as { type: 'json'; value: any }).value : null
}

function withRecipe(data: Record<string, unknown>): ProjectModel {
  let project = createProject({ namespace: 'farm' })
  const recipe = createNode(project, 'recipe', 'Dish', data)
  project = upsertNode(project, recipe)
  return project
}

describe('recipe generation', () => {
  it('writes a shaped crafting-table recipe by default', () => {
    const project = withRecipe({
      grid: ['', '', '', '', 'minecraft:egg', 'farm:oil', '', 'farm:pan', ''],
      result: 'farm:fried_egg',
      resultCount: 2,
    })

    const shaped = recipeJson(project, 'dish')['minecraft:recipe_shaped']
    expect(shaped.tags).toEqual(['crafting_table'])
    expect(shaped.pattern).toEqual(['AB', 'C '])
    expect(shaped.result).toEqual({ item: 'farm:fried_egg', count: 2 })
  })

  it('writes a furnace recipe, ignoring the grid entirely', () => {
    const project = withRecipe({
      station: 'smoker',
      grid: ['farm:leftover', '', '', '', '', '', '', '', ''],
      input: 'farm:raw_pie',
      result: 'farm:baked_pie',
    })

    const json = recipeJson(project, 'dish')
    expect(json['minecraft:recipe_shaped']).toBeUndefined()
    expect(json['minecraft:recipe_furnace']).toEqual({
      description: { identifier: 'farm:dish' },
      tags: ['smoker'],
      input: { item: 'farm:raw_pie' },
      output: { item: 'farm:baked_pie' },
    })
  })

  it('warns when the fuel slot holds one of our items that cannot burn', () => {
    let project = createProject({ namespace: 'farm' })
    const log = createNode(project, 'item', 'Damp Log', { isFuel: false })
    project = upsertNode(project, log)
    const recipe = createNode(project, 'recipe', 'Dish', {
      station: 'furnace',
      input: 'minecraft:potato',
      fuel: 'farm:damp_log',
      result: 'farm:baked',
    })
    project = upsertNode(project, recipe)

    const { problems } = emitProject(project)
    expect(problems.some((p) => p.message.includes('not marked as usable fuel'))).toBe(true)
  })

  it('tags a recipe with a cookware block’s own crafting tag', () => {
    let project = createProject({ namespace: 'farm' })
    const pot = createNode(project, 'block', 'Cooking Pot', {
      isCraftingStation: true,
      craftingTag: 'cooking_pot',
      craftingGridRows: 2,
      craftingGridCols: 2,
    })
    project = upsertNode(project, pot)

    const recipe = createNode(project, 'recipe', 'Stew', {
      station: `${NODE_STATION_PREFIX}${pot.id}`,
      // The bottom row is outside a 2x2 station and must not reach the pattern.
      grid: ['farm:rice', 'minecraft:bowl', '', '', '', '', 'minecraft:stone', '', ''],
      result: 'farm:stew',
    })
    project = upsertNode(project, recipe)

    const shaped = recipeJson(project, 'stew')['minecraft:recipe_shaped']
    expect(shaped.tags).toEqual(['cooking_pot'])
    expect(shaped.pattern).toEqual(['AB'])
    expect(Object.values(shaped.key)).toEqual([{ item: 'farm:rice' }, { item: 'minecraft:bowl' }])
  })

  it('writes a shapeless recipe when the station is a stonecutter', () => {
    const project = withRecipe({
      station: 'stonecutter',
      grid: ['minecraft:stone', '', '', '', '', '', '', '', ''],
      result: 'farm:tile',
      resultCount: 4,
    })

    const shapeless = recipeJson(project, 'dish')['minecraft:recipe_shapeless']
    expect(shapeless.tags).toEqual(['stonecutter'])
    expect(shapeless.ingredients).toEqual([{ item: 'minecraft:stone' }])
  })

  it('produces no file, and says why, when the result is missing', () => {
    let project = createProject({ namespace: 'farm' })
    const recipe = createNode(project, 'recipe', 'Dish', {
      grid: ['minecraft:egg', '', '', '', '', '', '', '', ''],
      result: '',
    })
    project = upsertNode(project, recipe)

    const { files, problems } = emitProject(project)
    expect(files.has('behavior_pack/recipes/dish.json')).toBe(false)
    expect(problems.some((p) => p.message.includes('no result item'))).toBe(true)
  })
})

describe('gridToPattern with a station window', () => {
  it('reads only the rows and columns the station exposes', () => {
    const cells = ['a', 'b', 'x', 'c', 'd', 'x', 'x', 'x', 'x']
    const result = gridToPattern(cells, { rows: 2, cols: 2, trim: true })!
    expect(result.pattern).toEqual(['AB', 'CD'])
  })

  it('keeps the old two-argument form working', () => {
    const result = gridToPattern(['', '', '', '', 'farm:pan', '', '', '', ''], false)!
    expect(result.pattern).toEqual(['   ', ' A ', '   '])
  })
})

import { describe, expect, it, beforeAll } from 'vitest'

import { installBuiltinKinds } from '../kinds'
import { gridToPattern } from '../kinds/recipe'
import { addAsset, createNode, createProject, upsertNode } from '../model/project'
import type { AssetRef, ProjectModel } from '../model/types'
import { emitProject } from './emit'

beforeAll(() => {
  installBuiltinKinds()
})

function asset(id: string): AssetRef {
  return {
    id,
    fileName: `${id}.png`,
    mime: 'image/png',
    size: 128,
    width: 16,
    height: 16,
    addedAt: new Date().toISOString(),
  }
}

/** A small farm project touching every built-in kind. */
function buildFarmProject(): ProjectModel {
  let project = createProject({ name: 'Sawah', namespace: 'farm', author: 'tester' })

  for (const id of ['t_stage0', 't_stage1', 't_stage2', 't_seed', 't_pan', 't_rice', 't_crow']) {
    project = addAsset(project, asset(id))
  }

  const rice = createNode(project, 'item', 'Rice')
  rice.textures.main = 't_rice'
  project = upsertNode(project, rice)

  const crop = createNode(project, 'crop', 'Rice Plant', { stages: 3, produce: rice.id })
  crop.textures.stage0 = 't_stage0'
  crop.textures.stage1 = 't_stage1'
  crop.textures.stage2 = 't_stage2'
  crop.textures.seed = 't_seed'
  project = upsertNode(project, crop)

  const pan = createNode(project, 'block', 'Frying Pan')
  pan.textures.main = 't_pan'
  project = upsertNode(project, pan)

  const scarecrow = createNode(project, 'entity', 'Scarecrow', {
    bodyPreset: 'post',
    temperament: 'stationary',
    families: ['scarecrow'],
  })
  project = upsertNode(project, scarecrow)

  const crow = createNode(project, 'entity', 'Crow', {
    bodyPreset: 'bird',
    canFly: true,
    temperament: 'skittish',
    families: ['crow'],
    avoidFamilies: ['scarecrow'],
    avoidRadius: 12,
    eatsBlocks: true,
    eatTarget: crop.id,
    spawnEnabled: true,
    spawnAboveBlocks: ['farm:rice_plant'],
  })
  crow.textures.main = 't_crow'
  project = upsertNode(project, crow)

  const recipe = createNode(project, 'recipe', 'Fried Egg', {
    grid: ['', '', '', '', 'minecraft:egg', 'farm:cooking_oil', '', 'farm:frying_pan', ''],
    result: 'farm:fried_egg',
  })
  project = upsertNode(project, recipe)

  return project
}

describe('emitProject', () => {
  it('produces a complete, error-free pack tree', () => {
    const { files, problems } = emitProject(buildFarmProject())

    expect(problems.filter((p) => p.severity === 'error')).toEqual([])

    for (const path of [
      'behavior_pack/manifest.json',
      'resource_pack/manifest.json',
      'behavior_pack/blocks/rice_plant.json',
      'behavior_pack/items/rice_plant_seeds.json',
      'behavior_pack/items/rice.json',
      'behavior_pack/loot_tables/blocks/rice_plant_mature.json',
      'behavior_pack/entities/crow.json',
      'behavior_pack/spawn_rules/crow.json',
      'behavior_pack/recipes/fried_egg.json',
      'resource_pack/entity/crow.entity.json',
      'resource_pack/models/entity/crow.geo.json',
      'resource_pack/textures/item_texture.json',
      'resource_pack/textures/terrain_texture.json',
      'resource_pack/texts/en_US.lang',
    ]) {
      expect(files.has(path), `expected ${path}`).toBe(true)
    }
  })

  it('gives both manifests distinct uuids and links them together', () => {
    const { files } = emitProject(buildFarmProject())
    const bp = files.get('behavior_pack/manifest.json')!.body as { type: 'json'; value: any }
    const rp = files.get('resource_pack/manifest.json')!.body as { type: 'json'; value: any }

    const ids = [
      bp.value.header.uuid,
      bp.value.modules[0].uuid,
      rp.value.header.uuid,
      rp.value.modules[0].uuid,
    ]
    expect(new Set(ids).size).toBe(4)

    expect(bp.value.dependencies[0].uuid).toBe(rp.value.header.uuid)
    expect(bp.value.header.min_engine_version).toEqual([1, 26, 40])
    expect(bp.value.format_version).toBe(2)
  })

  it('wires textures into the right atlas without anyone typing a path', () => {
    const { files } = emitProject(buildFarmProject())
    const terrain = (files.get('resource_pack/textures/terrain_texture.json')!.body as any).value
    const items = (files.get('resource_pack/textures/item_texture.json')!.body as any).value

    expect(terrain.texture_data.farm_rice_plant_stage0.textures).toBe(
      'textures/blocks/farm/farm_rice_plant_stage0',
    )
    expect(items.texture_data.farm_rice.textures).toBe('textures/items/farm/farm_rice')

    // And the PNG itself is scheduled to be written at exactly that path.
    expect(files.has('resource_pack/textures/blocks/farm/farm_rice_plant_stage0.png')).toBe(true)
  })

  it('adds the script module only when something actually needs it', () => {
    const withCrop = emitProject(buildFarmProject())
    const bp = (withCrop.files.get('behavior_pack/manifest.json')!.body as any).value
    expect(bp.modules.some((m: any) => m.type === 'script')).toBe(true)
    expect(withCrop.files.has('behavior_pack/scripts/main.js')).toBe(true)

    let bare = createProject({ namespace: 'farm' })
    bare = upsertNode(bare, createNode(bare, 'item', 'Plain Item'))
    const plain = emitProject(bare)
    const plainBp = (plain.files.get('behavior_pack/manifest.json')!.body as any).value
    expect(plainBp.modules.some((m: any) => m.type === 'script')).toBe(false)
    expect(plain.files.has('behavior_pack/scripts/main.js')).toBe(false)
  })

  it('keeps the crow away from scarecrows at a higher priority than eating', () => {
    const { files } = emitProject(buildFarmProject())
    const crow = (files.get('behavior_pack/entities/crow.json')!.body as any).value[
      'minecraft:entity'
    ]

    const avoid = crow.components['minecraft:behavior.avoid_mob_type']
    const eat = crow.components['minecraft:behavior.eat_block']

    expect(avoid.entity_types[0].filters.value).toBe('scarecrow')
    expect(avoid.entity_types[0].max_dist).toBe(12)
    expect(avoid.priority).toBeLessThan(eat.priority)

    // Eating a ripe plant puts the block back to its default state, i.e. stage 0.
    expect(eat.eat_and_replace_block_pairs[0].replace_block).toBe('farm:rice_plant')
    expect(eat.eat_and_replace_block_pairs[0].eat_block).toEqual({
      name: 'farm:rice_plant',
      states: { 'farm:rice_plant_age': 2 },
    })
  })

  it('reports a name collision instead of silently dropping a file', () => {
    let project = createProject({ namespace: 'farm' })
    const a = createNode(project, 'item', 'Bread')
    project = upsertNode(project, a)
    const b = { ...createNode(project, 'item', 'Bread'), name: 'bread' }
    project = upsertNode(project, b)

    const { problems } = emitProject(project)
    expect(problems.some((p) => p.severity === 'error' && p.message.includes('more than one'))).toBe(
      true,
    )
  })

  it('rejects a namespace that would collide with vanilla', () => {
    const project = createProject({ namespace: 'minecraft' })
    const { problems } = emitProject(project)
    expect(problems.some((p) => p.message.includes('not usable'))).toBe(true)
  })
})

describe('gridToPattern', () => {
  it('trims the grid and assigns one key per distinct ingredient', () => {
    // The fried-egg layout: egg centre, oil to its right, pan below it.
    const result = gridToPattern([
      '',
      '',
      '',
      '',
      'minecraft:egg',
      'farm:oil',
      '',
      'farm:pan',
      '',
    ])!

    expect(result.pattern).toEqual(['AB', 'C '])
    expect(result.key).toEqual({
      A: { item: 'minecraft:egg' },
      B: { item: 'farm:oil' },
      C: { item: 'farm:pan' },
    })
  })

  it('keeps absolute placement when trimming is off', () => {
    const result = gridToPattern(['', '', '', '', 'farm:pan', '', '', '', ''], false)!
    expect(result.pattern).toEqual(['   ', ' A ', '   '])
  })

  it('reuses one key for a repeated ingredient', () => {
    const result = gridToPattern(['a', 'a', '', 'a', 'a', '', '', '', ''])!
    expect(result.pattern).toEqual(['AA', 'AA'])
    expect(Object.keys(result.key)).toEqual(['A'])
  })

  it('returns null for an empty grid', () => {
    expect(gridToPattern(['', '', '', '', '', '', '', '', ''])).toBeNull()
  })
})

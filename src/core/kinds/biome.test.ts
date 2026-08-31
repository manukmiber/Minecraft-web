import { beforeAll, describe, expect, it } from 'vitest'

import { installBuiltinKinds } from '../kinds'
import { emitProject } from '../generators/emit'
import { createNode, createProject, upsertNode } from '../model/project'
import type { ContentNode, ProjectModel } from '../model/types'
import { effectiveCrowDensity, estimateCrows, readScatterEntries } from './biome'

beforeAll(() => {
  installBuiltinKinds()
})

/** A project with two crops and one biome that scatters them. */
function buildBiomeProject(
  biomeData: Record<string, unknown> = {},
): { project: ProjectModel; rice: ContentNode; taro: ContentNode; biome: ContentNode } {
  let project = createProject({ name: 'Sawah', namespace: 'farm' })

  const rice = createNode(project, 'crop', 'Rice Plant', { stages: 4 })
  project = upsertNode(project, rice)

  const taro = createNode(project, 'crop', 'Taro', { stages: 3, plantOn: 'minecraft:dirt' })
  project = upsertNode(project, taro)

  const biome = createNode(project, 'biome', 'Rice Paddy', {
    scatterAttempts: 24,
    scatterChance: 50,
    plants: [
      { plant: rice.id, weight: 6, placeOn: [], needsWater: true, maturity: 'ripe' },
      { plant: taro.id, weight: 2, placeOn: ['minecraft:coarse_dirt'], maturity: 'sprout' },
    ],
    ...biomeData,
  })
  project = upsertNode(project, biome)

  return { project, rice, taro, biome }
}

const json = (files: Map<string, { body: unknown }>, path: string): any => {
  const file = files.get(path)
  expect(file, `expected ${path}`).toBeDefined()
  return (file!.body as { type: 'json'; value: any }).value
}

describe('biome generation', () => {
  it('writes the biome, its colours and the whole scatter chain', () => {
    const { project } = buildBiomeProject()
    const { files, problems } = emitProject(project)

    expect(problems.filter((p) => p.severity === 'error')).toEqual([])

    for (const path of [
      'behavior_pack/biomes/rice_paddy.biome.json',
      'behavior_pack/features/rice_paddy_rice_plant_feature.json',
      'behavior_pack/features/rice_paddy_taro_feature.json',
      'behavior_pack/features/rice_paddy_choice.json',
      'behavior_pack/features/rice_paddy_scatter.json',
      'behavior_pack/feature_rules/rice_paddy_scatter_rule.json',
      'resource_pack/biomes/rice_paddy.client_biome.json',
      'resource_pack/fogs/rice_paddy.fog.json',
    ]) {
      expect(files.has(path), `expected ${path}`).toBe(true)
    }

    const biome = json(files, 'behavior_pack/biomes/rice_paddy.biome.json')['minecraft:biome']
    expect(biome.description.identifier).toBe('farm:rice_paddy')
    expect(biome.components['minecraft:tags'].tags).toContain('farm_rice_paddy')
    expect(biome.components['minecraft:overworld_generation_rules']).toBeDefined()
  })

  it('scopes the feature rule to this biome and nothing else', () => {
    const { project } = buildBiomeProject()
    const { files } = emitProject(project)

    const rule = json(files, 'behavior_pack/feature_rules/rice_paddy_scatter_rule.json')[
      'minecraft:feature_rules'
    ]
    expect(rule.description.places_feature).toBe('farm:rice_paddy_scatter')
    expect(rule.conditions['minecraft:biome_filter']).toEqual([
      { test: 'has_biome_tag', operator: '==', value: 'farm_rice_paddy' },
    ])
  })

  it('turns per-plant weights into the weighted pick the generator reads', () => {
    const { project } = buildBiomeProject()
    const { files } = emitProject(project)

    const choice = json(files, 'behavior_pack/features/rice_paddy_choice.json')[
      'minecraft:weighted_random_feature'
    ]
    expect(choice.features).toEqual([
      ['farm:rice_paddy_rice_plant_feature', 6],
      ['farm:rice_paddy_taro_feature', 2],
    ])

    const scatter = json(files, 'behavior_pack/features/rice_paddy_scatter.json')[
      'minecraft:scatter_feature'
    ]
    expect(scatter.places_feature).toBe('farm:rice_paddy_choice')
    expect(scatter.iterations).toBe(24)
    expect(scatter.scatter_chance).toBe(50)
  })

  it('places a single plant directly, with no pointless pick between one option', () => {
    let { project, rice, biome } = buildBiomeProject()
    biome = {
      ...biome,
      data: {
        ...biome.data,
        plants: [{ plant: rice.id, weight: 4, placeOn: [], needsWater: false, maturity: 'ripe' }],
      },
    }
    const { files } = emitProject(upsertNode(project, biome))

    expect(files.has('behavior_pack/features/rice_paddy_choice.json')).toBe(false)
    const scatter = json(files, 'behavior_pack/features/rice_paddy_scatter.json')[
      'minecraft:scatter_feature'
    ]
    expect(scatter.places_feature).toBe('farm:rice_paddy_rice_plant_feature')
  })

  it('inherits the crop growth stage and its plantable-on block, and honours the overrides', () => {
    const { project } = buildBiomeProject()
    const { files } = emitProject(project)

    const ricePlacement = json(files, 'behavior_pack/features/rice_paddy_rice_plant_feature.json')[
      'minecraft:single_block_feature'
    ]
    // Ripe rice with four stages generates at stage 3, on the farmland the crop
    // already declares, with water required beside it.
    expect(ricePlacement.places_block).toEqual({
      name: 'farm:rice_plant',
      states: { 'farm:rice_plant_age': 3 },
    })
    expect(ricePlacement.may_attach_to.top).toEqual(['minecraft:farmland'])
    expect(ricePlacement.may_attach_to.sides).toEqual(['minecraft:water'])

    const taroPlacement = json(files, 'behavior_pack/features/rice_paddy_taro_feature.json')[
      'minecraft:single_block_feature'
    ]
    expect(taroPlacement.places_block.states).toEqual({ 'farm:taro_age': 0 })
    expect(taroPlacement.may_attach_to.top).toEqual(['minecraft:coarse_dirt'])
    expect(taroPlacement.may_attach_to.sides).toBeUndefined()
  })

  it('lets a nested biome borrow its host instead of generating its own region', () => {
    const { project } = buildBiomeProject({ placement: 'nested', hostBiome: 'swamp' })
    const { files } = emitProject(project)

    const biome = json(files, 'behavior_pack/biomes/rice_paddy.biome.json')['minecraft:biome']
    expect(biome.components['minecraft:overworld_generation_rules']).toBeUndefined()

    // Colours belong to the host, so nothing client-side is written.
    expect(files.has('resource_pack/biomes/rice_paddy.client_biome.json')).toBe(false)
    expect(files.has('resource_pack/fogs/rice_paddy.fog.json')).toBe(false)

    const rule = json(files, 'behavior_pack/feature_rules/rice_paddy_scatter_rule.json')[
      'minecraft:feature_rules'
    ]
    expect(rule.conditions['minecraft:biome_filter'][0].value).toBe('swamp')
  })

  it('tags a farmland biome and says so when the crow cannot reach it', () => {
    let { project, biome } = buildBiomeProject()

    let crow = createNode(project, 'entity', 'Crow', {
      spawnEnabled: true,
      spawnBiomeTag: 'desert',
    })
    project = upsertNode(project, crow)

    biome = {
      ...biome,
      data: { ...biome.data, farmlandBiome: true, crowEntity: crow.id },
    }
    project = upsertNode(project, biome)

    const { files, problems } = emitProject(project)
    const tags = json(files, 'behavior_pack/biomes/rice_paddy.biome.json')['minecraft:biome']
      .components['minecraft:tags'].tags
    expect(tags).toEqual(expect.arrayContaining(['overworld', 'farm_rice_paddy', 'farm_farmland']))
    expect(problems.some((p) => p.message.includes('will not find this biome'))).toBe(true)

    // Any tag the biome carries counts as reachable — a crow on "overworld"
    // finds an overworld biome without being narrowed to the farmland tag.
    for (const tag of ['farm_farmland', 'overworld']) {
      crow = { ...crow, data: { ...crow.data, spawnBiomeTag: tag } }
      const fixed = emitProject(upsertNode(project, crow))
      expect(fixed.problems.some((p) => p.message.includes('will not find this biome'))).toBe(false)
    }
  })

  it('warns rather than generating a dangling feature when a plant is gone', () => {
    let { project, biome } = buildBiomeProject()
    biome = {
      ...biome,
      data: {
        ...biome.data,
        plants: [{ plant: 'crop_deleted', weight: 3, placeOn: [], maturity: 'ripe' }],
      },
    }
    const { files, problems } = emitProject(upsertNode(project, biome))

    expect(files.has('behavior_pack/features/rice_paddy_scatter.json')).toBe(false)
    expect(problems.some((p) => p.message.includes('no longer exists'))).toBe(true)
  })
})

describe('readScatterEntries', () => {
  it('fills in defaults and drops anything unusable', () => {
    const entries = readScatterEntries({
      plants: [
        { plant: 'crop_a' },
        { plant: '', weight: 4 },
        'nonsense',
        { plant: 'crop_b', weight: 999, maturity: 'wrong' },
      ],
    })

    expect(entries).toEqual([
      { plant: 'crop_a', weight: 3, placeOn: [], needsWater: false, maturity: 'ripe' },
      { plant: 'crop_b', weight: 20, placeOn: [], needsWater: false, maturity: 'ripe' },
    ])
  })
})

describe('estimateCrows', () => {
  it('scales with planting density and stops at a sane cap', () => {
    expect(estimateCrows(0, 100, 1).crowsPerChunk).toBe(0)
    expect(estimateCrows(24, 100, 0)).toEqual({
      plantsPerChunk: 0,
      crowsPerChunk: 0,
      densityLimit: 0,
    })

    const sparse = estimateCrows(6, 50, 1)
    const dense = estimateCrows(48, 100, 2)
    expect(dense.crowsPerChunk).toBeGreaterThan(sparse.crowsPerChunk)
    expect(dense.crowsPerChunk).toBeLessThanOrEqual(6)
    expect(dense.densityLimit).toBe(Math.ceil(dense.crowsPerChunk))
  })

  it('lets a manual override win over the estimate', () => {
    const data = { scatterAttempts: 24, scatterChance: 100, plants: [{ plant: 'crop_a' }] }
    expect(effectiveCrowDensity(data).crowsPerChunk).toBe(2)
    expect(effectiveCrowDensity({ ...data, crowDensity: 4.5 })).toMatchObject({
      crowsPerChunk: 4.5,
      densityLimit: 5,
    })
  })
})

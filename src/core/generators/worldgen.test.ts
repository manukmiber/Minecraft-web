import { beforeAll, describe, expect, it } from 'vitest'

import { installBuiltinKinds } from '../kinds'
import { createNode, createProject, upsertNode } from '../model/project'
import type { ProjectModel } from '../model/types'
import { emitProject } from './emit'

beforeAll(() => {
  installBuiltinKinds()
})

function withNode(kind: string, name: string, data: Record<string, unknown>): ProjectModel {
  let project = createProject({ namespace: 'farm' })
  project = upsertNode(project, createNode(project, kind, name, data))
  return project
}

/** Unwraps a generated JSON file, failing loudly when it is missing. */
function json(project: ProjectModel, path: string): any {
  const { files } = emitProject(project)
  const file = files.get(path)
  expect(file, `expected ${path} — got ${[...files.keys()].join(', ')}`).toBeDefined()
  return (file!.body as { type: 'json'; value: any }).value
}

describe('scatter', () => {
  it('turns one block into a single-block feature and a rule that spreads it', () => {
    const project = withNode('scatter', 'Wild Grass', {
      blocks: [{ id: 'farm:wild_grass', weight: 1 }],
      scatterPercent: 40,
      iterations: 6,
      mayPlaceOn: ['minecraft:grass_block'],
    })

    const feature = json(project, 'behavior_pack/features/wild_grass_block.json')
    expect(feature.format_version).toBe('1.13.0')
    expect(feature['minecraft:single_block_feature'].places_block).toBe('farm:wild_grass')
    expect(feature['minecraft:single_block_feature'].may_attach_to).toEqual({
      top: ['minecraft:grass_block'],
    })

    const rule = json(project, 'behavior_pack/feature_rules/wild_grass_rule.json')['minecraft:feature_rules']
    expect(rule.description.places_feature).toBe('farm:wild_grass_block')
    expect(rule.distribution.scatter_chance).toBe(40)
    expect(rule.distribution.iterations).toBe(6)
    expect(rule.conditions.placement_pass).toBe('surface_pass')
  })

  it('splits placements between blocks by weight', () => {
    const project = withNode('scatter', 'Meadow', {
      blocks: [
        { id: 'farm:plant_a', weight: 3 },
        { id: 'farm:plant_b', weight: 1 },
      ],
    })

    const mix = json(project, 'behavior_pack/features/meadow_mix.json')[
      'minecraft:weighted_random_feature'
    ]
    expect(mix.features).toEqual([
      ['farm:meadow_block_1', 3],
      ['farm:meadow_block_2', 1],
    ])

    const rule = json(project, 'behavior_pack/feature_rules/meadow_rule.json')['minecraft:feature_rules']
    expect(rule.description.places_feature).toBe('farm:meadow_mix')
  })

  it('restricts a block to a height band', () => {
    const project = withNode('scatter', 'Deep Dirt', {
      blocks: [{ id: 'minecraft:dirt', weight: 1 }],
      yMode: 'uniform',
      yMin: 2,
      yMax: 7,
      placementPass: 'underground_pass',
    })

    const rule = json(project, 'behavior_pack/feature_rules/deep_dirt_rule.json')['minecraft:feature_rules']
    expect(rule.distribution.y).toEqual({ distribution: 'uniform', extent: [2, 7] })
    expect(rule.conditions.placement_pass).toBe('underground_pass')
  })

  it('leaves y off entirely when the feature should follow the surface', () => {
    const project = withNode('scatter', 'Surface Only', {
      blocks: [{ id: 'minecraft:dirt', weight: 1 }],
      yMode: 'surface',
    })
    const rule = json(project, 'behavior_pack/feature_rules/surface_only_rule.json')[
      'minecraft:feature_rules'
    ]
    expect(rule.distribution).not.toHaveProperty('y')
  })

  it('anchors a height band to the world bottom when asked', () => {
    const project = withNode('scatter', 'Bedrock Moss', {
      blocks: [{ id: 'minecraft:moss_block', weight: 1 }],
      yMode: 'fixed',
      yAnchor: 'above_bottom',
      yMin: 3,
    })
    const rule = json(project, 'behavior_pack/feature_rules/bedrock_moss_rule.json')[
      'minecraft:feature_rules'
    ]
    expect(rule.distribution.y).toEqual({ above_bottom_most: 3 })
  })

  it('ORs several biome tags instead of demanding all of them at once', () => {
    const project = withNode('scatter', 'Jungle Vine', {
      blocks: [{ id: 'minecraft:vine', weight: 1 }],
      biomeMatch: 'anyOf',
      biomeTags: ['jungle', 'swamp'],
    })
    const conditions = json(project, 'behavior_pack/feature_rules/jungle_vine_rule.json')[
      'minecraft:feature_rules'
    ].conditions

    expect(conditions['minecraft:biome_filter']).toEqual([
      {
        any_of: [
          { test: 'has_biome_tag', operator: '==', value: 'jungle' },
          { test: 'has_biome_tag', operator: '==', value: 'swamp' },
        ],
      },
    ])
  })

  it('clumps into a patch feature once more than one block is placed at a time', () => {
    const project = withNode('scatter', 'Flower Patch', {
      blocks: [{ id: 'minecraft:red_flower', weight: 1 }],
      patchSize: 12,
      patchRadius: 4,
    })

    const patch = json(project, 'behavior_pack/features/flower_patch_patch.json')[
      'minecraft:scatter_feature'
    ]
    expect(patch.iterations).toBe(12)
    expect(patch.x).toEqual({ distribution: 'gaussian', extent: [-4, 4] })
    expect(patch.places_feature).toBe('farm:flower_patch_block')
  })

  it('writes no rule at all when world placement is off', () => {
    const project = withNode('scatter', 'Manual Only', {
      blocks: [{ id: 'minecraft:dirt', weight: 1 }],
      worldPlace: false,
    })
    const { files } = emitProject(project)
    expect(files.has('behavior_pack/features/manual_only_block.json')).toBe(true)
    expect(files.has('behavior_pack/feature_rules/manual_only_rule.json')).toBe(false)
  })
})

describe('tree', () => {
  it('maps the classic shape onto trunk and canopy, fruit included', () => {
    const project = withNode('tree', 'Mango', {
      shape: 'classic',
      heightMin: 5,
      heightMax: 8,
      trunkBlock: 'minecraft:jungle_log',
      leafBlock: 'minecraft:jungle_leaves',
      fruitBlock: 'farm:mango_block',
      fruitChance: 20,
      fruitSteps: 3,
    })

    const tree = json(project, 'behavior_pack/features/mango_feature.json')['minecraft:tree_feature']
    expect(tree.trunk.trunk_block).toBe('minecraft:jungle_log')
    expect(tree.trunk.trunk_height).toEqual({ base: 5, intervals: [3] })
    expect(tree.canopy.leaf_blocks).toEqual([['minecraft:jungle_leaves', 1]])
    expect(tree.canopy.canopy_decoration).toEqual({
      decoration_block: 'farm:mango_block',
      num_steps: 3,
      step_direction: 'down',
      decoration_chance: { numerator: 20, denominator: 100 },
    })
  })

  it('switches to the matching trunk and canopy keys for another shape', () => {
    const project = withNode('tree', 'Savanna Acacia', { shape: 'acacia' })
    const tree = json(project, 'behavior_pack/features/savanna_acacia_feature.json')[
      'minecraft:tree_feature'
    ]

    expect(tree).toHaveProperty('acacia_trunk')
    expect(tree).toHaveProperty('acacia_canopy')
    expect(tree).not.toHaveProperty('trunk')
    expect(tree).not.toHaveProperty('canopy')
  })

  it('forces a mega trunk to be at least two blocks wide', () => {
    const project = withNode('tree', 'Kapok', { shape: 'mega_jungle', trunkWidth: 1 })
    const tree = json(project, 'behavior_pack/features/kapok_feature.json')['minecraft:tree_feature']
    expect(tree.mega_trunk.trunk_width).toBe(2)
  })

  it('drops the canopy entirely for a fallen log', () => {
    const project = withNode('tree', 'Fallen Oak', { shape: 'fallen', logLength: 7 })
    const tree = json(project, 'behavior_pack/features/fallen_oak_feature.json')[
      'minecraft:tree_feature'
    ]
    expect(tree.fallen_trunk.log_length).toBe(7)
    expect(Object.keys(tree).some((key) => key.includes('canopy'))).toBe(false)
  })

  it('says so rather than silently dropping fruit on a shape that cannot carry it', () => {
    const project = withNode('tree', 'Pine', { shape: 'pine', fruitBlock: 'farm:pine_cone' })
    const { problems } = emitProject(project)
    expect(problems.some((p) => p.message.includes('only the Classic shape'))).toBe(true)
  })
})

describe('structure', () => {
  /** A 2x1x1 painted strip: one plank, one log. */
  const strip = {
    size: [2, 1, 1] as [number, number, number],
    cells: ['minecraft:oak_planks', 'minecraft:oak_log'],
  }

  it('builds an aggregate of offset placements, one block feature per material', () => {
    const project = withNode('structure', 'Hut', { grid: strip, anchor: 'corner' })
    const { files } = emitProject(project)

    expect(files.has('behavior_pack/features/hut_block_1.json')).toBe(true)
    expect(files.has('behavior_pack/features/hut_block_2.json')).toBe(true)

    const cell = json(project, 'behavior_pack/features/hut_cell_2.json')['minecraft:scatter_feature']
    expect(cell.x).toBe(1)
    expect(cell.y).toBe(0)
    expect(cell.places_feature).toBe('farm:hut_block_2')

    const aggregate = json(project, 'behavior_pack/features/hut_feature.json')[
      'minecraft:aggregate_feature'
    ]
    expect(aggregate.features).toEqual(['farm:hut_cell_1', 'farm:hut_cell_2'])

    const rule = json(project, 'behavior_pack/feature_rules/hut_rule.json')['minecraft:feature_rules']
    expect(rule.description.places_feature).toBe('farm:hut_feature')
  })

  it('reuses one block feature for every cell of the same material', () => {
    const project = withNode('structure', 'Wall', {
      grid: { size: [3, 1, 1], cells: ['minecraft:cobblestone', 'minecraft:cobblestone', 'minecraft:cobblestone'] },
    })
    const { files } = emitProject(project)
    const blockFeatures = [...files.keys()].filter((path) => /features\/wall_block_\d+\.json$/.test(path))
    expect(blockFeatures).toHaveLength(1)
  })

  it('centres the layout on the anchor by default', () => {
    const project = withNode('structure', 'Pillar', {
      grid: { size: [3, 1, 3], cells: ['', '', '', '', 'minecraft:stone', '', '', '', ''] },
    })
    const cell = json(project, 'behavior_pack/features/pillar_cell_1.json')[
      'minecraft:scatter_feature'
    ]
    expect([cell.x, cell.z]).toEqual([0, 0])
  })

  it('points at a .mcstructure without generating one', () => {
    const project = withNode('structure', 'Village Hut', {
      source: 'mcstructure',
      structureName: 'mystructure:hut',
      facing: 'north',
      adjustmentRadius: 6,
    })

    const feature = json(project, 'behavior_pack/features/village_hut_feature.json')[
      'minecraft:structure_template_feature'
    ]
    expect(feature.structure_name).toBe('mystructure:hut')
    expect(feature.facing_direction).toBe('north')
    expect(feature.adjustment_radius).toBe(6)
    expect(feature.constraints.grounded).toEqual({})

    const { files, problems } = emitProject(project)
    expect([...files.keys()].some((path) => path.endsWith('.mcstructure'))).toBe(false)
    expect(problems.some((p) => p.message.includes('Copy the .mcstructure file'))).toBe(true)
  })
})

describe('the world-gen kinds alongside everything else', () => {
  it('generates a mixed project without a single error', () => {
    let project = createProject({ namespace: 'farm' })
    project = upsertNode(project, createNode(project, 'tree', 'Mango Tree', { fruitBlock: 'farm:mango' }))
    project = upsertNode(
      project,
      createNode(project, 'scatter', 'Rice Patch', {
        blocks: [{ id: 'farm:rice_plant', weight: 2 }],
        patchSize: 5,
      }),
    )
    project = upsertNode(
      project,
      createNode(project, 'structure', 'Shrine', {
        grid: { size: [2, 2, 1], cells: ['minecraft:stone', '', '', 'minecraft:stone'] },
      }),
    )

    const { problems } = emitProject(project)
    expect(problems.filter((p) => p.severity === 'error')).toEqual([])
  })
})

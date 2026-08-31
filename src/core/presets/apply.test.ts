import { beforeAll, describe, expect, it } from 'vitest'

import { emitProject } from '../generators/emit'
import { installBuiltinKinds, } from '../kinds'
import { allKinds } from '../registry/types'
import { createProject } from '../model/project'
import type { ProjectModel } from '../model/types'
import { FARMING_PRESETS } from '../../presets/farming'
import { applyPreset } from './apply'
import { validatePreset } from './format'

beforeAll(() => {
  installBuiltinKinds()
})

function applyAll(namespace = 'sawah'): ProjectModel {
  let project = createProject({ name: 'Sawah', namespace })
  for (const preset of FARMING_PRESETS) {
    project = applyPreset(project, preset).project
  }
  return project
}

describe('farming presets', () => {
  it('are all valid against the preset format', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    for (const preset of FARMING_PRESETS) {
      const result = validatePreset(preset, kinds)
      expect(result.errors, `${preset.id}: ${result.errors.join('; ')}`).toEqual([])
    }
  })

  it('apply cleanly with every reference resolved', () => {
    let project = createProject({ namespace: 'sawah' })
    const unresolved: string[] = []
    for (const preset of FARMING_PRESETS) {
      const report = applyPreset(project, preset)
      project = report.project
      unresolved.push(...report.unresolved)
    }
    expect(unresolved).toEqual([])
    expect(project.nodes).toHaveLength(14)
  })

  it('generate a pack with no errors', () => {
    const { problems } = emitProject(applyAll())
    expect(problems.filter((p) => p.severity === 'error')).toEqual([])
  })

  it('adopt whatever namespace the project uses', () => {
    const { files } = emitProject(applyAll('pertanian'))
    const recipe = (files.get('behavior_pack/recipes/fried_egg.json')!.body as any).value[
      'minecraft:recipe_shaped'
    ]
    expect(recipe.result.item).toBe('pertanian:fried_egg')
    // Egg centre, oil right, pan below — trimmed to a 2x2 corner.
    expect(recipe.pattern).toEqual(['AB', 'C '])
    expect(recipe.key.A).toEqual({ item: 'minecraft:egg' })
    expect(recipe.key.B).toEqual({ item: 'pertanian:cooking_oil' })
    expect(recipe.key.C).toEqual({ item: 'pertanian:frying_pan' })
  })

  it('points crow spawning at the rice crop', () => {
    const { files } = emitProject(applyAll())
    const rules = (files.get('behavior_pack/spawn_rules/crow.json')!.body as any).value[
      'minecraft:spawn_rules'
    ]
    expect(rules.conditions[0]['minecraft:spawns_above_block_filter'].blocks).toEqual([
      'sawah:rice_plant',
    ])
  })

  it('re-applying a preset replaces its nodes rather than duplicating them', () => {
    let project = applyAll()
    const before = project.nodes.length
    project = applyPreset(project, FARMING_PRESETS[0]).project
    expect(project.nodes.length).toBe(before)
  })
})

describe('validatePreset', () => {
  it('rejects an unknown kind', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    const result = validatePreset(
      { presetFormat: 1, label: 'x', nodes: [{ kind: 'wormhole', name: 'a', displayName: 'A' }] },
      kinds,
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('wormhole')
  })

  it('rejects an identifier name the game would not accept', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    const result = validatePreset(
      { presetFormat: 1, label: 'x', nodes: [{ kind: 'item', name: 'Bad Name', displayName: 'A' }] },
      kinds,
    )
    expect(result.ok).toBe(false)
  })

  it('warns about a file outside the pack folders', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    const result = validatePreset(
      {
        presetFormat: 1,
        label: 'x',
        nodes: [],
        files: [{ path: 'notes.txt', content: 'hello' }],
      },
      kinds,
    )
    expect(result.ok).toBe(true)
    expect(result.warnings.join(' ')).toContain('will not ship')
  })
})

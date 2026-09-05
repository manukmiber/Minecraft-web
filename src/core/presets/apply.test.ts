import { beforeAll, describe, expect, it } from 'vitest'

import { emitProject } from '../generators/emit'
import { installBuiltinKinds, } from '../kinds'
import { allKinds } from '../registry/types'
import { createProject } from '../model/project'
import type { AssetRef, ProjectModel } from '../model/types'
import { COMPANION_PRESETS } from '../../presets/companion'
import { FARMING_PRESETS } from '../../presets/farming'
import { applyPreset } from './apply'
import { presetAssetKey, validatePreset } from './format'

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
    expect(project.nodes).toHaveLength(15)
  })

  it('scatters rice only inside the paddy biome the batch creates', () => {
    const { files } = emitProject(applyAll())
    const rule = (
      files.get('behavior_pack/feature_rules/rice_paddy_scatter_rule.json')!.body as any
    ).value['minecraft:feature_rules']

    expect(rule.description.places_feature).toBe('sawah:rice_paddy_scatter')
    expect(rule.conditions['minecraft:biome_filter'][0].value).toBe('sawah_rice_paddy')

    const placement = (
      files.get('behavior_pack/features/rice_paddy_rice_plant_feature.json')!.body as any
    ).value['minecraft:single_block_feature']
    expect(placement.places_block.name).toBe('sawah:rice_plant')
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

describe('presets that carry their own artwork', () => {
  const asset = (id: string): AssetRef => ({
    id,
    fileName: `${id}.png`,
    mime: 'image/png',
    size: 128,
    width: 512,
    height: 512,
    r2Key: null,
    repoPath: null,
    addedAt: new Date().toISOString(),
  })

  it('fills the bound slots and lists the assets on the project', () => {
    const report = applyPreset(createProject(), COMPANION_PRESETS[0], {
      assets: new Map([
        [presetAssetKey('entity:kohane', 'main'), asset('skin')],
        [presetAssetKey('entity:kohane', 'spawn_egg'), asset('egg')],
      ]),
    })

    const node = report.project.nodes.find((n) => n.name === 'kohane')!
    expect(node.textures.main).toBe('skin')
    expect(node.textures.spawn_egg).toBe('egg')
    // The emitter only ships bytes for assets the project lists.
    expect(report.project.assets.map((a) => a.id).sort()).toEqual(['egg', 'skin'])
    expect(report.textures).toContain('entity:kohane.main')
  })

  it('still applies when a texture could not be loaded, leaving the slot empty', () => {
    const report = applyPreset(createProject(), COMPANION_PRESETS[0], { assets: new Map() })

    const node = report.project.nodes.find((n) => n.name === 'kohane')!
    expect(node).toBeDefined()
    expect(node.textures.main).toBeUndefined()
    expect(report.textures).toEqual([])
  })

  it('leaves textures the node already had alone', () => {
    let project = applyPreset(createProject(), COMPANION_PRESETS[0], {
      assets: new Map([[presetAssetKey('entity:kohane', 'spawn_egg'), asset('egg')]]),
    }).project
    project = applyPreset(project, COMPANION_PRESETS[0], {
      assets: new Map([[presetAssetKey('entity:kohane', 'main'), asset('skin')]]),
    }).project

    const node = project.nodes.find((n) => n.name === 'kohane')!
    expect(node.textures).toEqual({ spawn_egg: 'egg', main: 'skin' })
  })

  it('accepts the shipped preset as valid', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    expect(validatePreset(COMPANION_PRESETS[0], kinds)).toMatchObject({ ok: true })
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

  it('rejects artwork bound to a node the preset does not create', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    const result = validatePreset(
      {
        presetFormat: 1,
        label: 'x',
        nodes: [],
        assets: [
          { node: 'entity:ghost', slot: 'main', fileName: 'a.png', url: 'textures/a.png', width: 8, height: 8 },
        ],
      },
      kinds,
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('entity:ghost')
  })

  it('refuses artwork that points anywhere but the app’s own textures', () => {
    const kinds = new Set(allKinds().map((k) => k.id))
    const result = validatePreset(
      {
        presetFormat: 1,
        label: 'x',
        nodes: [{ kind: 'item', name: 'a', displayName: 'A' }],
        assets: [
          {
            node: 'item:a',
            slot: 'main',
            fileName: 'a.png',
            url: 'https://example.invalid/a.png',
            width: 8,
            height: 8,
          },
        ],
      },
      kinds,
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('under "textures/"')
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

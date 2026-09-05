import { beforeAll, describe, expect, it } from 'vitest'

import { emitProject } from '../generators/emit'
import { installBuiltinKinds } from '.'
import { addAsset, createNode, createProject, upsertNode } from '../model/project'
import type { AssetRef, ProjectModel } from '../model/types'

beforeAll(() => {
  installBuiltinKinds()
})

function asset(id: string, size = 512): AssetRef {
  return {
    id,
    fileName: `${id}.png`,
    mime: 'image/png',
    size: 4096,
    width: size,
    height: size,
    r2Key: null,
    repoPath: null,
    addedAt: new Date().toISOString(),
  }
}

interface Built {
  behaviour: Record<string, any>
  client: Record<string, any>
  render: Record<string, any>
  animations: Record<string, any>
  project: ProjectModel
  warnings: string[]
}

function buildCompanion(overrides: Record<string, unknown> = {}, textures = true): Built {
  let project = createProject({ name: 'Vivid', namespace: 'vbs' })
  project = addAsset(project, asset('skin'))
  project = addAsset(project, asset('egg', 128))

  const node = createNode(project, 'entity', 'Kohane', {
    bodyPreset: 'companion',
    temperament: 'companion',
    families: ['companion'],
    tameItems: ['minecraft:cookie'],
    healItems: ['minecraft:cake'],
    healAmount: 6,
    ...overrides,
  })
  if (textures) {
    node.textures.main = 'skin'
    node.textures.spawn_egg = 'egg'
  }
  project = upsertNode(project, node)

  const out = emitProject(project)
  const read = (path: string): Record<string, any> => {
    const body = out.files.get(path)!.body
    if (body.type !== 'json') throw new Error(`${path} is not JSON`)
    return body.value as Record<string, any>
  }

  return {
    behaviour: read('behavior_pack/entities/kohane.json'),
    client: read('resource_pack/entity/kohane.entity.json'),
    render: read('resource_pack/render_controllers/kohane.render_controllers.json'),
    animations: read('resource_pack/animations/kohane.animation.json'),
    project,
    warnings: out.problems.map((problem) => problem.message),
  }
}

describe('a companion entity', () => {
  it('keeps the tamed behaviour in a group the taming event adds', () => {
    const { behaviour } = buildCompanion()
    const entity = behaviour['minecraft:entity']

    expect(entity.components['minecraft:tameable'].tame_items).toEqual(['minecraft:cookie'])
    expect(entity.components['minecraft:tameable'].tame_event.event).toBe('vbs:on_tame')
    expect(entity.events['vbs:on_tame']).toEqual({ add: { component_groups: ['vbs:tamed'] } })

    // Following, sitting and defending only exist once it is yours.
    const tamed = entity.component_groups['vbs:tamed']
    expect(tamed['minecraft:behavior.follow_owner']).toBeDefined()
    expect(tamed['minecraft:sittable']).toEqual({})
    expect(tamed['minecraft:behavior.owner_hurt_by_target']).toBeDefined()
    expect(entity.components['minecraft:behavior.follow_owner']).toBeUndefined()
  })

  it('is tempted by whatever tames it, so it comes to you first', () => {
    const { behaviour } = buildCompanion({ tempted: ['minecraft:apple'] })
    expect(behaviour['minecraft:entity'].components['minecraft:behavior.tempt'].items).toEqual([
      'minecraft:apple',
      'minecraft:cookie',
    ])
  })

  it('only heals from the items it was given, and only for its owner', () => {
    const { behaviour } = buildCompanion()
    const interact =
      behaviour['minecraft:entity'].component_groups['vbs:tamed']['minecraft:interact']
        .interactions[0]

    expect(interact.heal_amount).toBe(6)
    expect(interact.on_interact.filters.all_of).toContainEqual({
      test: 'has_equipment',
      subject: 'other',
      domain: 'hand',
      value: 'minecraft:cake',
    })
    expect(interact.on_interact.filters.all_of).toContainEqual({
      test: 'is_owner',
      subject: 'other',
    })
  })

  it('drops the sitting parts when the toggle is off', () => {
    const { behaviour, animations } = buildCompanion({ canSit: false })
    const tamed = behaviour['minecraft:entity'].component_groups['vbs:tamed']
    expect(tamed['minecraft:sittable']).toBeUndefined()
    expect(animations.animations['animation.vbs.kohane.sit']).toBeUndefined()
  })

  it('says so when nothing can ever tame it', () => {
    const { warnings } = buildCompanion({ tameItems: [] })
    expect(warnings.join(' ')).toContain('no taming items')
  })
})

describe('expressions', () => {
  it('recomputes the face every frame and hides all but one bone', () => {
    const { client, render } = buildCompanion()
    const scripts = client['minecraft:client_entity'].description.scripts

    expect(scripts.pre_animation[0]).toContain('v.kohane_face =')
    expect(scripts.initialize).toEqual(['v.kohane_face = 0;'])

    const visibility = render.render_controllers['controller.render.vbs.kohane'].part_visibility
    expect(visibility[0]).toEqual({ '*': true })
    expect(visibility).toContainEqual({ face_neutral: 'v.kohane_face == 0' })
    // One entry for the wildcard plus one per face.
    expect(visibility).toHaveLength(9)
  })

  it('leaves the render controller plain when the face is switched off', () => {
    const { client, render } = buildCompanion({ expressive: false })
    expect(client['minecraft:client_entity'].description.scripts.pre_animation).toBeUndefined()
    expect(
      render.render_controllers['controller.render.vbs.kohane'].part_visibility,
    ).toBeUndefined()
  })

  it('does not reach for expressions on a body that has no faces', () => {
    const { client } = buildCompanion({ bodyPreset: 'biped' })
    expect(client['minecraft:client_entity'].description.scripts.pre_animation).toBeUndefined()
  })
})

describe('the spawn egg', () => {
  it('uses a painted icon when the slot is filled', () => {
    const { client } = buildCompanion()
    expect(client['minecraft:client_entity'].description.spawn_egg).toEqual({
      texture: 'vbs_kohane_spawn_egg',
      texture_index: 0,
    })
  })

  it('falls back to the two tint colours when it is not', () => {
    const { client } = buildCompanion({ eggBaseColor: '#e7d7b0', eggOverlayColor: '#e8306e' }, false)
    expect(client['minecraft:client_entity'].description.spawn_egg).toEqual({
      base_colour: '#e7d7b0',
      overlay_colour: '#e8306e',
    })
  })

  it('has no egg at all when the entity is not spawnable from one', () => {
    const { client, behaviour } = buildCompanion({ hasSpawnEgg: false })
    expect(client['minecraft:client_entity'].description.spawn_egg).toBeUndefined()
    expect(behaviour['minecraft:entity'].description.is_spawnable).toBe(false)
  })
})

describe('companion animation', () => {
  it('animates the parts the body actually has', () => {
    const { animations } = buildCompanion()
    const idle = animations.animations['animation.vbs.kohane.idle'].bones
    const move = animations.animations['animation.vbs.kohane.move'].bones

    // Hair that lags behind the head, and a skirt that swings when she walks.
    expect(idle.tail_right).toBeDefined()
    expect(idle.tail_right_tip).toBeDefined()
    expect(move.skirt_front).toBeDefined()
    expect(move.leg_left).toBeDefined()
  })

  it('animates nothing it does not have', () => {
    const { animations } = buildCompanion({ bodyPreset: 'cube' })
    const idle = animations.animations['animation.vbs.kohane.idle'].bones
    expect(idle.tail_right).toBeUndefined()
    expect(idle.skirt_front).toBeUndefined()
  })
})

/**
 * Generic custom entity.
 *
 * One kind covers the whole spread — a wandering NPC, a static prop mob, a
 * flying pest — because the behaviour is assembled from toggles rather than
 * hardcoded per creature. The farming batch uses three sets of values on top of
 * this: a farmer (biped, wanders, passive), a scarecrow (post, stationary,
 * declares a family others react to) and a crow (bird, flies, avoids that
 * family, eats crop blocks).
 *
 * Entity AI is still fully data-driven in Bedrock, so none of this needs a
 * script — which is what keeps it cheap on low-end devices.
 */

import type { ContentKind } from '../registry/types'
import type { VirtualFile } from '../vfs/types'
import { BP, RP } from '../generators/emit'
import { BODY_PRESET_OPTIONS, buildGeometryJson, getBodyPreset } from '../generators/geometry'
import { buildAnimations, wrapAnimations, wrapControllers } from '../generators/entityAnim'
import { bool, compact, list, num, str } from './shared'

export const entityKind: ContentKind = {
  id: 'entity',
  label: 'Entity',
  plural: 'Entities',
  icon: 'Bird',
  accent: 'violet',
  group: 'creatures',
  description:
    'A mob or prop with a body, animations, AI goals and optional natural spawning.',
  preview: { type: 'entity', textureSlot: 'main' },

  fields: [
    // -- identity ------------------------------------------------------------
    {
      key: 'families',
      label: 'Type families',
      type: 'string-list',
      group: 'Identity',
      help: 'Other entities filter on these. Give anything that should repel or attract mobs its own family name.',
    },
    {
      key: 'isSummonable',
      label: 'Summonable',
      type: 'boolean',
      group: 'Identity',
      help: 'Allows /summon.',
    },
    {
      key: 'hasSpawnEgg',
      label: 'Spawn egg',
      type: 'boolean',
      group: 'Identity',
    },
    {
      key: 'eggBaseColor',
      label: 'Egg base colour',
      type: 'color',
      group: 'Identity',
      when: (data) => bool(data, 'hasSpawnEgg', true),
    },
    {
      key: 'eggOverlayColor',
      label: 'Egg spot colour',
      type: 'color',
      group: 'Identity',
      when: (data) => bool(data, 'hasSpawnEgg', true),
    },

    // -- body ----------------------------------------------------------------
    {
      key: 'bodyPreset',
      label: 'Body',
      type: 'select',
      group: 'Body',
      options: BODY_PRESET_OPTIONS,
      help: 'Generates the geometry and matching animations. Pick the closest shape.',
    },
    {
      key: 'scale',
      label: 'Scale',
      type: 'slider',
      group: 'Body',
      min: 0.2,
      max: 3,
      step: 0.1,
    },
    {
      key: 'health',
      label: 'Health',
      type: 'number',
      group: 'Body',
      min: 1,
      step: 1,
    },
    {
      key: 'movementSpeed',
      label: 'Movement speed',
      type: 'slider',
      group: 'Body',
      min: 0,
      max: 1,
      step: 0.01,
      help: '0.25 is villager pace. Set to 0 for something that never moves.',
    },
    {
      key: 'collisionWidth',
      label: 'Collision width',
      type: 'number',
      group: 'Body',
      min: 0.1,
      step: 0.1,
      unit: 'blocks',
    },
    {
      key: 'collisionHeight',
      label: 'Collision height',
      type: 'number',
      group: 'Body',
      min: 0.1,
      step: 0.1,
      unit: 'blocks',
    },

    // -- behaviour -----------------------------------------------------------
    {
      key: 'temperament',
      label: 'Temperament',
      type: 'select',
      group: 'Behaviour',
      options: [
        { value: 'passive', label: 'Passive', hint: 'Wanders, ignores the player' },
        { value: 'skittish', label: 'Skittish', hint: 'Wanders and panics when hurt' },
        { value: 'stationary', label: 'Stationary', hint: 'Never moves — props, scarecrows, totems' },
        { value: 'hostile', label: 'Hostile', hint: 'Hunts and attacks the player' },
      ],
    },
    {
      key: 'canFly',
      label: 'Flies',
      type: 'boolean',
      group: 'Behaviour',
      help: 'Swaps walking navigation for flight and adds a random-fly goal.',
    },
    {
      key: 'attackDamage',
      label: 'Attack damage',
      type: 'number',
      group: 'Behaviour',
      min: 0,
      step: 1,
      when: (data) => str(data, 'temperament') === 'hostile',
    },
    {
      key: 'tempted',
      label: 'Tempted by',
      type: 'string-list',
      group: 'Behaviour',
      help: 'Item identifiers the entity follows a player holding.',
    },
    {
      key: 'despawns',
      label: 'Despawns naturally',
      type: 'boolean',
      group: 'Behaviour',
      help: 'Leave on for ambient pests so they do not accumulate.',
    },

    // -- avoidance (the scarecrow mechanic, expressed generically) ------------
    {
      key: 'avoidFamilies',
      label: 'Avoids families',
      type: 'string-list',
      group: 'Avoidance',
      help: 'Runs from entities in these families. This is how a scarecrow keeps pests away — no scripting involved.',
    },
    {
      key: 'avoidRadius',
      label: 'Avoidance radius',
      type: 'slider',
      group: 'Avoidance',
      min: 2,
      max: 48,
      step: 1,
      unit: 'blocks',
      when: (data) => list(data, 'avoidFamilies').length > 0,
      help: 'Inside this radius the entity flees instead of doing anything else. Outside it, behaviour is normal.',
    },

    // -- block eating (the crow mechanic, expressed generically) -------------
    {
      key: 'eatsBlocks',
      label: 'Eats blocks',
      type: 'boolean',
      group: 'Block eating',
      help: 'Seeks out a block and consumes it, resetting it to its default state.',
    },
    {
      key: 'eatTarget',
      label: 'Block to eat',
      type: 'node-ref',
      group: 'Block eating',
      refKinds: ['crop', 'block'],
      when: (data) => bool(data, 'eatsBlocks'),
    },
    {
      key: 'eatOnlyWhenRipe',
      label: 'Only when fully grown',
      type: 'boolean',
      group: 'Block eating',
      when: (data) => bool(data, 'eatsBlocks'),
      help: 'Targets the ripe growth state only, so young plants are left alone.',
    },
    {
      key: 'eatChance',
      label: 'Eat success chance',
      type: 'slider',
      group: 'Block eating',
      min: 0.01,
      max: 1,
      step: 0.01,
      when: (data) => bool(data, 'eatsBlocks'),
    },
    {
      key: 'eatTime',
      label: 'Time to eat',
      type: 'number',
      group: 'Block eating',
      min: 0.5,
      step: 0.5,
      unit: 's',
      when: (data) => bool(data, 'eatsBlocks'),
    },

    // -- spawning ------------------------------------------------------------
    {
      key: 'spawnEnabled',
      label: 'Spawns naturally',
      type: 'boolean',
      group: 'Spawning',
      help: 'Generates a spawn_rules file. Density is driven by the blocks below rather than per-tick counting, which is far cheaper.',
    },
    {
      key: 'spawnWeight',
      label: 'Spawn weight',
      type: 'number',
      group: 'Spawning',
      min: 1,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
    },
    {
      key: 'spawnDensityLimit',
      label: 'Density limit',
      type: 'number',
      group: 'Spawning',
      min: 1,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
      help: 'Maximum of this entity per spawn area. Keep it low for pests.',
    },
    {
      key: 'spawnAboveBlocks',
      label: 'Spawns above blocks',
      type: 'string-list',
      group: 'Spawning',
      when: (data) => bool(data, 'spawnEnabled'),
      help: 'Block identifiers that attract spawns — point this at your crop to make pests follow the farm.',
    },
    {
      key: 'spawnOnBlocks',
      label: 'Spawns on blocks',
      type: 'string-list',
      group: 'Spawning',
      when: (data) => bool(data, 'spawnEnabled'),
      help: 'Ground blocks the entity may stand on when spawning.',
    },
    {
      key: 'spawnBiomeTag',
      label: 'Biome tag',
      type: 'text',
      group: 'Spawning',
      placeholder: 'overworld',
      when: (data) => bool(data, 'spawnEnabled'),
    },
    {
      key: 'spawnBrightnessMin',
      label: 'Min light',
      type: 'slider',
      group: 'Spawning',
      min: 0,
      max: 15,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
    },
    {
      key: 'spawnBrightnessMax',
      label: 'Max light',
      type: 'slider',
      group: 'Spawning',
      min: 0,
      max: 15,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
    },
    {
      key: 'spawnHerdMin',
      label: 'Herd min',
      type: 'number',
      group: 'Spawning',
      min: 1,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
    },
    {
      key: 'spawnHerdMax',
      label: 'Herd max',
      type: 'number',
      group: 'Spawning',
      min: 1,
      step: 1,
      when: (data) => bool(data, 'spawnEnabled'),
    },
  ],

  textureSlots: () => [
    {
      key: 'main',
      label: 'Skin',
      target: 'entity',
      required: true,
      recommended: 64,
      help: 'Must match the UV layout of the chosen body preset.',
    },
  ],

  defaults: () => ({
    families: ['mob'],
    isSummonable: true,
    hasSpawnEgg: true,
    eggBaseColor: '#8a7d5c',
    eggOverlayColor: '#3d3226',
    bodyPreset: 'biped',
    scale: 1,
    health: 10,
    movementSpeed: 0.25,
    collisionWidth: 0.6,
    collisionHeight: 1.8,
    temperament: 'passive',
    canFly: false,
    attackDamage: 2,
    tempted: [],
    despawns: false,
    avoidFamilies: [],
    avoidRadius: 16,
    eatsBlocks: false,
    eatTarget: '',
    eatOnlyWhenRipe: true,
    eatChance: 0.15,
    eatTime: 3,
    spawnEnabled: false,
    spawnWeight: 6,
    spawnDensityLimit: 2,
    spawnAboveBlocks: [],
    spawnOnBlocks: ['minecraft:grass_block', 'minecraft:farmland', 'minecraft:dirt'],
    spawnBiomeTag: 'overworld',
    spawnBrightnessMin: 7,
    spawnBrightnessMax: 15,
    spawnHerdMin: 1,
    spawnHerdMax: 2,
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const identifier = ctx.identifier(node)
    const flat = `${ctx.namespace}.${node.name}`
    const geometryId = `geometry.${flat}`

    ctx.lang(`entity.${identifier}.name`, node.displayName)
    if (bool(data, 'hasSpawnEgg', true)) {
      ctx.lang(`item.spawn_egg.entity.${identifier}.name`, `Spawn ${node.displayName}`)
    }

    const texturePath = ctx.entityTexturePath(node, 'main')
    if (!texturePath) ctx.warn(`Entity "${node.displayName}" has no skin texture yet.`)

    const bodySpec = getBodyPreset(str(data, 'bodyPreset', 'biped'))
    const flying = bool(data, 'canFly')
    const temperament = str(data, 'temperament', 'passive')
    const stationary = temperament === 'stationary'
    const speed = stationary ? 0 : num(data, 'movementSpeed', 0.25)

    // -- behaviour pack -------------------------------------------------------

    const components: Record<string, unknown> = {
      'minecraft:type_family': {
        family: [...new Set([...list(data, 'families'), node.name])],
      },
      'minecraft:health': {
        value: Math.round(num(data, 'health', 10)),
        max: Math.round(num(data, 'health', 10)),
      },
      'minecraft:collision_box': {
        width: num(data, 'collisionWidth', 0.6),
        height: num(data, 'collisionHeight', 1.8),
      },
      'minecraft:scale': { value: num(data, 'scale', 1) },
      'minecraft:physics': {},
      'minecraft:pushable': { is_pushable: !stationary, is_pushable_by_piston: true },
      'minecraft:nameable': {},
      'minecraft:breathable': { total_supply: 15, suffocate_time: 0 },
      'minecraft:movement': { value: speed },
      'minecraft:knockback_resistance': { value: stationary ? 1 : 0 },
    }

    if (stationary) {
      // Nothing to navigate with: the mob stands where it is placed.
      components['minecraft:behavior.look_at_player'] = {
        priority: 1,
        look_distance: 8,
        probability: 0.02,
      }
    } else if (flying) {
      components['minecraft:can_fly'] = {}
      components['minecraft:movement.fly'] = {}
      components['minecraft:navigation.fly'] = {
        can_path_over_water: true,
        can_path_from_air: true,
      }
      components['minecraft:jump.static'] = {}
      components['minecraft:behavior.random_fly'] = {
        priority: 6,
        xz_dist: 15,
        y_dist: 7,
        y_offset: 0,
        can_land_on_trees: true,
        avoid_damage_blocks: true,
      }
      components['minecraft:behavior.look_at_player'] = {
        priority: 7,
        look_distance: 8,
        probability: 0.02,
      }
    } else {
      components['minecraft:movement.basic'] = {}
      components['minecraft:jump.static'] = {}
      components['minecraft:navigation.walk'] = {
        can_path_over_water: true,
        avoid_water: true,
        avoid_damage_blocks: true,
      }
      components['minecraft:behavior.float'] = { priority: 0 }
      components['minecraft:behavior.random_stroll'] = { priority: 7, speed_multiplier: 1 }
      components['minecraft:behavior.look_at_player'] = {
        priority: 8,
        look_distance: 8,
        probability: 0.02,
      }
      components['minecraft:behavior.random_look_around'] = { priority: 9 }
    }

    if (temperament === 'skittish' && !stationary) {
      components['minecraft:behavior.panic'] = { priority: 1, speed_multiplier: 1.4 }
      components['minecraft:behavior.hurt_by_target'] = { priority: 2 }
    }

    if (temperament === 'hostile' && !stationary) {
      components['minecraft:attack'] = { damage: Math.round(num(data, 'attackDamage', 2)) }
      components['minecraft:behavior.melee_attack'] = { priority: 3, speed_multiplier: 1.1 }
      components['minecraft:behavior.nearest_attackable_target'] = {
        priority: 2,
        must_see: true,
        reselect_targets: true,
        entity_types: [
          {
            filters: { test: 'is_family', subject: 'other', value: 'player' },
            max_dist: 16,
          },
        ],
      }
    }

    const tempted = list(data, 'tempted')
    if (tempted.length > 0 && !stationary) {
      components['minecraft:behavior.tempt'] = {
        priority: 4,
        speed_multiplier: 1.1,
        items: tempted,
      }
    }

    // Avoidance sits at a higher priority than anything the entity would rather
    // be doing, which is precisely what makes a scarecrow work: inside the
    // radius, fleeing wins over eating.
    const avoidFamilies = list(data, 'avoidFamilies')
    if (avoidFamilies.length > 0 && !stationary) {
      components['minecraft:behavior.avoid_mob_type'] = {
        priority: 1,
        entity_types: avoidFamilies.map((family) => ({
          filters: { test: 'is_family', subject: 'other', value: family },
          max_dist: num(data, 'avoidRadius', 16),
          walk_speed_multiplier: 1.3,
          sprint_speed_multiplier: 1.5,
        })),
        probability_per_strength: 1,
      }
    }

    if (bool(data, 'eatsBlocks') && !stationary) {
      const targetNode = str(data, 'eatTarget') ? ctx.nodeById(str(data, 'eatTarget')) : undefined
      if (!targetNode) {
        ctx.warn(`Entity "${node.displayName}" is set to eat blocks but no target block is chosen.`)
      } else {
        const blockId = ctx.identifier(targetNode)
        const ripeOnly = bool(data, 'eatOnlyWhenRipe', true) && targetNode.kind === 'crop'
        const stages = Math.max(2, Math.round(num(targetNode.data, 'stages', 4)))
        const stateName = ctx.ownIdentifier(`${targetNode.name}_age`)

        components['minecraft:behavior.eat_block'] = {
          // Below avoidance, above wandering: a pest heads for ripe crops
          // unless something is scaring it off.
          priority: 4,
          success_chance: num(data, 'eatChance', 0.15),
          time_until_eat: num(data, 'eatTime', 3),
          eat_and_replace_block_pairs: [
            {
              // Replacing the block with itself puts it back to its default
              // state — for a crop, that means growth reset to stage 0.
              eat_block: ripeOnly
                ? { name: blockId, states: { [stateName]: stages - 1 } }
                : blockId,
              replace_block: blockId,
            },
          ],
          on_eat: { event: `${ctx.namespace}:ate_block`, target: 'self' },
        }
      }
    }

    if (bool(data, 'despawns')) {
      components['minecraft:despawn'] = { despawn_from_distance: {} }
    }

    const entityFile = {
      format_version: target.formats.entity,
      'minecraft:entity': {
        description: compact({
          identifier,
          is_spawnable: bool(data, 'hasSpawnEgg', true),
          is_summonable: bool(data, 'isSummonable', true),
        }),
        component_groups: {},
        components,
        events: {
          [`${ctx.namespace}:ate_block`]: {},
        },
      },
    }

    // -- resource pack --------------------------------------------------------

    const anim = buildAnimations(flat, bodySpec, flying)

    const clientEntity = {
      format_version: target.formats.clientEntity,
      'minecraft:client_entity': {
        description: compact({
          identifier,
          materials: { default: 'entity_alphatest' },
          textures: { default: texturePath ?? 'textures/entity/missing' },
          geometry: { default: geometryId },
          animations: anim.clientAnimations,
          scripts: { animate: ['general'] },
          render_controllers: [`controller.render.${flat}`],
          spawn_egg: bool(data, 'hasSpawnEgg', true)
            ? {
                base_colour: str(data, 'eggBaseColor', '#8a7d5c'),
                overlay_colour: str(data, 'eggOverlayColor', '#3d3226'),
              }
            : undefined,
        }),
      },
    }

    const renderController = {
      format_version: target.formats.renderController,
      render_controllers: {
        [`controller.render.${flat}`]: {
          geometry: 'Geometry.default',
          materials: [{ '*': 'Material.default' }],
          textures: ['Texture.default'],
        },
      },
    }

    const files: VirtualFile[] = [
      {
        path: `${BP}/entities/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Entity · ${node.displayName}` },
        body: { type: 'json' as const, value: entityFile },
      },
      {
        path: `${RP}/entity/${node.name}.entity.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Client · ${node.displayName}` },
        body: { type: 'json' as const, value: clientEntity },
      },
      {
        path: `${RP}/models/entity/${node.name}.geo.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Model · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: buildGeometryJson(geometryId, bodySpec, target.formats.geometry),
        },
      },
      {
        path: `${RP}/render_controllers/${node.name}.render_controllers.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Render · ${node.displayName}` },
        body: { type: 'json' as const, value: renderController },
      },
      {
        path: `${RP}/animations/${node.name}.animation.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Animation · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: wrapAnimations(target.formats.animation, anim.animations),
        },
      },
      {
        path: `${RP}/animation_controllers/${node.name}.animation_controllers.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Anim controller · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: wrapControllers(target.formats.animationController, anim.controller),
        },
      },
    ]

    // -- spawn rules ----------------------------------------------------------

    if (bool(data, 'spawnEnabled')) {
      const aboveBlocks = list(data, 'spawnAboveBlocks')
      const onBlocks = list(data, 'spawnOnBlocks')
      const biomeTag = str(data, 'spawnBiomeTag', 'overworld').trim()

      const condition: Record<string, unknown> = compact({
        'minecraft:spawns_on_surface': {},
        'minecraft:weight': { default: Math.round(num(data, 'spawnWeight', 6)) },
        'minecraft:density_limit': { surface: Math.round(num(data, 'spawnDensityLimit', 2)) },
        'minecraft:herd': {
          min_size: Math.round(num(data, 'spawnHerdMin', 1)),
          max_size: Math.max(
            Math.round(num(data, 'spawnHerdMin', 1)),
            Math.round(num(data, 'spawnHerdMax', 2)),
          ),
        },
        'minecraft:brightness_filter': {
          min: Math.round(num(data, 'spawnBrightnessMin', 7)),
          max: Math.round(num(data, 'spawnBrightnessMax', 15)),
          adjust_for_weather: false,
        },
        'minecraft:biome_filter': biomeTag
          ? { test: 'has_biome_tag', operator: '==', value: biomeTag }
          : undefined,
        'minecraft:spawns_on_block_filter': onBlocks.length > 0 ? onBlocks : undefined,
        // Tying spawn density to the presence of a block is the cheap way to
        // make pests follow a farm: no per-tick area maths, the spawner just
        // looks for the block.
        'minecraft:spawns_above_block_filter':
          aboveBlocks.length > 0 ? { blocks: aboveBlocks, distance: 4 } : undefined,
      })

      files.push({
        path: `${BP}/spawn_rules/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Spawn · ${node.displayName}` },
        body: {
          type: 'json' as const,
          value: {
            format_version: target.formats.spawnRules,
            'minecraft:spawn_rules': {
              description: {
                identifier,
                population_control: temperament === 'hostile' ? 'monster' : 'animal',
              },
              conditions: [condition],
            },
          },
        },
      })
    }

    return files
  },
}

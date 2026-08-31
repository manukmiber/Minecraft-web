/**
 * A staged, plantable crop.
 *
 * One node produces everything a crop needs: the multi-state block with a
 * permutation per growth stage, the seed item that plants it, the two loot
 * tables that make an immature crop drop only seeds, and — when growth is
 * enabled — the scripted custom component that advances the stage.
 *
 * On growth: Bedrock's modern block parser dropped data-driven block events and
 * deprecated `minecraft:random_ticking`, so a crop that grows by itself needs a
 * custom component. It is a single `onRandomTick` handler shared by every crop
 * in the project, which is about as light as growth can be made.
 */

import type { ContentKind, TextureSlot } from '../registry/types'
import type { VirtualFile } from '../vfs/types'
import { BP } from '../generators/emit'
import { MENU_CATEGORY_OPTIONS, bool, compact, list, materialInstances, menuCategory, num, str } from './shared'

const MIN_STAGES = 2
const MAX_STAGES = 8

function stageCount(data: Record<string, unknown>): number {
  return Math.round(Math.min(MAX_STAGES, Math.max(MIN_STAGES, num(data, 'stages', 4))))
}

/**
 * The shared growth component. Parameters come from the block JSON so a single
 * registration drives every crop, whatever its state name or stage count.
 */
const GROWTH_COMPONENT_BODY = `{
      onRandomTick: (event, args) => {
        const params = (args && args.params) || {}
        const stateName = params.state
        if (typeof stateName !== 'string') return

        const max = typeof params.max === 'number' ? params.max : 7
        const chance = typeof params.chance === 'number' ? params.chance : 1
        if (chance < 1 && Math.random() > chance) return

        const permutation = event.block.permutation
        const age = permutation.getState(stateName)
        if (typeof age !== 'number' || age >= max) return

        event.block.setPermutation(permutation.withState(stateName, age + 1))
      },
    }`

export const cropKind: ContentKind = {
  id: 'crop',
  label: 'Crop',
  plural: 'Crops',
  icon: 'Sprout',
  accent: 'mint',
  group: 'world',
  description: 'A plantable crop with growth stages, its own seed item and stage-aware drops.',
  preview: { type: 'crop', stagesKey: 'stages', slotPrefix: 'stage' },

  fields: [
    {
      key: 'stages',
      label: 'Growth stages',
      type: 'slider',
      group: 'Growth',
      min: MIN_STAGES,
      max: MAX_STAGES,
      step: 1,
      help: 'Each stage gets its own texture slot. Vanilla wheat uses 8.',
    },
    {
      key: 'growthMode',
      label: 'Growth',
      type: 'select',
      group: 'Growth',
      options: [
        {
          value: 'script',
          label: 'Grows on its own',
          hint: 'Adds a small scripted component — the only way to grow a custom block since data-driven block events were removed',
        },
        {
          value: 'manual',
          label: 'Stays put',
          hint: 'Stages exist but nothing advances them; drive it yourself with commands or another system',
        },
      ],
    },
    {
      key: 'growthChance',
      label: 'Growth chance per tick',
      type: 'slider',
      group: 'Growth',
      min: 0.05,
      max: 1,
      step: 0.05,
      when: (data) => str(data, 'growthMode', 'script') === 'script',
      help: 'Chance of advancing on each random tick. Lower means slower crops.',
    },
    {
      key: 'plantOn',
      label: 'Plantable on',
      type: 'block-ref',
      group: 'Growth',
      placeholder: 'minecraft:farmland',
      help: 'Block the crop must sit on. Leave as farmland for normal farming.',
    },
    {
      key: 'category',
      label: 'Creative tab',
      type: 'select',
      group: 'General',
      options: MENU_CATEGORY_OPTIONS,
    },
    {
      key: 'generateSeed',
      label: 'Generate a seed item',
      type: 'boolean',
      group: 'Seed & harvest',
      help: 'Creates the matching seed item and wires it to plant this crop. Turn off if you already have one.',
    },
    {
      key: 'seedName',
      label: 'Seed identifier name',
      type: 'text',
      group: 'Seed & harvest',
      placeholder: 'rice_seeds',
      when: (data) => bool(data, 'generateSeed', true),
    },
    {
      key: 'seedDisplayName',
      label: 'Seed display name',
      type: 'text',
      group: 'Seed & harvest',
      placeholder: 'Rice Seeds',
      when: (data) => bool(data, 'generateSeed', true),
    },
    {
      key: 'produce',
      label: 'Harvest item',
      type: 'node-ref',
      group: 'Seed & harvest',
      refKinds: ['item'],
      help: 'Dropped when the crop is fully grown. Create the item first, then pick it here.',
    },
    {
      key: 'produceMin',
      label: 'Harvest min',
      type: 'number',
      group: 'Seed & harvest',
      min: 0,
      step: 1,
    },
    {
      key: 'produceMax',
      label: 'Harvest max',
      type: 'number',
      group: 'Seed & harvest',
      min: 1,
      step: 1,
    },
    {
      key: 'seedDropMax',
      label: 'Seeds dropped when mature',
      type: 'number',
      group: 'Seed & harvest',
      min: 1,
      step: 1,
    },
    {
      key: 'tags',
      label: 'Block tags',
      type: 'string-list',
      group: 'Advanced',
      help: 'minecraft:crop is included by default so vanilla systems treat it as a crop.',
    },
  ],

  textureSlots: (node) => {
    const slots: TextureSlot[] = []
    const count = stageCount(node.data)
    for (let i = 0; i < count; i++) {
      slots.push({
        key: `stage${i}`,
        label: `Stage ${i}${i === count - 1 ? ' (ripe)' : ''}`,
        target: 'terrain',
        required: true,
        recommended: 16,
      })
    }
    slots.push({
      key: 'seed',
      label: 'Seed icon',
      target: 'item',
      help: 'Icon for the generated seed item.',
      recommended: 16,
    })
    return slots
  },

  defaults: () => ({
    stages: 4,
    growthMode: 'script',
    growthChance: 0.35,
    plantOn: 'minecraft:farmland',
    category: 'nature',
    generateSeed: true,
    seedName: '',
    seedDisplayName: '',
    produce: '',
    produceMin: 1,
    produceMax: 3,
    seedDropMax: 2,
    tags: ['minecraft:crop'],
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const identifier = ctx.identifier(node)
    const stages = stageCount(data)
    const maxAge = stages - 1
    const stateName = ctx.ownIdentifier(`${node.name}_age`)

    ctx.lang(`tile.${identifier}.name`, node.displayName)

    // -- per-stage appearance ------------------------------------------------

    const permutations: unknown[] = []
    for (let stage = 0; stage < stages; stage++) {
      const texture = ctx.stageTexture(node, 'stage', stage)
      if (!texture) {
        ctx.warn(`Crop "${node.displayName}" is missing the texture for stage ${stage}.`)
      }
      // Growth is visible in the hitbox too: a sprout you can barely see, a ripe
      // plant that fills most of the block.
      const height = Math.round((4 + (12 * stage) / maxAge) * 100) / 100
      permutations.push({
        condition: `q.block_state('${stateName}') == ${stage}`,
        components: compact({
          'minecraft:material_instances': materialInstances(
            target,
            { all: texture },
            'alpha_test',
            0,
            false,
          ),
          'minecraft:selection_box': {
            origin: [-8, 0, -8],
            size: [16, height, 16],
          },
        }),
      })
    }

    const tags = new Set(list(data, 'tags'))
    tags.add('minecraft:crop')

    const plantOn = str(data, 'plantOn', 'minecraft:farmland').trim() || 'minecraft:farmland'
    const growthMode = str(data, 'growthMode', 'script')

    const components: Record<string, unknown> = compact({
      'minecraft:geometry': 'minecraft:geometry.cross',
      'minecraft:collision_box': false,
      'minecraft:destructible_by_mining': { seconds_to_destroy: 0 },
      'minecraft:destructible_by_explosion': { explosion_resistance: 0 },
      'minecraft:light_dampening': 0,
      'minecraft:map_color': '#6f8f3a',
      'minecraft:placement_filter': {
        conditions: [
          {
            allowed_faces: ['up'],
            block_filter: [plantOn],
          },
        ],
      },
      'minecraft:loot': `loot_tables/blocks/${node.name}_immature.json`,
      'minecraft:tags': target.rules.tagsAsComponent ? [...tags] : undefined,
    })

    if (growthMode === 'script') {
      const componentId = ctx.ownIdentifier('crop_growth')
      ctx.registerScriptComponent(componentId, GROWTH_COMPONENT_BODY)
      // Custom components are declared inline alongside native ones, the way
      // the current scripting docs register them.
      components[componentId] = {
        state: stateName,
        max: maxAge,
        chance: num(data, 'growthChance', 0.35),
      }
    }

    const blockFile = {
      format_version: target.formats.block,
      'minecraft:block': {
        description: compact({
          identifier,
          states: { [stateName]: Array.from({ length: stages }, (_, i) => i) },
          menu_category: menuCategory(target, str(data, 'category', 'nature')),
        }),
        components,
        permutations: [
          ...permutations,
          // Last entry wins on duplicate components, so the ripe-stage loot
          // override has to come after the per-stage appearance block.
          {
            condition: `q.block_state('${stateName}') == ${maxAge}`,
            components: {
              'minecraft:loot': `loot_tables/blocks/${node.name}_mature.json`,
            },
          },
        ],
      },
    }

    const files: VirtualFile[] = [
      {
        path: `${BP}/blocks/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Crop · ${node.displayName}` },
        body: { type: 'json' as const, value: blockFile },
      },
    ]

    // -- seed item ------------------------------------------------------------

    const generateSeed = bool(data, 'generateSeed', true)
    const seedName = (str(data, 'seedName').trim() || `${node.name}_seeds`).toLowerCase()
    const seedIdentifier = ctx.ownIdentifier(seedName)

    if (generateSeed) {
      const seedDisplay = str(data, 'seedDisplayName').trim() || `${node.displayName} Seeds`
      const seedIcon = ctx.texture(node, 'seed')
      if (!seedIcon) ctx.warn(`Crop "${node.displayName}" has no seed icon yet.`)

      ctx.lang(`item.${seedIdentifier}`, seedDisplay)
      ctx.lang(`item.${seedIdentifier}.name`, seedDisplay)

      files.push({
        path: `${BP}/items/${seedName}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Seed · ${seedDisplay}` },
        body: {
          type: 'json' as const,
          value: {
            format_version: target.formats.item,
            'minecraft:item': {
              description: compact({
                identifier: seedIdentifier,
                menu_category: menuCategory(target, 'nature'),
              }),
              components: compact({
                'minecraft:icon': seedIcon ?? undefined,
                'minecraft:max_stack_size': 64,
                'minecraft:block_placer': {
                  block: identifier,
                  use_on: [{ name: plantOn }],
                },
              }),
            },
          },
        },
      })
    }

    // -- loot tables ----------------------------------------------------------

    const seedDrop = generateSeed ? seedIdentifier : null
    const produceNode = str(data, 'produce') ? ctx.nodeById(str(data, 'produce')) : undefined

    const immatureEntries = seedDrop
      ? [{ type: 'item', name: seedDrop, weight: 1 }]
      : []

    files.push({
      path: `${BP}/loot_tables/blocks/${node.name}_immature.json`,
      origin: { nodeId: node.id, kind: node.kind, label: `Loot · ${node.displayName} (young)` },
      body: {
        type: 'json' as const,
        value: {
          pools: immatureEntries.length > 0 ? [{ rolls: 1, entries: immatureEntries }] : [],
        },
      },
    })

    const maturePools: unknown[] = []
    if (seedDrop) {
      maturePools.push({
        rolls: 1,
        entries: [
          {
            type: 'item',
            name: seedDrop,
            weight: 1,
            functions: [
              {
                function: 'set_count',
                count: { min: 1, max: Math.max(1, Math.round(num(data, 'seedDropMax', 2))) },
              },
            ],
          },
        ],
      })
    }
    if (produceNode) {
      const min = Math.max(0, Math.round(num(data, 'produceMin', 1)))
      const max = Math.max(min, Math.round(num(data, 'produceMax', 3)))
      maturePools.push({
        rolls: 1,
        entries: [
          {
            type: 'item',
            name: ctx.identifier(produceNode),
            weight: 1,
            functions: [{ function: 'set_count', count: { min, max } }],
          },
        ],
      })
    } else {
      ctx.warn(
        `Crop "${node.displayName}" has no harvest item, so a ripe plant only gives seeds back.`,
      )
    }

    files.push({
      path: `${BP}/loot_tables/blocks/${node.name}_mature.json`,
      origin: { nodeId: node.id, kind: node.kind, label: `Loot · ${node.displayName} (ripe)` },
      body: { type: 'json' as const, value: { pools: maturePools } },
    })

    return files
  },
}

/**
 * Generic custom item.
 *
 * Covers ingredients, harvests, cooked dishes and tools. Because 1.26.30+
 * refuses to register an item whose `components` object is empty, the generator
 * always emits at least the icon and stack size.
 */

import type { ContentKind } from '../registry/types'
import { BP } from '../generators/emit'
import { MENU_CATEGORY_OPTIONS, bool, compact, list, menuCategory, num, str } from './shared'

export const itemKind: ContentKind = {
  id: 'item',
  label: 'Item',
  plural: 'Items',
  icon: 'Package',
  accent: 'mint',
  group: 'world',
  description: 'An inventory item — ingredients, harvests, cooked dishes, tools.',
  preview: { type: 'item', slot: 'main' },

  fields: [
    {
      key: 'category',
      label: 'Creative tab',
      type: 'select',
      group: 'General',
      options: MENU_CATEGORY_OPTIONS,
    },
    {
      key: 'creativeGroup',
      label: 'Creative group',
      type: 'text',
      group: 'General',
      placeholder: 'minecraft:itemGroup.name.miscFood',
      when: (data) => str(data, 'category', 'items') !== 'none',
    },
    {
      key: 'maxStackSize',
      label: 'Stack size',
      type: 'number',
      group: 'General',
      min: 1,
      max: 64,
      step: 1,
    },
    {
      key: 'isFood',
      label: 'Edible',
      type: 'boolean',
      group: 'Food',
      help: 'Turns the item into something the player can eat.',
    },
    {
      key: 'nutrition',
      label: 'Nutrition',
      type: 'slider',
      group: 'Food',
      min: 0,
      max: 20,
      step: 1,
      when: (data) => bool(data, 'isFood'),
      help: 'Half-drumsticks restored. A cooked steak is 8.',
    },
    {
      key: 'saturation',
      label: 'Saturation modifier',
      type: 'number',
      group: 'Food',
      min: 0,
      max: 4,
      step: 0.1,
      when: (data) => bool(data, 'isFood'),
    },
    {
      key: 'canAlwaysEat',
      label: 'Edible when full',
      type: 'boolean',
      group: 'Food',
      when: (data) => bool(data, 'isFood'),
    },
    {
      key: 'useDuration',
      label: 'Eat time',
      type: 'number',
      group: 'Food',
      min: 0,
      step: 0.1,
      unit: 's',
      when: (data) => bool(data, 'isFood'),
    },
    {
      key: 'usingConvertsTo',
      label: 'Leaves behind',
      type: 'item-ref',
      group: 'Food',
      placeholder: 'minecraft:bowl',
      when: (data) => bool(data, 'isFood'),
      help: 'Item returned after eating, e.g. an empty bowl.',
    },
    {
      key: 'isFuel',
      label: 'Usable as fuel',
      type: 'boolean',
      group: 'Behaviour',
    },
    {
      key: 'fuelDuration',
      label: 'Burn duration',
      type: 'number',
      group: 'Behaviour',
      min: 0,
      step: 0.5,
      unit: 's',
      when: (data) => bool(data, 'isFuel'),
    },
    {
      key: 'handEquipped',
      label: 'Held like a tool',
      type: 'boolean',
      group: 'Behaviour',
      help: 'Renders in the hand at tool angle rather than flat.',
    },
    {
      key: 'glint',
      label: 'Enchanted glint',
      type: 'boolean',
      group: 'Behaviour',
    },
    {
      key: 'placesBlock',
      label: 'Places a block',
      type: 'node-ref',
      group: 'Behaviour',
      refKinds: ['block', 'crop'],
      help: 'Makes this item place the chosen block — how seeds work.',
    },
    {
      key: 'tags',
      label: 'Item tags',
      type: 'string-list',
      group: 'Advanced',
    },
  ],

  textureSlots: () => [
    { key: 'main', label: 'Icon', target: 'item', required: true, recommended: 16 },
  ],

  defaults: () => ({
    category: 'items',
    creativeGroup: '',
    maxStackSize: 64,
    isFood: false,
    nutrition: 4,
    saturation: 0.6,
    canAlwaysEat: false,
    useDuration: 1.6,
    usingConvertsTo: '',
    isFuel: false,
    fuelDuration: 10,
    handEquipped: false,
    glint: false,
    placesBlock: '',
    tags: [],
  }),

  emit(node, ctx) {
    const identifier = ctx.identifier(node)
    const data = node.data
    const target = ctx.target

    const icon = ctx.texture(node, 'main')
    if (!icon) {
      ctx.warn(`Item "${node.displayName}" has no icon yet.`)
    }

    const placesBlockNode = str(data, 'placesBlock')
      ? ctx.nodeById(str(data, 'placesBlock'))
      : undefined

    const tags = list(data, 'tags')

    const components = compact({
      // String shorthand is the current form (1.20.60+) and the one the
      // creator docs use.
      'minecraft:icon': icon ?? undefined,
      'minecraft:max_stack_size': Math.round(num(data, 'maxStackSize', 64)),
      'minecraft:hand_equipped': bool(data, 'handEquipped') ? true : undefined,
      'minecraft:glint': bool(data, 'glint') ? true : undefined,
      'minecraft:food': bool(data, 'isFood')
        ? compact({
            nutrition: Math.round(num(data, 'nutrition', 4)),
            saturation_modifier: num(data, 'saturation', 0.6),
            can_always_eat: bool(data, 'canAlwaysEat') ? true : undefined,
            using_converts_to: str(data, 'usingConvertsTo').trim() || undefined,
          })
        : undefined,
      'minecraft:use_modifiers': bool(data, 'isFood')
        ? { use_duration: num(data, 'useDuration', 1.6), movement_modifier: 0.35 }
        : undefined,
      'minecraft:fuel': bool(data, 'isFuel')
        ? { duration: num(data, 'fuelDuration', 10) }
        : undefined,
      'minecraft:block_placer': placesBlockNode
        ? {
            block: ctx.identifier(placesBlockNode),
            // Without this the seed cannot be planted on farmland.
            use_on: [{ name: 'minecraft:farmland' }],
          }
        : undefined,
      'minecraft:tags': target.rules.tagsAsComponent && tags.length > 0 ? tags : undefined,
    })

    if (target.rules.itemsNeedComponent && Object.keys(components).length === 0) {
      // Cannot happen with the defaults above, but a preset could strip
      // everything — an item with no components silently fails to register.
      components['minecraft:max_stack_size'] = 64
    }

    // Both key shapes are written because Bedrock has used each of them for
    // custom items; the unused one is simply ignored.
    ctx.lang(`item.${identifier}`, node.displayName)
    ctx.lang(`item.${identifier}.name`, node.displayName)

    return [
      {
        path: `${BP}/items/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Item · ${node.displayName}` },
        body: {
          type: 'json',
          value: {
            format_version: target.formats.item,
            'minecraft:item': {
              description: compact({
                identifier,
                menu_category: menuCategory(
                  target,
                  str(data, 'category', 'items'),
                  str(data, 'creativeGroup'),
                ),
              }),
              components,
            },
          },
        },
      },
    ]
  },
}

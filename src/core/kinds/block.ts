/**
 * Generic custom block.
 *
 * Deliberately not themed: a greenhouse pane, a storage crate, a cooking pot
 * and a decorative statue are all this kind with different field values. The
 * farming presets are just saved field values on top of it.
 */

import type { ContentKind } from '../registry/types'
import { BP } from '../generators/emit'
import {
  MENU_CATEGORY_OPTIONS,
  RENDER_METHOD_OPTIONS,
  bool,
  compact,
  list,
  materialInstances,
  menuCategory,
  num,
  str,
} from './shared'

export const blockKind: ContentKind = {
  id: 'block',
  label: 'Block',
  plural: 'Blocks',
  icon: 'Box',
  accent: 'accent',
  group: 'world',
  description: 'A placeable custom block with its own textures, hardness and creative tab.',
  preview: {
    type: 'block',
    faceSlots: { up: 'up', down: 'down' },
    fallbackSlot: 'main',
  },

  fields: [
    {
      key: 'category',
      label: 'Creative tab',
      type: 'select',
      group: 'General',
      options: MENU_CATEGORY_OPTIONS,
      help: 'Where the block shows up in the creative inventory.',
    },
    {
      key: 'creativeGroup',
      label: 'Creative group',
      type: 'text',
      group: 'General',
      placeholder: 'minecraft:itemGroup.name.stone',
      help: 'Optional. Slots the block into an existing group so it sits next to similar blocks.',
      when: (data) => str(data, 'category', 'construction') !== 'none',
    },
    {
      key: 'renderMethod',
      label: 'Render method',
      type: 'select',
      group: 'Appearance',
      options: RENDER_METHOD_OPTIONS,
      help: 'Use alpha test for anything with transparent pixels, or it will render as solid black.',
    },
    {
      key: 'ambientOcclusion',
      label: 'Ambient occlusion',
      type: 'slider',
      group: 'Appearance',
      min: 0,
      max: 10,
      step: 0.1,
      help: 'Strength of contact shading. 1.0 matches vanilla; 0 disables it.',
    },
    {
      key: 'faceDimming',
      label: 'Face dimming',
      type: 'boolean',
      group: 'Appearance',
      help: 'Darkens side and bottom faces the way vanilla blocks do.',
    },
    {
      key: 'geometry',
      label: 'Shape',
      type: 'select',
      group: 'Appearance',
      options: [
        { value: 'minecraft:geometry.full_block', label: 'Full block' },
        { value: 'minecraft:geometry.cross', label: 'Cross (plant-style)' },
        { value: 'custom', label: 'Custom geometry identifier' },
      ],
    },
    {
      key: 'customGeometry',
      label: 'Geometry identifier',
      type: 'text',
      group: 'Appearance',
      placeholder: 'geometry.my_crate',
      when: (data) => str(data, 'geometry') === 'custom',
      help: 'Must match a geometry file in the resource pack.',
    },
    {
      key: 'mapColor',
      label: 'Map colour',
      type: 'color',
      group: 'Appearance',
      help: 'How the block appears on an in-game map.',
    },
    {
      key: 'destroyTime',
      label: 'Seconds to break',
      type: 'number',
      group: 'Physics',
      min: 0,
      step: 0.1,
      unit: 's',
      help: 'Set to 0 for an instantly-broken block. Negative values make it unbreakable.',
    },
    {
      key: 'explosionResistance',
      label: 'Blast resistance',
      type: 'number',
      group: 'Physics',
      min: 0,
      step: 0.5,
    },
    {
      key: 'friction',
      label: 'Friction',
      type: 'slider',
      group: 'Physics',
      min: 0,
      max: 0.9,
      step: 0.05,
      help: '0.6 is stone. Lower is more slippery.',
    },
    {
      key: 'lightEmission',
      label: 'Light emission',
      type: 'slider',
      group: 'Physics',
      min: 0,
      max: 15,
      step: 1,
      help: 'Light level the block gives off, 0-15.',
    },
    {
      key: 'lightDampening',
      label: 'Light dampening',
      type: 'slider',
      group: 'Physics',
      min: 0,
      max: 15,
      step: 1,
      help: 'How much light the block blocks, 0-15.',
    },
    {
      key: 'solid',
      label: 'Solid collision',
      type: 'boolean',
      group: 'Physics',
      help: 'Turn off for decoration you can walk through.',
    },
    {
      key: 'flammable',
      label: 'Flammable',
      type: 'boolean',
      group: 'Physics',
    },
    {
      key: 'tags',
      label: 'Block tags',
      type: 'string-list',
      group: 'Advanced',
      help: 'Written into minecraft:tags. Use namespaced tags such as minecraft:crop.',
    },
    {
      key: 'lootSelf',
      label: 'Drops itself when mined',
      type: 'boolean',
      group: 'Advanced',
    },
    {
      key: 'isCraftingStation',
      label: 'Works as a crafting station',
      type: 'boolean',
      group: 'Advanced',
      help: 'Gives the block its own crafting screen. Leave off if the block is meant to be an ingredient in a normal crafting-table recipe instead.',
    },
    {
      key: 'craftingTag',
      label: 'Crafting tag',
      type: 'text',
      group: 'Advanced',
      placeholder: 'cooking_pot',
      when: (data) => bool(data, 'isCraftingStation'),
      help: 'Recipes made at this station carry this tag. The Recipe builder gives the block its own tab as soon as it is set.',
    },
    {
      key: 'craftingGridRows',
      label: 'Recipe rows',
      type: 'slider',
      group: 'Advanced',
      min: 1,
      max: 3,
      step: 1,
      when: (data) => bool(data, 'isCraftingStation'),
      help: 'How many rows the station\u2019s tab offers. The in-game screen is always 3x3 — this only constrains the shape a recipe may take, which is what makes a two-slot pot feel like a two-slot pot.',
    },
    {
      key: 'craftingGridCols',
      label: 'Recipe columns',
      type: 'slider',
      group: 'Advanced',
      min: 1,
      max: 3,
      step: 1,
      when: (data) => bool(data, 'isCraftingStation'),
    },
  ],

  textureSlots: () => [
    { key: 'main', label: 'All faces', target: 'terrain', required: true, recommended: 16 },
    { key: 'up', label: 'Top face', target: 'terrain', help: 'Optional override.', recommended: 16 },
    { key: 'down', label: 'Bottom face', target: 'terrain', help: 'Optional override.', recommended: 16 },
  ],

  defaults: () => ({
    category: 'construction',
    creativeGroup: '',
    renderMethod: 'opaque',
    ambientOcclusion: 1,
    faceDimming: true,
    geometry: 'minecraft:geometry.full_block',
    customGeometry: '',
    mapColor: '#8a7d5c',
    destroyTime: 1.5,
    explosionResistance: 3,
    friction: 0.6,
    lightEmission: 0,
    lightDampening: 15,
    solid: true,
    flammable: false,
    tags: [],
    lootSelf: true,
    isCraftingStation: false,
    craftingTag: '',
    craftingGridRows: 3,
    craftingGridCols: 3,
  }),

  emit(node, ctx) {
    const identifier = ctx.identifier(node)
    const data = node.data
    const target = ctx.target

    const faces = {
      all: ctx.texture(node, 'main'),
      up: ctx.texture(node, 'up'),
      down: ctx.texture(node, 'down'),
    }
    if (!faces.all && !faces.up && !faces.down) {
      ctx.warn(`Block "${node.displayName}" has no texture yet — it will render as the missing-texture checker.`)
    }

    const geometryChoice = str(data, 'geometry', 'minecraft:geometry.full_block')
    const geometry =
      geometryChoice === 'custom' ? str(data, 'customGeometry').trim() : geometryChoice

    const tags = list(data, 'tags')
    const solid = bool(data, 'solid', true)

    const components = compact({
      'minecraft:material_instances': materialInstances(
        target,
        faces,
        str(data, 'renderMethod', 'opaque'),
        num(data, 'ambientOcclusion', 1),
        bool(data, 'faceDimming', true),
      ),
      'minecraft:geometry': geometry || undefined,
      'minecraft:destructible_by_mining':
        num(data, 'destroyTime', 1.5) < 0
          ? undefined
          : { seconds_to_destroy: num(data, 'destroyTime', 1.5) },
      'minecraft:destructible_by_explosion': {
        explosion_resistance: num(data, 'explosionResistance', 3),
      },
      'minecraft:friction': num(data, 'friction', 0.6),
      'minecraft:light_emission': Math.round(num(data, 'lightEmission', 0)),
      'minecraft:light_dampening': Math.round(num(data, 'lightDampening', 15)),
      'minecraft:map_color': str(data, 'mapColor', '#8a7d5c'),
      'minecraft:collision_box': solid ? undefined : false,
      'minecraft:selection_box': solid ? undefined : false,
      'minecraft:flammable': bool(data, 'flammable')
        ? { catch_chance_modifier: 5, destroy_chance_modifier: 20 }
        : undefined,
      'minecraft:loot': bool(data, 'lootSelf', true) ? undefined : 'loot_tables/empty.json',
      'minecraft:crafting_table':
        bool(data, 'isCraftingStation') && str(data, 'craftingTag').trim()
          ? {
              table_name: node.displayName,
              crafting_tags: [str(data, 'craftingTag').trim()],
            }
          : undefined,
      // 1.26.20+ requires tags to live inside this component rather than
      // floating as top-level entries in `components`.
      'minecraft:tags': target.rules.tagsAsComponent && tags.length > 0 ? tags : undefined,
    })

    const description = compact({
      identifier,
      menu_category: menuCategory(target, str(data, 'category', 'construction'), str(data, 'creativeGroup')),
    })

    // Blocks pick their name up from the `tile.<id>.name` key automatically.
    ctx.lang(`tile.${identifier}.name`, node.displayName)

    const legacyTagComponents: Record<string, unknown> = {}
    if (!target.rules.tagsAsComponent) {
      for (const tag of tags) legacyTagComponents[`tag:${tag}`] = {}
    }

    return [
      {
        path: `${BP}/blocks/${node.name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Block · ${node.displayName}` },
        body: {
          type: 'json',
          value: {
            format_version: target.formats.block,
            'minecraft:block': {
              description,
              components: { ...components, ...legacyTagComponents },
            },
          },
        },
      },
    ]
  },
}

/**
 * A tree, described by shape rather than by JSON.
 *
 * Bedrock does not have one tree schema — it has a family of trunk and canopy
 * shapes (`acacia_trunk` + `acacia_canopy`, `mega_trunk` + `mega_pine_canopy`,
 * and so on) that each take different keys. Picking "Acacia" here selects that
 * pair; the height, trunk block and leaf block you typed are then mapped onto
 * whatever keys that particular pair expects.
 *
 * Only the keys this wizard is confident about are emitted. Anything more exotic
 * — per-branch canopies, lean steps — is a Code View override away, and the
 * generated file is a valid starting point for one.
 */

import type { ContentKind, FieldOption } from '../registry/types'
import type { VirtualFile } from '../vfs/types'
import { bool, clamp, compact, list, num, str } from './shared'
import { FEATURE_DIR, emitFeatureRule, placementDefaults, placementFields } from './worldgen'

type TrunkKey = 'trunk' | 'acacia_trunk' | 'fancy_trunk' | 'mega_trunk' | 'fallen_trunk'
type CanopyKey =
  | 'canopy'
  | 'acacia_canopy'
  | 'fancy_canopy'
  | 'mega_canopy'
  | 'mega_pine_canopy'
  | 'pine_canopy'
  | 'roofed_canopy'
  | 'spruce_canopy'

interface TreeShape {
  trunk: TrunkKey
  canopy: CanopyKey | null
  label: string
  hint: string
}

/**
 * The shape table. This is the whole of the per-shape knowledge in this kind —
 * the builders below switch on the trunk/canopy key, so adding a shape is one
 * entry here plus one case in each builder.
 */
export const TREE_SHAPES: Record<string, TreeShape> = {
  classic: {
    trunk: 'trunk',
    canopy: 'canopy',
    label: 'Classic',
    hint: 'Straight trunk, blobby canopy — oak and birch',
  },
  fancy: {
    trunk: 'fancy_trunk',
    canopy: 'fancy_canopy',
    label: 'Fancy',
    hint: 'Tall, branching, irregular — the large oak',
  },
  acacia: {
    trunk: 'acacia_trunk',
    canopy: 'acacia_canopy',
    label: 'Acacia',
    hint: 'Leaning trunk with a flat, wide crown',
  },
  pine: {
    trunk: 'trunk',
    canopy: 'pine_canopy',
    label: 'Pine',
    hint: 'Bare trunk with a cone of leaves on top',
  },
  spruce: {
    trunk: 'trunk',
    canopy: 'spruce_canopy',
    label: 'Spruce',
    hint: 'Conical, leaves running most of the way down',
  },
  mega_jungle: {
    trunk: 'mega_trunk',
    canopy: 'mega_canopy',
    label: 'Mega jungle',
    hint: '2×2 trunk, huge canopy, side branches',
  },
  mega_pine: {
    trunk: 'mega_trunk',
    canopy: 'mega_pine_canopy',
    label: 'Mega pine',
    hint: '2×2 trunk with a tall narrow crown',
  },
  roofed: {
    trunk: 'trunk',
    canopy: 'roofed_canopy',
    label: 'Roofed',
    hint: 'Thick flat canopy — dark oak',
  },
  fallen: {
    trunk: 'fallen_trunk',
    canopy: null,
    label: 'Fallen log',
    hint: 'A log lying on the ground, no canopy at all',
  },
}

const SHAPE_OPTIONS: FieldOption[] = Object.entries(TREE_SHAPES).map(([value, shape]) => ({
  value,
  label: shape.label,
  hint: shape.hint,
}))

function shapeOf(data: Record<string, unknown>): TreeShape {
  return TREE_SHAPES[str(data, 'shape', 'classic')] ?? TREE_SHAPES.classic
}

/** A percentage as the `{numerator, denominator}` pair the tree schema wants. */
function chanceOf(percent: number): { numerator: number; denominator: number } {
  return { numerator: Math.round(clamp(percent, 0, 100)), denominator: 100 }
}

function decoration(
  block: string,
  percent: number,
  steps: number,
  direction: 'down' | 'up' | 'out',
): Record<string, unknown> | undefined {
  if (!block.trim() || percent <= 0) return undefined
  return {
    decoration_block: block.trim(),
    num_steps: Math.max(1, Math.round(steps)),
    step_direction: direction,
    decoration_chance: chanceOf(percent),
  }
}

/** Which trunk shapes accept a `trunk_decoration` block. */
const TRUNK_DECORATABLE: TrunkKey[] = ['trunk', 'mega_trunk', 'fallen_trunk']

export const treeKind: ContentKind = {
  id: 'tree',
  label: 'Tree',
  plural: 'Trees',
  icon: 'Trees',
  accent: 'mint',
  group: 'world',
  description:
    'A generated tree — its shape, how tall it grows, what it is made of, what it fruits, and where it is allowed to take root.',
  preview: { type: 'none' },

  fields: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'select',
      group: 'Shape',
      options: SHAPE_OPTIONS,
      help: 'Picks the trunk and canopy pair. Everything below is mapped onto whatever keys that pair uses.',
    },
    {
      key: 'heightMin',
      label: 'Shortest',
      type: 'number',
      group: 'Shape',
      min: 1,
      max: 60,
      step: 1,
      unit: 'blocks',
      validate: (value, data) =>
        (typeof value === 'number' ? value : 0) > num(data, 'heightMax', 0)
          ? 'The shortest tree is taller than the tallest one.'
          : null,
    },
    {
      key: 'heightMax',
      label: 'Tallest',
      type: 'number',
      group: 'Shape',
      min: 1,
      max: 60,
      step: 1,
      unit: 'blocks',
      help: 'Trunk height is rolled between the two on every tree.',
    },
    {
      key: 'trunkWidth',
      label: 'Trunk width',
      type: 'slider',
      group: 'Shape',
      min: 1,
      max: 4,
      step: 1,
      unit: 'blocks',
      when: (data) => ['acacia_trunk', 'fancy_trunk', 'mega_trunk'].includes(shapeOf(data).trunk),
    },
    {
      key: 'canopyWidth',
      label: 'Canopy width',
      type: 'slider',
      group: 'Shape',
      min: 1,
      max: 12,
      step: 1,
      unit: 'blocks',
      when: (data) => shapeOf(data).canopy !== null,
      help: 'Radius of the leaves, measured from the trunk.',
    },
    {
      key: 'canopyHeight',
      label: 'Canopy depth',
      type: 'slider',
      group: 'Shape',
      min: 1,
      max: 16,
      step: 1,
      unit: 'blocks',
      when: (data) =>
        ['canopy', 'fancy_canopy', 'mega_canopy', 'mega_pine_canopy', 'pine_canopy', 'roofed_canopy', 'spruce_canopy'].includes(
          shapeOf(data).canopy ?? '',
        ),
      help: 'How far down from the top the leaves reach.',
    },
    {
      key: 'logLength',
      label: 'Log length',
      type: 'slider',
      group: 'Shape',
      min: 2,
      max: 16,
      step: 1,
      unit: 'blocks',
      when: (data) => shapeOf(data).trunk === 'fallen_trunk',
    },
    {
      key: 'stumpHeight',
      label: 'Stump height',
      type: 'slider',
      group: 'Shape',
      min: 0,
      max: 4,
      step: 1,
      unit: 'blocks',
      when: (data) => shapeOf(data).trunk === 'fallen_trunk',
      help: 'The bit still standing where the log broke off.',
    },

    {
      key: 'trunkBlock',
      label: 'Trunk block',
      type: 'block-ref',
      group: 'Blocks',
      placeholder: 'minecraft:oak_log',
    },
    {
      key: 'leafBlock',
      label: 'Leaf block',
      type: 'block-ref',
      group: 'Blocks',
      placeholder: 'minecraft:oak_leaves',
      when: (data) => shapeOf(data).canopy !== null,
    },
    {
      key: 'leafVariation',
      label: 'Leaf gaps',
      type: 'slider',
      group: 'Blocks',
      min: 0,
      max: 100,
      step: 5,
      unit: '%',
      when: (data) => shapeOf(data).canopy === 'canopy',
      help: 'Chance a leaf at the edge of the canopy is skipped, which is what stops the crown looking like a cube.',
    },

    {
      key: 'fruitBlock',
      label: 'Fruit block',
      type: 'block-ref',
      group: 'Fruit & decoration',
      placeholder: 'minecraft:cocoa',
      help: 'Hung in the canopy. Use your own block here for a custom fruit — it is placed as a normal block, so it can be harvested like one.',
      when: (data) => shapeOf(data).canopy === 'canopy',
    },
    {
      key: 'fruitChance',
      label: 'Fruit chance',
      type: 'slider',
      group: 'Fruit & decoration',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      when: (data) => shapeOf(data).canopy === 'canopy' && str(data, 'fruitBlock').trim() !== '',
      help: 'Rolled per candidate spot, so a low number gives a tree with a handful of fruit rather than none at all.',
    },
    {
      key: 'fruitSteps',
      label: 'Fruit spread',
      type: 'slider',
      group: 'Fruit & decoration',
      min: 1,
      max: 8,
      step: 1,
      when: (data) => shapeOf(data).canopy === 'canopy' && str(data, 'fruitBlock').trim() !== '',
      help: 'How far out from each leaf the fruit may hang.',
    },
    {
      key: 'trunkDecorationBlock',
      label: 'Trunk decoration',
      type: 'block-ref',
      group: 'Fruit & decoration',
      placeholder: 'minecraft:vine',
      when: (data) => TRUNK_DECORATABLE.includes(shapeOf(data).trunk),
      help: 'Vines, moss, fungus — anything that clings to the trunk.',
    },
    {
      key: 'trunkDecorationChance',
      label: 'Trunk decoration chance',
      type: 'slider',
      group: 'Fruit & decoration',
      min: 0,
      max: 100,
      step: 1,
      unit: '%',
      when: (data) =>
        TRUNK_DECORATABLE.includes(shapeOf(data).trunk) &&
        str(data, 'trunkDecorationBlock').trim() !== '',
    },

    {
      key: 'mayGrowOn',
      label: 'May grow on',
      type: 'string-list',
      group: 'Growing conditions',
      placeholder: 'minecraft:grass_block',
      help: 'Surfaces the tree accepts. An empty list means anything solid.',
    },
    {
      key: 'mayReplace',
      label: 'May replace',
      type: 'string-list',
      group: 'Growing conditions',
      placeholder: 'minecraft:air',
      help: 'What the trunk and leaves are allowed to grow into.',
    },
    {
      key: 'mayGrowThrough',
      label: 'May grow through',
      type: 'string-list',
      group: 'Growing conditions',
      placeholder: 'minecraft:short_grass',
      help: 'Blocks the trunk pushes past on the way up without failing the placement.',
    },
    {
      key: 'baseBlock',
      label: 'Ground block underneath',
      type: 'string-list',
      group: 'Growing conditions',
      placeholder: 'minecraft:dirt',
      help: 'Placed under the trunk so a tree on stone or sand still has something to stand in.',
    },
    {
      key: 'baseCluster',
      label: 'Spread the ground block',
      type: 'boolean',
      group: 'Growing conditions',
      help: 'Lays a small patch of the ground block around the base, the way a jungle tree brings its own dirt.',
    },
    {
      key: 'baseClusterRadius',
      label: 'Ground patch radius',
      type: 'slider',
      group: 'Growing conditions',
      min: 1,
      max: 6,
      step: 1,
      unit: 'blocks',
      when: (data) => bool(data, 'baseCluster'),
    },
    {
      key: 'canBeSubmerged',
      label: 'May grow underwater',
      type: 'boolean',
      group: 'Growing conditions',
      help: 'Mangrove-style. Off means water fails the placement.',
    },

    ...placementFields({
      enableHelp:
        'Writes the feature rule that plants this tree in new chunks. Turn off for a tree you only grow from a sapling or place by command.',
    }),
  ],

  textureSlots: () => [],

  defaults: () => ({
    shape: 'classic',
    heightMin: 4,
    heightMax: 6,
    trunkWidth: 1,
    canopyWidth: 2,
    canopyHeight: 3,
    logLength: 5,
    stumpHeight: 1,
    trunkBlock: 'minecraft:oak_log',
    leafBlock: 'minecraft:oak_leaves',
    leafVariation: 25,
    fruitBlock: '',
    fruitChance: 15,
    fruitSteps: 2,
    trunkDecorationBlock: '',
    trunkDecorationChance: 20,
    mayGrowOn: ['minecraft:grass_block', 'minecraft:dirt'],
    mayReplace: ['minecraft:air', 'minecraft:short_grass'],
    mayGrowThrough: ['minecraft:short_grass'],
    baseBlock: ['minecraft:dirt'],
    baseCluster: false,
    baseClusterRadius: 2,
    canBeSubmerged: false,
    ...placementDefaults({ defaults: { scatterPercent: 10, iterations: 1 } }),
  }),

  emit(node, ctx) {
    const data = node.data
    const shape = shapeOf(data)
    const featureName = `${node.name}_feature`
    const identifier = ctx.ownIdentifier(featureName)

    const heightMin = Math.max(1, Math.round(num(data, 'heightMin', 4)))
    const heightMax = Math.max(heightMin, Math.round(num(data, 'heightMax', 6)))
    const heightSpread = heightMax - heightMin

    const trunkBlock = str(data, 'trunkBlock', 'minecraft:oak_log').trim() || 'minecraft:oak_log'
    const leafBlock = str(data, 'leafBlock', 'minecraft:oak_leaves').trim() || 'minecraft:oak_leaves'
    const trunkWidth = Math.round(clamp(num(data, 'trunkWidth', 1), 1, 4))
    const canopyWidth = Math.round(clamp(num(data, 'canopyWidth', 2), 1, 12))
    const canopyHeight = Math.round(clamp(num(data, 'canopyHeight', 3), 1, 16))

    const trunkDecoration = decoration(
      str(data, 'trunkDecorationBlock'),
      num(data, 'trunkDecorationChance', 20),
      2,
      'down',
    )
    const canopyDecoration = decoration(
      str(data, 'fruitBlock'),
      num(data, 'fruitChance', 15),
      num(data, 'fruitSteps', 2),
      'down',
    )

    if (canopyDecoration && shape.canopy !== 'canopy') {
      ctx.warn(
        `Tree "${node.displayName}" has a fruit block, but only the Classic shape hangs fruit in its canopy. Switch shape, or place the fruit with a Scatter.`,
      )
    }

    // -- trunk ---------------------------------------------------------------

    // `base` plus one interval is the plain "somewhere between min and max"
    // reading of trunk height; wider spreads are a second interval away in
    // Code View if a tree needs a lumpier distribution.
    const trunkHeight = { base: heightMin, intervals: heightSpread > 0 ? [heightSpread] : [0] }
    const submerged = bool(data, 'canBeSubmerged')

    let trunk: Record<string, unknown>
    switch (shape.trunk) {
      case 'fancy_trunk':
        trunk = compact({
          trunk_block: trunkBlock,
          trunk_height: { base: heightMin, variance: Math.max(1, heightSpread), scale: 1 },
          trunk_width: trunkWidth,
          can_be_submerged: submerged || undefined,
        })
        break
      case 'acacia_trunk':
        trunk = compact({
          trunk_block: trunkBlock,
          trunk_width: trunkWidth,
          trunk_height: trunkHeight,
          can_be_submerged: submerged || undefined,
        })
        break
      case 'mega_trunk':
        trunk = compact({
          trunk_block: trunkBlock,
          // The mega shapes are the 2×2 ones; forcing the minimum here stops a
          // "mega" tree quietly generating as a normal one-block trunk.
          trunk_width: Math.max(2, trunkWidth),
          trunk_height: trunkHeight,
          trunk_decoration: trunkDecoration,
          can_be_submerged: submerged || undefined,
        })
        break
      case 'fallen_trunk':
        trunk = compact({
          log_block: trunkBlock,
          log_length: Math.round(clamp(num(data, 'logLength', 5), 2, 16)),
          stump_height: Math.round(clamp(num(data, 'stumpHeight', 1), 0, 4)),
          trunk_decoration: trunkDecoration,
          can_be_submerged: submerged || undefined,
        })
        break
      default:
        trunk = compact({
          trunk_block: trunkBlock,
          trunk_height: trunkHeight,
          trunk_decoration: trunkDecoration,
          can_be_submerged: submerged || undefined,
        })
    }

    // -- canopy --------------------------------------------------------------

    let canopy: Record<string, unknown> | undefined
    switch (shape.canopy) {
      case 'canopy':
        canopy = compact({
          canopy_offset: { min: -canopyHeight + 1, max: 0 },
          min_width: 1,
          canopy_slope: { rise: 1, run: Math.max(1, canopyWidth) },
          variation_chance: chanceOf(num(data, 'leafVariation', 25)),
          leaf_blocks: [[leafBlock, 1]],
          canopy_decoration: canopyDecoration,
        })
        break
      case 'acacia_canopy':
        canopy = { leaf_block: leafBlock, canopy_size: canopyWidth, simplify_canopy: false }
        break
      case 'fancy_canopy':
        canopy = { leaf_block: leafBlock, height: canopyHeight, radius: canopyWidth }
        break
      case 'mega_canopy':
        canopy = {
          leaf_block: leafBlock,
          canopy_height: canopyHeight,
          base_radius: canopyWidth,
          core_width: Math.max(2, trunkWidth),
          simplify_canopy: false,
        }
        break
      case 'mega_pine_canopy':
        canopy = {
          leaf_block: leafBlock,
          canopy_height: canopyHeight,
          base_radius: canopyWidth,
          radius_step_modifier: 0.5,
        }
        break
      case 'pine_canopy':
        canopy = { leaf_block: leafBlock, canopy_height: canopyHeight, base_radius: canopyWidth }
        break
      case 'roofed_canopy':
        canopy = {
          leaf_block: leafBlock,
          canopy_height: canopyHeight,
          core_width: Math.max(1, trunkWidth),
          outer_radius: canopyWidth,
          inner_radius: Math.max(1, canopyWidth - 1),
        }
        break
      case 'spruce_canopy':
        canopy = {
          leaf_block: leafBlock,
          lower_offset: 1,
          upper_offset: canopyHeight,
          max_radius: canopyWidth,
        }
        break
      default:
        canopy = undefined
    }

    // -- growing conditions ---------------------------------------------------

    const mayGrowOn = list(data, 'mayGrowOn')
    const mayReplace = list(data, 'mayReplace')
    const mayGrowThrough = list(data, 'mayGrowThrough')
    const baseBlock = list(data, 'baseBlock')

    const feature = compact({
      description: { identifier },
      base_block: baseBlock.length > 0 ? baseBlock : undefined,
      base_cluster:
        bool(data, 'baseCluster') && baseBlock.length > 0
          ? {
              may_replace: mayReplace.length > 0 ? mayReplace : ['minecraft:air'],
              num_clusters: 4,
              cluster_radius: Math.round(clamp(num(data, 'baseClusterRadius', 2), 1, 6)),
            }
          : undefined,
      may_grow_on: mayGrowOn.length > 0 ? mayGrowOn : undefined,
      may_replace: mayReplace.length > 0 ? mayReplace : undefined,
      may_grow_through: mayGrowThrough.length > 0 ? mayGrowThrough : undefined,
      [shape.trunk]: trunk,
      ...(canopy && shape.canopy ? { [shape.canopy]: canopy } : {}),
    })

    const files: VirtualFile[] = [
      {
        path: `${FEATURE_DIR}/${featureName}.json`,
        origin: { nodeId: node.id, kind: node.kind, label: `Tree · ${node.displayName}` },
        body: {
          type: 'json',
          value: {
            format_version: ctx.target.formats.feature,
            'minecraft:tree_feature': feature,
          },
        },
      },
    ]

    const rule = emitFeatureRule(node, ctx, { featureId: identifier, label: node.displayName })
    if (rule) files.push(rule)

    return files
  },
}

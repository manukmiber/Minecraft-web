/**
 * Scattering — "put this block around the world, this often, at these heights".
 *
 * Covers the two things people mean by scatter, which are not the same thing:
 *
 *   1. *How often does this appear at all* — the scatter chance and attempts per
 *      chunk on the rule, so tall grass at 60% and a rare flower at 2% are two
 *      nodes with two numbers.
 *   2. *When it does appear, which of these blocks is it* — the weighted block
 *      list, which becomes a `minecraft:weighted_random_feature` so plant A can
 *      win 3 rolls out of 4 against plant B.
 *
 * Height is the third axis: a band of Y values, so a dirt blob restricted to
 * Y 2–7 is a height range on this node rather than a hand-written distribution.
 */

import type { ContentKind } from '../registry/types'
import type { VirtualFile } from '../vfs/types'
import { bool, clamp, compact, list, num, str } from './shared'
import {
  FEATURE_DIR,
  emitFeatureRule,
  placementDefaults,
  placementFields,
} from './worldgen'
import { type WeightedEntry, weightedEntries } from './weighted'

export const scatterKind: ContentKind = {
  id: 'scatter',
  label: 'Scatter',
  plural: 'Scattering',
  icon: 'Shuffle',
  accent: 'mint',
  group: 'world',
  description:
    'Sprinkles blocks through generated chunks — how often, which blocks win the roll, and between which heights.',
  preview: { type: 'none' },

  fields: [
    {
      key: 'placeMode',
      label: 'What to place',
      type: 'select',
      group: 'Contents',
      options: [
        { value: 'blocks', label: 'Blocks from a weighted list' },
        { value: 'feature', label: 'An existing feature', hint: 'Anything already in the pack, or a vanilla feature' },
      ],
    },
    {
      key: 'blocks',
      label: 'Blocks and their share',
      type: 'weighted-list',
      group: 'Contents',
      placeholder: 'minecraft:short_grass',
      when: (data) => str(data, 'placeMode', 'blocks') === 'blocks',
      help: 'Each entry gets a share of the placements. One entry places that block every time; several split the rolls by weight.',
      validate: (value) =>
        weightedEntries(value).length === 0 ? 'Add at least one block to place.' : null,
    },
    {
      key: 'featureRef',
      label: 'Feature identifier',
      type: 'text',
      group: 'Contents',
      placeholder: 'minecraft:oak_tree_feature',
      when: (data) => str(data, 'placeMode', 'blocks') === 'feature',
      help: 'Placed as-is. Use this to give a tree or structure from elsewhere in the pack a second, differently-tuned distribution.',
    },
    {
      key: 'patchSize',
      label: 'Blocks per patch',
      type: 'slider',
      group: 'Contents',
      min: 1,
      max: 64,
      step: 1,
      help: 'Above 1 the placements clump into a patch instead of being spread one at a time — how grass and flowers grow in vanilla.',
    },
    {
      key: 'patchRadius',
      label: 'Patch radius',
      type: 'slider',
      group: 'Contents',
      min: 1,
      max: 8,
      step: 1,
      unit: 'blocks',
      when: (data) => num(data, 'patchSize', 1) > 1,
    },
    {
      key: 'mayPlaceOn',
      label: 'Only on top of',
      type: 'string-list',
      group: 'Conditions',
      placeholder: 'minecraft:grass_block',
      help: 'Leave empty to allow any surface. Listing blocks here is what keeps a crop out of the sand.',
    },
    {
      key: 'mayReplace',
      label: 'May replace',
      type: 'string-list',
      group: 'Conditions',
      placeholder: 'minecraft:air',
      help: 'Blocks the placement is allowed to overwrite. Air only, unless you want it carving into terrain.',
    },
    {
      key: 'enforceSurvivability',
      label: 'Must be able to survive',
      type: 'boolean',
      group: 'Conditions',
      help: 'Refuses placements the block would immediately break out of — a plant on a block it cannot grow on, for one.',
    },
    {
      key: 'enforcePlacement',
      label: 'Respect the block’s own placement filter',
      type: 'boolean',
      group: 'Conditions',
    },
    {
      key: 'randomizeRotation',
      label: 'Random rotation',
      type: 'boolean',
      group: 'Conditions',
      help: 'Only does anything for blocks that have a rotation state.',
    },

    ...placementFields({
      enableHelp:
        'Writes the feature rule that actually spreads this through new chunks. Turn off to keep the feature for something else to place.',
    }),
  ],

  textureSlots: () => [],

  defaults: () => ({
    placeMode: 'blocks',
    blocks: [{ id: 'minecraft:short_grass', weight: 1 }] satisfies WeightedEntry[],
    featureRef: '',
    patchSize: 1,
    patchRadius: 3,
    mayPlaceOn: [],
    mayReplace: ['minecraft:air'],
    enforceSurvivability: true,
    enforcePlacement: true,
    randomizeRotation: false,
    ...placementDefaults({ defaults: { scatterPercent: 35, iterations: 2 } }),
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const files: VirtualFile[] = []

    const feature = (name: string, label: string, value: Record<string, unknown>): string => {
      const identifier = ctx.ownIdentifier(name)
      files.push({
        path: `${FEATURE_DIR}/${name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label },
        body: {
          type: 'json',
          value: { format_version: target.formats.feature, ...value },
        },
      })
      return identifier
    }

    // -- what a single placement drops --------------------------------------

    let placed: string | null = null

    if (str(data, 'placeMode', 'blocks') === 'feature') {
      placed = str(data, 'featureRef').trim() || null
      if (!placed) {
        ctx.warn(`Scatter "${node.displayName}" has no feature to place yet.`)
        return files
      }
    } else {
      const entries = weightedEntries(data.blocks)
      if (entries.length === 0) {
        ctx.warn(`Scatter "${node.displayName}" has no blocks to place yet.`)
        return files
      }

      const mayReplace = list(data, 'mayReplace')
      const mayPlaceOn = list(data, 'mayPlaceOn')

      const singles = entries.map((entry, index) => {
        const name = entries.length === 1 ? `${node.name}_block` : `${node.name}_block_${index + 1}`
        const identifier = feature(name, `Feature · ${entry.id}`, {
          'minecraft:single_block_feature': compact({
            description: { identifier: ctx.ownIdentifier(name) },
            places_block: entry.id,
            enforce_placement_rules: bool(data, 'enforcePlacement', true),
            enforce_survivability_rules: bool(data, 'enforceSurvivability', true),
            randomize_rotation: bool(data, 'randomizeRotation') ? true : undefined,
            may_replace: mayReplace.length > 0 ? mayReplace : undefined,
            may_attach_to: mayPlaceOn.length > 0 ? { top: mayPlaceOn } : undefined,
          }),
        })
        return [identifier, entry.weight] as const
      })

      placed =
        singles.length === 1
          ? singles[0][0]
          : feature(`${node.name}_mix`, `Feature · ${node.displayName} mix`, {
              // Weights are relative, not percentages — the game normalises
              // them — so the wizard shows the share and stores the raw weight.
              'minecraft:weighted_random_feature': {
                description: { identifier: ctx.ownIdentifier(`${node.name}_mix`) },
                features: singles.map(([id, weight]) => [id, weight]),
              },
            })
    }

    // -- clumping ------------------------------------------------------------

    const patchSize = Math.round(clamp(num(data, 'patchSize', 1), 1, 64))
    if (patchSize > 1) {
      const radius = Math.round(clamp(num(data, 'patchRadius', 3), 1, 8))
      placed = feature(`${node.name}_patch`, `Feature · ${node.displayName} patch`, {
        'minecraft:scatter_feature': {
          description: { identifier: ctx.ownIdentifier(`${node.name}_patch`) },
          iterations: patchSize,
          // Gaussian rather than uniform so a patch reads as a clump with a
          // dense middle instead of a square of evenly-spaced blocks.
          x: { distribution: 'gaussian', extent: [-radius, radius] },
          z: { distribution: 'gaussian', extent: [-radius, radius] },
          places_feature: placed,
        },
      })
    }

    const rule = emitFeatureRule(node, ctx, {
      featureId: placed,
      label: node.displayName,
    })
    if (rule) files.push(rule)

    return files
  },
}

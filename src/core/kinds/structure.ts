/**
 * The structure maker.
 *
 * Two ways in, because Bedrock has two honest answers to "generate a building":
 *
 *   • **Painted here.** You lay blocks out layer by layer in the wizard. Each
 *     filled cell becomes a one-block feature placed at a fixed offset, and an
 *     aggregate feature ties the lot together. Pure JSON, no binary files, and
 *     every block stays editable in Code View — but one feature file per block,
 *     which is why the grid is capped.
 *
 *   • **From a `.mcstructure`.** Anything exported from the game with a
 *     structure block. The pack just points at it, so a cathedral costs one
 *     file. Drop the `.mcstructure` into the behaviour pack yourself; the
 *     builder does not write binary NBT.
 */

import type { ContentKind } from '../registry/types'
import type { VirtualFile } from '../vfs/types'
import { bool, clamp, compact, list, num, str } from './shared'
import { FEATURE_DIR, emitFeatureRule, placementDefaults, placementFields } from './worldgen'
import { MAX_GRID_BLOCKS, filledCells, gridPalette, voxelGrid } from './voxels'

const painted = (data: Record<string, unknown>) => str(data, 'source', 'painted') === 'painted'

export const structureKind: ContentKind = {
  id: 'structure',
  label: 'Structure',
  plural: 'Structures',
  icon: 'Castle',
  accent: 'amber',
  group: 'world',
  description:
    'A multi-block build — painted layer by layer here, or pointed at a .mcstructure you exported from the game.',
  preview: { type: 'structure', gridKey: 'grid' },

  fields: [
    {
      key: 'source',
      label: 'Built from',
      type: 'select',
      group: 'Source',
      options: [
        {
          value: 'painted',
          label: 'Painted here',
          hint: 'Small builds — one feature file per block, so keep it modest',
        },
        {
          value: 'mcstructure',
          label: 'A .mcstructure file',
          hint: 'Any size — exported from a structure block in game',
        },
      ],
    },
    {
      key: 'grid',
      label: 'Layout',
      type: 'layer-grid',
      group: 'Source',
      when: painted,
      help: 'One layer at a time, bottom up. Empty cells leave whatever is already there.',
      validate: (value) => {
        const blocks = filledCells(voxelGrid(value)).length
        if (blocks === 0) return 'Paint at least one block.'
        if (blocks > MAX_GRID_BLOCKS) {
          return `${blocks} blocks is past the ${MAX_GRID_BLOCKS}-block limit for a painted structure. Export it as a .mcstructure instead.`
        }
        return null
      },
    },
    {
      key: 'anchor',
      label: 'Anchor point',
      type: 'select',
      group: 'Source',
      when: painted,
      options: [
        { value: 'center', label: 'Centre of the footprint' },
        { value: 'corner', label: 'North-west corner' },
      ],
      help: 'Which part of the layout lands on the position the world generator picked.',
    },
    {
      key: 'structureName',
      label: 'Structure name',
      type: 'text',
      group: 'Source',
      placeholder: 'mystructure:village_hut',
      when: (data) => !painted(data),
      help: 'The identifier the .mcstructure was saved under. The file itself goes in behavior_pack/structures/ — the builder does not generate it.',
      validate: (value, data) =>
        painted(data) || (typeof value === 'string' && value.trim() !== '')
          ? null
          : 'Name the structure to place.',
    },
    {
      key: 'facing',
      label: 'Facing',
      type: 'select',
      group: 'Source',
      when: (data) => !painted(data),
      options: [
        { value: 'random', label: 'Random' },
        { value: 'north', label: 'North' },
        { value: 'south', label: 'South' },
        { value: 'east', label: 'East' },
        { value: 'west', label: 'West' },
      ],
    },
    {
      key: 'adjustmentRadius',
      label: 'Fit search radius',
      type: 'slider',
      group: 'Source',
      min: 0,
      max: 16,
      step: 1,
      unit: 'blocks',
      when: (data) => !painted(data),
      help: 'How far the game may shuffle the structure sideways looking for a spot where it fits.',
    },

    {
      key: 'mayReplace',
      label: 'May replace',
      type: 'string-list',
      group: 'Conditions',
      placeholder: 'minecraft:air',
      when: painted,
      help: 'Blocks the build is allowed to overwrite. Add stone and dirt if it should cut into terrain.',
    },
    {
      key: 'grounded',
      label: 'Must sit on the ground',
      type: 'boolean',
      group: 'Conditions',
      when: (data) => !painted(data),
    },
    {
      key: 'unburied',
      label: 'Must not be buried',
      type: 'boolean',
      group: 'Conditions',
      when: (data) => !painted(data),
    },
    {
      key: 'intersectAllowlist',
      label: 'May intersect',
      type: 'string-list',
      group: 'Conditions',
      placeholder: 'minecraft:air',
      when: (data) => !painted(data),
      help: 'Existing blocks the structure is allowed to overlap. Anything else makes the placement fail.',
    },

    ...placementFields({
      enableHelp:
        'Writes the feature rule that drops this into new chunks. Turn off for a structure placed by command or by another feature.',
    }),
  ],

  textureSlots: () => [],

  defaults: () => ({
    source: 'painted',
    grid: { size: [5, 3, 5], cells: Array(75).fill('') },
    anchor: 'center',
    structureName: '',
    facing: 'random',
    adjustmentRadius: 4,
    mayReplace: ['minecraft:air'],
    grounded: true,
    unburied: true,
    intersectAllowlist: ['minecraft:air'],
    ...placementDefaults({
      defaults: { scatterPercent: 2, iterations: 1, placementPass: 'surface_pass' },
    }),
  }),

  emit(node, ctx) {
    const data = node.data
    const target = ctx.target
    const files: VirtualFile[] = []

    const feature = (name: string, label: string, value: Record<string, unknown>): string => {
      files.push({
        path: `${FEATURE_DIR}/${name}.json`,
        origin: { nodeId: node.id, kind: node.kind, label },
        body: { type: 'json', value: { format_version: target.formats.feature, ...value } },
      })
      return ctx.ownIdentifier(name)
    }

    let root: string | null = null

    if (!painted(data)) {
      const structureName = str(data, 'structureName').trim()
      if (!structureName) {
        ctx.warn(`Structure "${node.displayName}" has no .mcstructure name yet.`)
        return files
      }

      const allowlist = list(data, 'intersectAllowlist')
      const constraints = compact({
        grounded: bool(data, 'grounded', true) ? {} : undefined,
        unburied: bool(data, 'unburied', true) ? {} : undefined,
        block_intersection: allowlist.length > 0 ? { block_allowlist: allowlist } : undefined,
      })

      const name = `${node.name}_feature`
      root = feature(name, `Structure · ${node.displayName}`, {
        'minecraft:structure_template_feature': compact({
          description: { identifier: ctx.ownIdentifier(name) },
          structure_name: structureName,
          adjustment_radius: Math.round(clamp(num(data, 'adjustmentRadius', 4), 0, 16)),
          facing_direction: str(data, 'facing', 'random'),
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
        }),
      })

      ctx.warn(
        `Structure "${node.displayName}" points at ${structureName}. Copy the .mcstructure file into behavior_pack/structures/ before exporting — the builder cannot generate it.`,
      )
    } else {
      const grid = voxelGrid(data.grid)
      const cells = filledCells(grid)

      if (cells.length === 0) {
        ctx.warn(`Structure "${node.displayName}" is empty — nothing to place.`)
        return files
      }
      if (cells.length > MAX_GRID_BLOCKS) {
        ctx.warn(
          `Structure "${node.displayName}" paints ${cells.length} blocks, past the ${MAX_GRID_BLOCKS}-block limit. Only the first ${MAX_GRID_BLOCKS} are generated; export it as a .mcstructure for anything larger.`,
        )
      }

      const mayReplace = list(data, 'mayReplace')
      const kept = cells.slice(0, MAX_GRID_BLOCKS)

      // One block feature per distinct block, shared by every cell using it —
      // a 60-block wall of one material is 60 placements but a single block
      // feature, not 60 identical ones.
      const blockFeature = new Map<string, string>()
      gridPalette(grid).forEach((block, index) => {
        const name = `${node.name}_block_${index + 1}`
        blockFeature.set(
          block,
          feature(name, `Feature · ${block}`, {
            'minecraft:single_block_feature': compact({
              description: { identifier: ctx.ownIdentifier(name) },
              places_block: block,
              // A structure decides its own shape; letting each block re-check
              // survivability would punch holes in overhangs and ceilings.
              enforce_placement_rules: false,
              enforce_survivability_rules: false,
              may_replace: mayReplace.length > 0 ? mayReplace : undefined,
            }),
          }),
        )
      })

      const centred = str(data, 'anchor', 'center') === 'center'
      const offsetX = centred ? Math.floor(grid.size[0] / 2) : 0
      const offsetZ = centred ? Math.floor(grid.size[2] / 2) : 0

      // Bedrock has no "place this feature at an offset" primitive, so each
      // cell is a one-iteration scatter with constant coordinates. That is the
      // whole reason a painted structure is capped.
      const placements = kept.map((cell, index) => {
        const name = `${node.name}_cell_${index + 1}`
        return feature(name, `Cell · ${cell.block} (${cell.x}, ${cell.y}, ${cell.z})`, {
          'minecraft:scatter_feature': {
            description: { identifier: ctx.ownIdentifier(name) },
            iterations: 1,
            x: cell.x - offsetX,
            y: cell.y,
            z: cell.z - offsetZ,
            places_feature: blockFeature.get(cell.block)!,
          },
        })
      })

      const name = `${node.name}_feature`
      root = feature(name, `Structure · ${node.displayName}`, {
        'minecraft:aggregate_feature': {
          description: { identifier: ctx.ownIdentifier(name) },
          // A half-built house is worse than none, but a hard stop on the first
          // blocked cell would refuse to build against any terrain at all, so
          // the placements run independently.
          early_out: 'none',
          features: placements,
        },
      })
    }

    const rule = emitFeatureRule(node, ctx, { featureId: root, label: node.displayName })
    if (rule) files.push(rule)

    return files
  },
}

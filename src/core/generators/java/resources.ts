/**
 * The resource pack half of a Java export: models, blockstates and pack
 * metadata.
 *
 * Java's resource system is a good deal simpler than Bedrock's here, and the
 * difference is worth naming because it removes a whole class of bug. Bedrock
 * needs every texture registered in `item_texture.json` or
 * `terrain_texture.json` under a short key, and a block then refers to that key
 * — two files that must agree, which is precisely what the Bedrock emitter's
 * atlas plumbing exists to guarantee. Java has no atlas file: a model that says
 * `mmm:item/rice` resolves to `assets/mmm/textures/item/rice.png` by
 * convention, so the reference cannot go stale as long as the PNG is written to
 * the path the model names. Both are produced side by side below.
 */

import type { ContentNode } from '../../model/types'
import type { VirtualFile } from '../../vfs/types'
import { bool, num, str } from '../../kinds/shared'
import type { JavaContext } from './context'
import { assetPath } from './context'

/** `pack.mcmeta` for each half. The format number decides which game accepts it. */
export function packMeta(ctx: JavaContext, half: 'data' | 'resource'): VirtualFile {
  const format =
    half === 'data' ? ctx.profile.dataPackFormat : ctx.profile.resourcePackFormat
  return {
    path: 'pack.mcmeta',
    origin: { label: `${half === 'data' ? 'Data' : 'Resource'} pack · metadata` },
    body: {
      type: 'json',
      value: {
        pack: {
          pack_format: format,
          description: `${ctx.project.name} — ${ctx.project.description || 'built with the add-on builder'}`,
        },
      },
    },
  }
}

function itemModel(ctx: JavaContext, name: string, texture: string, node: ContentNode): VirtualFile {
  return {
    path: assetPath(ctx, 'models/item', `${name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Model · ${node.displayName}` },
    body: {
      type: 'json',
      value: { parent: 'minecraft:item/generated', textures: { layer0: texture } },
    },
  }
}

export function emitResources(ctx: JavaContext): VirtualFile[] {
  const files: VirtualFile[] = []

  for (const node of ctx.project.nodes) {
    switch (node.kind) {
      case 'item':
        files.push(...emitItemAssets(ctx, node))
        break
      case 'block':
        files.push(...emitBlockAssets(ctx, node))
        break
      case 'crop':
        files.push(...emitCropAssets(ctx, node))
        break
      default:
        break
    }
  }

  return files
}

function emitItemAssets(ctx: JavaContext, node: ContentNode): VirtualFile[] {
  const texture = ctx.texture(node, 'main', 'item')
  if (!texture) {
    ctx.warn(`Item "${node.displayName}" has no icon, so Java will draw the missing-texture square.`, node.id)
    return []
  }
  return [itemModel(ctx, node.name, texture, node)]
}

function emitBlockAssets(ctx: JavaContext, node: ContentNode): VirtualFile[] {
  const files: VirtualFile[] = []
  const all = ctx.texture(node, 'main', 'block')
  const up = ctx.texture(node, 'up', 'block', 'top')
  const down = ctx.texture(node, 'down', 'block', 'bottom')

  if (!all && !up && !down) {
    ctx.warn(`Block "${node.displayName}" has no texture.`, node.id)
    return files
  }

  const cross = str(node.data, 'geometry', '') === 'minecraft:geometry.cross'
  const side = all ?? up ?? down!

  const model = cross
    ? { parent: 'minecraft:block/cross', textures: { cross: side } }
    : up || down
      ? {
          // `cube_bottom_top` is the vanilla parent for a block with a distinct
          // top and bottom, which is what the two override slots describe.
          parent: 'minecraft:block/cube_bottom_top',
          textures: { top: up ?? side, bottom: down ?? side, side },
        }
      : { parent: 'minecraft:block/cube_all', textures: { all: side } }

  files.push({
    path: assetPath(ctx, 'models/block', `${node.name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Model · ${node.displayName}` },
    body: { type: 'json', value: model },
  })

  files.push({
    path: assetPath(ctx, 'blockstates', `${node.name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Blockstate · ${node.displayName}` },
    body: {
      type: 'json',
      value: { variants: { '': { model: `${ctx.modId}:block/${node.name}` } } },
    },
  })

  // The item you hold is a separate model that simply inherits the block one —
  // except for a cross-shaped block, which would render as a flat plane in the
  // hand and wants the sprite instead.
  files.push({
    path: assetPath(ctx, 'models/item', `${node.name}.json`),
    origin: { nodeId: node.id, kind: node.kind, label: `Item model · ${node.displayName}` },
    body: {
      type: 'json',
      value: cross
        ? { parent: 'minecraft:item/generated', textures: { layer0: side } }
        : { parent: `${ctx.modId}:block/${node.name}` },
    },
  })

  return files
}

function emitCropAssets(ctx: JavaContext, node: ContentNode): VirtualFile[] {
  const files: VirtualFile[] = []
  const stages = Math.max(2, Math.round(num(node.data, 'stages', 4)))
  const variants: Record<string, unknown> = {}

  for (let stage = 0; stage < stages; stage++) {
    const texture = ctx.texture(node, `stage${stage}`, 'block', `stage${stage}`)
    if (!texture) {
      ctx.warn(`Crop "${node.displayName}" is missing the texture for stage ${stage}.`, node.id)
      continue
    }
    const modelName = `${node.name}_stage${stage}`
    files.push({
      path: assetPath(ctx, 'models/block', `${modelName}.json`),
      origin: { nodeId: node.id, kind: node.kind, label: `Model · ${node.displayName} stage ${stage}` },
      body: {
        type: 'json',
        value: { parent: 'minecraft:block/crop', textures: { crop: texture } },
      },
    })
    variants[`age=${stage}`] = { model: `${ctx.modId}:block/${modelName}` }
  }

  if (Object.keys(variants).length > 0) {
    files.push({
      path: assetPath(ctx, 'blockstates', `${node.name}.json`),
      origin: { nodeId: node.id, kind: node.kind, label: `Blockstate · ${node.displayName}` },
      body: { type: 'json', value: { variants } },
    })
  }

  // The seed item is a separate registry entry on Java, so it gets its own
  // model pointing at whichever icon the crop declared for it.
  if (bool(node.data, 'generateSeed', true)) {
    const seedName = str(node.data, 'seedName').trim() || `${node.name}_seeds`
    const seedTexture =
      ctx.texture(node, 'seed', 'item', 'seed') ?? ctx.texture(node, 'stage0', 'item', 'seed_stage0')
    if (seedTexture) {
      files.push(itemModel(ctx, seedName, seedTexture, node))
    } else {
      ctx.warn(`Crop "${node.displayName}" has no seed icon, so its seed item has no model.`, node.id)
    }
  }

  return files
}

/**
 * The generation pass: ProjectModel -> complete pack tree.
 *
 * This is the heart of the "you never wire two packs together by hand" promise.
 * Generators never write a texture path or a cross-pack identifier themselves;
 * they ask the EmitContext, which registers the entry in the right atlas and
 * hands back the key. Because the whole tree is rebuilt from scratch every
 * time, a rename or a re-upload can never leave a stale reference behind.
 */

import type { ContentNode, ProjectModel } from '../model/types'
import { getKind } from '../registry/types'
import type { EmitContext } from '../registry/types'
import { getTargetProfile } from '../targets/profiles'
import type { TargetProfile } from '../targets/profiles'
import type { VirtualFile, VirtualFs } from '../vfs/types'
import { atlasKey, isValidName, isValidNamespace, makeIdentifier } from '../util/id'

export const BP = 'behavior_pack'
export const RP = 'resource_pack'

export interface EmitProblem {
  severity: 'error' | 'warning'
  message: string
  nodeId?: string
  path?: string
}

export interface EmitResult {
  files: VirtualFs
  problems: EmitProblem[]
}

interface AtlasEntry {
  /** Resource-pack-relative texture path without the `.png` extension. */
  texturePath: string
}

/** Where a texture slot's PNG is written, by atlas target. */
function textureFolder(target: 'item' | 'terrain' | 'entity', namespace: string): string {
  switch (target) {
    case 'item':
      return `textures/items/${namespace}`
    case 'terrain':
      return `textures/blocks/${namespace}`
    case 'entity':
      return `textures/entity/${namespace}`
  }
}

export function emitProject(project: ProjectModel): EmitResult {
  const target = getTargetProfile(project.targetProfileId)
  const files: VirtualFs = new Map()
  const problems: EmitProblem[] = []

  const itemAtlas = new Map<string, AtlasEntry>()
  const terrainAtlas = new Map<string, AtlasEntry>()
  const lang = new Map<string, string>()
  /** Assets actually referenced this pass — unreferenced uploads are not shipped. */
  const usedAssets = new Map<string, string>()
  /** Custom block components requested by generators, id -> JS object literal. */
  const scriptComponents = new Map<string, string>()

  const assetById = new Map(project.assets.map((a) => [a.id, a]))
  const nodeById = new Map(project.nodes.map((n) => [n.id, n]))

  const add = (file: VirtualFile): void => {
    if (files.has(file.path)) {
      problems.push({
        severity: 'error',
        message: `Two pieces of content both want to write ${file.path}. Rename one of them.`,
        path: file.path,
      })
      return
    }
    files.set(file.path, file)
  }

  // -- validation that has to happen before anything is generated -----------

  if (!isValidNamespace(project.namespace)) {
    problems.push({
      severity: 'error',
      message: `Namespace "${project.namespace}" is not usable. Use lowercase letters, digits and underscores, and never a reserved namespace like "minecraft".`,
    })
  }

  const seenNames = new Map<string, string>()
  for (const node of project.nodes) {
    if (!isValidName(node.name)) {
      problems.push({
        severity: 'error',
        nodeId: node.id,
        message: `"${node.name}" is not a valid identifier name (lowercase letters, digits, underscore; must start with a letter).`,
      })
    }
    const key = `${node.kind}:${node.name}`
    const clash = seenNames.get(key)
    if (clash) {
      problems.push({
        severity: 'error',
        nodeId: node.id,
        message: `Identifier ${makeIdentifier(project.namespace, node.name)} is used by more than one ${node.kind}.`,
      })
    } else {
      seenNames.set(key, node.id)
    }
  }

  // -- the context handed to every generator --------------------------------

  const registerTexture = (
    node: ContentNode,
    slotKey: string,
    slotTarget: 'item' | 'terrain' | 'entity',
    suffix?: string,
  ): { key: string; path: string } | null => {
    const assetId = node.textures[slotKey]
    if (!assetId) return null
    const asset = assetById.get(assetId)
    if (!asset) {
      problems.push({
        severity: 'warning',
        nodeId: node.id,
        message: `Texture slot "${slotKey}" points at a missing asset.`,
      })
      return null
    }

    const key = atlasKey(project.namespace, node.name, suffix)
    const folder = textureFolder(slotTarget, project.namespace)
    const texturePath = `${folder}/${key}`
    usedAssets.set(`${RP}/${texturePath}.png`, asset.id)

    if (slotTarget === 'item') itemAtlas.set(key, { texturePath })
    if (slotTarget === 'terrain') terrainAtlas.set(key, { texturePath })

    return { key, path: texturePath }
  }

  const currentNode = { value: null as ContentNode | null }

  const ctx: EmitContext = {
    project,
    target,
    namespace: project.namespace,

    identifier: (node) => makeIdentifier(project.namespace, node.name),
    ownIdentifier: (name) => makeIdentifier(project.namespace, name),

    texture(node, slotKey) {
      const kind = getKind(node.kind)
      const slot = kind?.textureSlots(node).find((s) => s.key === slotKey)
      if (!slot) return null
      const suffix = slotKey === 'main' ? undefined : slotKey
      return registerTexture(node, slotKey, slot.target, suffix)?.key ?? null
    },

    stageTexture(node, slotPrefix, index) {
      const slotKey = `${slotPrefix}${index}`
      return registerTexture(node, slotKey, 'terrain', `stage${index}`)?.key ?? null
    },

    entityTexturePath(node, slotKey) {
      return registerTexture(node, slotKey, 'entity', slotKey === 'main' ? undefined : slotKey)?.path ?? null
    },

    lang: (key, value) => {
      lang.set(key, value)
    },

    nodeById: (id) => nodeById.get(id),
    nodesOfKind: (kind) => project.nodes.filter((n) => n.kind === kind),

    extra: (file) => add(file),

    registerScriptComponent: (id, componentBody) => {
      scriptComponents.set(id, componentBody)
    },

    warn: (message) => {
      problems.push({ severity: 'warning', nodeId: currentNode.value?.id, message })
    },
  }

  // -- per-node generation ---------------------------------------------------

  for (const node of project.nodes) {
    const kind = getKind(node.kind)
    if (!kind) {
      problems.push({
        severity: 'error',
        nodeId: node.id,
        message: `Unknown content kind "${node.kind}". It may come from a preset built for a newer version of this app.`,
      })
      continue
    }
    currentNode.value = node
    try {
      for (const file of kind.emit(node, ctx)) add(file)
    } catch (error) {
      problems.push({
        severity: 'error',
        nodeId: node.id,
        message: `Generator for ${kind.label} "${node.displayName}" failed: ${String(error)}`,
      })
    }
  }
  currentNode.value = null

  // -- pack-level files ------------------------------------------------------

  if (scriptComponents.size > 0) {
    add({
      path: `${BP}/${target.script.entry}`,
      origin: { label: 'Pack · custom components' },
      body: { type: 'text', value: buildScriptEntry(scriptComponents) },
    })
  }

  for (const file of emitManifests(project, target, scriptComponents.size > 0)) add(file)

  if (itemAtlas.size > 0) {
    add({
      path: `${RP}/textures/item_texture.json`,
      origin: { label: 'Pack · item atlas' },
      body: {
        type: 'json',
        value: {
          resource_pack_name: project.namespace,
          texture_name: 'atlas.items',
          texture_data: Object.fromEntries(
            [...itemAtlas.entries()].map(([key, entry]) => [key, { textures: entry.texturePath }]),
          ),
        },
      },
    })
  }

  if (terrainAtlas.size > 0) {
    add({
      path: `${RP}/textures/terrain_texture.json`,
      origin: { label: 'Pack · terrain atlas' },
      body: {
        type: 'json',
        value: {
          resource_pack_name: project.namespace,
          texture_name: 'atlas.terrain',
          padding: 8,
          num_mip_levels: 4,
          texture_data: Object.fromEntries(
            [...terrainAtlas.entries()].map(([key, entry]) => [key, { textures: entry.texturePath }]),
          ),
        },
      },
    })
  }

  if (lang.size > 0) {
    const body = [...lang.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
    add({
      path: `${RP}/texts/en_US.lang`,
      origin: { label: 'Pack · language' },
      body: { type: 'text', value: `## ${project.name}\n${body}\n` },
    })
    add({
      path: `${RP}/texts/languages.json`,
      origin: { label: 'Pack · language' },
      body: { type: 'json', value: ['en_US'] },
    })
  }

  for (const [path, assetId] of usedAssets) {
    add({
      path,
      origin: { label: 'Texture' },
      body: { type: 'asset', assetId },
    })
  }

  // -- hand-edited overrides win, but stay visibly flagged -------------------

  for (const [path, raw] of Object.entries(project.overrides)) {
    const existing = files.get(path)
    files.set(path, {
      path,
      origin: existing?.origin ?? { label: 'Manual file' },
      overridden: true,
      body: path.endsWith('.json') ? safeJsonBody(raw, path, problems) : { type: 'text', value: raw },
    })
  }

  return { files, problems }
}

function safeJsonBody(
  raw: string,
  path: string,
  problems: EmitProblem[],
): { type: 'json'; value: unknown } | { type: 'text'; value: string } {
  try {
    return { type: 'json', value: JSON.parse(raw) }
  } catch (error) {
    problems.push({
      severity: 'error',
      path,
      message: `Manual edit of ${path} is not valid JSON: ${String(error)}`,
    })
    return { type: 'text', value: raw }
  }
}

/**
 * Both manifests, with the behaviour pack declaring its dependency on the
 * resource pack. Because the UUIDs live in the model they stay stable across
 * regenerations — reinstalling an updated pack keeps working in existing worlds.
 */
/**
 * Assembles the single script entry point from the components generators asked
 * for. Everything is registered in one `system.beforeEvents.startup` pass, which
 * is the current registration point (the older `world.beforeEvents.worldInitialize`
 * form is gone).
 */
function buildScriptEntry(components: Map<string, string>): string {
  const registrations = [...components.entries()]
    .map(([id, body]) => `    registry.registerCustomComponent('${id}', ${body})`)
    .join('\n\n')

  return `// Generated by mmmmmmmmmmmmm. Edit through the builder, not here.
//
// Bedrock's modern block parser dropped data-driven block events, so anything
// that changes a block over time is registered as a custom component instead.

import { system } from '@minecraft/server'

system.beforeEvents.startup.subscribe((init) => {
  const registry = init.blockComponentRegistry

${registrations}
})
`
}

function emitManifests(
  project: ProjectModel,
  target: TargetProfile,
  withScripts: boolean,
): VirtualFile[] {
  const { uuids, version, name, description } = project
  const min = target.minEngineVersion

  const behaviour = {
    format_version: target.manifestFormatVersion,
    header: {
      name: `${name} BP`,
      description,
      uuid: uuids.behaviorHeader,
      version,
      min_engine_version: min,
    },
    modules: [
      {
        type: 'data',
        uuid: uuids.behaviorModule,
        version,
        description: `${name} behaviour`,
      },
      ...(withScripts
        ? [
            {
              type: 'script',
              language: 'javascript',
              uuid: uuids.scriptModule,
              version,
              entry: target.script.entry,
            },
          ]
        : []),
    ],
    dependencies: [
      {
        // Links the two packs so enabling the behaviour pack pulls in the
        // resource pack automatically.
        uuid: uuids.resourceHeader,
        version,
      },
      ...(withScripts
        ? [
            {
              module_name: target.script.serverModule,
              version: target.script.serverModuleVersion,
            },
          ]
        : []),
    ],
    metadata: {
      authors: project.meta.author ? [project.meta.author] : [],
      generated_with: { mmmmmmmmmmmmm: ['0.1.0'] },
    },
  }

  const resource = {
    format_version: target.manifestFormatVersion,
    header: {
      name: `${name} RP`,
      description,
      uuid: uuids.resourceHeader,
      version,
      min_engine_version: min,
    },
    modules: [
      {
        type: 'resources',
        uuid: uuids.resourceModule,
        version,
        description: `${name} resources`,
      },
    ],
    metadata: {
      authors: project.meta.author ? [project.meta.author] : [],
      generated_with: { mmmmmmmmmmmmm: ['0.1.0'] },
    },
  }

  return [
    {
      path: `${BP}/manifest.json`,
      origin: { label: 'Pack · behaviour manifest' },
      body: { type: 'json', value: behaviour },
    },
    {
      path: `${RP}/manifest.json`,
      origin: { label: 'Pack · resource manifest' },
      body: { type: 'json', value: resource },
    },
  ]
}

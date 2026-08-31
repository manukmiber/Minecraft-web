/**
 * Creating, mutating and loading project models.
 *
 * Every mutation returns a new model rather than editing in place, which keeps
 * undo/redo and the "regenerate everything" pass trivial.
 */

import { getKind } from '../registry/types'
import { DEFAULT_TARGET_ID } from '../targets/profiles'
import { nodeId, slugify, uniqueUuids } from '../util/id'
import { MODEL_VERSION } from './types'
import type { AssetRef, ContentNode, ProjectModel } from './types'

export const DEFAULT_NAMESPACE = 'mmm'

export interface NewProjectOptions {
  name?: string
  description?: string
  namespace?: string
  author?: string
  targetProfileId?: string
}

export function createProject(options: NewProjectOptions = {}): ProjectModel {
  const now = new Date().toISOString()
  const [behaviorHeader, behaviorModule, resourceHeader, resourceModule, scriptModule] =
    uniqueUuids(5)

  return {
    modelVersion: MODEL_VERSION,
    id: nodeId('proj'),
    name: options.name?.trim() || 'Untitled Add-on',
    description: options.description?.trim() || 'Built with mmmmmmmmmmmmm',
    namespace: options.namespace?.trim() || DEFAULT_NAMESPACE,
    targetProfileId: options.targetProfileId || DEFAULT_TARGET_ID,
    version: [1, 0, 0],
    uuids: { behaviorHeader, behaviorModule, resourceHeader, resourceModule, scriptModule },
    nodes: [],
    assets: [],
    overrides: {},
    meta: {
      createdAt: now,
      updatedAt: now,
      author: options.author?.trim() || '',
      tagline: '',
    },
  }
}

/**
 * Builds a node for a kind, seeded with that kind's defaults. `name` is
 * slugified and de-duplicated against existing nodes of the same kind so a new
 * "Rice" next to an existing one becomes `rice_2` rather than silently
 * colliding at generation time.
 */
export function createNode(
  project: ProjectModel,
  kindId: string,
  displayName: string,
  seed?: Record<string, unknown>,
): ContentNode {
  const kind = getKind(kindId)
  if (!kind) throw new Error(`Unknown content kind: ${kindId}`)

  const now = new Date().toISOString()
  const base = slugify(displayName) || kindId
  const taken = new Set(project.nodes.filter((n) => n.kind === kindId).map((n) => n.name))
  let name = base
  let suffix = 2
  while (taken.has(name)) {
    name = `${base}_${suffix}`
    suffix += 1
  }

  return {
    id: nodeId(kindId),
    kind: kindId,
    name,
    displayName: displayName.trim() || name,
    data: { ...kind.defaults(), ...(seed ?? {}) },
    textures: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function touch(project: ProjectModel): ProjectModel {
  return { ...project, meta: { ...project.meta, updatedAt: new Date().toISOString() } }
}

export function upsertNode(project: ProjectModel, node: ContentNode): ProjectModel {
  const nodes = project.nodes.some((n) => n.id === node.id)
    ? project.nodes.map((n) => (n.id === node.id ? node : n))
    : [...project.nodes, node]
  return touch({ ...project, nodes })
}

export function removeNode(project: ProjectModel, id: string): ProjectModel {
  const target = project.nodes.find((n) => n.id === id)
  if (!target) return project

  // Anything pointing at the removed node would otherwise generate a dangling
  // identifier, so those references are cleared as part of the delete.
  const nodes = project.nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      const kind = getKind(n.kind)
      if (!kind) return n
      let changed = false
      const data = { ...n.data }
      for (const field of kind.fields) {
        if (field.type === 'node-ref' && data[field.key] === id) {
          data[field.key] = ''
          changed = true
        }
        // A biome's plant list holds node ids too, so a deleted crop has to
        // drop out of every biome that scattered it.
        if (field.type === 'biome-scatter' && Array.isArray(data[field.key])) {
          const entries = data[field.key] as Array<{ plant?: unknown }>
          const kept = entries.filter((entry) => entry?.plant !== id)
          if (kept.length !== entries.length) {
            data[field.key] = kept
            changed = true
          }
        }
      }
      return changed ? { ...n, data } : n
    })

  return touch({ ...project, nodes })
}

export function addAsset(project: ProjectModel, asset: AssetRef): ProjectModel {
  return touch({ ...project, assets: [...project.assets.filter((a) => a.id !== asset.id), asset] })
}

/** Drops assets no node references any more. */
export function pruneAssets(project: ProjectModel): ProjectModel {
  const used = new Set<string>()
  for (const node of project.nodes) {
    for (const assetId of Object.values(node.textures)) {
      if (assetId) used.add(assetId)
    }
  }
  const assets = project.assets.filter((a) => used.has(a.id))
  if (assets.length === project.assets.length) return project
  return touch({ ...project, assets })
}

export function setOverride(
  project: ProjectModel,
  path: string,
  content: string | null,
): ProjectModel {
  const overrides = { ...project.overrides }
  if (content === null) delete overrides[path]
  else overrides[path] = content
  return touch({ ...project, overrides })
}

/**
 * Brings a save written by an older build up to the current shape. Unknown
 * future versions are returned untouched rather than mangled — the UI warns
 * instead.
 */
export function migrateProject(raw: unknown): ProjectModel {
  if (!raw || typeof raw !== 'object') {
    throw new Error('That file is not a project.')
  }
  const input = raw as Partial<ProjectModel> & Record<string, unknown>
  if (!Array.isArray(input.nodes)) {
    throw new Error('That file is missing its content list, so it is not a project save.')
  }

  const fallback = createProject()
  const uuids = { ...fallback.uuids, ...(input.uuids ?? {}) }

  return {
    ...fallback,
    ...input,
    modelVersion: MODEL_VERSION,
    uuids,
    nodes: input.nodes.map((node) => ({
      ...node,
      data: node.data ?? {},
      textures: node.textures ?? {},
    })),
    assets: Array.isArray(input.assets) ? input.assets : [],
    overrides: (input.overrides as Record<string, string>) ?? {},
    meta: { ...fallback.meta, ...(input.meta ?? {}) },
  }
}

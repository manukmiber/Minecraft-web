/**
 * Applying a preset to the active save.
 *
 * A preset is never applied implicitly. It sits in the inbox until you press
 * Apply, and applying is a pure function from (project, preset) to a new
 * project plus a report of exactly what changed — so the diff is visible before
 * anything is committed.
 */

import { getKind } from '../registry/types'
import { nodeId } from '../util/id'
import type { AssetRef, ContentNode, ProjectModel } from '../model/types'
import { isRef, parseRef, presetAssetKey } from './format'
import type { PresetFile, PresetNode } from './format'

export interface ApplyChange {
  kind: string
  name: string
  displayName: string
  action: 'created' | 'replaced'
}

export interface ApplyReport {
  project: ProjectModel
  changes: ApplyChange[]
  files: string[]
  /** Refs the preset made that could not be resolved to a node. */
  unresolved: string[]
  /** Texture slots the preset filled in for you. */
  textures: string[]
}

export interface ApplyOptions {
  /**
   * Artwork the caller has already turned into assets, keyed by
   * `presetAssetKey(node, slot)`.
   *
   * Reading bytes is asynchronous and applying is not: keeping the fetch
   * outside means applying a preset stays a pure function of its inputs, and a
   * texture that failed to download degrades to an empty slot rather than to a
   * half-applied project.
   */
  assets?: Map<string, AssetRef>
}

function buildNode(
  presetNode: PresetNode,
  existing: ContentNode | undefined,
  textures: Record<string, string>,
): ContentNode {
  const kind = getKind(presetNode.kind)
  if (!kind) throw new Error(`Unknown content kind "${presetNode.kind}".`)

  const now = new Date().toISOString()
  return {
    id: existing?.id ?? nodeId(presetNode.kind),
    kind: presetNode.kind,
    name: presetNode.name,
    displayName: presetNode.displayName?.trim() || presetNode.name,
    // Defaults first so a preset only has to state what it cares about.
    data: { ...kind.defaults(), ...(presetNode.data ?? {}) },
    // A preset normally describes behaviour and leaves the PNGs to you; one
    // that ships its own artwork fills the slots it brought and leaves the
    // rest of the node's existing textures alone.
    textures: { ...(existing?.textures ?? {}), ...textures },
    presetId: presetNode.kind === existing?.kind ? existing?.presetId : undefined,
    notes: presetNode.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

export function applyPreset(
  project: ProjectModel,
  preset: PresetFile,
  options: ApplyOptions = {},
): ApplyReport {
  const changes: ApplyChange[] = []
  const unresolved: string[] = []
  const filled: string[] = []

  // Slot bindings the caller managed to resolve, grouped by the node they
  // belong to so building a node can take its textures in one go.
  const byNode = new Map<string, Record<string, string>>()
  for (const asset of preset.assets ?? []) {
    const resolved = options.assets?.get(presetAssetKey(asset.node, asset.slot))
    if (!resolved) continue
    const slots = byNode.get(asset.node) ?? {}
    slots[asset.slot] = resolved.id
    byNode.set(asset.node, slots)
    filled.push(`${asset.node}.${asset.slot}`)
  }

  // Start from the current nodes, then create or replace by kind+name.
  const nodes = [...project.nodes]
  const indexOf = (kind: string, name: string): number =>
    nodes.findIndex((n) => n.kind === kind && n.name === name)

  for (const presetNode of preset.nodes ?? []) {
    const at = indexOf(presetNode.kind, presetNode.name)
    const existing = at >= 0 ? nodes[at] : undefined
    const node = buildNode(
      presetNode,
      existing,
      byNode.get(`${presetNode.kind}:${presetNode.name}`) ?? {},
    )
    node.presetId = preset.id

    if (at >= 0) {
      nodes[at] = node
      changes.push({
        kind: node.kind,
        name: node.name,
        displayName: node.displayName,
        action: 'replaced',
      })
    } else {
      nodes.push(node)
      changes.push({
        kind: node.kind,
        name: node.name,
        displayName: node.displayName,
        action: 'created',
      })
    }
  }

  // Second pass: turn `#kind:name` references into something concrete, now that
  // every node the preset creates exists. A node-ref becomes an internal id; an
  // item or block reference becomes a real `namespace:name` identifier, which is
  // why a preset never has to know the namespace it will land in.
  const findTarget = (value: string): ContentNode | undefined => {
    const ref = parseRef(value)
    return ref ? nodes.find((n) => n.kind === ref.kind && n.name === ref.name) : undefined
  }

  for (const node of nodes) {
    const kind = getKind(node.kind)
    if (!kind) continue

    for (const field of kind.fields) {
      const value = node.data[field.key]

      if (field.type === 'node-ref' && isRef(value)) {
        const target = findTarget(value)
        if (target) {
          node.data[field.key] = target.id
        } else {
          unresolved.push(`${node.kind}:${node.name}.${field.key} -> ${value}`)
          node.data[field.key] = ''
        }
        continue
      }

      if ((field.type === 'item-ref' || field.type === 'block-ref') && isRef(value)) {
        const target = findTarget(value)
        if (target) {
          node.data[field.key] = `${project.namespace}:${target.name}`
        } else {
          unresolved.push(`${node.kind}:${node.name}.${field.key} -> ${value}`)
          node.data[field.key] = ''
        }
        continue
      }

      // Free string lists can carry references too — a spawn rule pointing at
      // the crop it should follow, for instance.
      if ((field.type === 'string-list' || field.type === 'multiselect') && Array.isArray(value)) {
        node.data[field.key] = value.map((entry) => {
          if (!isRef(entry)) return entry
          const target = findTarget(entry)
          if (target) return `${project.namespace}:${target.name}`
          unresolved.push(`${node.kind}:${node.name}.${field.key} -> ${entry}`)
          return entry
        })
        continue
      }

      // A biome's plant list is a list of objects, each pointing at a node the
      // preset may have created moments ago.
      if (field.type === 'biome-scatter' && Array.isArray(value)) {
        node.data[field.key] = value.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry
          const plant = (entry as { plant?: unknown }).plant
          if (!isRef(plant)) return entry
          const target = findTarget(plant)
          if (target) return { ...(entry as object), plant: target.id }
          unresolved.push(`${node.kind}:${node.name}.${field.key} -> ${plant}`)
          return { ...(entry as object), plant: '' }
        })
        continue
      }
    }

    // Visual builders own several data keys that no field declares one by one —
    // the recipe station writes the grid, the cooking input and the fuel slot.
    // Anything left holding a reference after the declared fields have been
    // resolved is an identifier reference too, so it is resolved the same way
    // rather than shipping "#item:rice" into a pattern key.
    const declared = new Set(kind.fields.map((field) => field.key))
    for (const [key, value] of Object.entries(node.data)) {
      if (declared.has(key)) continue

      const resolveOne = (entry: unknown): unknown => {
        if (!isRef(entry)) return entry
        const target = findTarget(entry)
        if (target) return `${project.namespace}:${target.name}`
        unresolved.push(`${node.kind}:${node.name}.${key} -> ${entry}`)
        return ''
      }

      if (isRef(value)) node.data[key] = resolveOne(value)
      else if (Array.isArray(value)) node.data[key] = value.map(resolveOne)
    }
  }

  const overrides = { ...project.overrides }
  const files: string[] = []
  for (const file of preset.files ?? []) {
    overrides[file.path] = file.content
    files.push(file.path)
  }

  // Any asset the preset brought has to be listed on the project, or the
  // emitter will not ship its bytes and a Save will not carry it to the repo.
  const known = new Set(project.assets.map((asset) => asset.id))
  const assets = [
    ...project.assets,
    ...[...(options.assets?.values() ?? [])].filter((asset) => !known.has(asset.id)),
  ]

  return {
    project: {
      ...project,
      nodes,
      assets,
      overrides,
      meta: { ...project.meta, updatedAt: new Date().toISOString() },
    },
    changes,
    files,
    unresolved,
    textures: filled,
  }
}

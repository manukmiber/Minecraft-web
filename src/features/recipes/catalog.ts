/**
 * What the Item Browser can offer.
 *
 * Two sources, one list: everything this add-on generates an item or block for,
 * and a curated set of vanilla identifiers. The project half is derived rather
 * than tracked — a crop, for instance, produces a plant block *and* a seed item,
 * and both are craftable, so both appear.
 */

import type { ProjectModel } from '../../core/model/types'
import { str } from '../../core/kinds/shared'
import { VANILLA_ITEMS } from '../../core/data/vanillaItems'

export const PROJECT_GROUP = 'This add-on'

export interface CatalogEntry {
  /** `namespace:name`, exactly what goes into the recipe JSON. */
  id: string
  label: string
  group: string
  source: 'project' | 'vanilla'
  /** The node behind a project entry, so the browser can jump to it. */
  nodeId?: string
  kind?: string
  /** Texture to preview, when the project has one for it. */
  assetId?: string | null
}

export function buildCatalog(project: ProjectModel): CatalogEntry[] {
  const own: CatalogEntry[] = []

  for (const node of project.nodes) {
    const identifier = `${project.namespace}:${node.name}`

    if (node.kind === 'item' || node.kind === 'block') {
      own.push({
        id: identifier,
        label: node.displayName,
        group: PROJECT_GROUP,
        source: 'project',
        nodeId: node.id,
        kind: node.kind,
        assetId: node.textures.main ?? null,
      })
      continue
    }

    if (node.kind === 'crop') {
      const stages = Math.max(1, Number(node.data.stages ?? 4))
      own.push({
        id: identifier,
        label: `${node.displayName} (plant)`,
        group: PROJECT_GROUP,
        source: 'project',
        nodeId: node.id,
        kind: 'block',
        assetId: node.textures[`stage${stages - 1}`] ?? null,
      })

      if (node.data.generateSeed !== false) {
        const seedName = (str(node.data, 'seedName').trim() || `${node.name}_seeds`).toLowerCase()
        own.push({
          id: `${project.namespace}:${seedName}`,
          label: str(node.data, 'seedDisplayName').trim() || `${node.displayName} Seeds`,
          group: PROJECT_GROUP,
          source: 'project',
          nodeId: node.id,
          kind: 'item',
          assetId: node.textures.seed ?? null,
        })
      }
    }
  }

  const vanilla: CatalogEntry[] = VANILLA_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    group: item.group,
    source: 'vanilla',
  }))

  return [...own, ...vanilla]
}

export function findCatalogEntry(catalog: CatalogEntry[], id: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.id === id)
}

/** A stable-ish colour per identifier, for entries with no artwork to show. */
export function tintFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 45% 42%)`
}

export function shortLabel(id: string): string {
  const name = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id
  return name.replace(/_/g, ' ')
}

/** The two-letter monogram drawn on a tile with no texture. */
export function monogram(label: string): string {
  const words = label.trim().split(/[\s_]+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

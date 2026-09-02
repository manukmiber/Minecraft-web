/**
 * The context a Java generator writes through.
 *
 * Deliberately much smaller than the Bedrock `EmitContext`. Bedrock needs a
 * context rich enough to register texture atlas entries and cross-pack
 * dependencies, because getting those wrong is the classic add-on bug. Java has
 * no atlas file and no second pack to stay in step with — a model that says
 * `mmm:item/rice` finds `assets/mmm/textures/item/rice.png` by convention — so
 * the only shared state worth threading through is the language file and the
 * problem list.
 */

import type { EmitProblem } from '../emit'
import type { ContentNode, ProjectModel } from '../../model/types'
import type { ModLoader } from '../../targets/platforms'
import type { JavaTargetProfile } from '../../targets/javaProfiles'
import { modId } from './ids'

export interface JavaContext {
  project: ProjectModel
  profile: JavaTargetProfile
  /** Which delivery route this pass is generating for. */
  loader: ModLoader
  modId: string
  /** Translation keys collected across the whole pass. */
  lang: Map<string, string>
  problems: EmitProblem[]
  /** Assets referenced this pass: destination path -> asset id. */
  usedAssets: Map<string, string>
  warn(message: string, nodeId?: string): void
  /** Registers a PNG at a resource-pack path and returns the model reference. */
  texture(node: ContentNode, slotKey: string, folder: 'item' | 'block', suffix?: string): string | null
}

export function createJavaContext(
  project: ProjectModel,
  profile: JavaTargetProfile,
  loader: ModLoader,
): JavaContext {
  const id = modId(project)
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]))
  const problems: EmitProblem[] = []
  const usedAssets = new Map<string, string>()

  return {
    project,
    profile,
    loader,
    modId: id,
    lang: new Map(),
    problems,
    usedAssets,
    warn(message, nodeId) {
      problems.push({ severity: 'warning', message, nodeId })
    },
    texture(node, slotKey, folder, suffix) {
      const assetId = node.textures[slotKey]
      if (!assetId) return null
      const asset = assetById.get(assetId)
      if (!asset) {
        problems.push({
          severity: 'warning',
          nodeId: node.id,
          message: `Texture slot "${slotKey}" on "${node.displayName}" points at a missing image.`,
        })
        return null
      }
      const name = suffix ? `${node.name}_${suffix}` : node.name
      usedAssets.set(`assets/${id}/textures/${folder}/${name}.png`, asset.id)
      return `${id}:${folder}/${name}`
    },
  }
}

/** `data/<modid>/<folder>` — the data pack half. */
export function dataPath(ctx: JavaContext, folder: string, file: string): string {
  return `data/${ctx.modId}/${folder}/${file}`
}

/** `assets/<modid>/<folder>` — the resource pack half. */
export function assetPath(ctx: JavaContext, folder: string, file: string): string {
  return `assets/${ctx.modId}/${folder}/${file}`
}

/** A file written under the `minecraft` namespace, e.g. a vanilla tag addition. */
export function vanillaDataPath(folder: string, file: string): string {
  return `data/minecraft/${folder}/${file}`
}

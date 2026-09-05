/**
 * Turning the artwork a preset ships with into ordinary project assets.
 *
 * The point is that nothing downstream can tell the difference. A preset
 * texture is fetched, validated as a PNG, put in the same IndexedDB cache a
 * dropped file goes into and pushed to R2 the same way — so from the moment it
 * lands it exports, saves and edits exactly like something you dragged in
 * yourself. Repainting the character in the pixel editor is not a special case;
 * it is the only case.
 *
 * A texture that fails to arrive is not fatal. The preset still applies, the
 * slot stays empty, and the Problems panel says which one is missing — much
 * better than refusing to create the entity at all because a PNG 404'd.
 */

import { presetAssetKey } from '../../core/presets/format'
import type { PresetAsset, PresetFile } from '../../core/presets/format'
import type { AssetRef } from '../../core/model/types'
import { assets as assetStore } from '../../state/services'

export interface PresetAssetResult {
  resolved: Map<string, AssetRef>
  /** Human-readable reasons, one per texture that could not be loaded. */
  failures: string[]
}

/** `textures/companion/kohane/kohane.png` -> an app-relative URL. */
function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}${path}`
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function readAsset(asset: PresetAsset): Promise<ArrayBuffer> {
  if (asset.base64) return decodeBase64(asset.base64)
  const response = await fetch(assetUrl(asset.url!))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.arrayBuffer()
}

/**
 * Loads every texture a preset carries, in parallel.
 *
 * Call this before `applyPreset` and hand the result through as
 * `{ assets: resolved }`.
 */
export async function loadPresetAssets(
  preset: PresetFile,
  projectId: string,
): Promise<PresetAssetResult> {
  const resolved = new Map<string, AssetRef>()
  const failures: string[] = []
  const declared = preset.assets ?? []
  if (declared.length === 0) return { resolved, failures }

  await Promise.all(
    declared.map(async (asset) => {
      try {
        const bytes = await readAsset(asset)
        const ref = await assetStore.importBytes(bytes, asset.fileName, projectId)
        resolved.set(presetAssetKey(asset.node, asset.slot), ref)
      } catch (error) {
        failures.push(`${asset.fileName}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }),
  )

  return { resolved, failures }
}

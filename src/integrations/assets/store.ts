/**
 * Asset bytes, kept in this browser.
 *
 * A dropped PNG is validated, written to IndexedDB and available immediately —
 * to the preview, to the export and to every save slot that references it.
 * There is no upload step and no remote copy: the bytes live next to the save
 * slots that point at them, and a backup .zip is how they leave the machine.
 */

import { del, get, set, keys } from 'idb-keyval'

import type { AssetRef } from '../../core/model/types'
import { nodeId } from '../../core/util/id'

const CACHE_PREFIX = 'asset:'

/** Matches the largest texture worth putting in a pack, and keeps IndexedDB sane. */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024

export interface ProbedImage {
  width: number
  height: number
}

/**
 * Reads a PNG's dimensions from its header rather than decoding the whole
 * image — enough to warn about a 512px texture in a 16px slot.
 */
export function probePng(bytes: ArrayBuffer): ProbedImage | null {
  const view = new DataView(bytes)
  if (view.byteLength < 24) return null
  // PNG signature.
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < signature.length; i++) {
    if (view.getUint8(i) !== signature[i]) return null
  }
  // IHDR width/height are the two big-endian ints right after the chunk header.
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export interface ImportResult {
  asset: AssetRef
  /** Populated when the image is not a square power-of-two-ish texture. */
  warning: string | null
}

export class AssetStore {
  /** Validates a dropped file and stores its bytes under a fresh asset id. */
  async importFile(file: File, recommended?: number): Promise<ImportResult> {
    if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
      throw new Error(`${file.name} is not a PNG. Bedrock textures have to be PNG files.`)
    }
    if (file.size > MAX_ASSET_BYTES) {
      throw new Error(`${file.name} is larger than 8 MB.`)
    }

    const bytes = await file.arrayBuffer()
    const probed = probePng(bytes)
    if (!probed) {
      throw new Error(`${file.name} does not look like a valid PNG.`)
    }

    let warning: string | null = null
    if (probed.width !== probed.height) {
      warning = `${file.name} is ${probed.width}x${probed.height}. Block and item textures should be square.`
    } else if (recommended && probed.width % recommended !== 0) {
      warning = `${file.name} is ${probed.width}px; this slot expects a multiple of ${recommended}px.`
    }

    const id = nodeId('asset')
    await set(CACHE_PREFIX + id, bytes)

    return {
      asset: {
        id,
        fileName: file.name,
        mime: 'image/png',
        size: file.size,
        width: probed.width,
        height: probed.height,
        addedAt: new Date().toISOString(),
      },
      warning,
    }
  }

  async read(asset: AssetRef): Promise<ArrayBuffer | null> {
    return (await get<ArrayBuffer>(CACHE_PREFIX + asset.id)) ?? null
  }

  /** Stores bytes that came from somewhere else — an imported backup .zip. */
  async prime(assetId: string, bytes: ArrayBuffer): Promise<void> {
    await set(CACHE_PREFIX + assetId, bytes)
  }

  async forget(assetId: string): Promise<void> {
    await del(CACHE_PREFIX + assetId)
  }

  /** Object URL for previews. Callers are responsible for revoking it. */
  async objectUrl(asset: AssetRef): Promise<string | null> {
    const bytes = await this.read(asset)
    if (!bytes) return null
    return URL.createObjectURL(new Blob([bytes], { type: asset.mime }))
  }

  /** Total bytes held, so Settings can show what the browser is carrying. */
  async totalBytes(): Promise<{ count: number; bytes: number }> {
    let count = 0
    let bytes = 0
    for (const key of await keys()) {
      if (typeof key !== 'string' || !key.startsWith(CACHE_PREFIX)) continue
      const stored = await get<ArrayBuffer>(key)
      if (!stored) continue
      count++
      bytes += stored.byteLength
    }
    return { count, bytes }
  }

  /**
   * Drops bytes nothing references any more. `liveIds` has to cover every
   * stored save slot as well as the open project — this cache is the only copy
   * there is, so a sweep that only knew about the open project would delete
   * textures belonging to the other slots.
   */
  async sweep(liveIds: Set<string>): Promise<number> {
    const all = await keys()
    let removed = 0
    for (const key of all) {
      if (typeof key !== 'string' || !key.startsWith(CACHE_PREFIX)) continue
      const id = key.slice(CACHE_PREFIX.length)
      if (!liveIds.has(id)) {
        await del(key)
        removed++
      }
    }
    return removed
  }
}

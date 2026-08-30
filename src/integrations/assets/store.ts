/**
 * Asset bytes: local first, R2 as the durable copy.
 *
 * A dropped PNG is readable immediately from IndexedDB so the preview and the
 * export never wait on the network, and it is pushed to R2 in the background so
 * the working state survives a different browser or a cleared cache. A Save
 * flushes it once more into the project repo, which is the permanent home.
 */

import { del, get, set, keys } from 'idb-keyval'

import type { AssetRef } from '../../core/model/types'
import { nodeId } from '../../core/util/id'
import { R2Client } from '../r2/client'

const CACHE_PREFIX = 'asset:'

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
  constructor(private r2: R2Client) {}

  setClient(r2: R2Client): void {
    this.r2 = r2
  }

  /**
   * Validates, caches and (best effort) uploads a dropped file.
   * A failed upload is not fatal: the bytes are already local, and the next
   * Save will carry them into the repo.
   */
  async importFile(file: File, projectId: string, recommended?: number): Promise<ImportResult> {
    if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
      throw new Error(`${file.name} is not a PNG. Bedrock textures have to be PNG files.`)
    }
    if (file.size > 8 * 1024 * 1024) {
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

    const asset: AssetRef = {
      id,
      fileName: file.name,
      mime: 'image/png',
      size: file.size,
      width: probed.width,
      height: probed.height,
      r2Key: null,
      repoPath: null,
      addedAt: new Date().toISOString(),
    }

    try {
      asset.r2Key = await this.r2.put(`${projectId}/${id}.png`, bytes, 'image/png')
    } catch {
      // Offline or no Worker: the local copy is enough to keep working.
    }

    return { asset, warning }
  }

  /** Local cache first, then R2, so exporting works offline once warmed. */
  async read(asset: AssetRef): Promise<ArrayBuffer | null> {
    const cached = await get<ArrayBuffer>(CACHE_PREFIX + asset.id)
    if (cached) return cached

    if (asset.r2Key) {
      const remote = await this.r2.get(asset.r2Key)
      if (remote) {
        await set(CACHE_PREFIX + asset.id, remote)
        return remote
      }
    }
    return null
  }

  /** Puts bytes loaded from somewhere else (a repo save) into the local cache. */
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

  /** Drops cached bytes for assets the project no longer references. */
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

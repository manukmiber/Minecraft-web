/**
 * Turns an asset id into a blob URL for previews, and revokes it on the way
 * out so a long editing session does not leak every texture it has shown.
 */

import { useEffect, useState } from 'react'

import type { AssetRef } from '../../core/model/types'
import { assets } from '../../state/services'

export function useAssetUrl(asset: AssetRef | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoked = false
    let current: string | null = null

    if (!asset) {
      setUrl(null)
      return
    }

    void assets.objectUrl(asset).then((next) => {
      if (revoked) {
        if (next) URL.revokeObjectURL(next)
        return
      }
      current = next
      setUrl(next)
    })

    return () => {
      revoked = true
      if (current) URL.revokeObjectURL(current)
      setUrl(null)
    }
  }, [asset?.id])

  return url
}

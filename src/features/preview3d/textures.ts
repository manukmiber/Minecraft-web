/**
 * Texture loading for the 3D preview.
 *
 * Minecraft textures are tiny and must not be smoothed, so every texture is
 * loaded with nearest-neighbour filtering and no mipmaps — the same way the
 * game draws them.
 */

import { useEffect, useState } from 'react'
import * as THREE from 'three'

export function usePixelTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) {
      setTexture(null)
      return
    }

    let disposed = false
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (loaded) => {
        if (disposed) {
          loaded.dispose()
          return
        }
        loaded.magFilter = THREE.NearestFilter
        loaded.minFilter = THREE.NearestFilter
        loaded.generateMipmaps = false
        loaded.colorSpace = THREE.SRGBColorSpace
        setTexture(loaded)
      },
      undefined,
      () => setTexture(null),
    )

    return () => {
      disposed = true
      setTexture((current) => {
        current?.dispose()
        return null
      })
    }
  }, [url])

  return texture
}

/** The checkerboard the game shows for a missing texture. */
export function makeMissingTexture(): THREE.Texture {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0
      context.fillStyle = on ? '#1c2330' : '#313b4d'
      context.fillRect(x, y, 1, 1)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

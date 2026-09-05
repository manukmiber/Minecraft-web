/**
 * Decoding the images an MMD model carries.
 *
 * Three things here are not what a normal texture loader does:
 *
 * - **Alpha is measured, not assumed.** Whether a material is opaque, cut out
 *   or genuinely translucent decides how it has to be drawn, and the only
 *   honest source for that is the pixels. Hair drawn as cut-out looks ragged;
 *   a face drawn as translucent sorts behind the head.
 * - **Toon ramps are rebuilt as gradient maps.** MMD samples its toon texture
 *   vertically by `dot(N, L)`; three.js samples a gradient map horizontally.
 *   One column of the toon image, reversed, is exactly the ramp three wants.
 * - **`.spa` and `.sph` are BMP files** with an MMD-specific extension, so the
 *   browser has to be told what they are before it will decode them.
 */

import * as THREE from 'three'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'

import { imageMimeType } from '../../core/companion/bundle'

/** How a texture's alpha channel behaves, which decides how to draw it. */
export type AlphaKind = 'none' | 'binary' | 'soft'

export interface DecodedTexture {
  texture: THREE.Texture
  alpha: AlphaKind
  /** Kept for the toon ramp, which needs the pixels rather than the texture. */
  pixels: ImageData | null
}

function canvasFor(width: number, height: number): {
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
} | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const context = new OffscreenCanvas(width, height).getContext('2d', {
      willReadFrequently: true,
    })
    return context ? { context } : null
  }
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return context ? { context } : null
}

/**
 * Classifies an alpha channel.
 *
 * Sampled rather than exhaustive — every fourth pixel across a 1024px texture
 * is 65k samples, which finds any real translucency while keeping the whole
 * import inside a frame or two.
 */
function classifyAlpha(data: Uint8ClampedArray): AlphaKind {
  let sawCutout = false
  for (let i = 3; i < data.length; i += 16) {
    const alpha = data[i]
    if (alpha === 255) continue
    if (alpha === 0) {
      sawCutout = true
      continue
    }
    return 'soft'
  }
  return sawCutout ? 'binary' : 'none'
}

function readPixels(source: CanvasImageSource, width: number, height: number): ImageData | null {
  const surface = canvasFor(width, height)
  if (!surface) return null
  surface.context.drawImage(source, 0, 0)
  try {
    return surface.context.getImageData(0, 0, width, height)
  } catch {
    // A tainted canvas cannot happen for a blob we made ourselves, but a
    // failed read should cost the alpha analysis, not the whole model.
    return null
  }
}

function decodeTga(bytes: Uint8Array): DecodedTexture | null {
  const parsed = new TGALoader().parse(
    bytes.slice().buffer as ArrayBuffer,
  ) as unknown as { width: number; height: number; data: Uint8Array } | null
  if (!parsed) return null

  const texture = new THREE.DataTexture(parsed.data, parsed.width, parsed.height)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  const pixels =
    typeof ImageData !== 'undefined'
      ? new ImageData(new Uint8ClampedArray(parsed.data), parsed.width, parsed.height)
      : null

  return {
    texture,
    alpha: pixels ? classifyAlpha(pixels.data) : 'none',
    pixels,
  }
}

/**
 * Decodes one texture out of the bundle. Returns null for anything the browser
 * will not decode, which the material builder treats as "no texture" rather
 * than as a failure.
 */
export async function decodeTexture(
  bytes: Uint8Array,
  path: string,
): Promise<DecodedTexture | null> {
  if (/\.tga$/i.test(path)) {
    try {
      return decodeTga(bytes)
    } catch {
      return null
    }
  }

  const mime = imageMimeType(path) ?? 'image/png'
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }))
  } catch {
    return null
  }

  const texture = new THREE.Texture(bitmap)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  texture.needsUpdate = true

  const pixels = readPixels(bitmap, bitmap.width, bitmap.height)

  return { texture, alpha: pixels ? classifyAlpha(pixels.data) : 'none', pixels }
}

/**
 * Rebuilds an MMD toon texture as a three.js gradient map.
 *
 * MMD reads the ramp down the image with `v = 0.5 - dot(N, L) * 0.5`, so the
 * top row is full light and the bottom is full shadow. three reads across with
 * `u = dot(N, L) * 0.5 + 0.5`, so the same ramp reversed is the answer. Taking
 * the middle column rather than the first avoids the border pixel some ramps
 * carry.
 */
export function toonGradientFrom(pixels: ImageData): THREE.DataTexture {
  const { width, height, data } = pixels
  const column = Math.floor(width / 2)
  const ramp = new Uint8Array(height * 4)

  for (let row = 0; row < height; row++) {
    const from = (row * width + column) * 4
    // Reversed: the last row of the toon is the first step of the gradient.
    const to = (height - 1 - row) * 4
    ramp[to] = data[from]
    ramp[to + 1] = data[from + 1]
    ramp[to + 2] = data[from + 2]
    ramp[to + 3] = 255
  }

  const texture = new THREE.DataTexture(ramp, height, 1)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

/**
 * The ramp used when a material asks for one of MMD's ten built-in toons,
 * which ship with the program rather than with the model.
 *
 * A soft two-step curve: flat shadow, a short blend, flat light. Cel-shaded
 * enough to sit beside materials that do have their own ramp without either
 * looking out of place.
 */
export function defaultToonGradient(): THREE.DataTexture {
  const steps = 32
  const ramp = new Uint8Array(steps * 4)
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const lit = THREE.MathUtils.smoothstep(t, 0.42, 0.58)
    const value = Math.round(255 * (0.62 + 0.38 * lit))
    ramp[i * 4] = value
    ramp[i * 4 + 1] = value
    ramp[i * 4 + 2] = value
    ramp[i * 4 + 3] = 255
  }

  const texture = new THREE.DataTexture(ramp, steps, 1)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

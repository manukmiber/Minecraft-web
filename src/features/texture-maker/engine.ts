/**
 * The pixel editor's model.
 *
 * Pure functions over a flat RGBA buffer: no canvas, no React, no DOM. The
 * editor component owns the buffer and the undo stack; everything that decides
 * what a tool does lives here, which is what makes the flood fill and the
 * mirror modes testable without a browser.
 */

import { encodePng } from './png'

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'eyedropper'
export type SymmetryMode = 'none' | 'horizontal' | 'vertical' | 'both'

/** Sizes the editor offers. 16 and 32 cover items and blocks; 64 is entities. */
export const CANVAS_SIZES = [16, 32, 64, 128] as const

export interface PixelCanvas {
  width: number
  height: number
  /** Straight (non-premultiplied) RGBA, row-major, 4 bytes per pixel. */
  pixels: Uint8ClampedArray
}

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 }

export function createCanvas(width: number, height = width): PixelCanvas {
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) }
}

export function cloneCanvas(canvas: PixelCanvas): PixelCanvas {
  return { ...canvas, pixels: new Uint8ClampedArray(canvas.pixels) }
}

export function inBounds(canvas: PixelCanvas, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height
}

export function getPixel(canvas: PixelCanvas, x: number, y: number): Rgba {
  if (!inBounds(canvas, x, y)) return TRANSPARENT
  const at = (y * canvas.width + x) * 4
  return {
    r: canvas.pixels[at],
    g: canvas.pixels[at + 1],
    b: canvas.pixels[at + 2],
    a: canvas.pixels[at + 3],
  }
}

/** Writes one pixel in place. Returns true when it actually changed. */
export function setPixel(canvas: PixelCanvas, x: number, y: number, color: Rgba): boolean {
  if (!inBounds(canvas, x, y)) return false
  const at = (y * canvas.width + x) * 4
  const same =
    canvas.pixels[at] === color.r &&
    canvas.pixels[at + 1] === color.g &&
    canvas.pixels[at + 2] === color.b &&
    canvas.pixels[at + 3] === color.a
  if (same) return false
  canvas.pixels[at] = color.r
  canvas.pixels[at + 1] = color.g
  canvas.pixels[at + 2] = color.b
  canvas.pixels[at + 3] = color.a
  return true
}

/**
 * Every pixel a stroke at (x, y) should touch under the current mirror mode.
 * Duplicates are removed so a stroke down the axis of symmetry is not painted
 * twice — harmless for a pencil, but it would double-count in a fill.
 */
export function symmetryTargets(
  canvas: PixelCanvas,
  x: number,
  y: number,
  mode: SymmetryMode,
): Array<[number, number]> {
  const mx = canvas.width - 1 - x
  const my = canvas.height - 1 - y
  const points: Array<[number, number]> = [[x, y]]
  if (mode === 'horizontal' || mode === 'both') points.push([mx, y])
  if (mode === 'vertical' || mode === 'both') points.push([x, my])
  if (mode === 'both') points.push([mx, my])

  const seen = new Set<string>()
  return points.filter(([px, py]) => {
    const key = `${px},${py}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function paint(
  canvas: PixelCanvas,
  x: number,
  y: number,
  color: Rgba,
  mode: SymmetryMode = 'none',
): boolean {
  let changed = false
  for (const [px, py] of symmetryTargets(canvas, x, y, mode)) {
    if (setPixel(canvas, px, py, color)) changed = true
  }
  return changed
}

function sameColor(a: Rgba, b: Rgba): boolean {
  // Fully transparent pixels compare equal whatever their RGB, which is what
  // stops a fill from stopping at an "erased red" pixel it cannot see.
  if (a.a === 0 && b.a === 0) return true
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

/** Four-way flood fill from a seed pixel. Returns true when anything changed. */
export function floodFill(
  canvas: PixelCanvas,
  x: number,
  y: number,
  color: Rgba,
  mode: SymmetryMode = 'none',
): boolean {
  if (!inBounds(canvas, x, y)) return false

  let changed = false
  for (const [seedX, seedY] of symmetryTargets(canvas, x, y, mode)) {
    const target = getPixel(canvas, seedX, seedY)
    if (sameColor(target, color)) continue

    const stack: Array<[number, number]> = [[seedX, seedY]]
    const visited = new Uint8Array(canvas.width * canvas.height)

    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!
      if (!inBounds(canvas, cx, cy)) continue
      const index = cy * canvas.width + cx
      if (visited[index]) continue
      visited[index] = 1
      if (!sameColor(getPixel(canvas, cx, cy), target)) continue

      if (setPixel(canvas, cx, cy, color)) changed = true
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
  }

  return changed
}

/**
 * Nearest-neighbour resize, so changing size never introduces a colour that was
 * not drawn. Growing doubles pixels; shrinking samples them.
 */
export function resizeCanvas(canvas: PixelCanvas, width: number, height = width): PixelCanvas {
  const next = createCanvas(width, height)
  for (let y = 0; y < height; y++) {
    const sourceY = Math.floor((y * canvas.height) / height)
    for (let x = 0; x < width; x++) {
      const sourceX = Math.floor((x * canvas.width) / width)
      setPixel(next, x, y, getPixel(canvas, sourceX, sourceY))
    }
  }
  return next
}

export function clearCanvas(canvas: PixelCanvas): PixelCanvas {
  return createCanvas(canvas.width, canvas.height)
}

/** `#rrggbb` (or `#rrggbbaa`) to bytes. Unparseable input reads as opaque black. */
export function hexToRgba(hex: string, alpha = 255): Rgba {
  const clean = hex.trim().replace(/^#/, '')
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(expanded)) return { r: 0, g: 0, b: 0, a: alpha }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) : alpha,
  }
}

export function rgbaToHex(color: Rgba): string {
  const part = (value: number): string => value.toString(16).padStart(2, '0')
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`
}

export function rgbaToCss(color: Rgba): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${(color.a / 255).toFixed(3)})`
}

export function isBlank(canvas: PixelCanvas): boolean {
  for (let i = 3; i < canvas.pixels.length; i += 4) {
    if (canvas.pixels[i] !== 0) return false
  }
  return true
}

export function toPngBytes(canvas: PixelCanvas): Uint8Array {
  return encodePng(canvas.width, canvas.height, canvas.pixels)
}

export function toPngFile(canvas: PixelCanvas, fileName: string): File {
  const bytes = toPngBytes(canvas)
  // A fresh ArrayBuffer keeps the File independent of the live editing buffer.
  return new File([bytes.slice().buffer as ArrayBuffer], fileName, { type: 'image/png' })
}

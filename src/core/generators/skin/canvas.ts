/**
 * A tiny RGBA canvas, and a brush that draws in *model units*.
 *
 * Entity artwork is painted here rather than in an image editor so it can be
 * regenerated from the body spec: a cube that moves takes its artwork with it,
 * because the painter asks the packer where the cube landed instead of
 * remembering a rectangle somebody typed in once.
 *
 * Everything a recipe draws is expressed in the same units the geometry uses, so
 * the same code produces a chunky 1x sheet or a detailed 4x one depending only
 * on `scale`. That is the whole trick behind the HD skin: Bedrock normalises UVs
 * by the geometry's declared `texture_width`, so a sheet painted at four texels
 * per unit drops onto a 128-unit model with no UV changes at all.
 */

export type Rgba = readonly [number, number, number, number]

export const TRANSPARENT: Rgba = [0, 0, 0, 0]

/** `#rrggbb` or `#rrggbbaa`. */
export function rgba(hex: string, alpha = 255): Rgba {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : alpha
  return [r, g, b, a]
}

/** Straight-line blend between two colours; `t` is clamped to 0..1. */
export function mix(from: Rgba, to: Rgba, t: number): Rgba {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
    Math.round(from[3] + (to[3] - from[3]) * k),
  ]
}

/** Lightens (`amount > 0`) or darkens a colour, keeping its alpha. */
export function shade(color: Rgba, amount: number): Rgba {
  const target: Rgba = amount >= 0 ? [255, 255, 255, color[3]] : [0, 0, 0, color[3]]
  return mix(color, target, Math.abs(amount))
}

export class Canvas {
  readonly data: Uint8ClampedArray

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4)
  }

  /** Source-over blend of one texel. Out-of-bounds writes are dropped. */
  blend(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const alpha = color[3] / 255
    if (alpha <= 0) return
    const at = (y * this.width + x) * 4
    if (alpha >= 1) {
      this.data[at] = color[0]
      this.data[at + 1] = color[1]
      this.data[at + 2] = color[2]
      this.data[at + 3] = 255
      return
    }
    const dstAlpha = this.data[at + 3] / 255
    const outAlpha = alpha + dstAlpha * (1 - alpha)
    for (let channel = 0; channel < 3; channel++) {
      const src = color[channel] * alpha
      const dst = this.data[at + channel] * dstAlpha * (1 - alpha)
      this.data[at + channel] = outAlpha === 0 ? 0 : (src + dst) / outAlpha
    }
    this.data[at + 3] = Math.round(outAlpha * 255)
  }

  /** Replaces a texel outright, alpha included — used to punch holes. */
  set(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const at = (y * this.width + x) * 4
    this.data[at] = color[0]
    this.data[at + 1] = color[1]
    this.data[at + 2] = color[2]
    this.data[at + 3] = color[3]
  }

  get(x: number, y: number): Rgba {
    const at = (y * this.width + x) * 4
    return [this.data[at], this.data[at + 1], this.data[at + 2], this.data[at + 3]]
  }
}

/** The rectangle of the sheet a brush is allowed to touch, in texels. */
export interface Frame {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Draws inside one face of one cube.
 *
 * Coordinates are model units measured from the face's top-left corner, so a
 * recipe reads like a description of the garment ("a two-unit band across the
 * chest") rather than like texture bookkeeping.
 */
export class Brush {
  constructor(
    private readonly canvas: Canvas,
    private readonly frame: Frame,
    /** Texels per model unit. */
    readonly scale: number,
  ) {}

  /** Face size in model units. */
  get width(): number {
    return this.frame.width / this.scale
  }

  get height(): number {
    return this.frame.height / this.scale
  }

  private each(
    x: number,
    y: number,
    w: number,
    h: number,
    paint: (px: number, py: number, u: number, v: number) => void,
  ): void {
    const x0 = Math.max(0, Math.round(x * this.scale))
    const y0 = Math.max(0, Math.round(y * this.scale))
    const x1 = Math.min(this.frame.width, Math.round((x + w) * this.scale))
    const y1 = Math.min(this.frame.height, Math.round((y + h) * this.scale))
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        // u and v run 0..1 across the rectangle being filled, which is what
        // gradients and dithers are written against.
        const u = x1 - x0 <= 1 ? 0.5 : (px - x0) / (x1 - x0 - 1)
        const v = y1 - y0 <= 1 ? 0.5 : (py - y0) / (y1 - y0 - 1)
        paint(px, py, u, v)
      }
    }
  }

  fill(color: Rgba): this {
    return this.box(0, 0, this.width, this.height, color)
  }

  box(x: number, y: number, w: number, h: number, color: Rgba): this {
    this.each(x, y, w, h, (px, py) => {
      this.canvas.blend(this.frame.x + px, this.frame.y + py, color)
    })
    return this
  }

  /** Overwrites (alpha included) rather than blending — cuts holes. */
  erase(x: number, y: number, w: number, h: number): this {
    this.each(x, y, w, h, (px, py) => {
      this.canvas.set(this.frame.x + px, this.frame.y + py, TRANSPARENT)
    })
    return this
  }

  /** Vertical gradient over a rectangle, defaulting to the whole face. */
  gradient(from: Rgba, to: Rgba, rect?: { x: number; y: number; w: number; h: number }): this {
    const r = rect ?? { x: 0, y: 0, w: this.width, h: this.height }
    this.each(r.x, r.y, r.w, r.h, (px, py, _u, v) => {
      this.canvas.blend(this.frame.x + px, this.frame.y + py, mix(from, to, v))
    })
    return this
  }

  /** Horizontal gradient, for cylinder-ish shading down a sleeve or a leg. */
  gradientX(from: Rgba, to: Rgba, rect?: { x: number; y: number; w: number; h: number }): this {
    const r = rect ?? { x: 0, y: 0, w: this.width, h: this.height }
    this.each(r.x, r.y, r.w, r.h, (px, py, u) => {
      this.canvas.blend(this.frame.x + px, this.frame.y + py, mix(from, to, u))
    })
    return this
  }

  /**
   * Rounds a solid shape by lighting one edge and darkening the other, which is
   * what stops every limb reading as a flat rectangle at distance.
   */
  roundX(light: number, dark: number, rect?: { x: number; y: number; w: number; h: number }): this {
    const r = rect ?? { x: 0, y: 0, w: this.width, h: this.height }
    this.each(r.x, r.y, r.w, r.h, (px, py, u) => {
      // Bright a third of the way in, falling off to shadow at both edges.
      const curve = Math.sin(u * Math.PI)
      const amount = dark + (light - dark) * curve
      const at = { x: this.frame.x + px, y: this.frame.y + py }
      const base = this.canvas.get(at.x, at.y)
      if (base[3] === 0) return
      this.canvas.set(at.x, at.y, shade(base, amount))
    })
    return this
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: Rgba): this {
    this.each(cx - rx, cy - ry, rx * 2, ry * 2, (px, py) => {
      const dx = (px + 0.5) / this.scale - cx
      const dy = (py + 0.5) / this.scale - cy
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
        this.canvas.blend(this.frame.x + px, this.frame.y + py, color)
      }
    })
    return this
  }

  /** A straight line of a given thickness, in model units. */
  line(x0: number, y0: number, x1: number, y1: number, color: Rgba, thickness = 1 / 4): this {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * this.scale * 2))
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      this.box(
        x0 + (x1 - x0) * t - thickness / 2,
        y0 + (y1 - y0) * t - thickness / 2,
        thickness,
        thickness,
        color,
      )
    }
    return this
  }

  /**
   * Deterministic value noise, for fabric grain and hair texture.
   *
   * A hash of the coordinates rather than a random number generator, so the
   * whole sheet is reproducible: the build script re-run on another machine
   * writes byte-identical PNGs.
   */
  grain(amount: number, seed: number, rect?: { x: number; y: number; w: number; h: number }): this {
    const r = rect ?? { x: 0, y: 0, w: this.width, h: this.height }
    this.each(r.x, r.y, r.w, r.h, (px, py) => {
      const at = { x: this.frame.x + px, y: this.frame.y + py }
      const base = this.canvas.get(at.x, at.y)
      if (base[3] === 0) return
      const noise = hash2(px + seed * 31, py + seed * 17)
      this.canvas.set(at.x, at.y, shade(base, (noise - 0.5) * 2 * amount))
    })
    return this
  }
}

/** A cheap stable hash in 0..1. */
export function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) % 10007) / 10007
}

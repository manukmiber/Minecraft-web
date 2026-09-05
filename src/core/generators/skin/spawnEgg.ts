/**
 * The companion's spawn egg icon.
 *
 * Bedrock will happily tint the vanilla egg from two colours, and for a pest
 * that is enough. A character deserves its own sprite, so this paints one: the
 * egg silhouette in her hair colour, speckled in the navy and pink of the
 * outfit, with the ribbon she wears as the marking.
 *
 * Drawn against a 16-unit square — the size every Minecraft item icon is
 * authored at — so the same code gives a crisp 16px sprite or the 64px one the
 * preset ships.
 */

import { Brush, Canvas, rgba, shade } from './canvas'
import { PALETTE } from './companionSkin'

const P = PALETTE

/** `scale` is texels per icon unit; the icon is always 16 units square. */
export function paintSpawnEgg(scale = 4): Canvas {
  const size = 16 * scale
  const canvas = new Canvas(size, size)
  const brush = new Brush(canvas, { x: 0, y: 0, width: size, height: size }, scale)

  const outline = rgba('#2a2333')
  const cx = 8

  // An egg is a circle below and a narrower arc above, so it is drawn as a
  // stack of rows whose half-width follows that profile. Doing it by rows keeps
  // the silhouette symmetric at every scale.
  const halfWidth = (y: number): number => {
    const t = (y - 1.5) / 13 // 0 at the top of the egg, 1 at the bottom
    if (t < 0 || t > 1) return 0
    // Narrow, pointed top; full, round bottom.
    return t < 0.55
      ? 4.6 * Math.sin(Math.PI * (t / 0.55) * 0.5) ** 1.35
      : 4.6 * Math.cos(((t - 0.55) / 0.45) * Math.PI * 0.5) ** 0.55
  }

  const row = 1 / scale
  for (let y = 1.5; y < 14.5; y += row) {
    const half = halfWidth(y)
    if (half <= 0) continue
    const t = (y - 1.5) / 13
    // Champagne body, lit from the upper left.
    const base = shade(P.hairLight, 0.12 - t * 0.34)
    brush.box(cx - half, y, half * 2, row, base)
  }

  // Outline: one texel of dark around the silhouette, drawn by walking the
  // profile again a hair wider.
  for (let y = 1.5; y < 14.5; y += row) {
    const half = halfWidth(y)
    if (half <= 0) continue
    brush.box(cx - half - 0.25, y, 0.25, row, outline)
    brush.box(cx + half, y, 0.25, row, outline)
  }
  brush.box(cx - 1.4, 1.25, 2.8, 0.25, outline)
  brush.box(cx - 3.3, 14.25, 6.6, 0.25, outline)

  // Speckles in the outfit's navy, densest towards the bottom of the egg.
  const spots = [
    [5.4, 5.2, 1.1],
    [9.8, 4.4, 0.85],
    [4.4, 8.6, 1.25],
    [10.6, 8.2, 1.15],
    [6.6, 11.4, 1.35],
    [9.9, 11.9, 1.0],
    [7.8, 7.2, 0.7],
  ]
  for (const [x, y, r] of spots) {
    brush.ellipse(x, y, r, r * 0.92, P.navy)
    brush.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.45, shade(P.navy, 0.22))
  }

  // Her ribbon, across the middle.
  brush.box(3.6, 6.1, 8.8, 1.5, P.hotPink)
  brush.box(3.6, 6.1, 8.8, 0.4, shade(P.hotPink, 0.35))
  brush.box(7.2, 5.5, 1.6, 2.7, shade(P.hotPink, -0.3))
  brush.ellipse(6.4, 6.85, 1.05, 0.95, P.hotPink)
  brush.ellipse(9.6, 6.85, 1.05, 0.95, P.hotPink)
  brush.ellipse(6.3, 6.6, 0.5, 0.4, shade(P.hotPink, 0.35))
  brush.ellipse(9.5, 6.6, 0.5, 0.4, shade(P.hotPink, 0.35))

  // Specular: the highlight that makes it read as a shell rather than a disc.
  brush.ellipse(6.1, 3.9, 1.05, 1.35, rgba('#ffffffcc'))
  brush.ellipse(6.1, 3.6, 0.55, 0.7, rgba('#ffffff'))
  // Bounce light along the bottom rim.
  brush.box(5.6, 13.3, 4.6, 0.5, rgba('#ffffff44'))

  return canvas
}

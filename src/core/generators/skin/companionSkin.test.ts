import { describe, expect, it } from 'vitest'

import { Brush, Canvas, mix, rgba, shade } from './canvas'
import { faceFrames, paintBody } from './paintBody'
import type { PaintRecipe } from './paintBody'
import { COMPANION_RECIPES, paintCompanion } from './companionSkin'
import { paintSpawnEgg } from './spawnEgg'
import { COMPANION } from '../bodies/companion'

/** Is anything drawn inside this rectangle? */
function anyOpaque(canvas: Canvas, x: number, y: number, w: number, h: number): boolean {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (canvas.get(px, py)[3] > 0) return true
    }
  }
  return false
}

function coverage(canvas: Canvas, x: number, y: number, w: number, h: number): number {
  let filled = 0
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (canvas.get(px, py)[3] > 0) filled++
    }
  }
  return filled / (w * h)
}

describe('the canvas', () => {
  it('blends by alpha and can punch a hole back through', () => {
    const canvas = new Canvas(4, 4)
    const brush = new Brush(canvas, { x: 0, y: 0, width: 4, height: 4 }, 1)
    brush.fill(rgba('#ff0000'))
    expect(canvas.get(1, 1)).toEqual([255, 0, 0, 255])

    brush.box(0, 0, 2, 2, rgba('#0000ff', 128))
    const blended = canvas.get(0, 0)
    expect(blended[0]).toBeGreaterThan(100)
    expect(blended[2]).toBeGreaterThan(100)

    brush.erase(0, 0, 2, 2)
    expect(canvas.get(0, 0)[3]).toBe(0)
    // Erasing one region leaves the rest alone.
    expect(canvas.get(3, 3)[3]).toBe(255)
  })

  it('mixes and shades without drifting off the ends', () => {
    const black = rgba('#000000')
    const white = rgba('#ffffff')
    expect(mix(black, white, -5)).toEqual(black)
    expect(mix(black, white, 5)).toEqual(white)
    expect(shade(black, 1)).toEqual(white)
    expect(shade(white, -1)).toEqual([0, 0, 0, 255])
  })
})

describe('unwrapping a cube for painting', () => {
  it('puts the six faces where applyBoxUv samples them', () => {
    const frames = faceFrames({ origin: [0, 0, 0], size: [8, 12, 4], uv: [16, 20] }, 1)
    expect(frames.up).toEqual({ x: 20, y: 20, width: 8, height: 4 })
    expect(frames.down).toEqual({ x: 28, y: 20, width: 8, height: 4 })
    expect(frames.west).toEqual({ x: 16, y: 24, width: 4, height: 12 })
    expect(frames.north).toEqual({ x: 20, y: 24, width: 8, height: 12 })
    expect(frames.east).toEqual({ x: 28, y: 24, width: 4, height: 12 })
    expect(frames.south).toEqual({ x: 32, y: 24, width: 8, height: 12 })
  })

  it('gives a zero-depth plane its front face in the left half of the patch', () => {
    const frames = faceFrames({ origin: [0, 0, 0], size: [8, 8, 0], uv: [0, 0] }, 1)
    expect(frames.north).toEqual({ x: 0, y: 0, width: 8, height: 8 })
    expect(frames.up.height).toBe(0)
  })

  it('scales every rectangle together, so an HD sheet stays aligned', () => {
    const one = faceFrames({ origin: [0, 0, 0], size: [8, 12, 4], uv: [16, 20] }, 1)
    const four = faceFrames({ origin: [0, 0, 0], size: [8, 12, 4], uv: [16, 20] }, 4)
    expect(four.north).toEqual({
      x: one.north.x * 4,
      y: one.north.y * 4,
      width: one.north.width * 4,
      height: one.north.height * 4,
    })
  })
})

describe('painting a body', () => {
  it('refuses a cube whose paint recipe does not exist', () => {
    expect(() =>
      paintBody(
        {
          textureWidth: 8,
          textureHeight: 8,
          visibleBoundsWidth: 1,
          visibleBoundsHeight: 1,
          visibleBoundsOffset: [0, 0, 0],
          bones: [
            {
              name: 'a',
              pivot: [0, 0, 0],
              cubes: [{ origin: [0, 0, 0], size: [1, 1, 1], uv: [0, 0], paint: 'nope' }],
            },
          ],
        },
        { scale: 1, recipes: {} },
      ),
    ).toThrow(/No paint recipe for "nope"/)
  })

  it('paints a shared patch once, so translucent passes do not double up', () => {
    let calls = 0
    const recipe: PaintRecipe = ({ faces }) => {
      calls++
      faces.north.fill(rgba('#ffffff', 100))
    }
    paintBody(
      {
        textureWidth: 16,
        textureHeight: 16,
        visibleBoundsWidth: 1,
        visibleBoundsHeight: 1,
        visibleBoundsOffset: [0, 0, 0],
        bones: [
          {
            name: 'pair',
            pivot: [0, 0, 0],
            cubes: [
              { origin: [0, 0, 0], size: [2, 2, 2], uv: [0, 0], paint: 'x' },
              { origin: [4, 0, 0], size: [2, 2, 2], uv: [0, 0], mirror: true, paint: 'x' },
            ],
          },
        ],
      },
      { scale: 1, recipes: { x: recipe } },
    )
    expect(calls).toBe(1)
  })
})

describe('the companion sheet', () => {
  it('has a recipe for every cube the body declares', () => {
    for (const bone of COMPANION.bones) {
      for (const cube of bone.cubes) {
        expect(cube.paint, `${bone.name} has an unpainted cube`).toBeDefined()
        expect(COMPANION_RECIPES[cube.paint!], `no recipe for ${cube.paint}`).toBeDefined()
      }
    }
  })

  it('paints at any scale, and 1x lines up with the declared sheet', () => {
    const sheet = paintCompanion(1)
    expect(sheet.width).toBe(COMPANION.textureWidth)
    expect(sheet.height).toBe(COMPANION.textureHeight)
  })

  it('cuts the face out from under the fringe', () => {
    const scale = 4
    const sheet = paintCompanion(scale)
    const hair = COMPANION.bones.find((b) => b.name === 'hair')!.cubes[0]
    const front = faceFrames(hair, scale).north

    // The top of the fringe is solid hair...
    expect(coverage(sheet, front.x, front.y, front.width, scale)).toBe(1)
    // ...and the bottom, where the mouth would be, is cut away entirely.
    expect(anyOpaque(sheet, front.x, front.y + front.height - scale, front.width, scale)).toBe(false)
  })

  it('draws something on every expression, and draws them differently', () => {
    const scale = 4
    const sheet = paintCompanion(scale)
    const seen = new Set<string>()

    for (const bone of COMPANION.bones) {
      if (bone.variant?.group !== 'face') continue
      const frame = faceFrames(bone.cubes[0], scale).north
      expect(
        anyOpaque(sheet, frame.x, frame.y, frame.width, frame.height),
        `${bone.name} is blank`,
      ).toBe(true)

      // Fingerprint the patch so two expressions cannot quietly be identical.
      let signature = ''
      for (let y = 0; y < frame.height; y++) {
        for (let x = 0; x < frame.width; x++) {
          signature += sheet.get(frame.x + x, frame.y + y).join(',')
        }
      }
      expect(seen.has(signature), `${bone.name} looks identical to another face`).toBe(false)
      seen.add(signature)
    }

    expect(seen.size).toBe(8)
  })

  it('is deterministic, so a rebuild only shows up in a diff when the art changed', () => {
    expect([...paintCompanion(1).data]).toEqual([...paintCompanion(1).data])
  })
})

describe('the spawn egg', () => {
  it('draws an egg: opaque in the middle, clear at the corners', () => {
    const scale = 4
    const egg = paintSpawnEgg(scale)
    expect(egg.width).toBe(16 * scale)
    expect(egg.get(8 * scale, 8 * scale)[3]).toBe(255)
    expect(egg.get(0, 0)[3]).toBe(0)
    expect(egg.get(egg.width - 1, egg.height - 1)[3]).toBe(0)
  })

  it('is narrower at the top than at the bottom', () => {
    const scale = 4
    const egg = paintSpawnEgg(scale)
    const widthAt = (row: number): number => {
      let count = 0
      for (let x = 0; x < egg.width; x++) if (egg.get(x, row)[3] > 0) count++
      return count
    }
    expect(widthAt(4 * scale)).toBeLessThan(widthAt(11 * scale))
  })
})

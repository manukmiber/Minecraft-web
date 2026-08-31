import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import {
  createCanvas,
  floodFill,
  getPixel,
  hexToRgba,
  isBlank,
  paint,
  resizeCanvas,
  rgbaToHex,
  setPixel,
  symmetryTargets,
  toPngBytes,
  type Rgba,
} from './engine'

const RED: Rgba = { r: 255, g: 0, b: 0, a: 255 }
const BLUE: Rgba = { r: 0, g: 0, b: 255, a: 255 }
const CLEAR: Rgba = { r: 0, g: 0, b: 0, a: 0 }

describe('the pixel canvas', () => {
  it('starts fully transparent', () => {
    expect(isBlank(createCanvas(16))).toBe(true)
  })

  it('reports a pixel outside the canvas as transparent rather than throwing', () => {
    const canvas = createCanvas(4)
    expect(getPixel(canvas, -1, 0)).toEqual(CLEAR)
    expect(setPixel(canvas, 99, 99, RED)).toBe(false)
  })

  it('mirrors a stroke across both axes without painting the same pixel twice', () => {
    const canvas = createCanvas(4)
    expect(symmetryTargets(canvas, 0, 0, 'both')).toEqual([
      [0, 0],
      [3, 0],
      [0, 3],
      [3, 3],
    ])
    // A pixel on the axis of symmetry of an odd canvas maps onto itself.
    expect(symmetryTargets(createCanvas(3), 1, 1, 'both')).toEqual([[1, 1]])
  })

  it('paints all mirrored positions', () => {
    const canvas = createCanvas(4)
    paint(canvas, 0, 1, RED, 'horizontal')
    expect(getPixel(canvas, 0, 1)).toEqual(RED)
    expect(getPixel(canvas, 3, 1)).toEqual(RED)
    expect(getPixel(canvas, 1, 1)).toEqual(CLEAR)
  })
})

describe('flood fill', () => {
  it('fills the connected transparent area and stops at a drawn edge', () => {
    const canvas = createCanvas(3)
    for (let y = 0; y < 3; y++) setPixel(canvas, 1, y, RED)

    floodFill(canvas, 0, 0, BLUE)

    expect(getPixel(canvas, 0, 0)).toEqual(BLUE)
    expect(getPixel(canvas, 0, 2)).toEqual(BLUE)
    expect(getPixel(canvas, 1, 1)).toEqual(RED)
    // The far side is a separate region, so it is untouched.
    expect(getPixel(canvas, 2, 0)).toEqual(CLEAR)
  })

  it('treats every fully transparent pixel as the same colour', () => {
    const canvas = createCanvas(2)
    // An "erased red" pixel still reads as empty and must not block a fill.
    setPixel(canvas, 0, 0, { r: 255, g: 0, b: 0, a: 0 })
    floodFill(canvas, 1, 1, BLUE)
    expect(getPixel(canvas, 0, 0)).toEqual(BLUE)
  })

  it('does nothing when the seed already has the fill colour', () => {
    const canvas = createCanvas(2)
    setPixel(canvas, 0, 0, RED)
    expect(floodFill(canvas, 0, 0, RED)).toBe(false)
  })
})

describe('resizing', () => {
  it('doubles pixels without inventing a colour', () => {
    const canvas = createCanvas(2)
    setPixel(canvas, 0, 0, RED)
    const bigger = resizeCanvas(canvas, 4)

    expect(bigger.width).toBe(4)
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      expect(getPixel(bigger, x, y)).toEqual(RED)
    }
    expect(getPixel(bigger, 2, 2)).toEqual(CLEAR)
  })
})

describe('colours', () => {
  it('round-trips hex', () => {
    expect(rgbaToHex(hexToRgba('#4aa3ff'))).toBe('#4aa3ff')
    expect(hexToRgba('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 255 })
    expect(hexToRgba('nonsense')).toEqual({ r: 0, g: 0, b: 0, a: 255 })
  })
})

describe('PNG encoding', () => {
  it('writes a real PNG whose pixels survive the round trip', () => {
    const canvas = createCanvas(2)
    setPixel(canvas, 0, 0, RED)
    setPixel(canvas, 1, 1, { r: 1, g: 2, b: 3, a: 128 })

    const png = toPngBytes(canvas)
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    expect(view.getUint32(16)).toBe(2) // IHDR width
    expect(view.getUint32(20)).toBe(2) // IHDR height
    expect(png[24]).toBe(8) // bit depth
    expect(png[25]).toBe(6) // RGBA

    // The IDAT payload sits after the 8-byte signature, the 25-byte IHDR chunk
    // and this chunk's own 8-byte header.
    const idatLength = view.getUint32(33)
    const idat = png.subarray(41, 41 + idatLength)
    const raw = new Uint8Array(inflateSync(Buffer.from(idat)))

    // Two scanlines, each led by a zero filter byte.
    expect(raw.length).toBe(2 * (1 + 2 * 4))
    expect(raw[0]).toBe(0)
    expect([...raw.subarray(1, 5)]).toEqual([255, 0, 0, 255])
    // Semi-transparent pixels keep their exact channels — the reason this
    // encoder exists rather than a canvas round trip.
    expect([...raw.subarray(14, 18)]).toEqual([1, 2, 3, 128])
  })

  it('rejects a buffer whose length does not match the size', () => {
    expect(() => {
      const canvas = createCanvas(2)
      canvas.width = 3
      toPngBytes(canvas)
    }).toThrow(/Expected/)
  })
})

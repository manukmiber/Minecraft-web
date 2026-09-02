/**
 * A minimal PNG reader/writer for the Faithful extraction script.
 *
 * Only what a resource pack actually contains is handled: non-interlaced
 * truecolour, greyscale and palette images at any bit depth up to 8 — the pack
 * mixes 8-bit RGBA with 4-bit palettes. Everything is normalised to RGBA so the
 * tinting step has one shape to work with, and written back out the same way.
 * Node ships zlib, so the deflate stream is real compression rather than the
 * stored blocks `src/features/texture-maker/png.ts` uses in the browser.
 */

import zlib from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Undoes one scanline filter in place, per the PNG spec's reconstruction rules. */
function unfilter(filter, line, previous, step) {
  switch (filter) {
    case 0:
      break
    case 1:
      for (let i = step; i < line.length; i++) line[i] = (line[i] + line[i - step]) & 0xff
      break
    case 2:
      for (let i = 0; i < line.length; i++) line[i] = (line[i] + previous[i]) & 0xff
      break
    case 3:
      for (let i = 0; i < line.length; i++) {
        const left = i >= step ? line[i - step] : 0
        line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xff
      }
      break
    case 4:
      for (let i = 0; i < line.length; i++) {
        const a = i >= step ? line[i - step] : 0
        const b = previous[i]
        const c = i >= step ? previous[i - step] : 0
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        line[i] = (line[i] + predictor) & 0xff
      }
      break
    default:
      throw new Error(`Unsupported PNG scanline filter ${filter}.`)
  }
}

/** Reads a PNG into `{ width, height, pixels }`, pixels being RGBA bytes. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('Not a PNG file.')

  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let palette = null
  let paletteAlpha = null
  const idat = []

  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported.')
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      paletteAlpha = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (depth > 8) throw new Error(`Unsupported PNG bit depth ${depth}.`)

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  // Filtering works on whole bytes, so sub-byte depths use a one-byte step and
  // a scanline rounded up to the next byte.
  const step = Math.max(1, (channels * depth) >> 3)
  const stride = Math.ceil((width * channels * depth) / 8)
  const max = (1 << depth) - 1
  const pixels = new Uint8Array(width * height * 4)
  let previous = new Uint8Array(stride)

  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1)
    const line = Uint8Array.prototype.slice.call(raw, start + 1, start + 1 + stride)
    unfilter(raw[start], line, previous, step)
    previous = line

    /** The nth sample on this scanline, whatever the bit depth. */
    const sample = (n) => {
      if (depth === 8) return line[n]
      const bit = n * depth
      return (line[bit >> 3] >> (8 - depth - (bit & 7))) & max
    }

    for (let x = 0; x < width; x++) {
      const from = x * channels
      const to = (y * width + x) * 4
      if (colorType === 3) {
        const index = sample(from)
        pixels[to] = palette[index * 3]
        pixels[to + 1] = palette[index * 3 + 1]
        pixels[to + 2] = palette[index * 3 + 2]
        pixels[to + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255
      } else if (colorType === 0 || colorType === 4) {
        // Greyscale samples are scaled so a 4-bit 15 reads as a full 255.
        const grey = Math.round((sample(from) * 255) / max)
        pixels[to] = pixels[to + 1] = pixels[to + 2] = grey
        pixels[to + 3] = colorType === 4 ? Math.round((sample(from + 1) * 255) / max) : 255
      } else {
        for (let c = 0; c < channels; c++) {
          pixels[to + c] = Math.round((sample(from + c) * 255) / max)
        }
        if (colorType === 2) pixels[to + 3] = 255
      }
    }
  }

  return { width, height, pixels }
}

function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([head.subarray(0, 4), body, tail])
}

/** Writes RGBA pixels back out as an 8-bit truecolour-with-alpha PNG. */
export function encodePng({ width, height, pixels }) {
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const to = y * (width * 4 + 1)
    raw[to] = 0
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(raw, to + 1)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * A tiny PNG encoder.
 *
 * The obvious alternative — draw onto a `<canvas>` and call `toBlob` — round
 * trips every pixel through the browser's premultiplied-alpha compositing,
 * which quietly shifts colours on semi-transparent pixels. A texture is
 * authored pixel by pixel here, so the bytes that leave the editor are the
 * bytes that were drawn.
 *
 * Compression is deflate's "stored" mode: no entropy coding, but a 64x64 RGBA
 * sheet is 16 KB, and being exact matters more than being small.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** zlib stream wrapping uncompressed deflate blocks. */
function zlibStore(raw: Uint8Array): Uint8Array {
  const MAX = 65535
  const blocks = Math.max(1, Math.ceil(raw.length / MAX))
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4)
  let at = 0

  // 0x78 0x01: deflate, 32K window, no preset dictionary, fastest setting.
  out[at++] = 0x78
  out[at++] = 0x01

  for (let offset = 0; offset < raw.length || offset === 0; offset += MAX) {
    const slice = raw.subarray(offset, Math.min(offset + MAX, raw.length))
    const last = offset + MAX >= raw.length ? 1 : 0
    out[at++] = last
    out[at++] = slice.length & 0xff
    out[at++] = (slice.length >> 8) & 0xff
    out[at++] = ~slice.length & 0xff
    out[at++] = (~slice.length >> 8) & 0xff
    out.set(slice, at)
    at += slice.length
    if (last) break
  }

  const checksum = adler32(raw)
  out[at++] = (checksum >>> 24) & 0xff
  out[at++] = (checksum >>> 16) & 0xff
  out[at++] = (checksum >>> 8) & 0xff
  out[at++] = checksum & 0xff

  return out.subarray(0, at)
}

/** Encodes straight (non-premultiplied) RGBA bytes as an 8-bit RGBA PNG. */
export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} bytes for ${width}x${height}, got ${rgba.length}.`)
  }

  // One filter byte (0 = none) in front of every scanline.
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const to = y * (1 + width * 4)
    raw[to] = 0
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), to + 1)
  }

  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: truecolour with alpha
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibStore(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]

  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const png = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    png.set(part, at)
    at += part.length
  }
  return png
}

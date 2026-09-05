/**
 * The parser is checked against files this test builds itself.
 *
 * A real MMD model cannot be committed here — the ones people actually use
 * are distributed under terms that forbid redistribution — so the fixtures are
 * written byte by byte instead. That turns out to be the better test anyway:
 * a hand-written file can exercise both text encodings, every index width and
 * every weight scheme in a way one donated model never would.
 */

import { describe, expect, it } from 'vitest'

import { BONE_FLAG, PmxParseError, parsePmx } from './pmx'

class PmxWriter {
  private bytes: number[] = []

  constructor(private encoding: 'utf-16le' | 'utf-8') {}

  u8(...values: number[]): this {
    for (const value of values) this.bytes.push(value & 0xff)
    return this
  }

  u16(value: number): this {
    return this.u8(value, value >> 8)
  }

  i32(value: number): this {
    return this.u8(value, value >> 8, value >> 16, value >> 24)
  }

  f32(...values: number[]): this {
    for (const value of values) {
      const view = new DataView(new ArrayBuffer(4))
      view.setFloat32(0, value, true)
      for (let i = 0; i < 4; i++) this.bytes.push(view.getUint8(i))
    }
    return this
  }

  text(value: string): this {
    const encoded =
      this.encoding === 'utf-8'
        ? new TextEncoder().encode(value)
        : new Uint8Array(
            Uint16Array.from([...value].map((char) => char.charCodeAt(0))).buffer,
          )
    this.i32(encoded.length)
    return this.u8(...encoded)
  }

  buffer(): ArrayBuffer {
    return Uint8Array.from(this.bytes).buffer
  }
}

interface FixtureOptions {
  encoding?: 'utf-16le' | 'utf-8'
  /** Left as-is so a test can claim more indices than the mesh has. */
  materialIndexCounts?: [number, number]
}

/**
 * Four vertices, two triangles, two materials, three bones and three morphs —
 * one of every shape the parser has to branch on, and nothing more.
 */
function fixture(options: FixtureOptions = {}): ArrayBuffer {
  const encoding = options.encoding ?? 'utf-16le'
  const counts = options.materialIndexCounts ?? [3, 3]
  const w = new PmxWriter(encoding)

  w.u8(0x50, 0x4d, 0x58, 0x20)
  w.f32(2.0)
  w.u8(8)
  // encoding, extra UVs, then vertex/texture/material/bone/morph/rigid widths.
  w.u8(encoding === 'utf-16le' ? 0 : 1, 1, 2, 1, 1, 1, 1, 1)

  w.text('Fixture').text('Fixture EN').text('comment').text('comment EN')

  w.i32(4)
  const vertex = (x: number, y: number, z: number, weight: () => void) => {
    w.f32(x, y, z)
    w.f32(0, 1, 0)
    w.f32(x, y)
    w.f32(0, 0, 0, 0) // the one additional UV this fixture declares
    weight()
    w.f32(1) // edge scale
  }
  vertex(0, 0, 0, () => w.u8(0).u8(1)) // BDEF1
  vertex(1, 0, 0, () => w.u8(1).u8(1).u8(2).f32(0.75)) // BDEF2
  vertex(1, 1, 0, () => w.u8(2).u8(0).u8(1).u8(2).u8(0xff).f32(0.5, 0.25, 0.25, 0)) // BDEF4
  vertex(0, 1, 0, () =>
    w
      .u8(3)
      .u8(1)
      .u8(2)
      .f32(0.25)
      .f32(0, 0, 0)
      .f32(0, 0, 0)
      .f32(0, 0, 0),
  ) // SDEF

  w.i32(6)
  for (const index of [0, 1, 2, 0, 2, 3]) w.u16(index)

  w.i32(1).text('tex\\body.png')

  w.i32(2)
  const material = (name: string, indexCount: number, toonShared: boolean) => {
    w.text(name).text(`${name} EN`)
    w.f32(1, 0.5, 0.25, 0.75)
    w.f32(0.1, 0.2, 0.3)
    w.f32(12)
    w.f32(0.4, 0.5, 0.6)
    w.u8(MATERIAL_FLAGS)
    w.f32(0, 0, 0, 1)
    w.f32(1.2)
    w.u8(0) // texture index
    w.u8(0xff) // sphere texture index: -1
    w.u8(2) // sphere mode: additive
    w.u8(toonShared ? 1 : 0)
    w.u8(toonShared ? 3 : 0)
    w.text('memo')
    w.i32(indexCount)
  }
  const MATERIAL_FLAGS = 0x11
  material('front', counts[0], false)
  material('back', counts[1], true)

  w.i32(3)
  // Root: tail as an offset, nothing else set.
  w.text('root').text('root EN').f32(0, 0, 0).u8(0xff).i32(0).u16(BONE_FLAG.rotatable)
  w.f32(0, 1, 0)
  // Spine: inherits rotation from the root, and points at a bone.
  w.text('spine')
    .text('spine EN')
    .f32(0, 1, 0)
    .u8(0)
    .i32(0)
    .u16(BONE_FLAG.tailIsBone | BONE_FLAG.inheritRotation | BONE_FLAG.fixedAxis)
  w.u8(2)
  w.u8(0).f32(0.5) // inherit parent + influence
  w.f32(0, 1, 0) // fixed axis
  // Leg IK, with one limited link.
  w.text('leg ik').text('leg ik EN').f32(0, 2, 0).u8(1).i32(0).u16(BONE_FLAG.ik)
  w.f32(0, 1, 0)
  w.u8(1).i32(40).f32(0.5).i32(1)
  w.u8(0).u8(1).f32(-1, -1, -1).f32(1, 1, 1)

  w.i32(3)
  // Vertex morph.
  w.text('blink').text('blink EN').u8(2).u8(1).i32(2)
  w.u16(1).f32(0.25, 0.5, 0.75)
  w.u16(3).f32(-0.25, 0, 0)
  // Group morph over it.
  w.text('smile').text('smile EN').u8(2).u8(0).i32(1)
  w.u8(0).f32(0.5)
  // Material morph, which the parser skips past but must still size right.
  w.text('tint').text('tint EN').u8(4).u8(8).i32(1)
  w.u8(0).u8(0)
  for (let i = 0; i < 28; i++) w.f32(1)

  // One display frame holding a bone and a morph.
  w.i32(1)
  w.text('frame').text('frame EN').u8(0).i32(2)
  w.u8(0).u8(1)
  w.u8(1).u8(0)

  w.i32(1)
  w.text('hair body').text('hair body EN').u8(1).u8(2).u16(0xffff).u8(2)
  w.f32(0.5, 1, 0.5).f32(0, 1, 0).f32(0, 0, 0)
  w.f32(1).f32(0.9).f32(0.8).f32(0.1).f32(0.5).u8(1)

  w.i32(1)
  w.text('hair joint').text('hair joint EN').u8(0).u8(0).u8(0)
  w.f32(0, 1, 0).f32(0, 0, 0)
  for (let i = 0; i < 18; i++) w.f32(0)

  return w.buffer()
}

describe('parsePmx', () => {
  it('reads the header, the model info and the geometry', () => {
    const model = parsePmx(fixture())

    expect(model.header.version).toBe(2)
    expect(model.header.encoding).toBe('utf-16le')
    expect(model.header.additionalUvCount).toBe(1)
    expect(model.header.vertexIndexSize).toBe(2)
    expect(model.info.name).toBe('Fixture')
    expect(model.info.englishComment).toBe('comment EN')

    expect(model.geometry.vertexCount).toBe(4)
    expect([...model.geometry.indices]).toEqual([0, 1, 2, 0, 2, 3])
    expect([...model.geometry.positions.slice(3, 6)]).toEqual([1, 0, 0])
    expect([...model.geometry.uvs.slice(4, 6)]).toEqual([1, 1])
  })

  it('flattens every weight scheme onto four influences', () => {
    const { skinIndices, skinWeights } = parsePmx(fixture()).geometry

    // BDEF1 is one bone at full weight.
    expect([...skinIndices.slice(0, 4)]).toEqual([1, 0, 0, 0])
    expect([...skinWeights.slice(0, 4)]).toEqual([1, 0, 0, 0])

    // BDEF2's second weight is implied by the first.
    expect([...skinIndices.slice(4, 8)]).toEqual([1, 2, 0, 0])
    expect([...skinWeights.slice(4, 8)]).toEqual([0.75, 0.25, 0, 0])

    // BDEF4's unused slot is bone -1, which has to land on 0 at zero weight
    // rather than wrapping to 65535 and indexing off the end of the skeleton.
    expect([...skinIndices.slice(8, 12)]).toEqual([0, 1, 2, 0])
    expect([...skinWeights.slice(8, 12)]).toEqual([0.5, 0.25, 0.25, 0])

    // SDEF carries extra data the parser skips, and weights like a BDEF2.
    expect([...skinWeights.slice(12, 16)]).toEqual([0.25, 0.75, 0, 0])
  })

  it('reads materials, including the two shapes a toon reference takes', () => {
    const [front, back] = parsePmx(fixture()).materials

    expect(front.name).toBe('front')
    expect(front.diffuse).toEqual([1, 0.5, 0.25, 0.75])
    expect(front.textureIndex).toBe(0)
    expect(front.sphereTextureIndex).toBe(-1)
    expect(front.sphereMode).toBe('add')
    expect(front.toonShared).toBe(false)
    expect(front.indexCount).toBe(3)

    expect(back.toonShared).toBe(true)
    expect(back.toonIndex).toBe(3)
  })

  it('reads bones with their optional blocks in the right order', () => {
    const [root, spine, ik] = parsePmx(fixture()).bones

    expect(root.tailOffset).toEqual([0, 1, 0])
    expect(root.tailIndex).toBe(-1)
    expect(root.parentIndex).toBe(-1)

    expect(spine.tailIndex).toBe(2)
    expect(spine.inherit).toEqual({ parentIndex: 0, influence: 0.5 })
    expect(spine.fixedAxis).toEqual([0, 1, 0])

    expect(ik.ik).not.toBeNull()
    expect(ik.ik?.targetIndex).toBe(1)
    expect(ik.ik?.iterations).toBe(40)
    expect(ik.ik?.links).toHaveLength(1)
    expect(ik.ik?.links[0].limits?.max).toEqual([1, 1, 1])
  })

  it('reads vertex and group morphs, and steps over the ones it cannot apply', () => {
    const [blink, smile, tint] = parsePmx(fixture()).morphs

    expect(blink.kind).toBe('vertex')
    if (blink.kind === 'vertex') {
      expect([...blink.indices]).toEqual([1, 3])
      expect([...blink.offsets.slice(0, 3)]).toEqual([0.25, 0.5, 0.75])
    }

    expect(smile.kind).toBe('group')
    if (smile.kind === 'group') {
      expect(smile.members).toEqual([{ morphIndex: 0, influence: 0.5 }])
    }

    // A material morph is named but not applied, and — the point of the test —
    // reading it must leave the cursor exactly where the next section starts.
    expect(tint.kind).toBe('other')
    expect(tint.name).toBe('tint')
  })

  it('reads the rigid bodies and joints after the display frames', () => {
    const model = parsePmx(fixture())

    expect(model.rigidBodies).toHaveLength(1)
    expect(model.rigidBodies[0].name).toBe('hair body')
    expect(model.rigidBodies[0].boneIndex).toBe(1)
    expect(model.rigidBodies[0].shape).toBe('capsule')
    expect(model.rigidBodies[0].physicsMode).toBe(1)

    expect(model.joints).toHaveLength(1)
    expect(model.joints[0].name).toBe('hair joint')
  })

  it('reads UTF-8 files the same way', () => {
    const model = parsePmx(fixture({ encoding: 'utf-8' }))

    expect(model.header.encoding).toBe('utf-8')
    expect(model.info.name).toBe('Fixture')
    expect(model.materials.map((material) => material.name)).toEqual(['front', 'back'])
    expect(model.bones).toHaveLength(3)
  })

  it('rejects a file that is not PMX', () => {
    const bytes = new Uint8Array([0x50, 0x6d, 0x64, 0x00, 1, 2, 3, 4]).buffer
    expect(() => parsePmx(bytes)).toThrow(PmxParseError)
    expect(() => parsePmx(bytes)).toThrow(/PMD models/)
  })

  it('names the offset when a file is truncated', () => {
    const full = new Uint8Array(fixture())
    const cut = full.slice(0, Math.floor(full.length * 0.6)).buffer
    expect(() => parsePmx(cut)).toThrow(/ends mid-record/)
  })

  it('catches a mesh whose materials do not add up', () => {
    expect(() => parsePmx(fixture({ materialIndexCounts: [3, 6] }))).toThrow(
      /claim 9 face indices but the mesh has 6/,
    )
  })
})

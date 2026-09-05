/**
 * A PMX reader.
 *
 * PMX is MikuMikuDance's model format, and the companion needs one because
 * three.js removed `MMDLoader` in r167 — there is no longer an addon to lean
 * on. So this parses the container itself: little-endian, length-prefixed
 * text, and index widths declared per file rather than fixed.
 *
 * It reads the file **exactly as it is on disk** and does not touch the
 * coordinate system. PMX is left-handed and three.js is right-handed, but
 * converting here would mean every consumer had to know which convention a
 * given field was already in; `buildCompanionModel` does the conversion in one
 * place instead, and this module stays a faithful description of the bytes.
 *
 * Geometry comes out as typed arrays rather than an array of vertex objects.
 * A dressed character is 30–60k vertices, and one object per vertex is enough
 * garbage to stall the first frame on a laptop.
 */

export type PmxEncoding = 'utf-16le' | 'utf-8'

export interface PmxHeader {
  version: number
  encoding: PmxEncoding
  /** Extra vec4s carried per vertex. Read past, never used. */
  additionalUvCount: number
  vertexIndexSize: 1 | 2 | 4
  textureIndexSize: 1 | 2 | 4
  materialIndexSize: 1 | 2 | 4
  boneIndexSize: 1 | 2 | 4
  morphIndexSize: 1 | 2 | 4
  rigidBodyIndexSize: 1 | 2 | 4
}

export interface PmxInfo {
  name: string
  englishName: string
  comment: string
  englishComment: string
}

/**
 * Vertex data, parallel across arrays: vertex `i` is `positions[3i..3i+2]`,
 * `skinIndices[4i..4i+3]` and so on.
 *
 * Every weight scheme in the format (BDEF1/2/4, SDEF, QDEF) is flattened to
 * the same four-influence layout. SDEF's spherical parameters are dropped:
 * they only refine the elbow and shoulder crease, and a companion standing in
 * a corner of the workspace never bends far enough for it to show.
 */
export interface PmxGeometry {
  vertexCount: number
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  skinIndices: Uint16Array
  skinWeights: Float32Array
  edgeScales: Float32Array
  indices: Uint32Array
}

/** Bit flags on `PmxMaterial.flags`. */
export const MATERIAL_FLAG = {
  noCull: 0x01,
  groundShadow: 0x02,
  castShadow: 0x04,
  receiveShadow: 0x08,
  hasEdge: 0x10,
  vertexColor: 0x20,
  pointDraw: 0x40,
  lineDraw: 0x80,
} as const

/** How a material's sphere texture combines with the lit colour. */
export type PmxSphereMode = 'none' | 'multiply' | 'add' | 'sub-texture'

export interface PmxMaterial {
  name: string
  englishName: string
  diffuse: [number, number, number, number]
  specular: [number, number, number]
  shininess: number
  ambient: [number, number, number]
  flags: number
  edgeColor: [number, number, number, number]
  edgeSize: number
  /** Index into `PmxModel.texturePaths`, or -1. */
  textureIndex: number
  sphereTextureIndex: number
  sphereMode: PmxSphereMode
  /** True when the toon comes from MMD's built-in ramps rather than the file. */
  toonShared: boolean
  toonIndex: number
  memo: string
  /** Number of *indices*, not triangles — always a multiple of three. */
  indexCount: number
}

export interface PmxIkLink {
  boneIndex: number
  limits: { min: [number, number, number]; max: [number, number, number] } | null
}

export interface PmxIk {
  targetIndex: number
  iterations: number
  limitAngle: number
  links: PmxIkLink[]
}

/** Bit flags on `PmxBone.flags`. */
export const BONE_FLAG = {
  tailIsBone: 0x0001,
  rotatable: 0x0002,
  translatable: 0x0004,
  visible: 0x0008,
  enabled: 0x0010,
  ik: 0x0020,
  inheritRotation: 0x0100,
  inheritTranslation: 0x0200,
  fixedAxis: 0x0400,
  localAxes: 0x0800,
  physicsAfterDeform: 0x1000,
  externalParent: 0x2000,
} as const

export interface PmxBone {
  name: string
  englishName: string
  position: [number, number, number]
  parentIndex: number
  layer: number
  flags: number
  /** Where the bone points, as a bone index or a local offset — never both. */
  tailIndex: number
  tailOffset: [number, number, number] | null
  inherit: { parentIndex: number; influence: number } | null
  fixedAxis: [number, number, number] | null
  localAxes: { x: [number, number, number]; z: [number, number, number] } | null
  externalParentKey: number
  ik: PmxIk | null
}

/**
 * Morphs, narrowed to the ones a companion can act on.
 *
 * `vertex` drives every expression worth having, `group` composes them, and
 * `bone` is how some models blink or open a mouth. The rest (UV, material,
 * flip, impulse) are parsed so the offsets can be skipped correctly and are
 * kept as a bare record — enough to list them, not enough to apply them.
 */
export type PmxMorph =
  | {
      kind: 'vertex'
      name: string
      englishName: string
      panel: number
      /** Vertex ids this morph moves, and their offsets, in file order. */
      indices: Uint32Array
      offsets: Float32Array
    }
  | {
      kind: 'group'
      name: string
      englishName: string
      panel: number
      members: Array<{ morphIndex: number; influence: number }>
    }
  | {
      kind: 'bone'
      name: string
      englishName: string
      panel: number
      offsets: Array<{
        boneIndex: number
        translation: [number, number, number]
        rotation: [number, number, number, number]
      }>
    }
  | {
      kind: 'other'
      name: string
      englishName: string
      panel: number
      /** The raw PMX morph type, so an unsupported morph can still be named. */
      type: number
    }

export interface PmxRigidBody {
  name: string
  boneIndex: number
  group: number
  collisionMask: number
  shape: 'sphere' | 'box' | 'capsule'
  size: [number, number, number]
  position: [number, number, number]
  rotation: [number, number, number]
  mass: number
  linearDamping: number
  angularDamping: number
  restitution: number
  friction: number
  /**
   * 0 follows its bone, 1 and 2 are simulated. The companion has no physics
   * engine, but "this bone was meant to move on its own" is exactly the hint
   * the hair and skirt springs need.
   */
  physicsMode: 0 | 1 | 2
}

export interface PmxJoint {
  name: string
  type: number
  rigidBodyA: number
  rigidBodyB: number
  position: [number, number, number]
  rotation: [number, number, number]
}

export interface PmxModel {
  header: PmxHeader
  info: PmxInfo
  geometry: PmxGeometry
  texturePaths: string[]
  materials: PmxMaterial[]
  bones: PmxBone[]
  morphs: PmxMorph[]
  rigidBodies: PmxRigidBody[]
  joints: PmxJoint[]
}

const MAGIC = 'PMX '

/** Thrown for anything that is not a PMX file we can read, with the reason. */
export class PmxParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PmxParseError'
  }
}

class Reader {
  private view: DataView
  private bytes: Uint8Array
  offset = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.bytes = new Uint8Array(buffer)
  }

  /** Guards every read: a truncated file should say so, not read garbage. */
  private need(count: number): number {
    const at = this.offset
    if (at + count > this.view.byteLength) {
      throw new PmxParseError(
        `The file ends mid-record — wanted ${count} more bytes at offset ${at}, ${
          this.view.byteLength - at
        } left.`,
      )
    }
    this.offset = at + count
    return at
  }

  u8(): number {
    return this.view.getUint8(this.need(1))
  }

  i8(): number {
    return this.view.getInt8(this.need(1))
  }

  u16(): number {
    return this.view.getUint16(this.need(2), true)
  }

  i16(): number {
    return this.view.getInt16(this.need(2), true)
  }

  u32(): number {
    return this.view.getUint32(this.need(4), true)
  }

  i32(): number {
    return this.view.getInt32(this.need(4), true)
  }

  f32(): number {
    return this.view.getFloat32(this.need(4), true)
  }

  vec2(): [number, number] {
    return [this.f32(), this.f32()]
  }

  vec3(): [number, number, number] {
    return [this.f32(), this.f32(), this.f32()]
  }

  vec4(): [number, number, number, number] {
    return [this.f32(), this.f32(), this.f32(), this.f32()]
  }

  skip(count: number): void {
    this.need(count)
  }

  /** A count that must be a sane array length before it is trusted. */
  count(what: string): number {
    const value = this.i32()
    if (value < 0) throw new PmxParseError(`Negative ${what} count (${value}).`)
    return value
  }

  slice(length: number): Uint8Array {
    const at = this.need(length)
    return this.bytes.subarray(at, at + length)
  }

  /**
   * Signed index. -1 means "none" throughout PMX, which is why these are read
   * as signed even though a vertex index never is.
   */
  index(size: 1 | 2 | 4): number {
    if (size === 1) return this.i8()
    if (size === 2) return this.i16()
    return this.i32()
  }

  /** Vertex indices are unsigned: a 2-byte file addresses 65535, not 32767. */
  vertexIndex(size: 1 | 2 | 4): number {
    if (size === 1) return this.u8()
    if (size === 2) return this.u16()
    return this.u32()
  }
}

function readText(reader: Reader, decoder: TextDecoder): string {
  const length = reader.count('text')
  if (length === 0) return ''
  return decoder.decode(reader.slice(length))
}

function indexSize(value: number, what: string): 1 | 2 | 4 {
  if (value === 1 || value === 2 || value === 4) return value
  throw new PmxParseError(`${what} index size is ${value}; PMX allows 1, 2 or 4.`)
}

function readHeader(reader: Reader): PmxHeader {
  const magic = String.fromCharCode(...reader.slice(4))
  if (magic !== MAGIC) {
    throw new PmxParseError(
      `Not a PMX file — it starts with ${JSON.stringify(magic)} rather than "PMX ". ` +
        'PMD models (the older MMD format) are not supported.',
    )
  }

  const version = reader.f32()
  if (version < 2 || version >= 3) {
    throw new PmxParseError(`PMX ${version.toFixed(1)} is not supported; this reads 2.0 and 2.1.`)
  }

  const globalCount = reader.u8()
  if (globalCount < 8) {
    throw new PmxParseError(`Header declares ${globalCount} globals; PMX 2.x needs at least 8.`)
  }
  const globals = reader.slice(globalCount)

  return {
    version,
    encoding: globals[0] === 0 ? 'utf-16le' : 'utf-8',
    additionalUvCount: globals[1],
    vertexIndexSize: indexSize(globals[2], 'Vertex'),
    textureIndexSize: indexSize(globals[3], 'Texture'),
    materialIndexSize: indexSize(globals[4], 'Material'),
    boneIndexSize: indexSize(globals[5], 'Bone'),
    morphIndexSize: indexSize(globals[6], 'Morph'),
    rigidBodyIndexSize: indexSize(globals[7], 'Rigid body'),
  }
}

/** BDEF1/2/4, SDEF and QDEF, all flattened into four influences. */
function readWeights(
  reader: Reader,
  boneIndexSize: 1 | 2 | 4,
  skinIndices: Uint16Array,
  skinWeights: Float32Array,
  vertex: number,
): void {
  const type = reader.u8()
  const base = vertex * 4

  const put = (slot: number, bone: number, weight: number) => {
    // -1 is "no bone". Pointing it at the root with zero weight keeps the
    // attribute in range for the shader, which cannot express "unused".
    skinIndices[base + slot] = bone < 0 ? 0 : bone
    skinWeights[base + slot] = bone < 0 ? 0 : weight
  }

  switch (type) {
    case 0: {
      put(0, reader.index(boneIndexSize), 1)
      break
    }
    case 1: {
      const a = reader.index(boneIndexSize)
      const b = reader.index(boneIndexSize)
      const weight = reader.f32()
      put(0, a, weight)
      put(1, b, 1 - weight)
      break
    }
    case 2:
    case 4: {
      const bones = [
        reader.index(boneIndexSize),
        reader.index(boneIndexSize),
        reader.index(boneIndexSize),
        reader.index(boneIndexSize),
      ]
      for (let slot = 0; slot < 4; slot++) put(slot, bones[slot], reader.f32())
      break
    }
    case 3: {
      const a = reader.index(boneIndexSize)
      const b = reader.index(boneIndexSize)
      const weight = reader.f32()
      put(0, a, weight)
      put(1, b, 1 - weight)
      // C, R0 and R1 — the spherical correction this reader does not apply.
      reader.skip(36)
      break
    }
    default:
      throw new PmxParseError(`Unknown vertex weight type ${type} on vertex ${vertex}.`)
  }
}

function readGeometry(reader: Reader, header: PmxHeader): PmxGeometry {
  const vertexCount = reader.count('vertex')

  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const skinIndices = new Uint16Array(vertexCount * 4)
  const skinWeights = new Float32Array(vertexCount * 4)
  const edgeScales = new Float32Array(vertexCount)

  const extraUvBytes = header.additionalUvCount * 16

  for (let i = 0; i < vertexCount; i++) {
    positions[i * 3] = reader.f32()
    positions[i * 3 + 1] = reader.f32()
    positions[i * 3 + 2] = reader.f32()
    normals[i * 3] = reader.f32()
    normals[i * 3 + 1] = reader.f32()
    normals[i * 3 + 2] = reader.f32()
    uvs[i * 2] = reader.f32()
    uvs[i * 2 + 1] = reader.f32()
    if (extraUvBytes) reader.skip(extraUvBytes)
    readWeights(reader, header.boneIndexSize, skinIndices, skinWeights, i)
    edgeScales[i] = reader.f32()
  }

  const indexCount = reader.count('face index')
  if (indexCount % 3 !== 0) {
    throw new PmxParseError(`Face list holds ${indexCount} indices, which is not a whole triangle.`)
  }
  const indices = new Uint32Array(indexCount)
  for (let i = 0; i < indexCount; i++) {
    const index = reader.vertexIndex(header.vertexIndexSize)
    if (index >= vertexCount) {
      throw new PmxParseError(`Face index ${index} points past the ${vertexCount} vertices.`)
    }
    indices[i] = index
  }

  return { vertexCount, positions, normals, uvs, skinIndices, skinWeights, edgeScales, indices }
}

const SPHERE_MODES: PmxSphereMode[] = ['none', 'multiply', 'add', 'sub-texture']

function readMaterials(reader: Reader, header: PmxHeader, decoder: TextDecoder): PmxMaterial[] {
  const count = reader.count('material')
  const materials: PmxMaterial[] = []

  for (let i = 0; i < count; i++) {
    const name = readText(reader, decoder)
    const englishName = readText(reader, decoder)
    const diffuse = reader.vec4()
    const specular = reader.vec3()
    const shininess = reader.f32()
    const ambient = reader.vec3()
    const flags = reader.u8()
    const edgeColor = reader.vec4()
    const edgeSize = reader.f32()
    const textureIndex = reader.index(header.textureIndexSize)
    const sphereTextureIndex = reader.index(header.textureIndexSize)
    const sphereMode = SPHERE_MODES[reader.u8()] ?? 'none'
    const toonShared = reader.u8() === 1
    // A shared toon is one of MMD's ten built-in ramps and is a single byte;
    // a per-model toon is an ordinary texture index and is index-sized.
    const toonIndex = toonShared ? reader.u8() : reader.index(header.textureIndexSize)
    const memo = readText(reader, decoder)
    const indexCount = reader.count('material face index')

    materials.push({
      name,
      englishName,
      diffuse,
      specular,
      shininess,
      ambient,
      flags,
      edgeColor,
      edgeSize,
      textureIndex,
      sphereTextureIndex,
      sphereMode,
      toonShared,
      toonIndex,
      memo,
      indexCount,
    })
  }

  return materials
}

function readBones(reader: Reader, header: PmxHeader, decoder: TextDecoder): PmxBone[] {
  const count = reader.count('bone')
  const bones: PmxBone[] = []

  for (let i = 0; i < count; i++) {
    const name = readText(reader, decoder)
    const englishName = readText(reader, decoder)
    const position = reader.vec3()
    const parentIndex = reader.index(header.boneIndexSize)
    const layer = reader.i32()
    const flags = reader.u16()

    let tailIndex = -1
    let tailOffset: [number, number, number] | null = null
    if (flags & BONE_FLAG.tailIsBone) tailIndex = reader.index(header.boneIndexSize)
    else tailOffset = reader.vec3()

    let inherit: PmxBone['inherit'] = null
    if (flags & (BONE_FLAG.inheritRotation | BONE_FLAG.inheritTranslation)) {
      inherit = {
        parentIndex: reader.index(header.boneIndexSize),
        influence: reader.f32(),
      }
    }

    const fixedAxis = flags & BONE_FLAG.fixedAxis ? reader.vec3() : null
    const localAxes =
      flags & BONE_FLAG.localAxes ? { x: reader.vec3(), z: reader.vec3() } : null
    const externalParentKey = flags & BONE_FLAG.externalParent ? reader.i32() : -1

    let ik: PmxIk | null = null
    if (flags & BONE_FLAG.ik) {
      const targetIndex = reader.index(header.boneIndexSize)
      const iterations = reader.i32()
      const limitAngle = reader.f32()
      const linkCount = reader.count('IK link')
      const links: PmxIkLink[] = []
      for (let link = 0; link < linkCount; link++) {
        const boneIndex = reader.index(header.boneIndexSize)
        const hasLimits = reader.u8() === 1
        links.push({
          boneIndex,
          limits: hasLimits ? { min: reader.vec3(), max: reader.vec3() } : null,
        })
      }
      ik = { targetIndex, iterations, limitAngle, links }
    }

    bones.push({
      name,
      englishName,
      position,
      parentIndex,
      layer,
      flags,
      tailIndex,
      tailOffset,
      inherit,
      fixedAxis,
      localAxes,
      externalParentKey,
      ik,
    })
  }

  return bones
}

function readMorphs(reader: Reader, header: PmxHeader, decoder: TextDecoder): PmxMorph[] {
  const count = reader.count('morph')
  const morphs: PmxMorph[] = []

  for (let i = 0; i < count; i++) {
    const name = readText(reader, decoder)
    const englishName = readText(reader, decoder)
    const panel = reader.u8()
    const type = reader.u8()
    const offsetCount = reader.count('morph offset')

    switch (type) {
      case 0: {
        const members: Array<{ morphIndex: number; influence: number }> = []
        for (let n = 0; n < offsetCount; n++) {
          members.push({
            morphIndex: reader.index(header.morphIndexSize),
            influence: reader.f32(),
          })
        }
        morphs.push({ kind: 'group', name, englishName, panel, members })
        break
      }
      case 1: {
        const indices = new Uint32Array(offsetCount)
        const offsets = new Float32Array(offsetCount * 3)
        for (let n = 0; n < offsetCount; n++) {
          indices[n] = reader.vertexIndex(header.vertexIndexSize)
          offsets[n * 3] = reader.f32()
          offsets[n * 3 + 1] = reader.f32()
          offsets[n * 3 + 2] = reader.f32()
        }
        morphs.push({ kind: 'vertex', name, englishName, panel, indices, offsets })
        break
      }
      case 2: {
        const offsets: Array<{
          boneIndex: number
          translation: [number, number, number]
          rotation: [number, number, number, number]
        }> = []
        for (let n = 0; n < offsetCount; n++) {
          offsets.push({
            boneIndex: reader.index(header.boneIndexSize),
            translation: reader.vec3(),
            rotation: reader.vec4(),
          })
        }
        morphs.push({ kind: 'bone', name, englishName, panel, offsets })
        break
      }
      case 3:
      case 4:
      case 5:
      case 6:
      case 7: {
        // UV morphs: a vertex index and a vec4 per offset.
        for (let n = 0; n < offsetCount; n++) {
          reader.vertexIndex(header.vertexIndexSize)
          reader.skip(16)
        }
        morphs.push({ kind: 'other', name, englishName, panel, type })
        break
      }
      case 8: {
        for (let n = 0; n < offsetCount; n++) {
          reader.index(header.materialIndexSize)
          // Blend mode, then 28 floats: diffuse(4), specular(3) + power(1),
          // ambient(3), edge colour(4) + size(1), and the texture, sphere and
          // toon tints (4 each).
          reader.skip(1 + 4 * 28)
        }
        morphs.push({ kind: 'other', name, englishName, panel, type })
        break
      }
      case 9: {
        for (let n = 0; n < offsetCount; n++) {
          reader.index(header.morphIndexSize)
          reader.skip(4)
        }
        morphs.push({ kind: 'other', name, englishName, panel, type })
        break
      }
      case 10: {
        for (let n = 0; n < offsetCount; n++) {
          reader.index(header.rigidBodyIndexSize)
          reader.skip(1 + 4 * 6)
        }
        morphs.push({ kind: 'other', name, englishName, panel, type })
        break
      }
      default:
        throw new PmxParseError(`Unknown morph type ${type} on morph ${JSON.stringify(name)}.`)
    }
  }

  return morphs
}

/** Display frames only group bones and morphs for MMD's own panels. */
function skipDisplayFrames(reader: Reader, header: PmxHeader, decoder: TextDecoder): void {
  const count = reader.count('display frame')
  for (let i = 0; i < count; i++) {
    readText(reader, decoder)
    readText(reader, decoder)
    reader.skip(1)
    const items = reader.count('display frame item')
    for (let n = 0; n < items; n++) {
      const target = reader.u8()
      reader.index(target === 1 ? header.morphIndexSize : header.boneIndexSize)
    }
  }
}

const SHAPES = ['sphere', 'box', 'capsule'] as const

function readRigidBodies(
  reader: Reader,
  header: PmxHeader,
  decoder: TextDecoder,
): PmxRigidBody[] {
  const count = reader.count('rigid body')
  const bodies: PmxRigidBody[] = []

  for (let i = 0; i < count; i++) {
    const name = readText(reader, decoder)
    readText(reader, decoder)
    const boneIndex = reader.index(header.boneIndexSize)
    const group = reader.u8()
    const collisionMask = reader.u16()
    const shape = SHAPES[reader.u8()] ?? 'sphere'
    const size = reader.vec3()
    const position = reader.vec3()
    const rotation = reader.vec3()
    const mass = reader.f32()
    const linearDamping = reader.f32()
    const angularDamping = reader.f32()
    const restitution = reader.f32()
    const friction = reader.f32()
    const mode = reader.u8()

    bodies.push({
      name,
      boneIndex,
      group,
      collisionMask,
      shape,
      size,
      position,
      rotation,
      mass,
      linearDamping,
      angularDamping,
      restitution,
      friction,
      physicsMode: mode === 1 || mode === 2 ? mode : 0,
    })
  }

  return bodies
}

function readJoints(reader: Reader, header: PmxHeader, decoder: TextDecoder): PmxJoint[] {
  const count = reader.count('joint')
  const joints: PmxJoint[] = []

  for (let i = 0; i < count; i++) {
    const name = readText(reader, decoder)
    readText(reader, decoder)
    const type = reader.u8()
    const rigidBodyA = reader.index(header.rigidBodyIndexSize)
    const rigidBodyB = reader.index(header.rigidBodyIndexSize)
    const position = reader.vec3()
    const rotation = reader.vec3()
    // Translation and rotation limits, then the spring constants.
    reader.skip(4 * 18)
    joints.push({ name, type, rigidBodyA, rigidBodyB, position, rotation })
  }

  return joints
}

/**
 * Reads a `.pmx` file.
 *
 * Everything up to and including joints is read; PMX 2.1 soft bodies come
 * after that and are ignored, as is any trailing data — a section this reader
 * does not need is not a reason to reject a model that is otherwise fine.
 */
export function parsePmx(buffer: ArrayBuffer): PmxModel {
  const reader = new Reader(buffer)
  const header = readHeader(reader)
  const decoder = new TextDecoder(header.encoding)

  const info: PmxInfo = {
    name: readText(reader, decoder),
    englishName: readText(reader, decoder),
    comment: readText(reader, decoder),
    englishComment: readText(reader, decoder),
  }

  const geometry = readGeometry(reader, header)

  const textureCount = reader.count('texture')
  const texturePaths: string[] = []
  for (let i = 0; i < textureCount; i++) texturePaths.push(readText(reader, decoder))

  const materials = readMaterials(reader, header, decoder)
  const bones = readBones(reader, header, decoder)

  if (bones.length > 0xffff) {
    throw new PmxParseError(`${bones.length} bones is past the 65535 a skinned mesh can address.`)
  }

  const morphs = readMorphs(reader, header, decoder)
  skipDisplayFrames(reader, header, decoder)

  // Rigid bodies and joints are the last sections this reader cares about, and
  // a model can legitimately stop before them.
  let rigidBodies: PmxRigidBody[] = []
  let joints: PmxJoint[] = []
  try {
    rigidBodies = readRigidBodies(reader, header, decoder)
    joints = readJoints(reader, header, decoder)
  } catch (error) {
    if (!(error instanceof PmxParseError)) throw error
    rigidBodies = []
    joints = []
  }

  const totalMaterialIndices = materials.reduce((sum, material) => sum + material.indexCount, 0)
  if (totalMaterialIndices !== geometry.indices.length) {
    throw new PmxParseError(
      `Materials claim ${totalMaterialIndices} face indices but the mesh has ${geometry.indices.length}.`,
    )
  }

  return { header, info, geometry, texturePaths, materials, bones, morphs, rigidBodies, joints }
}

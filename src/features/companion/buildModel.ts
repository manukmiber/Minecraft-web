/**
 * From parsed PMX to something the renderer can draw.
 *
 * The one substantive transformation is the coordinate system. MMD is
 * left-handed with the character facing -Z; three.js is right-handed with the
 * camera looking down -Z. Negating Z on every position and normal expresses
 * the same model in three's convention and turns the character to face the
 * camera — and because negating one axis reverses triangle orientation, every
 * face is rewound at the same time. It is done here, once, so the parser can
 * stay a plain description of the file.
 *
 * The result is also normalised: scaled to one unit tall, centred, with the
 * feet on y = 0. Every model then arrives at the same size regardless of the
 * units its author worked in, and the camera never has to be re-aimed.
 */

import * as THREE from 'three'

import { resolveTexture, type ModelBundle } from '../../core/companion/bundle'
import { parsePmx, type PmxModel } from '../../core/companion/pmx'
import { buildMaterials, type BuiltMaterials, type OutlineScale } from './materials'
import { decodeTexture, type DecodedTexture } from './textures'

/** One expression, flattened to the vertices it moves. */
export interface VertexMorph {
  name: string
  indices: Uint32Array
  /** Offsets in three's coordinate system, three floats per index. */
  offsets: Float32Array
}

export interface CompanionAsset {
  source: PmxModel
  /** Normalised: one unit tall, feet at the origin, facing +Z. */
  root: THREE.Group
  mesh: THREE.SkinnedMesh
  outline: THREE.SkinnedMesh
  skeleton: THREE.Skeleton
  /** Parallel to `source.bones`, so PMX data and scene bones line up by index. */
  boneList: THREE.Bone[]
  bones: Map<string, THREE.Bone>
  /** Morph name to the vertex morphs it drives, group morphs already resolved. */
  morphs: Map<string, Array<{ morph: VertexMorph; influence: number }>>
  /** The unposed positions, kept so morphs can be recomputed from scratch. */
  basePositions: Float32Array
  outlineScale: OutlineScale
  /** Anything skipped on the way in, for the import dialog to show. */
  warnings: string[]
  dispose(): void
}

/** Every texture slot any material points at, decoded once and shared. */
async function decodeTextures(
  model: PmxModel,
  bundle: ModelBundle,
  warnings: string[],
): Promise<Map<number, DecodedTexture>> {
  const wanted = new Set<number>()
  for (const material of model.materials) {
    if (material.textureIndex >= 0) wanted.add(material.textureIndex)
    if (material.sphereTextureIndex >= 0) wanted.add(material.sphereTextureIndex)
    if (!material.toonShared && material.toonIndex >= 0) wanted.add(material.toonIndex)
  }

  const decoded = new Map<number, DecodedTexture>()
  for (const index of wanted) {
    const path = model.texturePaths[index]
    if (!path) continue
    const bytes = resolveTexture(bundle, path)
    if (!bytes) {
      warnings.push(`Missing texture: ${path}`)
      continue
    }
    const texture = await decodeTexture(bytes, path)
    if (!texture) {
      warnings.push(`Could not decode ${path}`)
      continue
    }
    decoded.set(index, texture)
  }

  return decoded
}

function buildGeometry(model: PmxModel): THREE.BufferGeometry {
  const { geometry: source } = model

  const positions = new Float32Array(source.positions)
  const normals = new Float32Array(source.normals)
  for (let i = 2; i < positions.length; i += 3) {
    positions[i] = -positions[i]
    normals[i] = -normals[i]
  }

  // Negating an axis mirrors the mesh, so each triangle is rewound to keep its
  // front face pointing outwards.
  const indices = new Uint32Array(source.indices.length)
  for (let i = 0; i < source.indices.length; i += 3) {
    indices[i] = source.indices[i]
    indices[i + 1] = source.indices[i + 2]
    indices[i + 2] = source.indices[i + 1]
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(source.uvs), 2))
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(source.skinIndices), 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(source.skinWeights), 4))
  geometry.setAttribute('edgeScale', new THREE.BufferAttribute(new Float32Array(source.edgeScales), 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))

  // One draw group per material, in the order the materials were declared —
  // which is also the order MMD draws them in.
  let start = 0
  model.materials.forEach((material, index) => {
    geometry.addGroup(start, material.indexCount, index)
    start += material.indexCount
  })

  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function buildBones(model: PmxModel): { bones: THREE.Bone[]; roots: THREE.Bone[] } {
  const bones = model.bones.map((source) => {
    const bone = new THREE.Bone()
    bone.name = source.name
    return bone
  })

  const roots: THREE.Bone[] = []
  model.bones.forEach((source, index) => {
    const bone = bones[index]
    const parent = source.parentIndex >= 0 ? model.bones[source.parentIndex] : null
    // PMX stores every bone in model space; three wants each one relative to
    // its parent.
    bone.position.set(
      source.position[0] - (parent?.position[0] ?? 0),
      source.position[1] - (parent?.position[1] ?? 0),
      -(source.position[2] - (parent?.position[2] ?? 0)),
    )
    if (parent) bones[source.parentIndex].add(bone)
    else roots.push(bone)
  })

  return { bones, roots }
}

/**
 * Flattens the morph list into something addressable by name.
 *
 * A group morph is expanded into the vertex morphs it drives, so callers only
 * ever deal with vertex offsets. Only one level of grouping is followed:
 * groups of groups are legal in the format and unheard of in practice.
 */
function buildMorphs(model: PmxModel): CompanionAsset['morphs'] {
  const vertexMorphs = new Map<number, VertexMorph>()

  model.morphs.forEach((morph, index) => {
    if (morph.kind !== 'vertex') return
    const offsets = new Float32Array(morph.offsets)
    for (let i = 2; i < offsets.length; i += 3) offsets[i] = -offsets[i]
    vertexMorphs.set(index, { name: morph.name, indices: morph.indices, offsets })
  })

  const byName: CompanionAsset['morphs'] = new Map()

  model.morphs.forEach((morph, index) => {
    if (morph.kind === 'vertex') {
      const target = vertexMorphs.get(index)
      if (target) byName.set(morph.name, [{ morph: target, influence: 1 }])
      return
    }
    if (morph.kind !== 'group') return

    const members = morph.members
      .map((member) => {
        const target = vertexMorphs.get(member.morphIndex)
        return target ? { morph: target, influence: member.influence } : null
      })
      .filter((entry): entry is { morph: VertexMorph; influence: number } => entry !== null)

    if (members.length > 0) byName.set(morph.name, members)
  })

  return byName
}

/**
 * Reads a bundle all the way to a scene graph.
 *
 * Asynchronous only because image decoding is: the parse and the buffer work
 * are synchronous and take a few tens of milliseconds even on a 67k-vertex
 * model.
 */
export async function buildCompanionModel(bundle: ModelBundle): Promise<CompanionAsset> {
  const warnings: string[] = []
  const source = parsePmx(bundle.modelBytes)

  const textures = await decodeTextures(source, bundle, warnings)
  const outlineScale: OutlineScale = { value: 1 }
  const materials: BuiltMaterials = buildMaterials(source, textures, outlineScale)

  const geometry = buildGeometry(source)
  const { bones, roots } = buildBones(source)

  const mesh = new THREE.SkinnedMesh(geometry, materials.surface)
  mesh.name = source.info.name || 'companion'
  mesh.frustumCulled = false
  for (const root of roots) mesh.add(root)

  // The outline shares the geometry and the skeleton outright: it is the same
  // mesh, drawn back-faces-out one shader step wider.
  const outline = new THREE.SkinnedMesh(geometry, materials.outline)
  outline.name = `${mesh.name} outline`
  outline.frustumCulled = false
  outline.renderOrder = -1

  const bounds = geometry.boundingBox ?? new THREE.Box3()
  const size = bounds.getSize(new THREE.Vector3())
  const height = size.y || 1
  const centre = bounds.getCenter(new THREE.Vector3())

  // One unit tall, feet on the floor, centred left-to-right and front-to-back.
  const normalise = new THREE.Group()
  normalise.name = 'companion-normalise'
  normalise.scale.setScalar(1 / height)
  normalise.position.set(-centre.x / height, -bounds.min.y / height, -centre.z / height)
  normalise.add(mesh, outline)

  const root = new THREE.Group()
  root.name = 'companion'
  root.add(normalise)

  // Binding has to happen with the graph already assembled. A skeleton takes
  // its rest pose from the bones' world matrices, and an attached bind mode
  // compares those against the mesh's own world matrix every frame — bind it
  // before the normalising group exists and the scale lands on the model
  // twice.
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  mesh.bind(skeleton)
  outline.bind(skeleton)

  const boneMap = new Map<string, THREE.Bone>()
  for (const bone of bones) if (!boneMap.has(bone.name)) boneMap.set(bone.name, bone)

  return {
    source,
    root,
    mesh,
    outline,
    skeleton,
    boneList: bones,
    bones: boneMap,
    morphs: buildMorphs(source),
    basePositions: new Float32Array(geometry.getAttribute('position').array as Float32Array),
    outlineScale,
    warnings,
    dispose() {
      geometry.dispose()
      materials.dispose()
      for (const texture of textures.values()) texture.texture.dispose()
      skeleton.dispose()
    },
  }
}

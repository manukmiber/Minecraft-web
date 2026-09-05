/**
 * The 3D preview.
 *
 * What it draws comes from the same data the pack ships: block faces are the
 * atlas textures, and an entity is built from the very geometry spec that gets
 * written to the `.geo.json`. So a wrong-looking preview means a wrong-looking
 * mob in game, not a preview bug.
 */

import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Boxes } from 'lucide-react'

import { EmptyState } from '../../app/ui/primitives'
import { getBodyPreset } from '../../core/generators/geometry'
import type { BoneSpec, GeometrySpec } from '../../core/generators/geometry'
import type { ContentNode } from '../../core/model/types'
import { getKind } from '../../core/registry/types'
import { useProject } from '../../state/project'
import { vanillaTexture, vanillaTextureUrl } from '../../core/data/vanillaTextures'
import { blockColor } from '../editor-form/LayerGridField'
import { filledCells, gridSignature, voxelGrid } from '../../core/kinds/voxels'
import { useAssetUrl } from '../textures/useAssetUrl'
import { applyBoxUv } from './boxUv'
import { makeMissingTexture, usePixelTexture } from './textures'

const UNIT = 1 / 16

export function Preview3D({ node }: { node: ContentNode }) {
  const kind = getKind(node.kind)
  if (!kind || kind.preview.type === 'none') {
    return (
      <div className="grid h-full place-items-center p-4">
        <EmptyState
          icon={<Boxes size={20} />}
          title="Nothing to show in 3D"
          detail="Recipes and loot tables have no shape of their own. The crafting grid above is their preview."
        />
      </div>
    )
  }

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [2.4, 2, 3.2], fov: 42 }}
      className="size-full"
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0b0e14']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[4, 7, 4]} intensity={1.5} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.5} />

      <Suspense fallback={null}>
        <AutoFrame
          // Content ranges from a single block to a scarecrow nearly three
          // blocks tall and a crop laid out as a row of stages, so the camera is
          // framed from the model's real bounds. These are the fields that
          // change the silhouette, so a change to any of them re-frames.
          signature={`${node.id}:${String(node.data.bodyPreset)}:${String(node.data.scale)}:${String(node.data.stages)}:${previewSignature(node)}`}
        >
          <Scene node={node} />
        </AutoFrame>
      </Suspense>

      <Grid
        args={[16, 16]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#242c3b"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#313b4d"
        position={[0, -0.001, 0]}
        fadeDistance={16}
        fadeStrength={1.4}
        infiniteGrid
      />

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={0.6} maxDistance={24} />
    </Canvas>
  )
}

/**
 * Frames the camera on whatever it wraps. Measuring beats guessing: a fixed
 * camera distance either buries a one-block item or cuts the top off a tall mob.
 *
 * The fit runs on a drawn frame rather than in an effect, because on mount the
 * meshes are not in the scene graph yet and OrbitControls has not registered
 * itself. It also re-runs when the canvas is resized — the preview panel slides
 * open, so an early measurement would otherwise be taken against a sliver of a
 * viewport and push the camera absurdly far back.
 */
function AutoFrame({ signature, children }: { signature: string; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const pending = useRef(true)
  const lastSize = useRef({ width: 0, height: 0 })

  useEffect(() => {
    pending.current = true
  }, [signature])

  useFrame(({ camera, controls, size }) => {
    // A canvas mid-animation reports a sliver; wait for a real viewport.
    if (size.width < 80 || size.height < 80) return

    if (
      Math.abs(size.width - lastSize.current.width) > 2 ||
      Math.abs(size.height - lastSize.current.height) > 2
    ) {
      pending.current = true
    }
    if (!pending.current) return

    const group = ref.current
    if (!group) return

    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return

    const bounds = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const perspective = camera as THREE.PerspectiveCamera
    const fov = (perspective.fov * Math.PI) / 180

    // Fit both axes: the preview panel is narrow, so a wide model such as a row
    // of crop stages is usually constrained horizontally, not vertically.
    const aspect = size.width / size.height
    const verticalReach = Math.max(bounds.y, 0.4) / 2 / Math.tan(fov / 2)
    const horizontalReach =
      Math.max(bounds.x, bounds.z, 0.4) / 2 / Math.tan(fov / 2) / Math.max(aspect, 0.35)
    const distance = Math.max(verticalReach, horizontalReach) * 1.75

    camera.position.set(
      center.x + distance * 0.58,
      center.y + distance * 0.38,
      center.z + distance * 0.72,
    )
    camera.lookAt(center)
    perspective.near = Math.max(0.01, distance / 200)
    perspective.far = distance * 60
    camera.updateProjectionMatrix()

    const orbit = controls as { target: THREE.Vector3; update(): void } | null
    if (orbit?.target) {
      orbit.target.copy(center)
      orbit.update()
    }

    lastSize.current = { width: size.width, height: size.height }
    pending.current = false
  })

  return <group ref={ref}>{children}</group>
}

function Scene({ node }: { node: ContentNode }) {
  const kind = getKind(node.kind)!
  const preview = kind.preview

  switch (preview.type) {
    case 'block':
      return <BlockPreview node={node} />
    case 'item':
      return <ItemPreview node={node} slot={preview.slot} />
    case 'crop':
      return <CropPreview node={node} slotPrefix={preview.slotPrefix} />
    case 'entity':
      return <EntityPreview node={node} slot={preview.textureSlot} />
    case 'structure':
      return <StructurePreview node={node} gridKey={preview.gridKey} />
    default:
      return null
  }
}

/**
 * Anything else that changes a node's silhouette and so needs the camera
 * reframed. A painted structure grows as you work on it — without this the view
 * stays framed on the first block and you end up inside the walls.
 */
function previewSignature(node: ContentNode): string {
  const preview = getKind(node.kind)?.preview
  if (preview?.type !== 'structure') return ''
  return gridSignature(voxelGrid(node.data[preview.gridKey]))
}

/** Resolves a texture slot to a blob URL through the project's asset list. */
function useSlotUrl(node: ContentNode, slotKey: string): string | null {
  const assets = useProject((s) => s.project.assets)
  const assetId = node.textures[slotKey] ?? null
  const asset = assetId ? (assets.find((a) => a.id === assetId) ?? null) : null
  return useAssetUrl(asset)
}

function BlockPreview({ node }: { node: ContentNode }) {
  const allUrl = useSlotUrl(node, 'main')
  const upUrl = useSlotUrl(node, 'up')
  const downUrl = useSlotUrl(node, 'down')

  const all = usePixelTexture(allUrl)
  const up = usePixelTexture(upUrl)
  const down = usePixelTexture(downUrl)
  const missing = useMemo(() => makeMissingTexture(), [])
  useEffect(() => () => missing.dispose(), [missing])

  const pick = (specific: THREE.Texture | null) => specific ?? all ?? missing
  const transparent = node.data.renderMethod !== 'opaque'

  // three.js material order: +X, -X, +Y, -Y, +Z, -Z.
  const materials = useMemo(
    () =>
      [pick(null), pick(null), pick(up), pick(down), pick(null), pick(null)].map(
        (map) =>
          new THREE.MeshLambertMaterial({
            map,
            transparent,
            alphaTest: transparent ? 0.35 : 0,
          }),
      ),
    [all, up, down, missing, transparent],
  )

  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])

  return (
    <Spin>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow material={materials}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
    </Spin>
  )
}

function ItemPreview({ node, slot }: { node: ContentNode; slot: string }) {
  const url = useSlotUrl(node, slot)
  const texture = usePixelTexture(url)
  const missing = useMemo(() => makeMissingTexture(), [])
  useEffect(() => () => missing.dispose(), [missing])

  return (
    <Spin>
      <mesh position={[0, 0.6, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={texture ?? missing}
          transparent
          alphaTest={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </Spin>
  )
}

function CropPreview({ node, slotPrefix }: { node: ContentNode; slotPrefix: string }) {
  const stages = Math.max(2, Math.min(8, Number(node.data.stages) || 4))
  return (
    <group position={[-((stages - 1) * 1.15) / 2, 0, 0]}>
      {Array.from({ length: stages }, (_, index) => (
        <CropStage key={index} node={node} slotKey={`${slotPrefix}${index}`} offset={index * 1.15} />
      ))}
    </group>
  )
}

function CropStage({
  node,
  slotKey,
  offset,
}: {
  node: ContentNode
  slotKey: string
  offset: number
}) {
  const url = useSlotUrl(node, slotKey)
  const texture = usePixelTexture(url)
  const missing = useMemo(() => makeMissingTexture(), [])
  useEffect(() => () => missing.dispose(), [missing])

  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: texture ?? missing,
        transparent: true,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
      }),
    [texture, missing],
  )
  useEffect(() => () => material.dispose(), [material])

  // The game draws a crop as two planes crossed at 45 degrees.
  return (
    <group position={[offset, 0.5, 0]}>
      <mesh rotation={[0, Math.PI / 4, 0]} material={material}>
        <planeGeometry args={[1.4, 1]} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} material={material}>
        <planeGeometry args={[1.4, 1]} />
      </mesh>
    </group>
  )
}

/**
 * The painted structure, as it will actually generate.
 *
 * Cells are grouped by block so each distinct block is one draw and one hook —
 * the texture lookup cannot be done per cell without calling hooks in a loop —
 * and blocks with no texture in this project fall back to the same colour the
 * layer painter uses, so the two views stay recognisably the same build.
 */
function StructurePreview({ node, gridKey }: { node: ContentNode; gridKey: string }) {
  const namespace = useProject((s) => s.project.namespace)

  const groups = useMemo(() => {
    const grid = voxelGrid(node.data[gridKey])
    const [width, , depth] = grid.size
    const byBlock = new Map<string, Array<[number, number, number]>>()

    for (const cell of filledCells(grid)) {
      const list = byBlock.get(cell.block) ?? []
      // Centred on the footprint, matching the default anchor, and sitting on
      // the grid floor rather than straddling it.
      list.push([cell.x - (width - 1) / 2, cell.y + 0.5, cell.z - (depth - 1) / 2])
      byBlock.set(cell.block, list)
    }
    return [...byBlock.entries()]
  }, [node.data, gridKey])

  if (groups.length === 0) {
    return (
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#2b3446" transparent opacity={0.6} />
      </mesh>
    )
  }

  return (
    <group>
      {groups.map(([block, positions]) => (
        <StructureBlocks key={block} block={block} positions={positions} namespace={namespace} />
      ))}
    </group>
  )
}

function StructureBlocks({
  block,
  positions,
  namespace,
}: {
  block: string
  positions: Array<[number, number, number]>
  namespace: string
}) {
  // This project's own blocks wear their own texture; vanilla identifiers wear
  // the Faithful artwork the app ships, and anything neither covers falls back
  // to the painter's colour so the two views still agree.
  const project = useProject((s) => s.project)
  const owner =
    block.startsWith(`${namespace}:`)
      ? project.nodes.find(
          (candidate) =>
            `${namespace}:${candidate.name}` === block &&
            (candidate.kind === 'block' || candidate.kind === 'crop'),
        )
      : undefined
  const assetId = owner ? (owner.textures.main ?? owner.textures.stage0 ?? null) : null
  const asset = assetId ? (project.assets.find((a) => a.id === assetId) ?? null) : null
  const texture = usePixelTexture(useAssetUrl(asset))

  // Faces are only known for blocks; an item identifier painted into a build
  // (a torch, a flower) wears its inventory sprite on every side.
  const vanilla = owner ? null : vanillaTexture(block)
  const top = usePixelTexture(vanilla?.faces ? vanillaTextureUrl(vanilla.faces.top) : null)
  const side = usePixelTexture(vanilla ? vanillaTextureUrl(vanilla.faces?.side ?? vanilla.icon) : null)
  const bottom = usePixelTexture(vanilla?.faces ? vanillaTextureUrl(vanilla.faces.bottom) : null)

  const material = useMemo(() => {
    if (texture) return new THREE.MeshLambertMaterial({ map: texture })
    if (!side) return new THREE.MeshLambertMaterial({ color: new THREE.Color(blockColor(block)) })

    // Glass, leaves and anything cut out of a square need their empty pixels
    // dropped rather than drawn as black, and lit from both sides once you can
    // see through to the far face.
    const cutout = vanilla?.cutout
      ? { transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }
      : {}
    const face = (map: THREE.Texture) => new THREE.MeshLambertMaterial({ map, ...cutout })

    // three.js takes box faces in +x, -x, +y, -y, +z, -z order, so the four
    // walls share one material and the lid and floor get their own.
    const walls = face(side)
    return [walls, walls, face(top ?? side), face(bottom ?? side), walls, walls]
  }, [texture, top, side, bottom, vanilla, block])

  useEffect(
    () => () => {
      for (const one of new Set(Array.isArray(material) ? material : [material])) one.dispose()
    },
    [material],
  )

  return (
    <>
      {positions.map((position, index) => (
        <mesh key={index} position={position} material={material} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </>
  )
}

function EntityPreview({ node, slot }: { node: ContentNode; slot: string }) {
  const url = useSlotUrl(node, slot)
  const texture = usePixelTexture(url)
  const missing = useMemo(() => makeMissingTexture(), [])
  useEffect(() => () => missing.dispose(), [missing])

  const spec = useMemo(
    () => getBodyPreset(String(node.data.bodyPreset ?? 'cube')),
    [node.data.bodyPreset],
  )
  const scale = Number(node.data.scale) || 1

  const material = useMemo(
    () =>
      new THREE.MeshLambertMaterial({
        map: texture ?? missing,
        transparent: true,
        alphaTest: 0.3,
        side: THREE.DoubleSide,
      }),
    [texture, missing],
  )
  useEffect(() => () => material.dispose(), [material])

  const built = useMemo(() => buildEntityGroup(spec, material), [spec, material])
  useEffect(
    () => () => {
      built.root.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose()
      })
    },
    [built],
  )

  return (
    <Spin>
      <VariantCycle variants={built.variants} />
      <primitive object={built.root} scale={scale} />
    </Spin>
  )
}

/**
 * Shows one bone of each variant group at a time, changing every couple of
 * seconds.
 *
 * In game the choice comes from a Molang expression reading what the mob is
 * doing; there is nothing to read in a preview, so it simply cycles. That turns
 * a static bust into the answer to "what do all eight faces actually look like",
 * which is the question you have when you are drawing them.
 */
function VariantCycle({ variants }: { variants: Map<string, THREE.Group[]> }) {
  const elapsed = useRef(0)

  useEffect(() => {
    // Start on the first variant so the preview is not blank before the first
    // frame lands.
    for (const groups of variants.values()) {
      groups.forEach((group, index) => {
        group.visible = index === 0
      })
    }
  }, [variants])

  useFrame((_, delta) => {
    if (variants.size === 0) return
    elapsed.current += delta
    for (const groups of variants.values()) {
      const index = Math.floor(elapsed.current / 1.6) % groups.length
      groups.forEach((group, at) => {
        group.visible = at === index
      })
    }
  })

  return null
}

interface BuiltEntity {
  root: THREE.Group
  /** Variant group name -> the bone groups in it, in declaration order. */
  variants: Map<string, THREE.Group[]>
}

/**
 * Builds the entity from the same bone spec the generator writes, honouring the
 * bone hierarchy and pivots so a rotated bone lands where the game would put it.
 */
function buildEntityGroup(spec: GeometrySpec, material: THREE.Material): BuiltEntity {
  const root = new THREE.Group()
  const bones = new Map<string, THREE.Group>()
  const variants = new Map<string, THREE.Group[]>()

  const attach = (bone: BoneSpec): THREE.Group => {
    const existing = bones.get(bone.name)
    if (existing) return existing

    const group = new THREE.Group()
    group.position.set(bone.pivot[0] * UNIT, bone.pivot[1] * UNIT, bone.pivot[2] * UNIT)
    if (bone.rotation) {
      group.rotation.set(
        THREE.MathUtils.degToRad(bone.rotation[0]),
        THREE.MathUtils.degToRad(bone.rotation[1]),
        THREE.MathUtils.degToRad(bone.rotation[2]),
      )
    }

    for (const cube of bone.cubes) {
      const inflate = cube.inflate ?? 0
      const size: [number, number, number] = [
        cube.size[0] + inflate * 2,
        cube.size[1] + inflate * 2,
        cube.size[2] + inflate * 2,
      ]
      // A zero-thickness cube is a legitimate Bedrock plane; BoxGeometry needs
      // something non-zero to build from, so it gets the thinnest slab that
      // still renders.
      const geometry = new THREE.BoxGeometry(
        Math.max(size[0], 0.0001) * UNIT,
        Math.max(size[1], 0.0001) * UNIT,
        Math.max(size[2], 0.0001) * UNIT,
      )
      applyBoxUv(geometry, {
        u: cube.uv[0],
        v: cube.uv[1],
        width: cube.size[0],
        height: cube.size[1],
        depth: cube.size[2],
        textureWidth: spec.textureWidth,
        textureHeight: spec.textureHeight,
        mirror: cube.mirror,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true

      // Cube origin is its minimum corner; three.js centres its geometry, and
      // the cube is positioned relative to whichever pivot it turns about —
      // its own when it has a rotation, otherwise its bone's.
      const pivot = cube.rotation ? (cube.pivot ?? bone.pivot) : bone.pivot
      mesh.position.set(
        (cube.origin[0] - inflate + size[0] / 2 - pivot[0]) * UNIT,
        (cube.origin[1] - inflate + size[1] / 2 - pivot[1]) * UNIT,
        (cube.origin[2] - inflate + size[2] / 2 - pivot[2]) * UNIT,
      )

      if (cube.rotation) {
        const hinge = new THREE.Group()
        hinge.position.set(
          (pivot[0] - bone.pivot[0]) * UNIT,
          (pivot[1] - bone.pivot[1]) * UNIT,
          (pivot[2] - bone.pivot[2]) * UNIT,
        )
        hinge.rotation.set(
          THREE.MathUtils.degToRad(cube.rotation[0]),
          THREE.MathUtils.degToRad(cube.rotation[1]),
          THREE.MathUtils.degToRad(cube.rotation[2]),
        )
        hinge.add(mesh)
        group.add(hinge)
      } else {
        group.add(mesh)
      }
    }

    bones.set(bone.name, group)

    if (bone.variant) {
      const siblings = variants.get(bone.variant.group) ?? []
      siblings.push(group)
      variants.set(bone.variant.group, siblings)
    }

    const parentSpec = bone.parent ? spec.bones.find((b) => b.name === bone.parent) : undefined
    if (parentSpec) {
      const parentGroup = attach(parentSpec)
      // A child's position is relative to its parent's pivot.
      group.position.set(
        (bone.pivot[0] - parentSpec.pivot[0]) * UNIT,
        (bone.pivot[1] - parentSpec.pivot[1]) * UNIT,
        (bone.pivot[2] - parentSpec.pivot[2]) * UNIT,
      )
      parentGroup.add(group)
    } else {
      root.add(group)
    }

    return group
  }

  for (const bone of spec.bones) attach(bone)
  return { root, variants }
}

/** A slow turntable so a model can be read without touching the mouse. */
function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.28
  })
  return <group ref={ref}>{children}</group>
}

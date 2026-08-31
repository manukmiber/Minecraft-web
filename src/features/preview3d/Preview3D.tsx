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
          signature={`${node.id}:${String(node.data.bodyPreset)}:${String(node.data.scale)}:${String(node.data.stages)}`}
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
    default:
      return null
  }
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

  const group = useMemo(() => buildEntityGroup(spec, material), [spec, material])
  useEffect(
    () => () => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose()
      })
    },
    [group],
  )

  return (
    <Spin>
      <primitive object={group} scale={scale} />
    </Spin>
  )
}

/**
 * Builds the entity from the same bone spec the generator writes, honouring the
 * bone hierarchy and pivots so a rotated bone lands where the game would put it.
 */
function buildEntityGroup(spec: GeometrySpec, material: THREE.Material): THREE.Group {
  const root = new THREE.Group()
  const bones = new Map<string, THREE.Group>()

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
      const geometry = new THREE.BoxGeometry(size[0] * UNIT, size[1] * UNIT, size[2] * UNIT)
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
      // Cube origin is its minimum corner; three.js centres its geometry, and
      // the cube is positioned relative to its bone's pivot.
      mesh.position.set(
        (cube.origin[0] - inflate + size[0] / 2 - bone.pivot[0]) * UNIT,
        (cube.origin[1] - inflate + size[1] / 2 - bone.pivot[1]) * UNIT,
        (cube.origin[2] - inflate + size[2] / 2 - bone.pivot[2]) * UNIT,
      )
      mesh.castShadow = true
      group.add(mesh)
    }

    bones.set(bone.name, group)

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
  return root
}

/** A slow turntable so a model can be read without touching the mouse. */
function Spin({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.28
  })
  return <group ref={ref}>{children}</group>
}

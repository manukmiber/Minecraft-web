/**
 * The canvas the companion stands in.
 *
 * Transparent, unlit by the page, and deliberately thin: everything that moves
 * is driven by `CompanionRig` inside the frame loop, so React re-renders only
 * when the model itself changes. Pointer tracking comes in through a ref for
 * the same reason — a companion that followed the cursor by way of component
 * state would re-render the workspace sixty times a second.
 */

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import type { CompanionAsset } from './buildModel'
import { CompanionRig, type CompanionGesture, type CompanionMood } from './rig'

export interface LookTarget {
  x: number
  y: number
}

interface StageProps {
  asset: CompanionAsset
  mood: CompanionMood
  speaking: boolean
  /** Changing `id` replays the gesture, even if the name is the same. */
  gesture: { name: CompanionGesture; id: number } | null
  sway: boolean
  reducedMotion: boolean
  look: React.MutableRefObject<LookTarget>
  /** How much of the figure to show: 1 is head to toe, 0 is a close portrait. */
  framing: number
}

function Rigged({
  asset,
  mood,
  speaking,
  gesture,
  sway,
  reducedMotion,
  look,
}: Omit<StageProps, 'framing'>) {
  const rig = useMemo(() => new CompanionRig(asset), [asset])
  const played = useRef<number | null>(null)
  const { invalidate } = useThree()

  useEffect(() => {
    rig.setMood(mood)
    invalidate()
  }, [rig, mood, invalidate])

  useEffect(() => {
    rig.setSpeaking(speaking)
  }, [rig, speaking])

  useEffect(() => {
    rig.sway = sway
    rig.motion = !reducedMotion
  }, [rig, sway, reducedMotion])

  useEffect(() => {
    if (!gesture || played.current === gesture.id) return
    played.current = gesture.id
    rig.play(gesture.name)
  }, [rig, gesture])

  // Put the model back in its bind pose when it is handed to another rig, so
  // an import mid-session does not inherit a half-finished gesture.
  useEffect(() => () => rig.reset(), [rig])

  useFrame((_, delta) => {
    rig.setLook(look.current.x, look.current.y)
    rig.update(delta)
  })

  return <primitive object={asset.root} />
}

export function CompanionStage(props: StageProps) {
  const { asset, framing } = props

  // Head height on a normalised model is 1; framing pulls the camera in
  // towards the face without ever cutting the chin off.
  const distance = THREE.MathUtils.lerp(1.15, 2.15, framing)
  const height = THREE.MathUtils.lerp(0.88, 0.5, framing)

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
      camera={{ position: [0, height, distance], fov: 30, near: 0.05, far: 20 }}
      // The dock owns every pointer interaction; raycasting a 67k-vertex
      // skinned mesh on every mouse move would cost more than the render.
      style={{ pointerEvents: 'none' }}
      className="size-full"
    >
      <CameraRig height={height} distance={distance} />
      <OutlineWeight asset={asset} />

      {/* Flat key from the front so the face reads, a cool rim behind to keep
          the silhouette off a dark panel, and enough ambient that the toon
          ramp lands in its mid band rather than crushed to shadow. */}
      <ambientLight intensity={1.4} />
      <directionalLight position={[1.6, 2.4, 3]} intensity={1.5} />
      <directionalLight position={[-2.2, 1.2, -2.4]} intensity={0.6} color="#9fc4ff" />

      <Rigged {...props} asset={asset} />
    </Canvas>
  )
}

/**
 * Keeps the outline the same weight in pixels.
 *
 * The shader expands the hull by a fraction of the viewport, which is what
 * makes it independent of model scale and camera distance — but it also means
 * a 160px dock and a 520px one would get the same *fraction* and so a
 * different number of pixels. Scaling by the inverse of the canvas height
 * cancels that out, within limits that stop the line vanishing when she is
 * tiny or turning into a border when she is large.
 */
function OutlineWeight({ asset }: { asset: CompanionAsset }) {
  const height = useThree((state) => state.size.height)
  useEffect(() => {
    asset.outlineScale.value = THREE.MathUtils.clamp(300 / Math.max(1, height), 0.6, 1.8)
  }, [asset, height])
  return null
}

/** Keeps the camera aimed at the chest as the framing changes. */
function CameraRig({ height, distance }: { height: number; distance: number }) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    camera.position.set(0, height, distance)
    camera.lookAt(0, height - 0.06, 0)
    camera.updateProjectionMatrix()
  }, [camera, height, distance])
  return null
}

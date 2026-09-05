/**
 * What makes the model a companion rather than a statue.
 *
 * There are no motion files here, deliberately. A `.vmd` is someone else's
 * choreography with its own licence attached, and a workspace companion needs
 * to react to what just happened rather than replay a fixed loop. So
 * everything is procedural: breathing and weight shift from sine waves, blinks
 * from a Poisson-ish timer, a head that follows the pointer, expressions
 * composed from the model's own morphs, and hair and skirt driven by spring
 * bones.
 *
 * Names are matched in Japanese first, because that is what a PMX file
 * actually contains, with English fallbacks for models that were built or
 * retargeted in English.
 */

import * as THREE from 'three'

import type { PmxBone } from '../../core/companion/pmx'
import type { CompanionAsset, VertexMorph } from './buildModel'

export type CompanionMood = 'idle' | 'happy' | 'thinking' | 'concerned' | 'proud' | 'sleepy'

export type CompanionGesture = 'wave' | 'nod' | 'shake' | 'tilt' | 'cheer' | 'slump'

/** Candidate morph names, best first, matched case-insensitively. */
const MORPH_ALIASES = {
  blink: ['まばたき', 'まばたき2', 'blink'],
  wink: ['ウィンク', 'ウインク', 'wink'],
  smileEyes: ['笑い', 'にっこり', 'smile'],
  wideEyes: ['見開く', '瞳大', 'surprised'],
  narrowEyes: ['ジト目', '半目', 'jito'],
  browHappy: ['にこり', '喜び', 'happy'],
  browTrouble: ['困る', '困り', 'sad', 'troubled'],
  browAngry: ['怒り', 'anger', 'angry'],
  browSerious: ['真面目', '強気', 'serious'],
  browUp: ['上', '↑'],
  mouthA: ['あ', 'a'],
  mouthI: ['い', 'i'],
  mouthU: ['う', 'u'],
  mouthE: ['え', 'e'],
  mouthO: ['お', 'o'],
  // `い(歯閉じ笑み)` — a closed-teeth smile — is what a lot of Project Sekai
  // models call this, and without it the happy face has no mouth to pull.
  mouthSmile: ['にやり', 'わ', '∧', 'ω', 'い(歯閉じ笑み)', '笑み'],
  mouthFlat: ['一文字', 'む', '口幅狭く'],
  mouthWide: ['あ！', 'えぇ？', 'お2'],
  pupilSmall: ['瞳小', '瞳孔小'],
  blush: ['頬染め', '照れ', 'blush'],
} as const

export type MorphSlot = keyof typeof MORPH_ALIASES

/** Bones the rig poses directly, again Japanese first. */
const BONE_ALIASES = {
  centre: ['センター', 'center', 'Center'],
  groove: ['グルーブ', 'groove'],
  lowerBody: ['下半身', 'lower body'],
  upperBody: ['上半身', 'upper body'],
  upperBody2: ['上半身2', '上半身２', 'upper body 2'],
  neck: ['首', 'neck'],
  head: ['頭', 'head'],
  eyeL: ['左目', 'eye_L'],
  eyeR: ['右目', 'eye_R'],
  armL: ['左腕', 'arm_L'],
  armR: ['右腕', 'arm_R'],
  elbowL: ['左ひじ', '左肘', 'elbow_L'],
  elbowR: ['右ひじ', '右肘', 'elbow_R'],
} as const

type BoneSlot = keyof typeof BONE_ALIASES

/**
 * Bones that should keep swinging after the body has stopped.
 *
 * Two signals agree on this in a well-made model: the name says hair or
 * skirt, and the author gave the bone a simulated rigid body. Either alone is
 * enough — plenty of models name their bones in English, and plenty skip
 * physics on the shortest strands.
 */
const SWAY_NAME = /髪|房|ポニー|ツイン|もみあげ|リボン|ネクタイ|スカート|しっぽ|尻尾|マフラー|袖|裾|hair|skirt|ribbon|tie|tail|scarf|sleeve/i

/** Never sway these, whatever they are called: they carry the body. */
const SWAY_EXCLUDE = /IK|ＩＫ|足|脚|ひざ|膝|つま先|腕|ひじ|肘|手首|指|首|頭|センター|グルーブ|上半身|下半身|目|操作/

/**
 * A plain-English name for each expression slot, so the panel can report what
 * a model turned out to support without the reader having to know that
 * `browTrouble` means the eyebrows.
 */
export const MORPH_LABELS: Record<MorphSlot, string> = {
  blink: 'Blink',
  wink: 'Wink',
  smileEyes: 'Smiling eyes',
  wideEyes: 'Wide eyes',
  narrowEyes: 'Narrowed eyes',
  browHappy: 'Happy brows',
  browTrouble: 'Troubled brows',
  browAngry: 'Angry brows',
  browSerious: 'Serious brows',
  browUp: 'Raised brows',
  mouthA: 'Mouth A',
  mouthI: 'Mouth I',
  mouthU: 'Mouth U',
  mouthE: 'Mouth E',
  mouthO: 'Mouth O',
  mouthSmile: 'Smile',
  mouthFlat: 'Flat mouth',
  mouthWide: 'Open mouth',
  pupilSmall: 'Small pupils',
  blush: 'Blush',
}

interface SpringBone {
  bone: THREE.Bone
  depth: number
  restLocal: THREE.Quaternion
  /** Rest direction to the tail, in the bone's own space. */
  axis: THREE.Vector3
  length: number
  stiffness: number
  drag: number
  currentTail: THREE.Vector3
  previousTail: THREE.Vector3
}

interface PosedBone {
  bone: THREE.Bone
  rest: THREE.Quaternion
}

/**
 * Each mood, as morph weights.
 *
 * Weighted towards the eyes and the mouth rather than the brows, and that is
 * not an aesthetic preference: most character models have a fringe, and a
 * fringe hides eyebrows. A mood carried by the brows alone is a mood nobody
 * can see.
 */
const MOOD_FACE: Record<CompanionMood, Partial<Record<MorphSlot, number>>> = {
  idle: {},
  happy: { smileEyes: 0.9, browHappy: 1, mouthSmile: 0.7, blush: 0.3 },
  thinking: { narrowEyes: 0.75, browTrouble: 0.6, mouthFlat: 0.65, pupilSmall: 0.3 },
  concerned: { browTrouble: 1, wideEyes: 0.45, mouthWide: 0.3, pupilSmall: 0.5 },
  proud: { browSerious: 0.9, narrowEyes: 0.3, mouthSmile: 0.55 },
  sleepy: { blink: 0.68, browTrouble: 0.45, mouthFlat: 0.5 },
}

/**
 * How far below horizontal the arms should hang when nothing is happening.
 *
 * PMX bind poses are a T-pose or an A-pose depending on who rigged them, and
 * neither is a pose a person stands in. Rather than assume one, the rig
 * measures the arm the model actually has and rotates it down to here — so a
 * T-posed model relaxes by a lot, an A-posed one by a little, and both end up
 * standing the same way.
 */
const ARM_REST_ANGLE = 1.16

/** A small forward and inward set, so the arms do not read as a flat plane. */
const ARM_REST_YAW = 0.14
const ELBOW_REST_BEND = 0.16

/**
 * How far above horizontal an arm reaches at full lift.
 *
 * Gesture lifts are given as 0–1, where 0 is the resting pose and 1 is here.
 * Expressing them absolutely rather than as an offset is what stops a gesture
 * silently shrinking on a model whose arms already hang lower: an offset would
 * be spent cancelling the rest angle before it moved anything.
 */
const ARM_FULL_LIFT = 1.4

const GESTURE_SECONDS: Record<CompanionGesture, number> = {
  wave: 1.9,
  nod: 0.9,
  shake: 0.9,
  tilt: 1.4,
  cheer: 1.6,
  slump: 1.8,
}

function findByAlias<T>(lookup: Map<string, T>, aliases: readonly string[]): T | null {
  for (const alias of aliases) {
    const hit = lookup.get(alias)
    if (hit) return hit
  }
  const lowered = new Map<string, T>()
  for (const [key, value] of lookup) lowered.set(key.toLowerCase(), value)
  for (const alias of aliases) {
    const hit = lowered.get(alias.toLowerCase())
    if (hit) return hit
  }
  return null
}

function approach(current: number, target: number, rate: number, dt: number): number {
  // Frame-rate independent exponential ease; `rate` is roughly "per second".
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

/**
 * What the rig will actually be able to do with a given model.
 *
 * Every MMD model names its morphs differently, and a model missing `にこり`
 * simply cannot look pleased. Reporting that up front — rather than leaving
 * someone to wonder why their import never smiles — is the difference between
 * a limitation and a bug.
 */
export interface ModelCapabilities {
  /** Expression slots that matched, with the morph each one found. */
  expressions: Array<{ slot: MorphSlot; label: string; morph: string }>
  /** Expression slots the model has nothing for. */
  missing: MorphSlot[]
  /** Bones the rig will pose directly. */
  posedBones: number
  /** Hair, skirt and ribbon chains that will swing. */
  springBones: number
}

export function describeModel(asset: CompanionAsset): ModelCapabilities {
  const expressions: ModelCapabilities['expressions'] = []
  const missing: MorphSlot[] = []

  for (const slot of Object.keys(MORPH_ALIASES) as MorphSlot[]) {
    const name = findMorphName(asset, MORPH_ALIASES[slot])
    if (name) expressions.push({ slot, label: MORPH_LABELS[slot], morph: name })
    else missing.push(slot)
  }

  let posedBones = 0
  for (const slot of Object.keys(BONE_ALIASES) as BoneSlot[]) {
    if (findByAlias(asset.bones, BONE_ALIASES[slot])) posedBones++
  }

  return { expressions, missing, posedBones, springBones: countSpringBones(asset) }
}

/** The alias match, reported by name rather than by value. */
function findMorphName(asset: CompanionAsset, aliases: readonly string[]): string | null {
  for (const alias of aliases) if (asset.morphs.has(alias)) return alias
  const lowered = new Map<string, string>()
  for (const key of asset.morphs.keys()) lowered.set(key.toLowerCase(), key)
  for (const alias of aliases) {
    const hit = lowered.get(alias.toLowerCase())
    if (hit) return hit
  }
  return null
}

/** Shared with the rig, so the report and the behaviour cannot disagree. */
function countSpringBones(asset: CompanionAsset): number {
  const simulated = new Set<number>()
  for (const body of asset.source.rigidBodies) {
    if (body.physicsMode !== 0 && body.boneIndex >= 0) simulated.add(body.boneIndex)
  }
  return asset.source.bones.filter(
    (bone, index) =>
      !SWAY_EXCLUDE.test(bone.name) &&
      (SWAY_NAME.test(bone.name) || simulated.has(index)) &&
      (bone.tailIndex >= 0 || bone.tailOffset !== null),
  ).length
}

export class CompanionRig {
  private posed = new Map<BoneSlot, PosedBone>()
  private morphs = new Map<MorphSlot, Array<{ morph: VertexMorph; influence: number }>>()
  private springs: SpringBone[] = []

  private weights = new Map<MorphSlot, number>()
  private targets = new Map<MorphSlot, number>()
  /** Vertices moved last frame, so only those have to be restored. */
  private touched = new Set<number>()
  private morphsDirty = true

  private clock = 0
  private blinkAt = 1.5
  private blinkPhase = -1
  private mood: CompanionMood = 'idle'
  private speaking = false
  private talkPhase = 0
  private talkTarget = 0
  private lookTarget = new THREE.Vector2()
  private look = new THREE.Vector2()
  private gesture: { kind: CompanionGesture; elapsed: number } | null = null
  private idleFor = 0
  private armDrop = 0

  /** Turned off wholesale on a weak device, or when someone finds it fussy. */
  sway = true
  motion = true

  private scratch = {
    euler: new THREE.Euler(),
    quaternion: new THREE.Quaternion(),
    parent: new THREE.Quaternion(),
    world: new THREE.Quaternion(),
    inverse: new THREE.Quaternion(),
    vector: new THREE.Vector3(),
    origin: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    rest: new THREE.Vector3(),
    next: new THREE.Vector3(),
  }

  constructor(private asset: CompanionAsset) {
    for (const slot of Object.keys(BONE_ALIASES) as BoneSlot[]) {
      const bone = findByAlias(asset.bones, BONE_ALIASES[slot])
      if (bone) this.posed.set(slot, { bone, rest: bone.quaternion.clone() })
    }
    for (const slot of Object.keys(MORPH_ALIASES) as MorphSlot[]) {
      const morph = findByAlias(asset.morphs, MORPH_ALIASES[slot])
      if (morph) this.morphs.set(slot, morph)
    }
    this.armDrop = this.measureArmDrop()
    this.collectSprings()
  }

  /**
   * How much the arms have to come down from the bind pose, in radians. Zero
   * for a model already rigged with its arms relaxed.
   */
  private measureArmDrop(): number {
    const bones = this.asset.source.bones
    const find = (aliases: readonly string[]) =>
      bones.find((bone) => aliases.some((alias) => bone.name === alias)) ?? null

    const shoulder = find(BONE_ALIASES.armL)
    const elbow = find(BONE_ALIASES.elbowL)
    if (!shoulder || !elbow) return 0

    const across = Math.abs(elbow.position[0] - shoulder.position[0])
    const down = shoulder.position[1] - elbow.position[1]
    if (across < 1e-4 && down < 1e-4) return 0

    return Math.max(0, ARM_REST_ANGLE - Math.atan2(down, across))
  }

  /** What the model turned out to support, for the import dialog to report. */
  describe(): { expressions: number; springs: number; posed: number } {
    return { expressions: this.morphs.size, springs: this.springs.length, posed: this.posed.size }
  }

  private collectSprings(): void {
    const { source, boneList } = this.asset
    const simulated = new Set<number>()
    for (const body of source.rigidBodies) {
      if (body.physicsMode !== 0 && body.boneIndex >= 0) simulated.add(body.boneIndex)
    }

    const depthOf = (index: number): number => {
      let depth = 0
      let at = source.bones[index]?.parentIndex ?? -1
      while (at >= 0 && depth < 64) {
        depth++
        at = source.bones[at]?.parentIndex ?? -1
      }
      return depth
    }

    source.bones.forEach((pmxBone: PmxBone, index) => {
      if (SWAY_EXCLUDE.test(pmxBone.name)) return
      if (!SWAY_NAME.test(pmxBone.name) && !simulated.has(index)) return

      const bone = boneList[index]
      if (!bone) return

      // The tail is where the bone points: another bone, or a raw offset for
      // the last link in a chain.
      const axis = new THREE.Vector3()
      if (pmxBone.tailIndex >= 0) {
        const tail = source.bones[pmxBone.tailIndex]
        if (!tail) return
        axis.set(
          tail.position[0] - pmxBone.position[0],
          tail.position[1] - pmxBone.position[1],
          -(tail.position[2] - pmxBone.position[2]),
        )
      } else if (pmxBone.tailOffset) {
        axis.set(pmxBone.tailOffset[0], pmxBone.tailOffset[1], -pmxBone.tailOffset[2])
      } else {
        return
      }

      const length = axis.length()
      if (length < 1e-4) return
      axis.divideScalar(length)

      const depth = depthOf(index)
      this.springs.push({
        bone,
        depth,
        restLocal: bone.quaternion.clone(),
        axis,
        length,
        // Strands get looser the further they are from the root, which is what
        // stops a whole chain moving as one stiff wire.
        stiffness: 14 - Math.min(6, depth * 0.35),
        drag: 0.62,
        currentTail: new THREE.Vector3(),
        previousTail: new THREE.Vector3(),
      })
    })

    this.springs.sort((a, b) => a.depth - b.depth)
    this.primeSprings()
  }

  /** Parks every spring on its rest pose, so the first frame does not snap. */
  private primeSprings(): void {
    this.asset.root.updateMatrixWorld(true)
    for (const spring of this.springs) {
      spring.bone.getWorldPosition(this.scratch.origin)
      spring.bone.getWorldQuaternion(this.scratch.world)
      const tail = this.scratch.origin
        .clone()
        .add(
          this.scratch.vector
            .copy(spring.axis)
            .applyQuaternion(this.scratch.world)
            .multiplyScalar(spring.length * this.worldScale()),
        )
      spring.currentTail.copy(tail)
      spring.previousTail.copy(tail)
    }
  }

  private worldScale(): number {
    return this.asset.root.getWorldScale(this.scratch.vector).y || 1
  }

  setMood(mood: CompanionMood): void {
    if (this.mood === mood) return
    this.mood = mood
    this.idleFor = 0
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking
    if (speaking) this.idleFor = 0
  }

  /** Pointer position in view space, -1 to 1 on each axis. */
  setLook(x: number, y: number): void {
    this.lookTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1))
    this.idleFor = 0
  }

  play(gesture: CompanionGesture): void {
    this.gesture = { kind: gesture, elapsed: 0 }
    this.idleFor = 0
  }

  update(dt: number): void {
    // Capped only against the jump a backgrounded tab produces. It used to be
    // 1/20, which quietly played every gesture in slow motion on a machine
    // rendering below that — the spring pass has its own tighter clamp, so
    // nothing here needed the outer one to be so strict.
    const step = Math.min(dt, 1 / 10)
    this.clock += step
    this.idleFor += step

    this.updateFace(step)
    this.updateBody(step)
    this.asset.root.updateMatrixWorld(true)
    if (this.sway && this.motion) this.updateSprings(step)
    this.applyMorphs()
  }

  // -- expression ----------------------------------------------------------

  private updateFace(dt: number): void {
    this.targets.clear()
    for (const [slot, value] of Object.entries(MOOD_FACE[this.mood]) as Array<[MorphSlot, number]>) {
      this.targets.set(slot, value)
    }

    // Blinking runs on top of whatever the mood set, so a happy face still
    // blinks — and a sleepy one blinks from half closed rather than from open.
    if (this.clock >= this.blinkAt && this.blinkPhase < 0) this.blinkPhase = 0
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt
      const closing = 0.06
      const holding = 0.04
      const opening = 0.1
      const total = closing + holding + opening
      let blink: number
      if (this.blinkPhase < closing) blink = this.blinkPhase / closing
      else if (this.blinkPhase < closing + holding) blink = 1
      else blink = 1 - (this.blinkPhase - closing - holding) / opening

      this.targets.set('blink', Math.max(this.targets.get('blink') ?? 0, THREE.MathUtils.clamp(blink, 0, 1)))

      if (this.blinkPhase >= total) {
        this.blinkPhase = -1
        // Roughly every two to seven seconds, with the odd quick double.
        this.blinkAt = this.clock + (Math.random() < 0.16 ? 0.2 : 2 + Math.random() * 5)
      }
    }

    if (this.speaking) {
      this.talkPhase -= dt
      if (this.talkPhase <= 0) {
        this.talkPhase = 0.07 + Math.random() * 0.09
        this.talkTarget = Math.random() < 0.22 ? 0 : 0.3 + Math.random() * 0.55
      }
      const vowel: MorphSlot[] = ['mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO']
      const chosen = vowel[Math.floor((this.clock * 3.1) % vowel.length)]
      this.targets.set(chosen, Math.max(this.targets.get(chosen) ?? 0, this.talkTarget))
    }

    // Left alone for long enough, the companion drifts towards sleepy of its
    // own accord — a small thing that makes an idle workspace feel calm rather
    // than watched.
    if (this.mood === 'idle' && this.idleFor > 90) {
      this.targets.set('blink', Math.max(this.targets.get('blink') ?? 0, 0.35))
    }

    for (const slot of this.morphs.keys()) {
      const target = this.targets.get(slot) ?? 0
      const current = this.weights.get(slot) ?? 0
      // Blinks have to be instant; everything else eases.
      const next = slot === 'blink' ? target : approach(current, target, 9, dt)
      if (Math.abs(next - current) > 0.0005 || (next === 0 && current !== 0)) {
        this.weights.set(slot, next)
        this.morphsDirty = true
      }
    }
  }

  private applyMorphs(): void {
    if (!this.morphsDirty) return
    this.morphsDirty = false

    const attribute = this.asset.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = attribute.array as Float32Array
    const base = this.asset.basePositions

    for (const vertex of this.touched) {
      positions[vertex * 3] = base[vertex * 3]
      positions[vertex * 3 + 1] = base[vertex * 3 + 1]
      positions[vertex * 3 + 2] = base[vertex * 3 + 2]
    }
    this.touched.clear()

    for (const [slot, weight] of this.weights) {
      if (weight <= 0.001) continue
      const parts = this.morphs.get(slot)
      if (!parts) continue
      for (const { morph, influence } of parts) {
        const scale = weight * influence
        for (let i = 0; i < morph.indices.length; i++) {
          const vertex = morph.indices[i]
          positions[vertex * 3] += morph.offsets[i * 3] * scale
          positions[vertex * 3 + 1] += morph.offsets[i * 3 + 1] * scale
          positions[vertex * 3 + 2] += morph.offsets[i * 3 + 2] * scale
          this.touched.add(vertex)
        }
      }
    }

    attribute.needsUpdate = true
  }

  // -- pose ----------------------------------------------------------------

  /** The standing pose, on top of whatever the model author left in the file. */
  private basePose(slot: BoneSlot): [number, number, number] {
    switch (slot) {
      // Z lowers an arm on the model's left and raises it on the right, which
      // is MMD's own convention and survives the axis flip unchanged.
      case 'armL':
        return [0, -ARM_REST_YAW, -this.armDrop]
      case 'armR':
        return [0, ARM_REST_YAW, this.armDrop]
      case 'elbowL':
        return [0, ELBOW_REST_BEND, 0]
      case 'elbowR':
        return [0, -ELBOW_REST_BEND, 0]
      default:
        return [0, 0, 0]
    }
  }

  private setPose(slot: BoneSlot, x: number, y: number, z: number): void {
    const posed = this.posed.get(slot)
    if (!posed) return
    const [bx, by, bz] = this.basePose(slot)
    this.scratch.euler.set(bx + x, by + y, bz + z, 'YXZ')
    this.scratch.quaternion.setFromEuler(this.scratch.euler)
    posed.bone.quaternion.copy(posed.rest).multiply(this.scratch.quaternion)
  }

  /** A 0–1 gesture lift, as the rotation to add on top of the resting arm. */
  private lift(amount: number): number {
    return amount * (this.armDrop + ARM_FULL_LIFT)
  }

  private updateBody(dt: number): void {
    if (!this.motion) {
      // Still, but still standing: the base pose is not motion, it is posture.
      for (const slot of this.posed.keys()) this.setPose(slot, 0, 0, 0)
      return
    }

    this.look.x = approach(this.look.x, this.lookTarget.x, 6, dt)
    this.look.y = approach(this.look.y, this.lookTarget.y, 6, dt)

    const t = this.clock
    // Breath: a slow rise through the chest, with the shoulders a beat behind.
    const breath = Math.sin(t * 1.15)
    const sway = Math.sin(t * 0.37)
    const shift = Math.sin(t * 0.23)

    const gesture = this.gestureAmounts(dt)

    // The model faces +Z after the coordinate conversion, so a positive yaw
    // turns towards +X, which is the viewer's right.
    const yaw = this.look.x * 0.42 + gesture.headYaw
    const pitch = -this.look.y * 0.3 + gesture.headPitch
    const roll = this.look.x * 0.06 + gesture.headRoll

    this.setPose('lowerBody', breath * 0.004, sway * 0.03, shift * 0.012)
    this.setPose('upperBody', breath * 0.016 + gesture.bow, sway * 0.04, -shift * 0.02)
    this.setPose('upperBody2', breath * 0.012, sway * 0.03, -shift * 0.014)
    this.setPose('neck', pitch * 0.3, yaw * 0.3, roll * 0.4)
    this.setPose('head', pitch * 0.7, yaw * 0.7, roll * 0.9)

    // Eyes lead the head slightly, which is what stops the look reading as a
    // turret sweep.
    this.setPose('eyeL', -this.look.y * 0.12, this.look.x * 0.2, 0)
    this.setPose('eyeR', -this.look.y * 0.12, this.look.x * 0.2, 0)

    // Arms hang from the shoulder; positive Z lifts the left arm and lowers
    // the right, mirroring MMD's own convention.
    this.setPose('armL', 0, gesture.armLYaw, this.lift(gesture.armLLift))
    this.setPose('armR', 0, -gesture.armRYaw, -this.lift(gesture.armRLift))
    this.setPose('elbowL', 0, gesture.elbowL, 0)
    this.setPose('elbowR', 0, -gesture.elbowR, 0)

    const centre = this.posed.get('centre') ?? this.posed.get('groove')
    if (centre) {
      const bone = centre.bone
      bone.position.y = (bone.userData.restY ??= bone.position.y) + breath * 0.02 + gesture.hop
      bone.position.x = (bone.userData.restX ??= bone.position.x) + shift * 0.05
    }
  }

  /**
   * One gesture at a time, expressed as the offsets it contributes. Returning
   * a plain record rather than posing directly keeps the idle motion and the
   * gesture additive instead of fighting each other.
   */
  private gestureAmounts(dt: number): {
    headYaw: number
    headPitch: number
    headRoll: number
    bow: number
    hop: number
    armLLift: number
    armRLift: number
    armLYaw: number
    armRYaw: number
    elbowL: number
    elbowR: number
  } {
    const zero = {
      headYaw: 0,
      headPitch: 0,
      headRoll: 0,
      bow: 0,
      hop: 0,
      armLLift: 0,
      armRLift: 0,
      armLYaw: 0,
      armRYaw: 0,
      elbowL: 0,
      elbowR: 0,
    }
    if (!this.gesture) return zero

    this.gesture.elapsed += dt
    const total = GESTURE_SECONDS[this.gesture.kind]
    const t = this.gesture.elapsed / total
    if (t >= 1) {
      this.gesture = null
      return zero
    }

    // Every gesture fades in and out of the idle pose rather than snapping.
    const envelope = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1))

    switch (this.gesture.kind) {
      case 'wave':
        return {
          ...zero,
          // Up beside the head, with the forearm doing the actual waving.
          armLLift: envelope * 0.78,
          armLYaw: envelope * 0.3,
          elbowL: envelope * (0.7 + Math.sin(t * Math.PI * 6) * 0.5),
          headRoll: envelope * 0.09,
        }
      case 'nod':
        return { ...zero, headPitch: Math.sin(t * Math.PI * 2) * 0.4 }
      case 'shake':
        return { ...zero, headYaw: Math.sin(t * Math.PI * 4) * 0.32 }
      case 'tilt':
        return { ...zero, headRoll: envelope * 0.42, headYaw: envelope * 0.1 }
      case 'cheer':
        return {
          ...zero,
          armLLift: envelope * 0.95,
          armRLift: envelope * 0.95,
          hop: Math.max(0, Math.sin(t * Math.PI * 2)) * 0.35,
          headPitch: -envelope * 0.16,
        }
      case 'slump':
        return {
          ...zero,
          bow: envelope * 0.22,
          headPitch: envelope * 0.36,
          armLLift: -envelope * 0.08,
          armRLift: -envelope * 0.08,
        }
    }
  }

  // -- secondary motion ----------------------------------------------------

  /**
   * Spring bones, in the shape everyone settled on: carry the tail's own
   * momentum forward, pull it back towards where the pose says it should be,
   * add a little gravity, then rotate the bone so it points at the result.
   *
   * The rotation away from rest is clamped, which is the difference between
   * hair that swings and hair that turns inside out the first time the panel
   * is dragged across the screen.
   */
  private updateSprings(dt: number): void {
    const scale = this.worldScale()
    const step = Math.min(dt, 1 / 30)
    const s = this.scratch

    for (const spring of this.springs) {
      const parent = spring.bone.parent
      if (!parent) continue

      parent.getWorldQuaternion(s.parent)
      spring.bone.getWorldPosition(s.origin)

      // Where the tail would sit with no simulation at all.
      s.world.copy(s.parent).multiply(spring.restLocal)
      s.rest.copy(spring.axis).applyQuaternion(s.world).normalize()

      const reach = spring.length * scale

      s.next
        .copy(spring.currentTail)
        .addScaledVector(
          s.direction.copy(spring.currentTail).sub(spring.previousTail),
          1 - spring.drag,
        )
        .addScaledVector(s.rest, spring.stiffness * step * reach)
      s.next.y -= 1.1 * step * reach

      // A spring bone has a fixed length; only its direction is free.
      s.direction.copy(s.next).sub(s.origin)
      if (s.direction.lengthSq() < 1e-12) s.direction.copy(s.rest)
      s.direction.normalize()

      // Clamp how far the strand may leave its rest direction.
      const angle = Math.acos(THREE.MathUtils.clamp(s.direction.dot(s.rest), -1, 1))
      const limit = 0.42
      if (angle > limit) {
        s.direction.copy(s.rest).lerp(s.direction, limit / angle).normalize()
      }

      spring.previousTail.copy(spring.currentTail)
      spring.currentTail.copy(s.origin).addScaledVector(s.direction, reach)

      s.quaternion.setFromUnitVectors(s.rest, s.direction)
      s.world.premultiply(s.quaternion)
      spring.bone.quaternion.copy(s.inverse.copy(s.parent).invert()).multiply(s.world)
      spring.bone.updateMatrixWorld(true)
    }
  }

  /** Puts every bone back where the model author left it. */
  reset(): void {
    for (const posed of this.posed.values()) posed.bone.quaternion.copy(posed.rest)
    for (const spring of this.springs) spring.bone.quaternion.copy(spring.restLocal)
    this.weights.clear()
    this.morphsDirty = true
    this.applyMorphs()
    this.asset.root.updateMatrixWorld(true)
    this.primeSprings()
  }
}

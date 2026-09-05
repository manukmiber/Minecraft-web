/**
 * Generated animations for the built-in body presets.
 *
 * These are deliberately simple Molang expressions rather than keyframes: an
 * idle sway plus a movement cycle that reads whichever limbs the body actually
 * has. It means every entity you create arrives already animated, and the same
 * bone names drive the 3D preview.
 *
 * Nothing here is written per body preset. Each clause asks "does this body have
 * a pair of wings / a skirt / twin tails?" and contributes only if it does, so a
 * new body gets the animation that fits it without this file learning its name.
 */

import type { GeometrySpec } from './geometry'

export interface EntityAnimations {
  animations: Record<string, unknown>
  controller: Record<string, unknown>
  /** Short name -> full animation identifier, for the client entity file. */
  clientAnimations: Record<string, string>
  controllerId: string
}

export interface AnimationOptions {
  flying: boolean
  /** Adds a sitting pose and the state that plays it. */
  sittable: boolean
}

function hasBone(spec: GeometrySpec, name: string): boolean {
  return spec.bones.some((bone) => bone.name === name)
}

function hasBones(spec: GeometrySpec, ...names: string[]): boolean {
  return names.every((name) => hasBone(spec, name))
}

/** The vanilla walk frequency. Matching it keeps custom mobs in step. */
const WALK = 'q.modified_distance_moved * 38.17'
const SPEED = 'q.modified_move_speed'

export function buildAnimations(
  animPrefix: string,
  spec: GeometrySpec,
  options: AnimationOptions | boolean,
): EntityAnimations {
  // The third argument used to be a bare `flying` boolean.
  const { flying, sittable } =
    typeof options === 'boolean' ? { flying: options, sittable: false } : options

  const idleBones: Record<string, unknown> = {}
  const moveBones: Record<string, unknown> = {}
  const sitBones: Record<string, unknown> = {}

  if (hasBone(spec, 'head')) {
    // Look toward whatever the entity is targeting, clamped by the game.
    idleBones.head = {
      rotation: ['q.target_x_rotation', 'q.target_y_rotation', 0],
    }
  }

  if (hasBone(spec, 'body')) {
    idleBones.body = {
      rotation: ['math.sin(q.life_time * 40) * 0.8', 0, 0],
    }
  }

  if (hasBone(spec, 'neck')) {
    idleBones.neck = { rotation: ['math.sin(q.life_time * 40) * 0.4', 0, 0] }
  }

  if (hasBones(spec, 'wing_left', 'wing_right')) {
    const flap = (sign: string) =>
      `${sign}(35 + math.sin(q.life_time * ${flying ? 900 : 200}) * ${flying ? 45 : 12})`
    idleBones.wing_left = { rotation: [0, 0, flap('-')] }
    idleBones.wing_right = { rotation: [0, 0, flap('')] }
    moveBones.wing_left = { rotation: [0, 0, `-(35 + math.sin(q.life_time * 900) * 55)`] }
    moveBones.wing_right = { rotation: [0, 0, `35 + math.sin(q.life_time * 900) * 55`] }
  }

  if (hasBones(spec, 'leg_left', 'leg_right')) {
    moveBones.leg_left = { rotation: [`math.cos(${WALK}) * 40 * ${SPEED}`, 0, 0] }
    moveBones.leg_right = { rotation: [`-math.cos(${WALK}) * 40 * ${SPEED}`, 0, 0] }
  }

  if (hasBones(spec, 'arm_left', 'arm_right')) {
    moveBones.arm_left = { rotation: [`-math.cos(${WALK}) * 30 * ${SPEED}`, 0, 0] }
    moveBones.arm_right = { rotation: [`math.cos(${WALK}) * 30 * ${SPEED}`, 0, 0] }
    // Arms hang with a slight outward tilt and drift; a biped standing with two
    // perfectly straight arms reads as a mannequin.
    idleBones.arm_left = { rotation: ['math.sin(q.life_time * 35) * 1.6', 0, -3] }
    idleBones.arm_right = { rotation: ['math.sin(q.life_time * 35 + 40) * 1.6', 0, 3] }
  }

  if (hasBone(spec, 'crossbar')) {
    // A scarecrow does not walk; it creaks in the wind.
    idleBones.crossbar = { rotation: [0, 'math.sin(q.life_time * 25) * 2', 0] }
  }

  // -- hair with weight ------------------------------------------------------
  //
  // Twin tails are the one part of a character that has to *lag*: swinging them
  // in phase with the head is what makes a model look like a puppet. The upper
  // segment follows the head's turn at a fraction of its angle, and the tip
  // follows the upper segment later still.
  for (const [bone, phase, follow] of [
    ['tail_right', 0, 0.35],
    ['tail_left', 55, 0.35],
    ['tail_right_tip', 90, 0.55],
    ['tail_left_tip', 145, 0.55],
  ] as const) {
    if (!hasBone(spec, bone)) continue
    const side = bone.includes('right') ? -1 : 1
    idleBones[bone] = {
      rotation: [
        `math.sin(q.life_time * 62 + ${phase}) * 2.5 - q.target_x_rotation * ${follow}`,
        `math.sin(q.life_time * 44 + ${phase}) * 3`,
        `${side} * math.sin(q.life_time * 55 + ${phase}) * 2.5 - q.target_y_rotation * ${follow * 0.4}`,
      ],
    }
    moveBones[bone] = {
      rotation: [`-math.cos(${WALK} + ${phase}) * ${Math.round(follow * 30)} * ${SPEED}`, 0, 0],
    }
  }

  // -- a skirt that is not painted on ---------------------------------------
  for (const [bone, axis, sign] of [
    ['skirt_front', 'x', -1],
    ['skirt_back', 'x', 1],
    ['skirt_right', 'z', 1],
    ['skirt_left', 'z', -1],
  ] as const) {
    if (!hasBone(spec, bone)) continue
    const drift = `math.sin(q.life_time * 48 ${sign > 0 ? '+ 90' : ''}) * 1.8`
    // Walking lifts the panels; the front and back swing against each other.
    const swing = `${sign} * (4 + math.cos(${WALK}) * 7) * ${SPEED}`
    idleBones[bone] = axis === 'x' ? { rotation: [drift, 0, 0] } : { rotation: [0, 0, drift] }
    moveBones[bone] = axis === 'x' ? { rotation: [swing, 0, 0] } : { rotation: [0, 0, swing] }
  }

  // -- sitting ---------------------------------------------------------------
  const canSit = sittable && hasBones(spec, 'leg_left', 'leg_right')
  if (canSit) {
    sitBones.leg_left = { rotation: [-80, 0, -8], position: [0, 1, -3.5] }
    sitBones.leg_right = { rotation: [-80, 0, 8], position: [0, 1, -3.5] }
    if (hasBone(spec, 'body')) sitBones.body = { position: [0, -5, 0], rotation: [6, 0, 0] }
    if (hasBones(spec, 'arm_left', 'arm_right')) {
      sitBones.arm_left = { rotation: [-12, 0, -6] }
      sitBones.arm_right = { rotation: [-12, 0, 6] }
    }
    for (const bone of ['skirt_front', 'skirt_right', 'skirt_left']) {
      if (hasBone(spec, bone)) sitBones[bone] = { rotation: [-6, 0, 0] }
    }
  }

  const idleId = `animation.${animPrefix}.idle`
  const moveId = `animation.${animPrefix}.move`
  const sitId = `animation.${animPrefix}.sit`
  const controllerId = `controller.animation.${animPrefix}.general`

  const animations: Record<string, unknown> = {
    [idleId]: {
      loop: true,
      bones: idleBones,
    },
  }

  const hasMovement = Object.keys(moveBones).length > 0
  if (hasMovement) {
    animations[moveId] = { loop: true, bones: moveBones }
  }
  const hasSit = Object.keys(sitBones).length > 0
  if (hasSit) {
    animations[sitId] = { loop: true, bones: sitBones }
  }

  const states: Record<string, unknown> = {
    default: {
      animations: ['idle'],
      transitions: [
        ...(hasSit ? [{ sitting: 'q.is_sitting' }] : []),
        ...(hasMovement ? [{ moving: `${SPEED} > 0.05` }] : []),
      ],
    },
  }
  if (hasMovement) {
    states.moving = {
      animations: ['idle', 'move'],
      transitions: [
        ...(hasSit ? [{ sitting: 'q.is_sitting' }] : []),
        { default: `${SPEED} <= 0.05` },
      ],
    }
  }
  if (hasSit) {
    // A short blend makes standing up look like a decision rather than a cut.
    states.sitting = {
      animations: ['idle', 'sit'],
      blend_transition: 0.25,
      transitions: [{ default: '!q.is_sitting' }],
    }
  }

  const controller = { [controllerId]: { initial_state: 'default', states } }

  const clientAnimations: Record<string, string> = { idle: idleId, general: controllerId }
  if (hasMovement) clientAnimations.move = moveId
  if (hasSit) clientAnimations.sit = sitId

  return { animations, controller, clientAnimations, controllerId }
}

export function wrapAnimations(formatVersion: string, animations: Record<string, unknown>): unknown {
  return { format_version: formatVersion, animations }
}

export function wrapControllers(
  formatVersion: string,
  controllers: Record<string, unknown>,
): unknown {
  return { format_version: formatVersion, animation_controllers: controllers }
}

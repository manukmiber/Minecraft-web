/**
 * Generated animations for the built-in body presets.
 *
 * These are deliberately simple Molang expressions rather than keyframes: an
 * idle sway plus a movement cycle that reads whichever limbs the body actually
 * has. It means every entity you create arrives already animated, and the same
 * bone names drive the 3D preview.
 */

import type { GeometrySpec } from './geometry'

export interface EntityAnimations {
  animations: Record<string, unknown>
  controller: Record<string, unknown>
  /** Short name -> full animation identifier, for the client entity file. */
  clientAnimations: Record<string, string>
  controllerId: string
}

function hasBone(spec: GeometrySpec, name: string): boolean {
  return spec.bones.some((bone) => bone.name === name)
}

export function buildAnimations(
  animPrefix: string,
  spec: GeometrySpec,
  flying: boolean,
): EntityAnimations {
  const idleBones: Record<string, unknown> = {}
  const moveBones: Record<string, unknown> = {}

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

  if (hasBone(spec, 'wing_left') && hasBone(spec, 'wing_right')) {
    const flap = (sign: string) =>
      `${sign}(35 + math.sin(q.life_time * ${flying ? 900 : 200}) * ${flying ? 45 : 12})`
    idleBones.wing_left = { rotation: [0, 0, flap('-')] }
    idleBones.wing_right = { rotation: [0, 0, flap('')] }
    moveBones.wing_left = { rotation: [0, 0, `-(35 + math.sin(q.life_time * 900) * 55)`] }
    moveBones.wing_right = { rotation: [0, 0, `35 + math.sin(q.life_time * 900) * 55`] }
  }

  if (hasBone(spec, 'leg_left') && hasBone(spec, 'leg_right')) {
    // 38.17 is the vanilla walk frequency constant; matching it keeps custom
    // mobs in step with the rest of the world.
    moveBones.leg_left = {
      rotation: ['math.cos(q.modified_distance_moved * 38.17) * 40 * q.modified_move_speed', 0, 0],
    }
    moveBones.leg_right = {
      rotation: ['-math.cos(q.modified_distance_moved * 38.17) * 40 * q.modified_move_speed', 0, 0],
    }
  }

  if (hasBone(spec, 'arm_left') && hasBone(spec, 'arm_right')) {
    moveBones.arm_left = {
      rotation: ['-math.cos(q.modified_distance_moved * 38.17) * 30 * q.modified_move_speed', 0, 0],
    }
    moveBones.arm_right = {
      rotation: ['math.cos(q.modified_distance_moved * 38.17) * 30 * q.modified_move_speed', 0, 0],
    }
  }

  if (hasBone(spec, 'crossbar')) {
    // A scarecrow does not walk; it creaks in the wind.
    idleBones.crossbar = { rotation: [0, 'math.sin(q.life_time * 25) * 2', 0] }
  }

  const idleId = `animation.${animPrefix}.idle`
  const moveId = `animation.${animPrefix}.move`
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

  const controller = {
    [controllerId]: {
      initial_state: 'default',
      states: hasMovement
        ? {
            default: {
              animations: ['idle'],
              transitions: [{ moving: 'q.modified_move_speed > 0.05' }],
            },
            moving: {
              animations: ['idle', 'move'],
              transitions: [{ default: 'q.modified_move_speed <= 0.05' }],
            },
          }
        : {
            default: { animations: ['idle'] },
          },
    },
  }

  const clientAnimations: Record<string, string> = { idle: idleId, general: controllerId }
  if (hasMovement) clientAnimations.move = moveId

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

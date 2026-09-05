/**
 * Walking a body spec with a paintbrush.
 *
 * `packBody` decided where every cube's patch sits on the sheet; this turns each
 * of those patches back into the six faces it unwraps into and hands a recipe a
 * brush per face. A recipe therefore never sees a UV coordinate — it says "the
 * front of the jacket looks like this" and the layout is somebody else's problem.
 */

import { Brush, Canvas } from './canvas'
import type { Frame } from './canvas'
import type { CubeSpec, GeometrySpec } from '../bodySpec'

export type CubeFace = 'up' | 'down' | 'north' | 'south' | 'east' | 'west'

export const CUBE_FACES: CubeFace[] = ['up', 'down', 'north', 'south', 'east', 'west']

/**
 * The six rectangles a cube unwraps into, in texels.
 *
 * This is the same cross layout `applyBoxUv` samples from — up and down along
 * the top, then right, front, left, back in a row underneath:
 *
 *          [  up  ][ down ]
 *   [ west ][north ][ east ][south ]
 */
export function faceFrames(cube: CubeSpec, scale: number): Record<CubeFace, Frame> {
  const [w, h, d] = cube.size
  const [u, v] = cube.uv
  const at = (x: number, y: number, width: number, height: number): Frame => ({
    x: Math.round(x * scale),
    y: Math.round(y * scale),
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  })

  return {
    up: at(u + d, v, w, d),
    down: at(u + d + w, v, w, d),
    west: at(u, v + d, d, h),
    north: at(u + d, v + d, w, h),
    east: at(u + d + w, v + d, d, h),
    south: at(u + d + w + d, v + d, w, h),
  }
}

/** What a recipe is handed: one brush per face, plus where the cube sits. */
export interface PaintTarget {
  faces: Record<CubeFace, Brush>
  cube: CubeSpec
  boneName: string
  scale: number
  /** Draws the same thing on every face named. */
  on(names: CubeFace[], draw: (brush: Brush, face: CubeFace) => void): void
  /** The four upright faces — everything but the lid and the underside. */
  sides(draw: (brush: Brush, face: CubeFace) => void): void
}

export type PaintRecipe = (target: PaintTarget) => void

export interface PaintOptions {
  /** Texels per model unit. 1 is a vanilla-resolution sheet, 4 is the shipped one. */
  scale: number
  recipes: Record<string, PaintRecipe>
  /** Called for a cube whose `paint` key has no recipe. Defaults to throwing. */
  onMissing?: (key: string, boneName: string) => void
}

/**
 * Paints a whole body and returns the sheet.
 *
 * Cubes that share a patch are painted once — the second visit would draw the
 * same thing over the same texels, and skipping it keeps translucent passes
 * (the blush, the fabric grain) from doubling up and coming out twice as strong.
 */
export function paintBody(spec: GeometrySpec, options: PaintOptions): Canvas {
  const { scale, recipes } = options
  const canvas = new Canvas(spec.textureWidth * scale, spec.textureHeight * scale)
  const painted = new Set<string>()

  for (const bone of spec.bones) {
    for (const cube of bone.cubes) {
      const key = cube.paint
      if (!key) continue

      const patch = `${cube.uv[0]},${cube.uv[1]}`
      if (painted.has(patch)) continue
      painted.add(patch)

      const recipe = recipes[key]
      if (!recipe) {
        if (options.onMissing) {
          options.onMissing(key, bone.name)
          continue
        }
        throw new Error(`No paint recipe for "${key}" (bone ${bone.name}).`)
      }

      const frames = faceFrames(cube, scale)
      const faces = Object.fromEntries(
        CUBE_FACES.map((face) => [face, new Brush(canvas, frames[face], scale)]),
      ) as Record<CubeFace, Brush>

      const target: PaintTarget = {
        faces,
        cube,
        boneName: bone.name,
        scale,
        on(names, draw) {
          for (const name of names) draw(faces[name], name)
        },
        sides(draw) {
          for (const name of ['north', 'south', 'east', 'west'] as CubeFace[]) {
            draw(faces[name], name)
          }
        },
      }

      recipe(target)
    }
  }

  return canvas
}

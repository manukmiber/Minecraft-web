/**
 * Built-in entity geometry.
 *
 * Uploading a hand-made `.geo.json` is supported, but most of the time you just
 * want a body that exists so the entity can be tested in-game and shown in the
 * 3D preview. These presets are ordinary Bedrock geometry, generated from the
 * compact bone spec in `bodySpec.ts`, and the same spec feeds the three.js
 * viewer — so what the preview draws is literally what ships.
 */

import { cubePatchSize } from './bodySpec'
import type { BoneSpec, GeometrySpec } from './bodySpec'
import { COMPANION } from './bodies/companion'

export type { BoneSpec, CubeSpec, GeometrySpec } from './bodySpec'
export { cubePatchSize, packBody } from './bodySpec'
export type { BodyDraft, BoneDraft, CubeDraft } from './bodySpec'

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export type BodyPreset = 'biped' | 'bird' | 'post' | 'cube' | 'companion'

export const BODY_PRESET_OPTIONS = [
  {
    value: 'companion',
    label: 'Companion',
    hint: 'Detailed character — layered hair, skirt, boots and eight facial expressions',
  },
  { value: 'biped', label: 'Biped', hint: 'Villager-sized humanoid — NPCs, farmers, traders' },
  { value: 'bird', label: 'Bird', hint: 'Small winged body — crows, pests, critters' },
  { value: 'post', label: 'Post', hint: 'Static cross-shaped prop — scarecrows, totems, markers' },
  { value: 'cube', label: 'Cube', hint: 'Single box — slimes, blobs, placeholder bodies' },
]

/**
 * A biped roughly the proportions of a villager: readable at distance and it
 * animates sensibly with the stock walk animation.
 */
const BIPED: GeometrySpec = {
  textureWidth: 64,
  textureHeight: 64,
  visibleBoundsWidth: 1,
  visibleBoundsHeight: 2,
  visibleBoundsOffset: [0, 1, 0],
  bones: [
    {
      name: 'root',
      pivot: [0, 0, 0],
      cubes: [],
    },
    {
      name: 'body',
      parent: 'root',
      pivot: [0, 24, 0],
      cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 20] }],
    },
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 24, 0],
      cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
    },
    {
      name: 'hat',
      parent: 'head',
      pivot: [0, 24, 0],
      cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [32, 0], inflate: 0.5 }],
    },
    {
      name: 'arm_right',
      parent: 'body',
      pivot: [-5, 22, 0],
      cubes: [{ origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 20] }],
    },
    {
      name: 'arm_left',
      parent: 'body',
      pivot: [5, 22, 0],
      cubes: [{ origin: [4, 12, -2], size: [4, 12, 4], uv: [40, 20], mirror: true }],
    },
    {
      name: 'leg_right',
      parent: 'root',
      pivot: [-2, 12, 0],
      cubes: [{ origin: [-4, 0, -2], size: [4, 12, 4], uv: [0, 20] }],
    },
    {
      name: 'leg_left',
      parent: 'root',
      pivot: [2, 12, 0],
      cubes: [{ origin: [0, 0, -2], size: [4, 12, 4], uv: [0, 20], mirror: true }],
    },
  ],
}

/** Small flier: body, head, tail and two wings that the flap animation drives. */
const BIRD: GeometrySpec = {
  textureWidth: 32,
  textureHeight: 32,
  visibleBoundsWidth: 1,
  visibleBoundsHeight: 1,
  visibleBoundsOffset: [0, 0.5, 0],
  bones: [
    {
      name: 'root',
      pivot: [0, 0, 0],
      cubes: [],
    },
    {
      name: 'body',
      parent: 'root',
      pivot: [0, 5, 0],
      cubes: [{ origin: [-2, 3, -3], size: [4, 5, 6], uv: [0, 0] }],
    },
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 8, -3],
      cubes: [
        { origin: [-2, 7, -5], size: [4, 4, 3], uv: [0, 11] },
        // Beak.
        { origin: [-1, 8, -7], size: [2, 2, 2], uv: [14, 11] },
      ],
    },
    {
      name: 'wing_right',
      parent: 'body',
      pivot: [-2, 7, -1],
      cubes: [{ origin: [-3, 4, -3], size: [1, 4, 6], uv: [20, 0] }],
    },
    {
      name: 'wing_left',
      parent: 'body',
      pivot: [2, 7, -1],
      cubes: [{ origin: [2, 4, -3], size: [1, 4, 6], uv: [20, 0], mirror: true }],
    },
    {
      name: 'tail',
      parent: 'body',
      pivot: [0, 5, 3],
      cubes: [{ origin: [-1, 4, 3], size: [2, 1, 4], uv: [22, 11] }],
    },
    {
      name: 'leg_right',
      parent: 'root',
      pivot: [-1, 3, 0],
      cubes: [{ origin: [-2, 0, -1], size: [1, 3, 1], uv: [26, 0] }],
    },
    {
      name: 'leg_left',
      parent: 'root',
      pivot: [1, 3, 0],
      cubes: [{ origin: [1, 0, -1], size: [1, 3, 1], uv: [26, 0], mirror: true }],
    },
  ],
}

/** Cross-shaped prop on a stake — the classic scarecrow silhouette. */
const POST: GeometrySpec = {
  textureWidth: 64,
  textureHeight: 64,
  visibleBoundsWidth: 2,
  visibleBoundsHeight: 3,
  visibleBoundsOffset: [0, 1.5, 0],
  bones: [
    {
      name: 'root',
      pivot: [0, 0, 0],
      cubes: [],
    },
    {
      name: 'stake',
      parent: 'root',
      pivot: [0, 0, 0],
      cubes: [{ origin: [-2, 0, -2], size: [4, 20, 4], uv: [0, 20] }],
    },
    {
      name: 'body',
      parent: 'stake',
      pivot: [0, 20, 0],
      cubes: [{ origin: [-5, 16, -3], size: [10, 14, 6], uv: [16, 34] }],
    },
    {
      name: 'crossbar',
      parent: 'body',
      pivot: [0, 28, 0],
      cubes: [{ origin: [-14, 26, -2], size: [28, 3, 4], uv: [0, 48] }],
    },
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 30, 0],
      cubes: [{ origin: [-4, 30, -4], size: [8, 8, 8], uv: [0, 0] }],
    },
    {
      name: 'hat',
      parent: 'head',
      pivot: [0, 38, 0],
      cubes: [
        { origin: [-7, 38, -7], size: [14, 1, 14], uv: [24, 0] },
        { origin: [-4, 39, -4], size: [8, 4, 8], uv: [32, 16] },
      ],
    },
  ],
}

const CUBE: GeometrySpec = {
  textureWidth: 32,
  textureHeight: 32,
  visibleBoundsWidth: 1,
  visibleBoundsHeight: 1,
  visibleBoundsOffset: [0, 0.5, 0],
  bones: [
    {
      name: 'root',
      pivot: [0, 0, 0],
      cubes: [{ origin: [-6, 0, -6], size: [12, 12, 12], uv: [0, 0] }],
    },
  ],
}

const PRESETS: Record<BodyPreset, GeometrySpec> = {
  biped: BIPED,
  bird: BIRD,
  post: POST,
  cube: CUBE,
  companion: COMPANION,
}

export function getBodyPreset(preset: string): GeometrySpec {
  return PRESETS[(preset as BodyPreset) in PRESETS ? (preset as BodyPreset) : 'cube']
}

/** Turns a spec into the `.geo.json` Bedrock expects. */
export function buildGeometryJson(
  identifier: string,
  spec: GeometrySpec,
  formatVersion: string,
): unknown {
  return {
    format_version: formatVersion,
    'minecraft:geometry': [
      {
        description: {
          identifier,
          texture_width: spec.textureWidth,
          texture_height: spec.textureHeight,
          visible_bounds_width: spec.visibleBoundsWidth,
          visible_bounds_height: spec.visibleBoundsHeight,
          visible_bounds_offset: spec.visibleBoundsOffset,
        },
        bones: spec.bones
          // A bone with no cubes is only useful as a parent; keep it, Bedrock
          // relies on empty root bones for animation pivots.
          .map((bone) => ({
            name: bone.name,
            ...(bone.parent ? { parent: bone.parent } : {}),
            pivot: bone.pivot,
            ...(bone.rotation ? { rotation: bone.rotation } : {}),
            ...(bone.cubes.length > 0
              ? {
                  cubes: bone.cubes.map((cube) => ({
                    origin: cube.origin,
                    size: cube.size,
                    uv: cube.uv,
                    ...(cube.inflate ? { inflate: cube.inflate } : {}),
                    // Bedrock only honours a cube rotation when the cube also
                    // carries its own pivot, so the two travel together.
                    ...(cube.rotation
                      ? { rotation: cube.rotation, pivot: cube.pivot ?? bone.pivot }
                      : {}),
                    ...(cube.mirror ? { mirror: true } : {}),
                  })),
                }
              : {}),
          })),
      },
    ],
  }
}

/** The variant groups a spec declares, in the order the bones appear. */
export function variantGroups(spec: GeometrySpec): Map<string, BoneSpec[]> {
  const groups = new Map<string, BoneSpec[]>()
  for (const bone of spec.bones) {
    if (!bone.variant) continue
    const list = groups.get(bone.variant.group)
    if (list) list.push(bone)
    else groups.set(bone.variant.group, [bone])
  }
  return groups
}

/**
 * One labelled rectangle on an entity's texture sheet.
 *
 * A Bedrock cube unwraps into the cross layout `applyBoxUv` samples from, so
 * the patch a single cube occupies is `2*(depth+width)` wide and
 * `depth+height` tall, anchored at its UV origin. Handing those rectangles to
 * the pixel editor is what turns a blank 64x64 square into a template with a
 * head, a body and two wings on it.
 */
export interface UvRegion {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export function geometryUvRegions(spec: GeometrySpec): UvRegion[] {
  // Mirrored limbs deliberately share one patch of the sheet, so they are
  // collapsed into a single region — two labels stacked on the same rectangle
  // would be unreadable and would suggest there are two areas to paint.
  const byRect = new Map<string, { region: UvRegion; labels: string[] }>()

  for (const bone of spec.bones) {
    bone.cubes.forEach((cube, index) => {
      const { width, height } = cubePatchSize(cube.size)
      const region: UvRegion = {
        label: cube.label ?? (bone.cubes.length > 1 ? `${bone.name} ${index + 1}` : bone.name),
        x: cube.uv[0],
        y: cube.uv[1],
        width,
        height,
      }
      const key = `${region.x},${region.y},${region.width},${region.height}`
      const existing = byRect.get(key)
      if (existing) existing.labels.push(region.label)
      else byRect.set(key, { region, labels: [region.label] })
    })
  }

  return [...byRect.values()].map(({ region, labels }) =>
    labels.length > 1 ? { ...region, label: `${sharedName(labels)} (mirrored)` } : region,
  )
}

/** `leg_right` + `leg_left` -> `leg`. Falls back to the first name. */
function sharedName(labels: string[]): string {
  const parts = labels.map((label) => label.split('_'))
  const shared: string[] = []
  for (let i = 0; i < parts[0].length; i++) {
    const segment = parts[0][i]
    if (!parts.every((part) => part[i] === segment)) break
    shared.push(segment)
  }
  return shared.length > 0 ? shared.join('_') : labels[0]
}

/** The sheet size a body preset's UVs are laid out against. */
export function presetSheetSize(preset: string): { width: number; height: number } {
  const spec = getBodyPreset(preset)
  return { width: spec.textureWidth, height: spec.textureHeight }
}

/**
 * The companion body.
 *
 * Where the other presets are a torso and four limbs, this one is a character:
 * layered hair with bangs and twin tails, an open jacket over a shirt, a pleated
 * skirt in four panels that can swing independently, boots, and eight facial
 * expressions stacked as alternative bones.
 *
 * The shape is a Minecraft reading of a slim teenage figure — thirty-one units
 * tall, so she stands a head above a villager and level with a player. Every
 * cube keeps an integer size, because a cube's texture patch is derived from its
 * size and a fractional one would land the artwork between texels; layering is
 * done with fractional *origins* and `inflate` instead, which leave the UV
 * grid alone.
 *
 * Nothing here is hand-placed on the sheet. Cubes declare which paint recipe
 * fills them and, for a mirrored pair, which patch they share; `packBody` works
 * out the layout and `paintCompanion` fills it in, so the geometry and the
 * artwork cannot drift apart.
 */

import { packBody } from '../bodySpec'
import type { BodyDraft, CubeDraft, GeometrySpec } from '../bodySpec'

/** Every expression the face can wear, in the order the render controller ranks them. */
export const FACE_EXPRESSIONS = [
  'neutral',
  'blink',
  'smile',
  'happy',
  'surprised',
  'hurt',
  'sleepy',
  'sing',
] as const

export type FaceExpression = (typeof FACE_EXPRESSIONS)[number]

/** The bone that carries one expression. */
export function faceBoneName(expression: string): string {
  return `face_${expression}`
}

/**
 * Reflects a cube across x = 0.
 *
 * Writing the left side out by hand is how a model ends up with one boot a
 * quarter unit further forward than the other, so only the right side is
 * authored and the left is derived.
 */
function mirrored(cube: CubeDraft): CubeDraft {
  const [x, y, z] = cube.origin
  const [w, h, d] = cube.size
  return {
    ...cube,
    origin: [-(x + w), y, z],
    size: [w, h, d],
    mirror: !cube.mirror,
    ...(cube.rotation
      ? { rotation: [cube.rotation[0], -cube.rotation[1], -cube.rotation[2]] as [number, number, number] }
      : {}),
    ...(cube.pivot ? { pivot: [-cube.pivot[0], cube.pivot[1], cube.pivot[2]] as [number, number, number] } : {}),
  }
}

/** One 0-thickness plane per expression, all sitting a hair in front of the face. */
function faceBones() {
  return FACE_EXPRESSIONS.map((expression) => ({
    name: faceBoneName(expression),
    parent: 'head',
    pivot: [0, 23, 0] as [number, number, number],
    variant: { group: 'face', name: expression },
    cubes: [
      {
        // A zero-depth cube renders as a double-sided plane, and its box UV
        // puts the front face in the left half of the patch — which is what
        // makes one 16x8 rectangle enough for a whole expression.
        origin: [-4, 23, -4.03] as [number, number, number],
        size: [8, 8, 0] as [number, number, number],
        paint: `face:${expression}`,
        label: `face · ${expression}`,
      },
    ],
  }))
}

const RIGHT_LEG: CubeDraft[] = [
  // Over-the-knee sock.
  { origin: [-3.3, 3, -1.5], size: [3, 9, 3], paint: 'sock', share: 'leg', label: 'sock' },
  // High-top trainer with a chunky sole.
  { origin: [-3.8, 0, -2.6], size: [4, 3, 5], paint: 'boot', share: 'boot', label: 'boot' },
]

const RIGHT_ARM: CubeDraft[] = [
  { origin: [-6.6, 15, -1.5], size: [3, 7, 3], paint: 'sleeve', share: 'sleeve', label: 'sleeve' },
  { origin: [-6.6, 14, -1.5], size: [3, 2, 3], inflate: 0.3, paint: 'cuff', share: 'cuff', label: 'cuff' },
  { origin: [-6.5, 12, -1.4], size: [3, 2, 3], paint: 'hand', share: 'hand', label: 'hand' },
]

const DRAFT: BodyDraft = {
  textureWidth: 128,
  textureHeight: 128,
  visibleBoundsWidth: 2.5,
  visibleBoundsHeight: 2.6,
  visibleBoundsOffset: [0, 1.1, 0],
  bones: [
    { name: 'root', pivot: [0, 0, 0], cubes: [] },

    // -- legs ---------------------------------------------------------------
    { name: 'leg_right', parent: 'root', pivot: [-1.8, 12, 0], cubes: RIGHT_LEG },
    { name: 'leg_left', parent: 'root', pivot: [1.8, 12, 0], cubes: RIGHT_LEG.map(mirrored) },

    // -- torso --------------------------------------------------------------
    {
      name: 'body',
      parent: 'root',
      pivot: [0, 12, 0],
      cubes: [
        // Shirt. Everything else on the torso is a shell around this.
        { origin: [-3.5, 12, -2], size: [7, 11, 4], paint: 'shirt', label: 'shirt' },
        // Open denim jacket, inflated so it reads as a second garment rather
        // than a print on the shirt.
        { origin: [-3.5, 14, -2], size: [7, 8, 4], inflate: 0.45, paint: 'jacket', label: 'jacket' },
        // The printed tape band across the chest.
        { origin: [-3.5, 16.5, -2], size: [7, 1, 4], inflate: 0.62, paint: 'tape', label: 'chest tape' },
        { origin: [-3.5, 21, -2], size: [7, 2, 4], inflate: 0.9, paint: 'collar', label: 'collar' },
        { origin: [-3.5, 9, -1.6], size: [7, 4, 3], paint: 'shorts', label: 'shorts' },
        { origin: [-1.5, 22, -1.5], size: [3, 2, 3], paint: 'neck', label: 'neck' },
      ],
    },

    // -- skirt: four panels, each free to swing on its own -------------------
    { name: 'skirt', parent: 'body', pivot: [0, 13, 0], cubes: [] },
    {
      name: 'skirt_front',
      parent: 'skirt',
      pivot: [0, 13, -1.8],
      rotation: [-16, 0, 0],
      cubes: [{ origin: [-4.5, 8, -2.5], size: [9, 5, 1], paint: 'skirt', share: 'skirt_panel', label: 'skirt panel' }],
    },
    {
      name: 'skirt_back',
      parent: 'skirt',
      pivot: [0, 13, 1.8],
      rotation: [16, 0, 0],
      cubes: [{ origin: [-4.5, 8, 1.5], size: [9, 5, 1], paint: 'skirt', share: 'skirt_panel', label: 'skirt panel' }],
    },
    {
      name: 'skirt_right',
      parent: 'skirt',
      pivot: [-3, 13, 0],
      rotation: [0, 0, 16],
      cubes: [{ origin: [-4, 8, -2.5], size: [1, 5, 5], paint: 'skirt_side', share: 'skirt_side', label: 'skirt side' }],
    },
    {
      name: 'skirt_left',
      parent: 'skirt',
      pivot: [3, 13, 0],
      rotation: [0, 0, -16],
      cubes: [
        { origin: [3, 8, -2.5], size: [1, 5, 5], mirror: true, paint: 'skirt_side', share: 'skirt_side', label: 'skirt side' },
      ],
    },

    // -- arms ---------------------------------------------------------------
    { name: 'arm_right', parent: 'body', pivot: [-4, 22, 0], cubes: RIGHT_ARM },
    { name: 'arm_left', parent: 'body', pivot: [4, 22, 0], cubes: RIGHT_ARM.map(mirrored) },

    // -- head ---------------------------------------------------------------
    {
      name: 'head',
      parent: 'body',
      pivot: [0, 23, 0],
      cubes: [
        { origin: [-4, 23, -4], size: [8, 8, 8], paint: 'head', label: 'head' },
        { origin: [-4.6, 25, -1], size: [1, 2, 1], paint: 'ear', share: 'ear', label: 'ear' },
        { origin: [3.6, 25, -1], size: [1, 2, 1], mirror: true, paint: 'ear', share: 'ear', label: 'ear' },
      ],
    },

    ...faceBones(),

    // -- hair ---------------------------------------------------------------
    {
      // A shell over the whole skull. Its front face is painted as bangs with
      // everything below them transparent, which is what cuts the face out.
      name: 'hair',
      parent: 'head',
      pivot: [0, 23, 0],
      cubes: [
        { origin: [-4, 23, -4], size: [8, 8, 8], inflate: 0.6, paint: 'hair_cap', label: 'hair + bangs' },
        // The volume behind the head, and a narrower nape section under it —
        // one slab of the full height reads as a board rather than as hair.
        { origin: [-4.5, 21, 2.2], size: [9, 10, 3], paint: 'hair_back', label: 'back hair' },
        { origin: [-3, 16, 2.6], size: [6, 6, 2], paint: 'hair_nape', label: 'nape' },
        // Locks framing the face, standing proud of the cheeks.
        { origin: [-5, 24, -4.6], size: [2, 6, 3], paint: 'hair_side', share: 'hair_side', label: 'side lock' },
        { origin: [3, 24, -4.6], size: [2, 6, 3], mirror: true, paint: 'hair_side', share: 'hair_side', label: 'side lock' },
        // The cowlick. Rotated, so it reads as hair rather than as an antenna.
        {
          origin: [-0.5, 30.6, -1],
          size: [1, 3, 1],
          rotation: [-28, 0, 14],
          pivot: [0, 30.6, -0.5],
          paint: 'hair_light',
          label: 'cowlick',
        },
        // Hairpin.
        { origin: [1.4, 29.4, -4.75], size: [3, 1, 1], paint: 'clip', label: 'hairpin' },
      ],
    },

    // -- twin tails: tied at the sides and splayed outward, so they read from
    //    the front instead of disappearing into the back hair ----------------
    {
      name: 'tail_right',
      parent: 'head',
      pivot: [-4.2, 26.5, 2.8],
      rotation: [3, 0, -9],
      cubes: [
        { origin: [-5.9, 25.4, 1.8], size: [3, 2, 2], paint: 'ribbon', share: 'ribbon', label: 'ribbon' },
        { origin: [-5.9, 20, 1.8], size: [3, 6, 3], paint: 'tail_upper', share: 'tail_upper', label: 'tail' },
      ],
    },
    {
      name: 'tail_right_tip',
      parent: 'tail_right',
      pivot: [-4.4, 20.5, 3.3],
      rotation: [3, 0, -6],
      cubes: [
        { origin: [-5.4, 14.5, 2.3], size: [2, 6, 2], paint: 'tail_lower', share: 'tail_lower', label: 'tail tip' },
      ],
    },
    {
      name: 'tail_left',
      parent: 'head',
      pivot: [4.2, 26.5, 2.8],
      rotation: [3, 0, 9],
      cubes: [
        { origin: [2.9, 25.4, 1.8], size: [3, 2, 2], mirror: true, paint: 'ribbon', share: 'ribbon', label: 'ribbon' },
        { origin: [2.9, 20, 1.8], size: [3, 6, 3], mirror: true, paint: 'tail_upper', share: 'tail_upper', label: 'tail' },
      ],
    },
    {
      name: 'tail_left_tip',
      parent: 'tail_left',
      pivot: [4.4, 20.5, 3.3],
      rotation: [3, 0, 6],
      cubes: [
        { origin: [3.4, 14.5, 2.3], size: [2, 6, 2], mirror: true, paint: 'tail_lower', share: 'tail_lower', label: 'tail tip' },
      ],
    },
  ],
}

export const COMPANION: GeometrySpec = packBody(DRAFT)

/** The draft is what the skin painter walks; the packed spec is what ships. */
export const COMPANION_DRAFT = DRAFT

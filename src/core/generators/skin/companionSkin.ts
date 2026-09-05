/**
 * The companion's artwork.
 *
 * Every garment, every lock of hair and all eight expressions are painted here
 * in model units, so the sheet is a *description* of the character rather than a
 * PNG somebody has to open in an editor to change. Widen the fringe, move the
 * blush, restyle the jacket — it is all in this file, and re-running
 * `node scripts/make-companion.mjs` re-renders it at any resolution.
 *
 * The palette is read off a reference sheet for the character: pale champagne
 * hair with warm shadows, amber eyes, and a denim-and-pink stage outfit over a
 * white shirt. Only the colours were taken; the pixel art is drawn from scratch
 * here, because a Minecraft entity sheet has nothing in common with the UV
 * layout of the model it was sampled from.
 */

import { Brush, mix, rgba, shade } from './canvas'
import type { Canvas, Rgba } from './canvas'
import { paintBody } from './paintBody'
import type { PaintRecipe } from './paintBody'
import { COMPANION, FACE_EXPRESSIONS } from '../bodies/companion'
import type { FaceExpression } from '../bodies/companion'

/* -------------------------------------------------------------------------- */
/* Palette                                                                     */
/* -------------------------------------------------------------------------- */

export const PALETTE = {
  hairTip: rgba('#fdf6e2'),
  hairLight: rgba('#f3e6c8'),
  hairMid: rgba('#dfcaa2'),
  hairShade: rgba('#bda87f'),
  hairDeep: rgba('#8f7c58'),

  skin: rgba('#f9efe3'),
  skinMid: rgba('#f2ded0'),
  skinShade: rgba('#e0bfae'),
  blush: rgba('#f4a7b3'),
  lash: rgba('#33222a'),
  lashSoft: rgba('#5d4048'),

  eyeDark: rgba('#7c4d1d'),
  eyeMid: rgba('#b3862f'),
  eyeLight: rgba('#eec877'),
  eyePupil: rgba('#241505'),
  eyeWhite: rgba('#fdf9f4'),

  navy: rgba('#40567f'),
  navyDark: rgba('#2b3752'),
  navyLight: rgba('#5c76a4'),

  white: rgba('#f4f2ef'),
  whiteDim: rgba('#d9d6d2'),
  grey: rgba('#c9ccd4'),
  black: rgba('#262a35'),

  pink: rgba('#f7a2b4'),
  hotPink: rgba('#e8306e'),
  gold: rgba('#e6c35c'),
} as const

const P = PALETTE

/* -------------------------------------------------------------------------- */
/* Reusable strokes                                                            */
/* -------------------------------------------------------------------------- */

/** Vertical streaks that read as strands rather than as a flat block of colour. */
function strands(brush: Brush, tint: Rgba, seed: number, density = 0.55): void {
  const step = 0.5
  for (let x = 0; x < brush.width; x += step) {
    const roll = hashAt(x, seed)
    if (roll > density) continue
    const top = roll * brush.height * 0.35
    const length = brush.height * (0.35 + roll * 0.6)
    brush.box(x, top, step * 0.6, length, tint)
  }
}

/** Stitching along a seam — two texel dashes, the way denim reads at 4x. */
function stitch(brush: Brush, x: number, y: number, length: number, color: Rgba): void {
  for (let at = 0; at < length; at += 0.75) {
    brush.box(x, y + at, 0.25, 0.4, color)
  }
}

function hashAt(x: number, seed: number): number {
  const value = Math.sin((x + 1) * 12.9898 + seed * 78.233) * 43758.5453
  return value - Math.floor(value)
}

/** Cloth: a lit top edge, a shadowed hem, a little grain. */
function garment(brush: Brush, base: Rgba, seed: number): void {
  brush.gradient(shade(base, 0.09), shade(base, -0.14))
  brush.grain(0.05, seed)
}

/* -------------------------------------------------------------------------- */
/* Faces                                                                       */
/* -------------------------------------------------------------------------- */

type EyeShape = 'open' | 'closed' | 'half' | 'arc' | 'squeeze' | 'wide'
type MouthShape = 'neutral' | 'smile' | 'grin' | 'small' | 'oh' | 'wave' | 'sing'
type BrowShape = 'flat' | 'raised' | 'worried' | 'happy'

interface FaceStyle {
  eyes: EyeShape
  mouth: MouthShape
  brows: BrowShape
  blush: number
  /** A tear at the outer corner, for the hurt face. */
  tear?: boolean
}

const FACE_STYLES: Record<FaceExpression, FaceStyle> = {
  neutral: { eyes: 'open', mouth: 'neutral', brows: 'flat', blush: 0.35 },
  blink: { eyes: 'closed', mouth: 'neutral', brows: 'flat', blush: 0.35 },
  smile: { eyes: 'half', mouth: 'smile', brows: 'happy', blush: 0.55 },
  happy: { eyes: 'arc', mouth: 'grin', brows: 'happy', blush: 0.85 },
  surprised: { eyes: 'wide', mouth: 'oh', brows: 'raised', blush: 0.3 },
  hurt: { eyes: 'squeeze', mouth: 'wave', brows: 'worried', blush: 0.5, tear: true },
  sleepy: { eyes: 'half', mouth: 'small', brows: 'worried', blush: 0.25 },
  sing: { eyes: 'arc', mouth: 'sing', brows: 'happy', blush: 0.7 },
}

/** Where the features sit on the eight-unit-square face plane. */
const FACE_LAYOUT = {
  eyeWidth: 2.2,
  eyeHeight: 2.45,
  eyeTop: 3.45,
  leftEyeX: 1,
  rightEyeX: 4.8,
  browY: 3.05,
  mouthY: 6.3,
  centreX: 4,
}

function drawEye(brush: Brush, x: number, style: EyeShape): void {
  const { eyeWidth: w, eyeHeight: h, eyeTop: y } = FACE_LAYOUT
  const cx = x + w / 2
  const cy = y + h / 2

  if (style === 'closed' || style === 'arc' || style === 'squeeze') {
    // A lash arc rather than an eye. Three shapes share the code because they
    // differ only in which way the curve bends: up for a happy squint, down
    // when scrunched shut, flat for an ordinary blink.
    const bend = style === 'arc' ? -0.85 : style === 'squeeze' ? 0.85 : 0
    const steps = 12
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const curve = bend * (0.5 - Math.abs(t - 0.5)) * 1.5
      brush.box(x + t * w - 0.14, cy + curve - 0.18, 0.32, 0.36, P.lash)
    }
    // Lashes at the outer corner, which is what keeps a closed eye from
    // reading as a pencil stroke.
    const outer = x < FACE_LAYOUT.centreX ? x - 0.1 : x + w - 0.2
    brush.box(outer, cy - 0.45, 0.3, 0.3, P.lash)
    if (style !== 'squeeze') brush.box(x + w * 0.2, cy + 0.5, w * 0.6, 0.2, P.lashSoft)
    return
  }

  const lidDrop = style === 'half' ? 0.85 : 0
  const top = y + lidDrop
  const height = h - lidDrop + (style === 'wide' ? 0.25 : 0)
  const lashHeight = 0.45

  // Sclera. Kept as a thin margin around the iris — an anime eye is mostly
  // iris, and a wide white border is what makes a pixel face look startled.
  brush.box(x + 0.15, top + 0.2, w - 0.3, height - 0.4, P.eyeWhite)

  // Iris: taller than it is wide, amber, shaded under the lid and brightening
  // towards the lower rim where the light bounces in.
  const irisRx = w * 0.4
  const irisRy = (height - lashHeight - 0.2) * 0.5
  const irisCx = cx
  const irisCy = top + lashHeight + irisRy
  brush.ellipse(irisCx, irisCy, irisRx, irisRy, P.eyeMid)
  brush.ellipse(irisCx, irisCy - irisRy * 0.48, irisRx * 0.95, irisRy * 0.42, P.eyeDark)
  brush.ellipse(irisCx, irisCy + irisRy * 0.52, irisRx * 0.86, irisRy * 0.4, P.eyeLight)
  brush.ellipse(irisCx, irisCy + irisRy * 0.08, irisRx * 0.36, irisRy * 0.52, P.eyePupil)

  // Highlights — the big one up and to the left, a pinprick opposite.
  brush.box(irisCx - irisRx * 0.72, irisCy - irisRy * 0.6, 0.38, 0.42, P.eyeWhite)
  brush.box(irisCx + irisRx * 0.28, irisCy + irisRy * 0.38, 0.22, 0.24, P.eyeWhite)

  if (style === 'half') {
    // A heavy lid: skin over the top of the eye, with the lash line riding on
    // its edge. This is all "sleepy" and "fond" really are.
    brush.box(x - 0.1, y - 0.1, w + 0.2, lidDrop + 0.2, P.skinMid)
    brush.box(x - 0.1, y + lidDrop - 0.05, w + 0.2, 0.25, P.skinShade)
  }

  // Upper lash line, thickened at the outer corner the way eyeliner sits.
  brush.box(x, top, w, lashHeight, P.lash)
  const outer = x < FACE_LAYOUT.centreX ? x - 0.15 : x + w - 0.25
  brush.box(outer, top + 0.2, 0.4, 0.5, P.lash)
  // Lower lid.
  brush.box(x + 0.3, y + h - 0.26, w - 0.6, 0.2, P.lashSoft)
}

function drawBrow(brush: Brush, x: number, style: BrowShape): void {
  const w = FACE_LAYOUT.eyeWidth
  const y = FACE_LAYOUT.browY
  const inner = x < FACE_LAYOUT.centreX ? x + w - 0.4 : x + 0.4
  const outer = x < FACE_LAYOUT.centreX ? x + 0.2 : x + w - 0.2
  const tilt =
    style === 'raised' ? -0.35 : style === 'worried' ? 0.45 : style === 'happy' ? -0.15 : 0
  brush
    .line(outer, y, inner, y + tilt, P.hairShade, 0.35)
    .line(outer, y + 0.12, inner, y + tilt + 0.12, mix(P.hairShade, P.lash, 0.35), 0.2)
}

function drawMouth(brush: Brush, style: MouthShape): void {
  const cx = FACE_LAYOUT.centreX
  const y = FACE_LAYOUT.mouthY
  const lip = rgba('#c9616d')
  const inner = rgba('#8e3444')
  const tongue = rgba('#e07a86')

  /** A smile is an arc, and an arc is a row of texels stepping down and back up. */
  const arc = (halfWidth: number, depth: number, color: Rgba, thickness = 0.3): void => {
    const steps = 10
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      const dx = (t - 0.5) * 2
      brush.box(cx + dx * halfWidth - 0.15, y + (1 - dx * dx) * depth, thickness, thickness, color)
    }
  }

  switch (style) {
    case 'neutral':
      brush.box(cx - 0.35, y + 0.2, 0.7, 0.24, lip)
      brush.box(cx - 0.15, y + 0.4, 0.3, 0.16, mix(lip, P.skin, 0.45))
      break
    case 'small':
      brush.box(cx - 0.28, y + 0.2, 0.56, 0.26, lip)
      break
    case 'smile':
      arc(0.72, 0.42, lip, 0.26)
      break
    case 'grin':
      // An open smile: the mouth shape, then the tongue, then a lip line on top.
      brush.ellipse(cx, y + 0.45, 0.72, 0.45, inner)
      brush.ellipse(cx, y + 0.62, 0.5, 0.24, tongue)
      brush.box(cx - 0.72, y + 0.12, 1.44, 0.22, lip)
      break
    case 'oh':
      brush.ellipse(cx, y + 0.45, 0.42, 0.55, inner)
      brush.ellipse(cx, y + 0.6, 0.24, 0.26, tongue)
      break
    case 'wave':
      // A wobbly line: the mouth of somebody trying not to complain.
      for (let i = 0; i < 5; i++) {
        brush.box(cx - 0.65 + i * 0.26, y + 0.2 + (i % 2 === 0 ? 0 : 0.2), 0.3, 0.26, lip)
      }
      break
    case 'sing':
      brush.ellipse(cx, y + 0.5, 0.55, 0.68, inner)
      brush.ellipse(cx, y + 0.8, 0.36, 0.28, tongue)
      brush.box(cx - 0.55, y - 0.05, 1.1, 0.22, lip)
      break
  }
}

/** One expression, drawn onto the front half of a face plane's patch. */
export function drawFace(brush: Brush, expression: FaceExpression): void {
  const style = FACE_STYLES[expression]
  const { leftEyeX, rightEyeX } = FACE_LAYOUT

  if (style.blush > 0) {
    const tint: Rgba = [P.blush[0], P.blush[1], P.blush[2], Math.round(175 * style.blush)]
    const dash: Rgba = [P.blush[0], P.blush[1], P.blush[2], Math.round(235 * style.blush)]
    for (const cx of [1.35, 6.65]) {
      brush.ellipse(cx, 5.95, 1, 0.5, tint)
      // Two brighter strokes inside each patch — the standard anime blush.
      brush.box(cx - 0.5, 5.72, 0.24, 0.48, dash)
      brush.box(cx + 0.1, 5.72, 0.24, 0.48, dash)
    }
  }

  // Nose: one shadow texel. Any more and it stops reading as anime.
  brush.box(FACE_LAYOUT.centreX + 0.2, 5.6, 0.28, 0.26, rgba('#e9c6b6'))

  drawBrow(brush, leftEyeX, style.brows)
  drawBrow(brush, rightEyeX, style.brows)
  drawEye(brush, leftEyeX, style.eyes)
  drawEye(brush, rightEyeX, style.eyes)
  drawMouth(brush, style.mouth)

  if (style.tear) {
    // Welling under the outer corner of each eye rather than running down the
    // side of the face, where the hair would cover it anyway.
    for (const x of [leftEyeX + 0.35, rightEyeX + FACE_LAYOUT.eyeWidth - 0.65]) {
      brush.box(x, 4.85, 0.3, 0.7, rgba('#b8dcf2'))
      brush.box(x, 5.4, 0.3, 0.3, rgba('#7cb8e4'))
      brush.box(x - 0.12, 4.85, 0.14, 0.4, rgba('#ffffffcc'))
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/** Skin with a soft top-lit gradient — used for anything bare. */
const skinRecipe: PaintRecipe = ({ sides, faces }) => {
  sides((brush) => {
    brush.gradient(P.skin, P.skinMid)
    brush.roundX(0.05, -0.1)
  })
  faces.up.fill(P.skin)
  faces.down.fill(P.skinShade)
}

const RECIPES: Record<string, PaintRecipe> = {
  /* -- head and skin ----------------------------------------------------- */

  head: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.skin, P.skinMid)
      brush.roundX(0.06, -0.12)
    })
    // The jaw catches a little shadow from the hair.
    faces.north.box(0, 6.6, 8, 1.4, rgba('#e9c9b8aa'))
    faces.north.box(0, 0, 8, 3.2, rgba('#dbb9a955'))
    faces.up.fill(P.skin)
    faces.down.fill(P.skinShade)
  },

  neck: skinRecipe,
  hand: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.skin, P.skinMid)
      brush.roundX(0.05, -0.12)
      // Fingers, suggested with two shadow lines.
      brush.box(brush.width * 0.33, brush.height * 0.55, 0.16, brush.height * 0.45, P.skinShade)
      brush.box(brush.width * 0.66, brush.height * 0.55, 0.16, brush.height * 0.45, P.skinShade)
    })
    faces.up.fill(P.skinMid)
    faces.down.fill(P.skinShade)
  },
  ear: skinRecipe,

  /* -- hair -------------------------------------------------------------- */

  hair_cap: ({ faces }) => {
    for (const face of ['south', 'east', 'west'] as const) {
      const brush = faces[face]
      brush.gradient(P.hairLight, P.hairMid)
      strands(brush, shade(P.hairShade, 0.08), face === 'south' ? 3 : 7, 0.5)
      brush.grain(0.06, 11)
    }
    faces.up.gradient(P.hairTip, P.hairLight)
    faces.up.grain(0.05, 4)
    // A centre parting, so the top does not read as a helmet.
    faces.up.box(3.85, 0, 0.3, 8, shade(P.hairMid, -0.12))
    faces.down.fill(shade(P.hairDeep, -0.15))

    // The fringe. Everything below the cut line is punched out so the face
    // underneath shows through — that hole is what makes this hair and not a hat.
    const front = faces.north
    front.gradient(P.hairTip, P.hairMid)
    strands(front, rgba('#cbb68c55'), 5, 0.4)
    front.grain(0.04, 9)

    const cut = (x: number): number => {
      const fromCentre = (x - 4) / 4
      // Shorter over the eyes, longer at the temples, with a dip at the parting.
      let depth = 2.4 + 1.35 * fromCentre * fromCentre
      if (Math.abs(x - 4) < 0.9) depth += 0.5
      // Jitter quantised to a whole unit: enough to break the curve up, not so
      // much that neighbouring columns disagree and the fringe turns into a comb.
      return depth + hashAt(Math.floor(x), 21) * 0.28
    }

    const step = 0.25
    for (let x = 0; x < 8; x += step) {
      const depth = cut(x)
      front.erase(x, depth, step, 8 - depth)
      // A darker tip where each strand ends, which is what sells the cut.
      front.box(x, depth - 0.55, step, 0.55, rgba('#c2ab7f80'))
      front.box(x, depth - 0.2, step, 0.2, rgba('#a8916688'))
    }
  },

  hair_back: ({ faces, sides }) => {
    sides((brush, face) => {
      brush.gradient(P.hairLight, P.hairShade)
      strands(brush, shade(P.hairMid, -0.12), face === 'south' ? 13 : 17, 0.6)
      brush.grain(0.06, 23)
      // The ends are lighter — hair thins out towards the tip.
      brush.gradient(rgba('#00000000'), rgba('#fdf6e277'), {
        x: 0,
        y: brush.height * 0.7,
        w: brush.width,
        h: brush.height * 0.3,
      })
    })
    faces.up.fill(P.hairMid)
    faces.down.fill(shade(P.hairDeep, -0.1))
  },

  hair_nape: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.hairMid, P.hairLight)
      strands(brush, shade(P.hairShade, -0.05), 19, 0.6)
      brush.grain(0.05, 27)
    })
    faces.up.fill(P.hairShade)
    faces.down.fill(P.hairTip)
  },

  hair_side: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.hairTip, P.hairMid)
      strands(brush, shade(P.hairShade, 0.1), 29, 0.65)
      brush.roundX(0.08, -0.1)
    })
    faces.up.fill(P.hairLight)
    faces.down.fill(P.hairTip)
  },

  hair_light: ({ faces, sides }) => {
    sides((brush) => brush.gradient(P.hairTip, P.hairLight))
    faces.up.fill(P.hairTip)
    faces.down.fill(P.hairMid)
  },

  tail_upper: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.hairLight, P.hairMid)
      strands(brush, shade(P.hairShade, 0.05), 31, 0.7)
      brush.roundX(0.1, -0.14)
    })
    faces.up.fill(P.hairMid)
    faces.down.fill(P.hairMid)
  },

  tail_lower: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.hairMid, P.hairTip)
      strands(brush, shade(P.hairLight, 0.05), 37, 0.7)
      brush.roundX(0.1, -0.12)
    })
    faces.up.fill(P.hairMid)
    faces.down.fill(P.hairTip)
  },

  ribbon: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.hotPink, shade(P.hotPink, -0.25))
      // The knot in the middle, and a highlight along the top of each loop.
      brush.box(brush.width / 2 - 0.35, 0, 0.7, brush.height, shade(P.hotPink, -0.35))
      brush.box(0.15, 0.2, brush.width / 2 - 0.7, 0.3, shade(P.hotPink, 0.4))
      brush.box(brush.width / 2 + 0.55, 0.2, brush.width / 2 - 0.7, 0.3, shade(P.hotPink, 0.4))
    })
    faces.up.fill(shade(P.hotPink, 0.15))
    faces.down.fill(shade(P.hotPink, -0.3))
  },

  clip: ({ faces, sides }) => {
    sides((brush) => {
      brush.fill(P.hotPink)
      brush.box(0.25, 0.25, 0.5, 0.5, P.gold)
      brush.box(1.35, 0.25, 0.5, 0.5, P.white)
    })
    faces.up.fill(shade(P.hotPink, 0.2))
    faces.down.fill(shade(P.hotPink, -0.2))
  },

  /* -- clothes ------------------------------------------------------------ */

  shirt: ({ faces, sides }) => {
    sides((brush) => garment(brush, P.white, 41))
    // The shirt only shows at the hem and in the gap of the jacket, so the hem
    // is where the detail goes.
    faces.north.box(0, 9.6, 7, 0.5, P.whiteDim)
    faces.south.box(0, 9.6, 7, 0.5, P.whiteDim)
    faces.up.fill(P.whiteDim)
    faces.down.fill(shade(P.whiteDim, -0.2))
  },

  jacket: ({ faces, sides }) => {
    sides((brush) => garment(brush, P.navy, 43))
    const front = faces.north
    // Open front: the shirt shows in a strip down the middle, with a denim
    // placket and its stitching either side of it.
    front.box(2.75, 0, 1.5, 8, P.white)
    front.box(2.75, 0, 1.5, 8, rgba('#00000018'))
    front.box(2.45, 0, 0.4, 8, shade(P.navy, -0.3))
    front.box(4.15, 0, 0.4, 8, shade(P.navy, -0.3))
    stitch(front, 2.15, 0.3, 7.4, P.navyLight)
    stitch(front, 4.7, 0.3, 7.4, P.navyLight)
    // Chest pockets, kept faint — at this size a hard-edged patch reads as a
    // hole rather than as a pocket.
    for (const x of [0.7, 5.1]) {
      front.box(x, 4.2, 1.2, 1.3, shade(P.navy, -0.1))
      front.box(x, 4.2, 1.2, 0.2, shade(P.navyLight, -0.1))
    }
    faces.south.box(0, 0.4, 7, 0.3, P.navyLight)
    faces.up.fill(shade(P.navy, 0.12))
    faces.down.fill(shade(P.navyDark, -0.1))
  },

  tape: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.pink, shade(P.pink, -0.2))
      // Printed tape: a white edge top and bottom, and a row of marks standing
      // in for the slogan. Real lettering at this size turns to mud.
      brush.box(0, 0, brush.width, 0.14, rgba('#ffffffbb'))
      brush.box(0, brush.height - 0.14, brush.width, 0.14, shade(P.hotPink, -0.1))
      for (let x = 0.6; x < brush.width - 0.5; x += 1.1) {
        brush.box(x, 0.36, 0.4, 0.28, rgba('#9aa9cc99'))
      }
    })
    faces.up.fill(shade(P.pink, 0.15))
    faces.down.fill(shade(P.pink, -0.25))
  },

  collar: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.white, P.whiteDim)
      brush.box(0, brush.height - 0.3, brush.width, 0.3, P.grey)
    })
    // Choker at the throat, and the two points of the collar over it.
    sides((brush) => brush.box(0, 1.55, brush.width, 0.3, P.hotPink))
    const front = faces.north
    front.box(3.3, 1.5, 0.4, 0.4, P.gold)
    front.line(2.5, 0, 3.4, 1.15, P.whiteDim, 0.28)
    front.line(4.5, 0, 3.6, 1.15, P.whiteDim, 0.28)
    faces.up.fill(P.whiteDim)
    faces.down.fill(shade(P.whiteDim, -0.25))
  },

  sleeve: ({ faces, sides }) => {
    sides((brush) => {
      garment(brush, P.navy, 47)
      brush.roundX(0.09, -0.16)
      brush.box(0, brush.height - 1.1, brush.width, 0.35, P.pink)
    })
    faces.up.fill(shade(P.navy, 0.14))
    faces.down.fill(shade(P.navyDark, -0.05))
  },

  cuff: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.white, P.whiteDim)
      brush.roundX(0.08, -0.14)
      brush.box(0, brush.height - 0.3, brush.width, 0.3, P.grey)
    })
    faces.up.fill(P.whiteDim)
    faces.down.fill(P.white)
  },

  shorts: ({ faces, sides }) => {
    sides((brush) => {
      garment(brush, P.black, 53)
      brush.box(0, 0, brush.width, 0.7, shade(P.black, 0.25))
      brush.box(0, 0.55, brush.width, 0.2, P.hotPink)
    })
    faces.north.box(2.4, 0.1, 1.2, 0.5, P.grey)
    faces.up.fill(shade(P.black, 0.1))
    faces.down.fill(shade(P.black, -0.25))
  },

  skirt: ({ faces, sides }) => {
    sides((brush) => {
      garment(brush, P.navy, 59)
      // Pleats.
      for (let x = 0.75; x < brush.width; x += 1.5) {
        brush.box(x, 0, 0.25, brush.height, shade(P.navy, -0.22))
        brush.box(x + 0.25, 0, 0.2, brush.height, shade(P.navy, 0.12))
      }
      brush.box(0, brush.height - 0.7, brush.width, 0.35, P.white)
      brush.box(0, brush.height - 0.35, brush.width, 0.35, P.hotPink)
    })
    faces.up.fill(shade(P.navy, 0.1))
    faces.down.fill(shade(P.navyDark, -0.2))
  },

  skirt_side: ({ faces, sides }) => {
    sides((brush) => {
      garment(brush, P.navy, 61)
      brush.box(0, brush.height - 0.7, brush.width, 0.35, P.white)
      brush.box(0, brush.height - 0.35, brush.width, 0.35, P.hotPink)
    })
    faces.up.fill(shade(P.navy, 0.1))
    faces.down.fill(shade(P.navyDark, -0.2))
  },

  sock: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.white, P.whiteDim)
      brush.roundX(0.09, -0.24)
      // Over-the-knee band.
      brush.box(0, 0, brush.width, 0.9, P.navyDark)
      brush.box(0, 0.9, brush.width, 0.25, P.hotPink)
      brush.grain(0.04, 67)
    })
    // The top of the leg is inside the shorts; painting it dark stops a stray
    // pale texel showing through the gap between the skirt panels.
    faces.up.fill(P.black)
    faces.down.fill(P.whiteDim)
  },

  boot: ({ faces, sides }) => {
    sides((brush) => {
      brush.gradient(P.white, P.whiteDim)
      // Sole, then the coloured midsole stripe above it, then the ankle collar.
      brush.box(0, brush.height - 1, brush.width, 1, P.grey)
      brush.box(0, brush.height - 1.25, brush.width, 0.25, P.hotPink)
      brush.box(0, 0, brush.width, 0.6, P.navyDark)
      brush.grain(0.03, 71)
    })
    // The tongue and a single lace, rather than a scribble of them: at four
    // texels to the unit anything busier turns into noise.
    const front = faces.north
    front.box(1.2, 0.6, 1.6, 1.5, P.whiteDim)
    front.box(1.2, 1.15, 1.6, 0.3, P.hotPink)
    // A stripe down each side, where a trainer carries its logo.
    for (const brush of [faces.east, faces.west]) {
      brush.box(1, 1.15, 2.8, 0.3, P.hotPink)
    }
    faces.up.fill(P.navyDark)
    faces.down.fill(shade(P.grey, -0.3))
  },
}

// One recipe per expression, generated so adding a mood is a one-line change.
for (const expression of FACE_EXPRESSIONS) {
  RECIPES[`face:${expression}`] = ({ faces }) => drawFace(faces.north, expression)
}

export const COMPANION_RECIPES = RECIPES

/**
 * Renders the whole companion sheet.
 *
 * `scale` is texels per model unit: 1 gives a 128x128 vanilla-resolution sheet,
 * 4 the 512x512 one the preset ships.
 */
export function paintCompanion(scale = 4): Canvas {
  return paintBody(COMPANION, { scale, recipes: RECIPES })
}

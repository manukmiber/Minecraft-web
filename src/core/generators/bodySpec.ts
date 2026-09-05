/**
 * The bone spec every entity body is written in.
 *
 * A spec is deliberately smaller than Bedrock geometry: bones, cubes, pivots and
 * rotations, and nothing else. Both the `.geo.json` writer and the three.js
 * preview consume it, so there is one description of a body rather than two that
 * can drift apart.
 *
 * The four original presets are hand-placed on their sheet, which is fine for a
 * body made of six cubes. Anything bigger is authored as a *draft* instead —
 * cubes without UVs — and `packBody` shelf-packs them onto the sheet. That is
 * what makes a forty-cube character maintainable: moving a cube never means
 * re-deriving somebody else's UV origin by hand.
 */

export interface CubeSpec {
  /** Bottom-north-west corner, in model units. */
  origin: [number, number, number]
  size: [number, number, number]
  /** Top-left of this cube's box UV on the texture. */
  uv: [number, number]
  inflate?: number
  mirror?: boolean
  /** Degrees, applied about `pivot`. Bedrock requires both or neither. */
  rotation?: [number, number, number]
  pivot?: [number, number, number]
  /** Which recipe the skin painter fills this cube's faces with. */
  paint?: string
  /** Name shown over this cube's rectangle in the pixel editor's UV template. */
  label?: string
}

export interface BoneSpec {
  name: string
  parent?: string
  pivot: [number, number, number]
  rotation?: [number, number, number]
  cubes: CubeSpec[]
  /**
   * Marks the bone as one of a set of alternatives — the face planes of a
   * character, say. Exactly one variant of a group is visible at a time; the
   * entity generator turns them into render-controller `part_visibility`, and
   * the 3D preview cycles them so you can see the whole set.
   */
  variant?: { group: string; name: string }
}

export interface GeometrySpec {
  textureWidth: number
  textureHeight: number
  visibleBoundsWidth: number
  visibleBoundsHeight: number
  visibleBoundsOffset: [number, number, number]
  bones: BoneSpec[]
}

/* -------------------------------------------------------------------------- */
/* Authoring a big body                                                        */
/* -------------------------------------------------------------------------- */

/** A cube before the packer has decided where on the sheet it lives. */
export interface CubeDraft extends Omit<CubeSpec, 'uv'> {
  /**
   * Cubes with the same share key are drawn from one patch. Mirrored limbs use
   * it so a left and right boot cost one rectangle and always match.
   */
  share?: string
}

export interface BoneDraft extends Omit<BoneSpec, 'cubes'> {
  cubes: CubeDraft[]
}

export interface BodyDraft {
  textureWidth: number
  textureHeight: number
  visibleBoundsWidth: number
  visibleBoundsHeight: number
  visibleBoundsOffset: [number, number, number]
  bones: BoneDraft[]
}

/** The rectangle one cube unwraps into: `2*(d+w)` across, `d+h` down. */
export function cubePatchSize(size: [number, number, number]): { width: number; height: number } {
  const [w, h, d] = size
  return { width: Math.ceil(2 * (d + w)), height: Math.ceil(d + h) }
}

/**
 * Shelf-packs every cube onto the sheet, tallest first.
 *
 * Tallest-first is what keeps the waste down without a real bin packer, and
 * sorting by a stable key before that makes the layout deterministic — two runs
 * of the build script produce byte-identical artwork, so a texture only shows up
 * in a diff when it actually changed.
 */
export function packBody(draft: BodyDraft): GeometrySpec {
  interface Entry {
    cube: CubeDraft
    key: string
    width: number
    height: number
  }

  const entries: Entry[] = []
  for (const bone of draft.bones) {
    bone.cubes.forEach((cube, index) => {
      const { width, height } = cubePatchSize(cube.size)
      entries.push({ cube, key: cube.share ?? `${bone.name}#${index}`, width, height })
    })
  }

  // One rectangle per share key; the first cube to claim it decides the size.
  const groups = new Map<string, Entry>()
  for (const entry of entries) {
    const existing = groups.get(entry.key)
    if (!existing) groups.set(entry.key, entry)
    else if (existing.width !== entry.width || existing.height !== entry.height) {
      throw new Error(
        `Cubes sharing UV patch "${entry.key}" have different sizes; they cannot share a patch.`,
      )
    }
  }

  const order = [...groups.values()].sort(
    (a, b) => b.height - a.height || b.width - a.width || a.key.localeCompare(b.key),
  )

  const placed = new Map<string, [number, number]>()
  let shelfY = 0
  let shelfHeight = 0
  let cursorX = 0

  for (const entry of order) {
    // A patch wider than the sheet cannot be placed at all — better to say so
    // than to silently sample somebody else's pixels in game.
    if (entry.width > draft.textureWidth) {
      throw new Error(
        `Cube patch "${entry.key}" is ${entry.width} wide; the sheet is only ${draft.textureWidth}.`,
      )
    }
    if (cursorX + entry.width > draft.textureWidth) {
      shelfY += shelfHeight
      shelfHeight = 0
      cursorX = 0
    }
    placed.set(entry.key, [cursorX, shelfY])
    cursorX += entry.width
    shelfHeight = Math.max(shelfHeight, entry.height)
  }

  const used = shelfY + shelfHeight
  if (used > draft.textureHeight) {
    throw new Error(
      `Body needs ${used} rows of texture but the sheet is ${draft.textureHeight} tall.`,
    )
  }

  return {
    textureWidth: draft.textureWidth,
    textureHeight: draft.textureHeight,
    visibleBoundsWidth: draft.visibleBoundsWidth,
    visibleBoundsHeight: draft.visibleBoundsHeight,
    visibleBoundsOffset: draft.visibleBoundsOffset,
    bones: draft.bones.map((bone) => ({
      ...bone,
      cubes: bone.cubes.map((cube, index) => {
        const { share: _share, ...rest } = cube
        return { ...rest, uv: placed.get(cube.share ?? `${bone.name}#${index}`)! }
      }),
    })),
  }
}

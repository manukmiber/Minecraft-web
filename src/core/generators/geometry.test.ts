import { describe, expect, it } from 'vitest'

import { packBody } from './bodySpec'
import type { BodyDraft } from './bodySpec'
import { geometryUvRegions, getBodyPreset, presetSheetSize, variantGroups } from './geometry'
import { COMPANION } from './bodies/companion'
import { FACE_EXPRESSIONS } from './bodies/companion'

describe('UV templates', () => {
  it('lays a region over the patch each cube occupies on the sheet', () => {
    const regions = geometryUvRegions(getBodyPreset('biped'))
    const head = regions.find((region) => region.label === 'head')!

    // An 8x8x8 head at uv [0, 0] unwraps into a 32x16 cross.
    expect(head).toEqual({ label: 'head', x: 0, y: 0, width: 32, height: 16 })
    // Every cube gets one, and empty parent bones contribute nothing.
    expect(regions.some((region) => region.label === 'root')).toBe(false)
    // The two legs are mirrored onto the same patch, so there is one region
    // for both rather than two labels fighting over one rectangle.
    expect(regions.map((region) => region.label)).toContain('leg (mirrored)')
    expect(regions.filter((region) => region.label.startsWith('leg'))).toHaveLength(1)
  })

  it('numbers the regions of a bone built from several cubes', () => {
    const labels = geometryUvRegions(getBodyPreset('bird')).map((region) => region.label)
    expect(labels).toContain('head 1')
    expect(labels).toContain('head 2')
  })

  it('prefers a cube’s own label when it has one', () => {
    const labels = geometryUvRegions(COMPANION).map((region) => region.label)
    expect(labels).toContain('hair + bangs')
    expect(labels).toContain('skirt panel (mirrored)')
    // Nothing falls back to the "bone N" form on a body that labels its cubes.
    expect(labels.some((label) => /\s\d+$/.test(label))).toBe(false)
  })

  it('reports the sheet a body preset is drawn against', () => {
    expect(presetSheetSize('biped')).toEqual({ width: 64, height: 64 })
    expect(presetSheetSize('bird')).toEqual({ width: 32, height: 32 })
    expect(presetSheetSize('companion')).toEqual({ width: 128, height: 128 })
  })
})

describe('packing a body onto its sheet', () => {
  const draft = (overrides: Partial<BodyDraft> = {}): BodyDraft => ({
    textureWidth: 32,
    textureHeight: 32,
    visibleBoundsWidth: 1,
    visibleBoundsHeight: 1,
    visibleBoundsOffset: [0, 0, 0],
    bones: [
      { name: 'a', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [8, 8, 4] }] },
      { name: 'b', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [2, 2, 2] }] },
    ],
    ...overrides,
  })

  it('gives every cube a patch that fits on the sheet without overlapping', () => {
    const spec = packBody(draft())
    const regions = geometryUvRegions(spec)

    for (const region of regions) {
      expect(region.x + region.width).toBeLessThanOrEqual(spec.textureWidth)
      expect(region.y + region.height).toBeLessThanOrEqual(spec.textureHeight)
    }
    // Two rectangles, and they are not the same rectangle.
    expect(regions).toHaveLength(2)
    expect(regions[0].x !== regions[1].x || regions[0].y !== regions[1].y).toBe(true)
  })

  it('is deterministic — the same draft packs the same way every time', () => {
    expect(packBody(draft())).toEqual(packBody(draft()))
  })

  it('draws cubes that share a key from one patch', () => {
    const spec = packBody(
      draft({
        bones: [
          {
            name: 'boots',
            pivot: [0, 0, 0],
            cubes: [
              { origin: [-4, 0, 0], size: [3, 3, 3], share: 'boot' },
              { origin: [1, 0, 0], size: [3, 3, 3], mirror: true, share: 'boot' },
            ],
          },
        ],
      }),
    )
    expect(spec.bones[0].cubes[0].uv).toEqual(spec.bones[0].cubes[1].uv)
  })

  it('refuses a shared key whose cubes are different sizes', () => {
    expect(() =>
      packBody(
        draft({
          bones: [
            {
              name: 'mismatch',
              pivot: [0, 0, 0],
              cubes: [
                { origin: [0, 0, 0], size: [3, 3, 3], share: 'x' },
                { origin: [0, 0, 0], size: [4, 4, 4], share: 'x' },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/cannot share a patch/)
  })

  it('refuses a body that does not fit rather than overlapping silently', () => {
    expect(() =>
      packBody(
        draft({
          textureHeight: 4,
          bones: [
            { name: 'big', pivot: [0, 0, 0], cubes: [{ origin: [0, 0, 0], size: [8, 8, 4] }] },
          ],
        }),
      ),
    ).toThrow(/rows of texture/)
  })
})

describe('the companion body', () => {
  it('declares one face bone per expression, all in one variant group', () => {
    const faces = variantGroups(COMPANION).get('face')!
    expect(faces.map((bone) => bone.variant!.name)).toEqual([...FACE_EXPRESSIONS])
    // They are planes stacked in the same place, so exactly one may be visible.
    for (const bone of faces) {
      expect(bone.cubes[0].size[2]).toBe(0)
      expect(bone.parent).toBe('head')
    }
  })

  it('keeps every cube on an integer size, so no patch lands between texels', () => {
    for (const bone of COMPANION.bones) {
      for (const cube of bone.cubes) {
        for (const axis of cube.size) expect(Number.isInteger(axis)).toBe(true)
      }
    }
  })

  it('gives a rotated cube its own pivot, which Bedrock requires', () => {
    const rotated = COMPANION.bones.flatMap((bone) => bone.cubes).filter((cube) => cube.rotation)
    expect(rotated.length).toBeGreaterThan(0)
    for (const cube of rotated) expect(cube.pivot).toBeDefined()
  })

  it('has the bones the animation generator looks for', () => {
    const names = new Set(COMPANION.bones.map((bone) => bone.name))
    for (const bone of [
      'head',
      'body',
      'arm_left',
      'arm_right',
      'leg_left',
      'leg_right',
      'skirt_front',
      'tail_left',
      'tail_right_tip',
    ]) {
      expect(names.has(bone)).toBe(true)
    }
  })
})

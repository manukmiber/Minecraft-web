import { describe, expect, it } from 'vitest'

import { geometryUvRegions, getBodyPreset, presetSheetSize } from './geometry'

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

  it('reports the sheet a body preset is drawn against', () => {
    expect(presetSheetSize('biped')).toEqual({ width: 64, height: 64 })
    expect(presetSheetSize('bird')).toEqual({ width: 32, height: 32 })
  })
})

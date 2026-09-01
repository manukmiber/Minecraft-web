/**
 * Guards the seam between the catalogue and the generated texture manifest:
 * adding an identifier to `vanillaItems.ts` without re-running
 * `scripts/extract-faithful.mjs` would quietly drop it back to a monogram.
 */

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { VANILLA_ITEMS } from './vanillaItems'
import { VANILLA_TEXTURES, vanillaTexture, vanillaTextureUrl } from './vanillaTextures'

/** Drawn from an entity atlas in the game, so the pack has no square for them. */
const NO_ARTWORK = ['minecraft:chest', 'minecraft:shield']

const TEXTURE_ROOT = path.resolve(__dirname, '../../../public/textures/vanilla')

describe('vanilla textures', () => {
  it('covers every catalogue identifier that has artwork', () => {
    const uncovered = VANILLA_ITEMS.map((item) => item.id)
      .filter((id) => !NO_ARTWORK.includes(id))
      .filter((id) => !vanillaTexture(id))

    expect(uncovered).toEqual([])
  })

  it('leaves identifiers with no artwork to the monogram fallback', () => {
    for (const id of NO_ARTWORK) expect(vanillaTexture(id)).toBeNull()
  })

  it('points every path at a file that is actually committed', () => {
    for (const [id, texture] of Object.entries(VANILLA_TEXTURES)) {
      const paths = [texture.icon, ...(texture.faces ? Object.values(texture.faces) : [])]
      for (const relative of paths) {
        expect(fs.existsSync(path.join(TEXTURE_ROOT, relative)), `${id} -> ${relative}`).toBe(true)
      }
    }
  })

  it('ships the pack licence alongside the artwork', () => {
    expect(fs.existsSync(path.join(TEXTURE_ROOT, 'LICENSE.txt'))).toBe(true)
  })

  it('builds a URL the app can load', () => {
    expect(vanillaTextureUrl('block/stone.png')).toBe('/textures/vanilla/block/stone.png')
  })
})

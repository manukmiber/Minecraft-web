/**
 * Pulls the vanilla block and item artwork the app draws out of a Faithful 32x
 * resource pack zip.
 *
 * Until now every `minecraft:` identifier was drawn as a tinted monogram or a
 * flat hashed colour, because the app shipped no Minecraft artwork. Faithful is
 * licensed for reuse with credit, so the catalogue can show the real thing.
 *
 * Only the identifiers the app actually offers are extracted — the pack holds
 * five thousand files and the app names about a hundred and sixty — and the
 * result is committed, so a checkout builds without the zip. Re-run it when the
 * catalogue grows or the pack is updated:
 *
 *     node scripts/extract-faithful.mjs "Faithful 32x - 26.2.zip"
 *
 * Writes `public/textures/vanilla/**` and regenerates
 * `src/core/data/vanillaTextures.ts`.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { decodePng, encodePng } from './faithful-png.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public/textures/vanilla')
const MANIFEST = path.join(ROOT, 'src/core/data/vanillaTextures.ts')

/**
 * Identifiers the catalogue names but the pack has no flat texture for.
 *
 * Chests and shields are drawn from an entity atlas rather than a block face,
 * so there is no square to crop; they keep the monogram tile.
 */
const NO_ARTWORK = new Set(['chest', 'shield'])

/** Catalogue name -> the pack's name for it, where the two disagree. */
const ALIAS = {
  wool: 'white_wool',
  // Bedrock's flower identifiers, under their Java texture names.
  red_flower: 'poppy',
  yellow_flower: 'dandelion',
  // Stairs and slabs are cut from the full block's texture.
  oak_stairs: 'oak_planks',
  // Both are animation strips of numbered frames; frame 0 is the still icon.
  compass: 'compass_00',
  clock: 'clock_00',
}

/** Faces the automatic `_top`/`_side`/`_bottom` search gets wrong. */
const FACE_OVERRIDES = {
  // A sticky piston differs from a plain one only on the head.
  sticky_piston: {
    top: 'piston_top_sticky',
    side: 'piston_side',
    bottom: 'piston_bottom',
    icon: 'piston_top_sticky',
  },
  // A two-block plant, with no single square standing for the whole thing.
  tall_grass: { icon: 'tall_grass_top' },
  // Anything with dirt underneath, which no `_bottom` texture spells out.
  grass_block: { bottom: 'dirt' },
  podzol: { bottom: 'dirt' },
  farmland: { bottom: 'dirt', side: 'dirt' },
}

/**
 * Greyscale masks the game tints per biome, and the colour to bake in.
 *
 * These ship colourless and are multiplied by a biome colour at render time.
 * The app has no biome context in the item browser, so the plains colours it
 * already uses as editor defaults are baked in instead of shipping grey blobs.
 */
const GRASS_TINT = [0x79, 0xc0, 0x5a]
const FOLIAGE_TINT = [0x59, 0xae, 0x30]
const TINTS = {
  grass_block_top: GRASS_TINT,
  short_grass: GRASS_TINT,
  tall_grass_top: GRASS_TINT,
  tall_grass_bottom: GRASS_TINT,
  fern: GRASS_TINT,
  oak_leaves: FOLIAGE_TINT,
  spruce_leaves: FOLIAGE_TINT,
  birch_leaves: FOLIAGE_TINT,
  jungle_leaves: FOLIAGE_TINT,
  acacia_leaves: FOLIAGE_TINT,
  dark_oak_leaves: FOLIAGE_TINT,
  vine: FOLIAGE_TINT,
  lily_pad: FOLIAGE_TINT,
}

/**
 * Identifiers the app offers outside the item browser: the structure painter's
 * brushes and the block dropdowns in the form editor.
 */
const EXTRA_IDS = [
  'oak_stairs',
  'hay_block',
  'torch',
  'short_grass',
  'tall_grass',
  'red_flower',
  'yellow_flower',
  'farmland',
  'grass_block',
  'dirt',
  'gravel',
]

/** The identifiers `vanillaItems.ts` lists, read straight out of its groups. */
function catalogueIds() {
  const source = fs.readFileSync(path.join(ROOT, 'src/core/data/vanillaItems.ts'), 'utf8')
  const ids = [...source.matchAll(/^\s*'([a-z0-9_]+)',$/gm)].map((match) => match[1])
  if (ids.length < 100) {
    throw new Error(`Only ${ids.length} identifiers found — vanillaItems.ts has changed shape.`)
  }
  return ids
}

function unpack(zipPath) {
  const staging = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'faithful-'))
  execFileSync('unzip', [
    '-q',
    '-o',
    zipPath,
    'assets/minecraft/textures/block/*',
    'assets/minecraft/textures/item/*',
    'LICENSE.txt',
    '-d',
    staging,
  ])
  return staging
}

/** Multiplies a greyscale mask by a biome colour, leaving alpha alone. */
function tint(image, colour) {
  for (let i = 0; i < image.pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      image.pixels[i + c] = Math.round((image.pixels[i + c] * colour[c]) / 255)
    }
  }
  return image
}

function main() {
  const zipPath = process.argv[2] ?? path.join(ROOT, 'Faithful 32x - 26.2.zip')
  if (!fs.existsSync(zipPath)) {
    throw new Error(`No pack at ${zipPath}. Pass the zip as the first argument.`)
  }

  const staging = unpack(zipPath)
  const packDir = path.join(staging, 'assets/minecraft/textures')
  const has = (kind, name) => fs.existsSync(path.join(packDir, kind, `${name}.png`))

  const ids = [...new Set([...catalogueIds(), ...EXTRA_IDS])]
  const copied = new Map()
  const entries = []
  const missing = []

  /**
   * Copies one texture across, tinting it on the way if it is a biome mask, and
   * returns its path within the output folder plus whether it has holes in it.
   */
  const take = (kind, name) => {
    const key = `${kind}/${name}.png`
    if (!copied.has(key)) {
      const image = decodePng(fs.readFileSync(path.join(packDir, kind, `${name}.png`)))
      if (TINTS[name]) tint(image, TINTS[name])

      let cutout = false
      for (let i = 3; i < image.pixels.length && !cutout; i += 4) cutout = image.pixels[i] < 255

      const destination = path.join(OUT_DIR, key)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, encodePng(image))
      copied.set(key, { path: key, cutout })
    }
    return copied.get(key)
  }

  for (const id of ids.sort()) {
    if (NO_ARTWORK.has(id)) continue

    const base = ALIAS[id] ?? id
    const overrides = FACE_OVERRIDES[id] ?? {}

    /** First of these block textures the pack actually has. */
    const block = (...candidates) => {
      const name = candidates.find((candidate) => candidate && has('block', candidate))
      return name ? take('block', name) : null
    }

    const top = overrides.top
      ? take('block', overrides.top)
      : block(`${base}_top`, `${base}_end`, base)
    const side = overrides.side
      ? take('block', overrides.side)
      : block(`${base}_side`, base, `${base}_front`)
    const bottom = overrides.bottom
      ? take('block', overrides.bottom)
      : block(`${base}_bottom`, `${base}_end`, `${base}_top`, base)

    // An item's inventory sprite is the truest icon; a block falls back to the
    // face the game shows in the creative menu, which is its front or its side.
    const icon = has('item', base)
      ? take('item', base)
      : (overrides.icon && take('block', overrides.icon)) || block(`${base}_front`, `${base}_side`, base)

    if (!icon) {
      missing.push(id)
      continue
    }

    const faces = top && side && bottom ? { top, side, bottom } : null
    entries.push({
      id: `minecraft:${id}`,
      icon,
      faces,
      cutout: [icon, ...(faces ? [top, side, bottom] : [])].some((face) => face.cutout),
    })
  }

  // Clause 6 of the Faithful License: the file travels, unmodified, with the art.
  fs.copyFileSync(path.join(staging, 'LICENSE.txt'), path.join(OUT_DIR, 'LICENSE.txt'))

  fs.writeFileSync(MANIFEST, renderManifest(entries, path.basename(zipPath)))
  fs.rmSync(staging, { recursive: true, force: true })

  console.log(`${entries.length} identifiers, ${copied.size} textures -> public/textures/vanilla`)
  if (missing.length > 0) console.log(`no texture found for: ${missing.join(', ')}`)
}

function renderManifest(entries, packName) {
  const rows = entries
    .map((entry) => {
      const faces = entry.faces
        ? `{ top: '${entry.faces.top.path}', side: '${entry.faces.side.path}', bottom: '${entry.faces.bottom.path}' }`
        : 'null'
      return `  '${entry.id}': { icon: '${entry.icon.path}', faces: ${faces}, cutout: ${entry.cutout} },`
    })
    .join('\n')

  return `/**
 * Vanilla artwork, from Faithful 32x.
 *
 * Generated by \`node scripts/extract-faithful.mjs\` out of \`${packName}\` — edit
 * that script, not this file. Paths are relative to \`public/textures/vanilla\`,
 * which \`vanillaTextureUrl\` turns into something an <img> or a loader can take.
 *
 * Textures by the Faithful Resource Pack team (https://faithfulpack.net/), used
 * under the Faithful License; the full terms are in
 * \`public/textures/vanilla/LICENSE.txt\`.
 */

export interface VanillaFaces {
  top: string
  side: string
  bottom: string
}

export interface VanillaTexture {
  /** The flat sprite for tiles, slots and swatches. */
  icon: string
  /** Cube faces for the 3D preview, or null when the pack has no block form. */
  faces: VanillaFaces | null
  /** True when some pixel is see-through, so the preview needs an alpha test. */
  cutout: boolean
}

export const VANILLA_TEXTURES: Record<string, VanillaTexture> = {
${rows}
}

export function vanillaTexture(id: string): VanillaTexture | null {
  return VANILLA_TEXTURES[id] ?? null
}

export function vanillaTextureUrl(texturePath: string): string {
  return \`\${import.meta.env.BASE_URL}textures/vanilla/\${texturePath}\`
}
`
}

main()

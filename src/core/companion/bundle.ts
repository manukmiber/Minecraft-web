/**
 * Turning a folder of MMD files into something the loader can read.
 *
 * A distributed model is a zip with the `.pmx` at some arbitrary depth, its
 * textures beside it, and a readme in Japanese. Three things then go wrong on
 * the way in, and this module is the answer to all three:
 *
 * - texture paths are written Windows-style (`khn_tex\kao.png`);
 * - they are written against wherever the author kept the file, which is not
 *   always where it ended up (`vrt.png` for a file that ships in `khn_tex/`);
 * - the archive's own entry names are frequently Shift-JIS, so the folder
 *   names arrive as mojibake even when the texture names are plain ASCII.
 *
 * So lookups are normalised, then tried from the most specific match to the
 * least: exact path, path relative to the model, then bare file name. The last
 * one is what actually rescues most real models, and it is safe because a
 * model with two textures of the same name in different folders is vanishingly
 * rare next to one whose paths are simply stale.
 */

export interface ModelArchive {
  /** Every file in the drop, keyed by its **normalised** path. */
  files: Map<string, Uint8Array>
  /** Names as they appeared, for anything shown to a person. */
  displayNames: Map<string, string>
}

export interface ModelBundle extends ModelArchive {
  /** Normalised path of the chosen `.pmx`. */
  modelPath: string
  modelBytes: ArrayBuffer
  /** Other `.pmx` files in the same drop — a model often ships variants. */
  alternates: string[]
}

/** Lower-cased, forward-slashed, with any leading `./` and slashes stripped. */
export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase()
}

export function baseName(path: string): string {
  const normalized = normalizePath(path)
  const cut = normalized.lastIndexOf('/')
  return cut === -1 ? normalized : normalized.slice(cut + 1)
}

export function dirName(path: string): string {
  const normalized = normalizePath(path)
  const cut = normalized.lastIndexOf('/')
  return cut === -1 ? '' : normalized.slice(0, cut)
}

/** Joins two normalised path fragments, resolving `..` and `.` segments. */
export function joinPath(dir: string, relative: string): string {
  const segments = dir ? dir.split('/') : []
  for (const segment of normalizePath(relative).split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

export class ModelBundleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelBundleError'
  }
}

/**
 * Picks the model out of an archive.
 *
 * Shallowest wins, then shortest name. A distribution that ships a rigged
 * model beside a `_修正` fix-up or a "no accessories" cut-down keeps them all
 * at the same depth, so the rest are offered as alternates rather than being
 * guessed between.
 */
export function chooseModel(archive: ModelArchive, preferred?: string): ModelBundle {
  const candidates = [...archive.files.keys()].filter((path) => path.endsWith('.pmx'))

  if (candidates.length === 0) {
    const pmd = [...archive.files.keys()].some((path) => path.endsWith('.pmd'))
    throw new ModelBundleError(
      pmd
        ? 'That archive holds a .pmd model. Only PMX models can be read — open it in PMX Editor and save it as .pmx first.'
        : 'No .pmx file in that drop. An MMD model is usually a folder with the .pmx at its root and a textures folder beside it.',
    )
  }

  candidates.sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length
    return depth !== 0 ? depth : a.length - b.length
  })

  const wanted = preferred ? normalizePath(preferred) : null
  const modelPath = (wanted && candidates.includes(wanted) ? wanted : null) ?? candidates[0]
  const bytes = archive.files.get(modelPath)
  if (!bytes) throw new ModelBundleError(`${modelPath} vanished between listing and reading it.`)

  return {
    files: archive.files,
    displayNames: archive.displayNames,
    modelPath,
    // A fresh copy: the archive's view may be a slice of one large buffer, and
    // the parser reads absolute offsets into whatever it is handed.
    modelBytes: bytes.slice().buffer,
    alternates: candidates.filter((path) => path !== modelPath),
  }
}

/**
 * Finds the bytes for a texture path taken out of a PMX file.
 *
 * Returns null rather than throwing: a model missing one texture should still
 * show up wearing the rest of them.
 */
export function resolveTexture(bundle: ModelBundle, texturePath: string): Uint8Array | null {
  if (!texturePath) return null
  const modelDir = dirName(bundle.modelPath)

  const relative = joinPath(modelDir, texturePath)
  const direct = bundle.files.get(relative) ?? bundle.files.get(normalizePath(texturePath))
  if (direct) return direct

  // Fall back to the file name alone, preferring a hit under the model's own
  // folder over one somewhere else in the drop.
  const wanted = baseName(texturePath)
  let loose: Uint8Array | null = null
  for (const [path, bytes] of bundle.files) {
    if (baseName(path) !== wanted) continue
    if (modelDir === '' || path.startsWith(`${modelDir}/`)) return bytes
    loose ??= bytes
  }
  return loose
}

/** Everything the PMX references but the archive does not hold. */
export function missingTextures(bundle: ModelBundle, texturePaths: string[]): string[] {
  return texturePaths.filter((path) => path && resolveTexture(bundle, path) === null)
}

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  gif: 'image/gif',
  webp: 'image/webp',
  tga: 'image/x-tga',
  spa: 'image/bmp',
  sph: 'image/bmp',
}

/**
 * MIME type for a texture, guessed from its extension.
 *
 * `.spa` and `.sph` are MMD's sphere maps and are BMP files under a different
 * name, which is why the browser has to be told rather than sniffing.
 */
export function imageMimeType(path: string): string | null {
  const extension = baseName(path).split('.').pop() ?? ''
  return IMAGE_TYPES[extension] ?? null
}

/** Rough guide for the UI: how big the drop was once unpacked. */
export function bundleSize(archive: ModelArchive): number {
  let total = 0
  for (const bytes of archive.files.values()) total += bytes.byteLength
  return total
}

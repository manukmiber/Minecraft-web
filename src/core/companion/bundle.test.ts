import { describe, expect, it } from 'vitest'

import {
  ModelBundleError,
  baseName,
  chooseModel,
  imageMimeType,
  joinPath,
  missingTextures,
  normalizePath,
  resolveTexture,
  type ModelArchive,
} from './bundle'

function archive(paths: Record<string, string>): ModelArchive {
  const files = new Map<string, Uint8Array>()
  const displayNames = new Map<string, string>()
  for (const [path, content] of Object.entries(paths)) {
    files.set(normalizePath(path), new TextEncoder().encode(content))
    displayNames.set(normalizePath(path), path)
  }
  return { files, displayNames }
}

const text = (bytes: Uint8Array | null) => (bytes ? new TextDecoder().decode(bytes) : null)

describe('path handling', () => {
  it('normalises Windows paths and case', () => {
    expect(normalizePath('Model\\Tex\\Kao.PNG')).toBe('model/tex/kao.png')
    expect(normalizePath('./a/b')).toBe('a/b')
    expect(baseName('model\\tex\\kao.png')).toBe('kao.png')
  })

  it('resolves relative segments when joining', () => {
    expect(joinPath('model/sub', '../tex/kao.png')).toBe('model/tex/kao.png')
    expect(joinPath('', 'tex/kao.png')).toBe('tex/kao.png')
  })
})

describe('chooseModel', () => {
  it('takes the shallowest model and offers the rest as alternates', () => {
    const bundle = chooseModel(
      archive({
        'kohane/extras/deep.pmx': 'deep',
        'kohane/model.pmx': 'main',
        'kohane/model_fixed.pmx': 'fixed',
      }),
    )

    expect(bundle.modelPath).toBe('kohane/model.pmx')
    expect(bundle.alternates).toEqual(['kohane/model_fixed.pmx', 'kohane/extras/deep.pmx'])
  })

  it('honours an explicit choice among the alternates', () => {
    const bundle = chooseModel(
      archive({ 'a/model.pmx': 'main', 'a/model_fixed.pmx': 'fixed' }),
      'A/Model_Fixed.pmx',
    )
    expect(bundle.modelPath).toBe('a/model_fixed.pmx')
  })

  it('says which older format it found when there is no PMX', () => {
    expect(() => chooseModel(archive({ 'a/model.pmd': 'old' }))).toThrow(ModelBundleError)
    expect(() => chooseModel(archive({ 'a/model.pmd': 'old' }))).toThrow(/\.pmd/)
    expect(() => chooseModel(archive({ 'readme.txt': 'hi' }))).toThrow(/No \.pmx/)
  })
})

describe('resolveTexture', () => {
  const bundle = chooseModel(
    archive({
      'kohane/model.pmx': 'model',
      'kohane/khn_tex/kao.png': 'face',
      'kohane/khn_tex/toonh.bmp': 'toon',
      'elsewhere/stray.png': 'stray',
    }),
  )

  it('finds a texture through the path the model actually wrote', () => {
    expect(text(resolveTexture(bundle, 'khn_tex\\kao.png'))).toBe('face')
  })

  it('falls back to the file name when the path is stale', () => {
    // The model says the toon sits beside it; the archive keeps it a folder
    // down. This is the case that breaks a naive loader on real models.
    expect(text(resolveTexture(bundle, 'toonh.bmp'))).toBe('toon')
  })

  it('prefers a match under the model over one elsewhere in the drop', () => {
    const shadowed = chooseModel(
      archive({
        'kohane/model.pmx': 'model',
        'kohane/tex/shared.png': 'mine',
        'other/shared.png': 'theirs',
      }),
    )
    expect(text(resolveTexture(shadowed, 'shared.png'))).toBe('mine')
  })

  it('reports what it could not find rather than failing the load', () => {
    expect(resolveTexture(bundle, 'nothing.png')).toBeNull()
    expect(missingTextures(bundle, ['khn_tex\\kao.png', 'nothing.png'])).toEqual(['nothing.png'])
  })
})

describe('imageMimeType', () => {
  it('knows that MMD sphere maps are BMP files under another name', () => {
    expect(imageMimeType('eye.spa')).toBe('image/bmp')
    expect(imageMimeType('eye.sph')).toBe('image/bmp')
    expect(imageMimeType('KAO.PNG')).toBe('image/png')
    expect(imageMimeType('readme.txt')).toBeNull()
  })
})

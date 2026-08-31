import { describe, expect, it } from 'vitest'

import { normalizeSlotName } from './workspace'
import { createProject, migrateProject } from '../../core/model/project'
import { installBuiltinKinds } from '../../core/kinds'

installBuiltinKinds()

describe('normalizeSlotName', () => {
  it('keeps a plain name as it is', () => {
    expect(normalizeSlotName('main')).toBe('main')
    expect(normalizeSlotName('v2.1')).toBe('v2.1')
  })

  it('folds the characters a slot name cannot carry into a backup filename', () => {
    expect(normalizeSlotName('  My Save  ')).toBe('my-save')
    expect(normalizeSlotName('a/../b')).toBe('a-b')
    expect(normalizeSlotName('résumé')).toBe('r-sum')
  })

  it('falls back rather than producing an empty key', () => {
    expect(normalizeSlotName('')).toBe('main')
    expect(normalizeSlotName('///')).toBe('main')
  })

  it('bounds the length', () => {
    expect(normalizeSlotName('x'.repeat(200))).toHaveLength(64)
  })
})

describe('loading a save written before local-only storage', () => {
  it('drops the retired remote-storage fields from assets', () => {
    const legacy = {
      ...createProject(),
      assets: [
        {
          id: 'asset_1',
          fileName: 'crow.png',
          mime: 'image/png',
          size: 1024,
          width: 64,
          height: 64,
          r2Key: 'proj_x/asset_1.png',
          repoPath: 'saves/main/assets/asset_1.png',
          addedAt: '2026-01-01T00:00:00Z',
        },
      ],
    }

    const [asset] = migrateProject(legacy).assets
    expect(asset).toEqual({
      id: 'asset_1',
      fileName: 'crow.png',
      mime: 'image/png',
      size: 1024,
      width: 64,
      height: 64,
      addedAt: '2026-01-01T00:00:00Z',
    })
  })

  it('keeps the asset id, which is what the texture bytes are keyed by', () => {
    const project = migrateProject({
      ...createProject(),
      assets: [{ id: 'asset_keepme', fileName: 'x.png' }],
    })
    expect(project.assets[0].id).toBe('asset_keepme')
    expect(project.assets[0].mime).toBe('image/png')
  })
})

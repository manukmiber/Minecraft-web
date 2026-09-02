import { describe, expect, it } from 'vitest'

import {
  CHANNELS,
  nextBuildNumber,
  parseReleaseTag,
  releaseBody,
  releaseName,
  releaseTag,
} from './release'

describe('release tags', () => {
  it('suffixes a pre-release and leaves a stable release bare', () => {
    expect(releaseTag([1, 2, 0], 'alpha', 3)).toBe('v1.2.0-alpha.3')
    expect(releaseTag([1, 2, 0], 'beta', 1)).toBe('v1.2.0-beta.1')
    expect(releaseTag([1, 2, 0], 'release', 1)).toBe('v1.2.0')
  })

  it('round-trips through parseReleaseTag', () => {
    expect(parseReleaseTag('v0.4.1-beta.7')).toEqual({
      version: [0, 4, 1],
      channel: 'beta',
      build: 7,
    })
    expect(parseReleaseTag('v2.0.0')).toEqual({ version: [2, 0, 0], channel: 'release', build: 1 })
    expect(parseReleaseTag('nightly')).toBeNull()
  })

  it('names a build the way the release list should read', () => {
    expect(releaseName('Plants and Foods', [1, 0, 0], 'alpha', 2)).toBe(
      'Plants and Foods 1.0.0 Alpha 2',
    )
    expect(releaseName('Plants and Foods', [1, 0, 0], 'release', 1)).toBe('Plants and Foods 1.0.0')
  })
})

describe('build numbers', () => {
  it('continues from the highest tag already in the repo', () => {
    const tags = ['v1.2.0-alpha.1', 'v1.2.0-alpha.2', 'v1.1.0-alpha.9']
    expect(nextBuildNumber(tags, [1, 2, 0], 'alpha')).toBe(3)
  })

  it('counts each channel and each version separately', () => {
    const tags = ['v1.2.0-alpha.4', 'v1.2.0-beta.1']
    expect(nextBuildNumber(tags, [1, 2, 0], 'beta')).toBe(2)
    // A version with no tags yet starts at one, whatever its neighbours did.
    expect(nextBuildNumber(tags, [1, 3, 0], 'alpha')).toBe(1)
  })

  it('ignores tags it did not write', () => {
    const tags = ['v1.2.0-alpha.oops', 'release-candidate', 'v1.2.0-alpha.2']
    expect(nextBuildNumber(tags, [1, 2, 0], 'alpha')).toBe(3)
  })

  it('never numbers a stable release', () => {
    expect(nextBuildNumber(['v1.2.0'], [1, 2, 0], 'release')).toBe(1)
  })
})

describe('channels', () => {
  it('marks pre-releases as such and only promotes a stable one to latest', () => {
    expect(CHANNELS.alpha).toMatchObject({ prerelease: true, latest: false })
    expect(CHANNELS.beta).toMatchObject({ prerelease: true, latest: false })
    expect(CHANNELS.release).toMatchObject({ prerelease: false, latest: true })
  })
})

describe('release notes', () => {
  it('leads with a warning on a pre-release and lists what to download', () => {
    const body = releaseBody({
      changelog: 'Added the cooking pot.',
      channel: 'alpha',
      artifacts: [
        { fileName: 'plants-v1.0.0.mcaddon', description: 'Bedrock add-on.' },
        { fileName: 'plants-v1.0.0-fabric.zip', description: 'Fabric source project.' },
      ],
      warnings: ['Entities ship a placeholder renderer.'],
    })

    expect(body).toContain('**Alpha build.**')
    expect(body).toContain('Added the cooking pot.')
    expect(body).toContain('## What to download')
    expect(body).toContain('`plants-v1.0.0-fabric.zip`')
    expect(body).toContain('## Known gaps in this build')
  })

  it('leaves the warning banner off a stable release', () => {
    const body = releaseBody({
      changelog: 'First proper release.',
      channel: 'release',
      artifacts: [{ fileName: 'plants-v1.0.0.mcaddon', description: 'Bedrock add-on.' }],
      warnings: [],
    })

    expect(body).not.toContain('build.**')
    expect(body).not.toContain('Known gaps')
  })
})

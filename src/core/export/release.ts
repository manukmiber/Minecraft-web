/**
 * Release channels.
 *
 * Every export now becomes a GitHub release, which raises the question the old
 * "download a file" flow never had to answer: is this thing finished? Shipping
 * everything as a release with no distinction would make the release list
 * useless within a week — the whole point of a release page is that someone can
 * tell at a glance which build to install.
 *
 * So a release picks a channel, and the channel decides three things: the tag,
 * whether GitHub marks it a pre-release, and whether it becomes the "latest"
 * one people land on.
 *
 *   alpha    Work in progress. Tagged v1.2.0-alpha.3, pre-release, never latest.
 *   beta     Feature-complete, still being tested. v1.2.0-beta.1, pre-release.
 *   release  Finished. Tagged v1.2.0 with no suffix, and marked latest.
 *
 * The build number is not stored in the project: it is worked out from the tags
 * that already exist in the repo, so two people exporting from two browsers
 * cannot both claim `alpha.3`.
 */

export type ReleaseChannel = 'alpha' | 'beta' | 'release'

export const RELEASE_CHANNELS: ReleaseChannel[] = ['alpha', 'beta', 'release']

export interface ChannelInfo {
  id: ReleaseChannel
  label: string
  summary: string
  /** GitHub's `prerelease` flag. */
  prerelease: boolean
  /** Whether this build should become the repository's "latest release". */
  latest: boolean
}

export const CHANNELS: Record<ReleaseChannel, ChannelInfo> = {
  alpha: {
    id: 'alpha',
    label: 'Alpha',
    summary: 'Unfinished. Expect breakage, and expect worlds made with it to need rebuilding.',
    prerelease: true,
    latest: false,
  },
  beta: {
    id: 'beta',
    label: 'Beta',
    summary: 'Everything is in, and it is being tested. Safe to play with, not yet promised stable.',
    prerelease: true,
    latest: false,
  },
  release: {
    id: 'release',
    label: 'Release',
    summary: 'Finished and supported. This is the build the repository points people at.',
    prerelease: false,
    latest: true,
  },
}

export type SemVer = [number, number, number]

export function versionString(version: SemVer): string {
  return version.join('.')
}

/**
 * The tag for a release.
 *
 * A stable release is `v1.2.0` and a pre-release is `v1.2.0-alpha.3`, which is
 * ordinary semver — so tools that sort tags, GitHub's release list included,
 * put the pre-releases before the stable one they lead up to rather than after.
 */
export function releaseTag(version: SemVer, channel: ReleaseChannel, build: number): string {
  const base = `v${versionString(version)}`
  return channel === 'release' ? base : `${base}-${channel}.${Math.max(1, build)}`
}

export function releaseName(
  projectName: string,
  version: SemVer,
  channel: ReleaseChannel,
  build: number,
): string {
  const suffix = channel === 'release' ? '' : ` ${CHANNELS[channel].label} ${Math.max(1, build)}`
  return `${projectName} ${versionString(version)}${suffix}`
}

/**
 * The next build number for a channel, given the tags already in the repo.
 *
 * Reading it back from the repo rather than storing a counter in the project is
 * what makes this safe across two browsers, two machines and a re-imported
 * save: the tags are the only record, and they are the record everyone shares.
 */
export function nextBuildNumber(
  existingTags: string[],
  version: SemVer,
  channel: ReleaseChannel,
): number {
  if (channel === 'release') return 1
  const prefix = `v${versionString(version)}-${channel}.`
  let highest = 0
  for (const tag of existingTags) {
    if (!tag.startsWith(prefix)) continue
    const parsed = Number.parseInt(tag.slice(prefix.length), 10)
    if (Number.isFinite(parsed)) highest = Math.max(highest, parsed)
  }
  return highest + 1
}

/** Parses a tag this module produced, for reading a release list back. */
export function parseReleaseTag(
  tag: string,
): { version: SemVer; channel: ReleaseChannel; build: number } | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/.exec(tag.trim())
  if (!match) return null
  const version: SemVer = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!match[4]) return { version, channel: 'release', build: 1 }
  return { version, channel: match[4] as ReleaseChannel, build: Number(match[5]) }
}

/**
 * The release body.
 *
 * Assembled rather than left to the changelog alone, because a release page has
 * to answer "what do I download?" before it answers "what changed?" — and an
 * export that produced five artifacts for four loaders needs that spelled out.
 */
export function releaseBody(options: {
  changelog: string
  channel: ReleaseChannel
  artifacts: Array<{ fileName: string; description: string }>
  warnings: string[]
}): string {
  const lines: string[] = []

  if (options.channel !== 'release') {
    lines.push(`> **${CHANNELS[options.channel].label} build.** ${CHANNELS[options.channel].summary}`, '')
  }

  lines.push(options.changelog.trim() || '_No description given._', '')

  if (options.artifacts.length > 0) {
    lines.push('## What to download', '')
    for (const artifact of options.artifacts) {
      lines.push(`- **\`${artifact.fileName}\`** — ${artifact.description}`)
    }
    lines.push('')
  }

  if (options.warnings.length > 0) {
    lines.push('## Known gaps in this build', '')
    for (const warning of options.warnings) lines.push(`- ${warning}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * The Releases panel: every build this project has published.
 *
 * Reads the repository's releases rather than keeping a list of its own. The
 * releases *are* the record — that is the whole reason exports publish them —
 * so a second copy in the app would only be a chance for the two to disagree.
 *
 * The channel a build was published on is recovered from its tag, which is why
 * `releaseTag` writes ordinary semver rather than something prettier: a tag
 * that can be parsed back is a tag that survives being read by anything else,
 * this panel included.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, ExternalLink, RefreshCw, Rocket } from 'lucide-react'

import { Badge, Button, EmptyState, Section, Spinner, cn } from '../../app/ui/primitives'
import { CHANNELS, parseReleaseTag } from '../../core/export/release'
import type { ReleaseChannel } from '../../core/export/release'
import type { ReleaseSummary } from '../../integrations/github/client'
import { projectRepo } from '../../state/services'
import { useSettings, repoConfigured } from '../../state/settings'

const CHANNEL_TONE: Record<ReleaseChannel, 'neutral' | 'warn' | 'good'> = {
  alpha: 'warn',
  beta: 'neutral',
  release: 'good',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toISOString().slice(0, 10)
}

export function ReleasesView() {
  const settings = useSettings()
  const configured = repoConfigured(settings)

  const [releases, setReleases] = useState<ReleaseSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!configured) return
    setLoading(true)
    setError(null)
    try {
      setReleases(await projectRepo.listReleases(30))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void load()
  }, [load])

  if (!configured) {
    return (
      <div className="p-3">
        <EmptyState
          icon={<Rocket size={24} />}
          title="No project repository yet"
          detail="Releases live in the project repo. Set the GitHub token, owner, repo and branch in Settings and every export will publish one."
        />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto pb-6">
      <Section
        title={`${settings.githubOwner}/${settings.githubRepo}`}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            icon={loading ? <Spinner /> : <RefreshCw size={13} />}
            aria-label="Reload the release list"
          />
        }
      >
        {error ? (
          <p role="alert" className="px-1 text-xs leading-relaxed text-rose-500">
            {error}
          </p>
        ) : releases === null ? (
          <p className="px-1 text-xs text-ink-300">Loading…</p>
        ) : releases.length === 0 ? (
          <EmptyState
            icon={<Rocket size={22} />}
            title="Nothing published yet"
            detail="Export with “Publish these files as a GitHub release” ticked and the build shows up here."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {releases.map((release) => {
              const parsed = parseReleaseTag(release.tagName)
              const channel = parsed?.channel ?? 'release'
              return (
                <motion.li
                  key={release.id}
                  layout
                  className="rounded-md border border-ink-700 bg-ink-850 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-ink-50">{release.tagName}</span>
                    {/* The label carries the word; the tone is a second signal. */}
                    <Badge tone={CHANNEL_TONE[channel]}>{CHANNELS[channel].label}</Badge>
                    {release.draft ? <Badge tone="warn">Draft</Badge> : null}
                    <span className="ml-auto text-xs text-ink-300">
                      {formatDate(release.createdAt)}
                    </span>
                  </div>

                  <p className="mt-0.5 text-xs text-ink-200">{release.name}</p>

                  {release.assets.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1 border-l border-ink-700 pl-2.5">
                      {release.assets.map((asset) => (
                        <li key={asset.name}>
                          <a
                            href={asset.downloadUrl}
                            className={cn(
                              'inline-flex items-center gap-1.5 text-xs text-ink-300',
                              'hover:text-accent-400 focus-visible:focus-ring rounded',
                            )}
                          >
                            <Download size={11} aria-hidden="true" />
                            <span className="font-mono">{asset.name}</span>
                            <span className="text-ink-300">{formatBytes(asset.size)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs text-amber-500">
                      This release has no files attached.
                    </p>
                  )}

                  <a
                    href={release.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 rounded text-xs text-ink-300 hover:text-accent-400 focus-visible:focus-ring"
                  >
                    Open on GitHub
                    <ExternalLink size={11} aria-hidden="true" />
                  </a>
                </motion.li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}

/**
 * The export dialog.
 *
 * Export used to be one checkbox on the changelog modal, because there was one
 * thing to build. With two platforms, five delivery routes and three release
 * channels it is a screen of its own — and the reason it is a screen rather
 * than a longer list of checkboxes is that **the choices are not equivalent**.
 * Ticking "Fabric" and ticking "data pack" produce genuinely different things,
 * and a project full of custom blocks gets almost nothing from the second.
 *
 * So every target carries its verdict against the live project, read from
 * `targets/capabilities.ts`. Choosing the data-pack route for a block-heavy
 * add-on is allowed — sometimes it is exactly what you want — but never a
 * surprise.
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Boxes, Coffee, Package, Rocket, X } from 'lucide-react'

import { Badge, Button, Spinner, cn } from '../../app/ui/primitives'
import { useModalA11y } from '../../app/ui/useModalA11y'
import { CHANNELS, RELEASE_CHANNELS, releaseTag } from '../../core/export/release'
import type { ReleaseChannel } from '../../core/export/release'
import { ALL_LOADERS, LOADERS } from '../../core/targets/platforms'
import type { ModLoader } from '../../core/targets/platforms'
import { JAVA_TARGET_PROFILES, getJavaProfile, loadersFor } from '../../core/targets/javaProfiles'
import { verdictFor } from '../../core/targets/capabilities'
import type { SupportLevel } from '../../core/targets/capabilities'
import { useProject } from '../../state/project'
import { useSettings } from '../../state/settings'

const IS_APPLE =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

const LEVEL_TONE: Record<SupportLevel, 'good' | 'warn' | 'danger'> = {
  full: 'good',
  partial: 'warn',
  none: 'danger',
}

const LEVEL_LABEL: Record<SupportLevel, string> = {
  full: 'Everything ships',
  partial: 'Some gaps',
  none: 'Little survives',
}

export interface ExportDialogProps {
  open: boolean
  repoConfigured: boolean
  onCancel(): void
  onConfirm(request: {
    changelog: string
    bedrock: boolean
    javaLoaders: ModLoader[]
    javaProfileId: string
    publish: boolean
    channel: ReleaseChannel
  }): Promise<void>
}

export function ExportDialog({ open, repoConfigured, onCancel, onConfirm }: ExportDialogProps) {
  const project = useProject((state) => state.project)
  const settings = useSettings()

  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [bedrock, setBedrock] = useState(settings.exportBedrock)
  const [javaLoaders, setJavaLoaders] = useState<ModLoader[]>(settings.exportJavaLoaders)
  const [javaProfileId, setJavaProfileId] = useState(settings.javaTargetProfileId)
  const [publish, setPublish] = useState(settings.publishRelease)
  const [channel, setChannel] = useState<ReleaseChannel>(settings.releaseChannel)

  const fieldId = useId()
  const titleId = `${fieldId}-title`
  const descriptionId = `${fieldId}-description`
  const errorId = `${fieldId}-error`
  const noteId = `${fieldId}-note`

  const dialogRef = useModalA11y<HTMLDivElement>(open, () => {
    if (!busy) onCancel()
  })

  useEffect(() => {
    if (!open) return
    setText('')
    setError(null)
    setBusy(false)
    setBedrock(settings.exportBedrock)
    setJavaLoaders(settings.exportJavaLoaders)
    setJavaProfileId(settings.javaTargetProfileId)
    setPublish(settings.publishRelease && repoConfigured)
    setChannel(settings.releaseChannel)
    // Re-reading settings on every open is deliberate: the dialog should
    // reflect what Settings says now, not what it said when the app booted.
  }, [open, repoConfigured, settings])

  const profile = getJavaProfile(javaProfileId)
  const availableLoaders = useMemo(
    () => ALL_LOADERS.filter((id) => id === 'datapack' || loadersFor(profile).includes(id as never)),
    [profile],
  )

  const verdicts = useMemo(
    () => ({
      bedrock: verdictFor(project, 'bedrock'),
      datapack: verdictFor(project, 'javaDatapack'),
      mod: verdictFor(project, 'javaMod'),
    }),
    [project],
  )

  const targetCount = (bedrock ? 1 : 0) + javaLoaders.length
  // A pack version has no channel suffix, so the preview tag is only exact for
  // a release; alpha and beta get their build number from the repo at publish.
  const previewTag = releaseTag(project.version, channel, 1)

  const toggleLoader = (loader: ModLoader) => {
    setJavaLoaders((current) =>
      current.includes(loader) ? current.filter((id) => id !== loader) : [...current, loader],
    )
  }

  const submit = async () => {
    if (!text.trim()) {
      setError('Say what changed — even one line is enough.')
      return
    }
    if (targetCount === 0) {
      setError('Pick at least one target to export.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Remember the selection before the build, so a failed publish does not
      // cost you the choices you just made.
      settings.set('exportBedrock', bedrock)
      settings.set('exportJavaLoaders', javaLoaders)
      settings.set('javaTargetProfileId', javaProfileId)
      settings.set('publishRelease', publish)
      settings.set('releaseChannel', channel)

      await onConfirm({
        changelog: text,
        bedrock,
        javaLoaders,
        javaProfileId,
        publish: publish && repoConfigured,
        channel,
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onCancel()
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-float"
          >
            <header className="flex shrink-0 items-center gap-2.5 border-b border-ink-700 px-4 py-3">
              <Package size={18} aria-hidden="true" className="text-amber-500" />
              <div className="flex-1">
                <h2 id={titleId} className="text-base font-semibold text-ink-50">
                  Export and release
                </h2>
                <p id={descriptionId} className="text-xs text-ink-300">
                  Builds in this browser, downloads every file, then publishes them as one release.
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className={cn(
                  'tap-target grid size-8 shrink-0 place-items-center rounded text-ink-300',
                  'transition-colors [transition-duration:var(--duration-state)]',
                  'hover:bg-ink-750 hover:text-ink-100 disabled:pointer-events-none disabled:opacity-45',
                )}
                aria-label="Close without exporting"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
                  Bedrock
                </legend>
                <TargetRow
                  checked={bedrock}
                  onChange={setBedrock}
                  icon={<Boxes size={15} />}
                  label="Bedrock add-on (.mcaddon)"
                  detail="Opens straight into the game. Nothing to compile."
                  level={verdicts.bedrock.level}
                  gaps={verdicts.bedrock.gaps.map((gap) => `${gap.label}: ${gap.bedrock.note}`)}
                />
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="pb-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
                  Java
                </legend>

                <label className="flex items-center gap-2 pb-1 text-xs text-ink-200">
                  <span className="shrink-0">Minecraft version</span>
                  <select
                    value={javaProfileId}
                    onChange={(event) => {
                      setJavaProfileId(event.target.value)
                      // A loader the new version has no coordinates for would
                      // silently produce nothing, so drop it rather than
                      // leaving a ticked box that does not build.
                      const next = getJavaProfile(event.target.value)
                      const allowed = loadersFor(next) as ModLoader[]
                      setJavaLoaders((current) =>
                        current.filter((id) => id === 'datapack' || allowed.includes(id)),
                      )
                    }}
                    className="h-8 flex-1 rounded-md border border-edge bg-ink-900 px-2 text-xs text-ink-50 focus:border-accent-500 focus:outline-none"
                  >
                    {JAVA_TARGET_PROFILES.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label} — {entry.engineLabel}
                      </option>
                    ))}
                  </select>
                </label>

                {availableLoaders.map((loader) => {
                  const info = LOADERS[loader]
                  const verdict = loader === 'datapack' ? verdicts.datapack : verdicts.mod
                  const route = loader === 'datapack' ? 'javaDatapack' : 'javaMod'
                  return (
                    <TargetRow
                      key={loader}
                      checked={javaLoaders.includes(loader)}
                      onChange={() => toggleLoader(loader)}
                      icon={<Coffee size={15} />}
                      label={info.label}
                      detail={info.summary}
                      level={verdict.level}
                      gaps={verdict.gaps.map((gap) => `${gap.label}: ${gap[route].note}`)}
                    />
                  )
                })}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={noteId} className="text-xs font-medium text-ink-100">
                  What changed?
                </label>
                <textarea
                  id={noteId}
                  autoFocus
                  required
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void submit()
                  }}
                  rows={4}
                  placeholder="First build with the cooking pot and its recipes…"
                  className={cn(
                    'w-full resize-y rounded-md border bg-ink-900 px-2.5 py-2 text-sm leading-relaxed',
                    'text-ink-50 placeholder:text-ink-300 focus:outline-none',
                    error
                      ? 'border-rose-500 focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-rose-500)_28%,transparent)]'
                      : 'border-edge focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-glow)]',
                  )}
                />
              </div>

              <fieldset className="flex flex-col gap-2 rounded-md border border-ink-700 bg-ink-900/50 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
                  Release
                </legend>

                <label className="tap-target flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink-200">
                  <input
                    type="checkbox"
                    checked={publish && repoConfigured}
                    disabled={!repoConfigured}
                    onChange={(event) => setPublish(event.target.checked)}
                    className="size-4 shrink-0 accent-[var(--color-accent-500)]"
                  />
                  <span className="flex items-center gap-2">
                    <Rocket size={14} aria-hidden="true" className="text-accent-500" />
                    Publish these files as a GitHub release
                  </span>
                </label>

                {repoConfigured ? null : (
                  <p className="text-xs leading-relaxed text-amber-500">
                    The project repository is not configured, so this build can only be downloaded.
                    Set it up in Settings to publish releases.
                  </p>
                )}

                {publish && repoConfigured ? (
                  <>
                    <div
                      role="radiogroup"
                      aria-label="Release channel"
                      className="grid grid-cols-3 gap-1.5"
                    >
                      {RELEASE_CHANNELS.map((id) => {
                        const info = CHANNELS[id]
                        const active = channel === id
                        return (
                          <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setChannel(id)}
                            className={cn(
                              'tap-target flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left',
                              'transition-colors [transition-duration:var(--duration-state)]',
                              active
                                ? 'border-accent-500 bg-accent-500/15 text-ink-50'
                                : 'border-edge bg-ink-850 text-ink-200 hover:border-ink-300',
                            )}
                          >
                            <span className="text-xs font-semibold">{info.label}</span>
                            <span className="text-[10.5px] leading-snug text-ink-300">
                              {info.prerelease ? 'Pre-release' : 'Marked latest'}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    <p className="text-xs leading-relaxed text-ink-300">
                      {CHANNELS[channel].summary} Tagged{' '}
                      <span className="font-mono text-ink-100">{previewTag}</span>
                      {channel === 'release'
                        ? '.'
                        : ' — the build number is taken from the tags already in the repo.'}
                    </p>
                  </>
                ) : null}
              </fieldset>

              {error ? (
                <div
                  id={errorId}
                  role="alert"
                  className={cn(
                    'flex gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-2',
                    'text-xs leading-relaxed text-rose-500',
                  )}
                >
                  <AlertTriangle size={15} aria-hidden="true" className="mt-px shrink-0" />
                  <span className="whitespace-pre-wrap">{error}</span>
                </div>
              ) : null}
            </div>

            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-700 bg-ink-900/60 px-4 py-3">
              <span className="text-xs text-ink-300">
                {targetCount === 0 ? (
                  'No targets picked'
                ) : (
                  <>
                    {targetCount} target{targetCount === 1 ? '' : 's'} ·{' '}
                    <kbd className="font-mono">{IS_APPLE ? '⌘' : 'Ctrl'}</kbd> +{' '}
                    <kbd className="font-mono">Enter</kbd>
                  </>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={submit}
                  disabled={busy || targetCount === 0}
                  aria-busy={busy}
                  icon={busy ? <Spinner /> : undefined}
                >
                  {busy ? 'Building…' : publish && repoConfigured ? 'Build & release' : 'Build & download'}
                </Button>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * One target, with its verdict against the current project.
 *
 * The gap list is collapsed behind a details element rather than shown inline:
 * a project with ten custom blocks has a long list against the data-pack route,
 * and burying the checkbox under it would make the common case worse to serve
 * the rare one.
 */
function TargetRow({
  checked,
  onChange,
  icon,
  label,
  detail,
  level,
  gaps,
}: {
  checked: boolean
  onChange(value: boolean): void
  icon: React.ReactNode
  label: string
  detail: string
  level: SupportLevel
  gaps: string[]
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 transition-colors [transition-duration:var(--duration-state)]',
        checked ? 'border-accent-500/50 bg-accent-500/8' : 'border-edge bg-ink-900/40',
      )}
    >
      <label className="tap-target flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent-500)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="text-ink-300">
              {icon}
            </span>
            <span className="text-sm font-medium text-ink-50">{label}</span>
            {/* The badge carries its own words, so the colour is not the signal. */}
            <Badge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</Badge>
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-300">{detail}</span>
        </span>
      </label>

      {gaps.length > 0 ? (
        <details className="mt-1.5 pl-6.5">
          <summary className="cursor-pointer text-xs text-ink-300 hover:text-ink-100">
            {gaps.length} thing{gaps.length === 1 ? '' : 's'} this target does not fully cover
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 border-l border-ink-700 pl-2.5">
            {gaps.map((gap) => (
              <li key={gap} className="text-[10.5px] leading-relaxed text-ink-300">
                {gap}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

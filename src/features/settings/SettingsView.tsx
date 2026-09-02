/**
 * Settings.
 *
 * Everything sensitive here stays in this browser. The GitHub token is sent
 * only to api.github.com and the Worker passphrase only to this app's own
 * /api routes; nothing is stored server-side.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Cloud, Github, KeyRound, Package, Palette, XCircle } from 'lucide-react'

import { Badge, Button, FieldRow, Section, Spinner, cn, inputClass } from '../../app/ui/primitives'
import { TARGET_PROFILES } from '../../core/targets/profiles'
import { isValidNamespace } from '../../core/util/id'
import { github, r2 } from '../../state/services'
import type { WorkerHealth } from '../../integrations/r2/client'
import { useProject } from '../../state/project'
import { useSettings } from '../../state/settings'

export function SettingsView() {
  const settings = useSettings()
  const { project, commit } = useProject()

  const [health, setHealth] = useState<WorkerHealth | null>(null)
  const [checkingWorker, setCheckingWorker] = useState(true)
  const [repoStatus, setRepoStatus] = useState<
    { ok: true; label: string } | { ok: false; label: string } | null
  >(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    void (async () => {
      setCheckingWorker(true)
      setHealth(await r2.health())
      setCheckingWorker(false)
    })()
  }, [])

  const namespaceValid = isValidNamespace(project.namespace)

  return (
    <div className="h-full overflow-y-auto pb-6">
      <Section title="Project">
        <FieldRow
          label="Namespace"
          help="Prefixes every identifier this project generates. Lowercase letters, digits and underscores; never a reserved namespace."
          error={namespaceValid ? null : 'Not usable — pick something other than minecraft/mc/vanilla.'}
        >
          <input
            value={project.namespace}
            onChange={(event) => commit({ ...project, namespace: event.target.value.trim() })}
            className={cn(inputClass, 'font-mono', !namespaceValid && 'border-rose-500/60')}
            placeholder="mmm"
          />
        </FieldRow>

        <FieldRow label="Description" help="Written into both pack manifests.">
          <input
            value={project.description}
            onChange={(event) => commit({ ...project, description: event.target.value })}
            className={inputClass}
          />
        </FieldRow>

        <FieldRow label="Author" help="Listed in the manifest metadata.">
          <input
            value={project.meta.author}
            onChange={(event) =>
              commit({ ...project, meta: { ...project.meta, author: event.target.value } })
            }
            className={inputClass}
          />
        </FieldRow>

        <FieldRow label="Pack version">
          <div className="flex gap-2">
            {(['major', 'minor', 'patch'] as const).map((part, index) => (
              <input
                key={part}
                type="number"
                min={0}
                value={project.version[index]}
                onChange={(event) => {
                  const version = [...project.version] as [number, number, number]
                  version[index] = Math.max(0, Number(event.target.value) || 0)
                  commit({ ...project, version })
                }}
                className={cn(inputClass, 'w-20 text-center font-mono')}
                aria-label={part}
              />
            ))}
          </div>
        </FieldRow>

        <FieldRow
          label="Bedrock target"
          help="Decides every format_version the generators write. Change it and the whole pack is regenerated."
        >
          <select
            value={project.targetProfileId}
            onChange={(event) => commit({ ...project, targetProfileId: event.target.value })}
            className={inputClass}
          >
            {TARGET_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label} — {profile.engineLabel}
              </option>
            ))}
          </select>
        </FieldRow>

        <ul className="mt-1 flex flex-col gap-1 border-l border-ink-700 pl-2.5">
          {(TARGET_PROFILES.find((p) => p.id === project.targetProfileId) ?? TARGET_PROFILES[0])
            .notes.map((note) => (
              <li key={note} className="text-[10.5px] leading-relaxed text-ink-300">
                {note}
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Project repository">
        <p className="pb-2 text-xs leading-relaxed text-ink-300">
          This repo is the database: save slots, the preset inbox, the changelog and exported
          archives all live in it. Keep the token to a fine-grained one with contents write access
          on that single repository.
        </p>

        <FieldRow label="GitHub token" help="Stored in this browser only. Sent only to api.github.com.">
          <input
            type="password"
            value={settings.githubToken}
            onChange={(event) => settings.set('githubToken', event.target.value)}
            placeholder="github_pat_…"
            className={cn(inputClass, 'font-mono')}
            autoComplete="off"
          />
        </FieldRow>

        <div className="grid grid-cols-2 gap-2">
          <FieldRow label="Owner">
            <input
              value={settings.githubOwner}
              onChange={(event) => settings.set('githubOwner', event.target.value.trim())}
              placeholder="manukmiber"
              className={cn(inputClass, 'font-mono')}
            />
          </FieldRow>
          <FieldRow label="Repository">
            <input
              value={settings.githubRepo}
              onChange={(event) => settings.set('githubRepo', event.target.value.trim())}
              placeholder="my-addon-data"
              className={cn(inputClass, 'font-mono')}
            />
          </FieldRow>
        </div>

        <FieldRow label="Branch">
          <input
            value={settings.githubBranch}
            onChange={(event) => settings.set('githubBranch', event.target.value.trim())}
            placeholder="main"
            className={cn(inputClass, 'font-mono')}
          />
        </FieldRow>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="subtle"
            icon={verifying ? <Spinner /> : <Github size={13} />}
            disabled={verifying || !settings.githubToken}
            onClick={async () => {
              setVerifying(true)
              setRepoStatus(null)
              try {
                const info = await github.verify()
                setRepoStatus({
                  ok: info.canPush,
                  label: info.canPush
                    ? `${info.fullName} — write access confirmed`
                    : `${info.fullName} — the token cannot push, so saving will fail`,
                })
              } catch (failure) {
                setRepoStatus({
                  ok: false,
                  label: failure instanceof Error ? failure.message : String(failure),
                })
              } finally {
                setVerifying(false)
              }
            }}
          >
            Test connection
          </Button>

          {repoStatus ? (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-center gap-1.5 text-xs',
                repoStatus.ok ? 'text-mint-500' : 'text-rose-500',
              )}
            >
              {repoStatus.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {repoStatus.label}
            </motion.span>
          ) : null}
        </div>
      </Section>

      <Section title="Texture storage">
        <p className="pb-2 text-xs leading-relaxed text-ink-300">
          Dropped PNGs are cached in this browser and pushed to R2 through the Worker, which holds
          the bucket binding. No R2 credential ever reaches the page.
        </p>

        <div className="flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850 p-2.5">
          {checkingWorker ? (
            <Spinner />
          ) : health ? (
            <Cloud size={14} className={health.bucketBound ? 'text-mint-500' : 'text-amber-500'} />
          ) : (
            <Cloud size={14} className="text-ink-300" />
          )}
          <div className="flex-1 text-xs leading-relaxed">
            {checkingWorker ? (
              <span className="text-ink-300">Checking the Worker…</span>
            ) : !health ? (
              <span className="text-ink-300">
                No Worker responding. That is expected under plain <code>vite dev</code> — textures
                stay in this browser until a Save carries them into the repo.
              </span>
            ) : health.bucketBound ? (
              <span className="text-ink-100">
                Worker reachable, R2 bucket bound.{' '}
                {health.authRequired ? 'A passphrase is required.' : 'Running without a passphrase.'}
              </span>
            ) : (
              <span className="text-amber-500">
                Worker reachable but no R2 bucket is bound. Check the r2_buckets binding in
                wrangler.jsonc.
              </span>
            )}
          </div>
        </div>

        {health?.authRequired ? (
          <FieldRow
            label="Worker passphrase"
            help="Must match the API_PASSPHRASE secret set on the Worker."
          >
            <input
              type="password"
              value={settings.workerPassphrase}
              onChange={(event) => settings.set('workerPassphrase', event.target.value)}
              className={cn(inputClass, 'font-mono')}
              autoComplete="off"
            />
          </FieldRow>
        ) : null}
      </Section>

      <Section title="Defaults for new projects">
        <FieldRow label="Default namespace">
          <input
            value={settings.defaultNamespace}
            onChange={(event) => settings.set('defaultNamespace', event.target.value.trim())}
            className={cn(inputClass, 'font-mono')}
          />
        </FieldRow>
        <FieldRow label="Default author">
          <input
            value={settings.author}
            onChange={(event) => settings.set('author', event.target.value)}
            className={inputClass}
          />
        </FieldRow>
      </Section>

      <Section title="About">
        <div className="flex flex-col gap-2 text-xs leading-relaxed text-ink-300">
          <p className="flex items-center gap-2">
            <Package size={13} className="text-accent-500" />
            <span>
              App source: <span className="font-mono">{settings.appRepo}</span>
            </span>
          </p>
          <p className="flex items-center gap-2">
            <KeyRound size={13} className="text-ink-300" />
            Single-user by design — there is no account system and no server-side copy of your
            credentials.
          </p>
          <p className="flex items-start gap-2">
            <Palette size={13} className="mt-0.5 shrink-0 text-ink-400" />
            <span>
              Vanilla block and item artwork is{' '}
              <a
                href="https://faithfulpack.net/"
                target="_blank"
                rel="noreferrer"
                className="text-accent-400 underline underline-offset-2"
              >
                Faithful 32x
              </a>
              , used under the Faithful License. It is shown here as a preview only and is never
              written into an exported pack.
            </span>
          </p>
          <div className="flex gap-2 pt-1">
            <Badge tone="neutral">model v{project.modelVersion}</Badge>
            <Badge tone="neutral">{project.nodes.length} content</Badge>
            <Badge tone="neutral">{project.assets.length} textures</Badge>
          </div>
        </div>
      </Section>
    </div>
  )
}

/**
 * Settings.
 *
 * There is nothing to connect and no credential to enter: the app is static
 * files plus this browser's storage. What is left is the project itself, the
 * defaults new projects start from, and a place to see and prune what the
 * browser is holding.
 */

import { useCallback, useEffect, useState } from 'react'
import { HardDrive, KeyRound, Package, Trash2 } from 'lucide-react'

import { Badge, Button, FieldRow, Section, Spinner, cn, inputClass } from '../../app/ui/primitives'
import { TARGET_PROFILES } from '../../core/targets/profiles'
import { isValidNamespace } from '../../core/util/id'
import { assets, workspace } from '../../state/services'
import type { StorageUsage } from '../../integrations/local/workspace'
import { useProject } from '../../state/project'
import { useSettings } from '../../state/settings'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SettingsView() {
  const settings = useSettings()
  const { project, commit, toast } = useProject()

  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [assetUsage, setAssetUsage] = useState<{ count: number; bytes: number } | null>(null)
  const [measuring, setMeasuring] = useState(true)
  const [sweeping, setSweeping] = useState(false)

  const measure = useCallback(async () => {
    setMeasuring(true)
    try {
      setUsage(await workspace.usage())
      setAssetUsage(await assets.totalBytes())
    } finally {
      setMeasuring(false)
    }
  }, [])

  useEffect(() => {
    void measure()
  }, [measure])

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
              <li key={note} className="text-[10.5px] leading-relaxed text-ink-400">
                {note}
              </li>
            ))}
        </ul>
      </Section>

      <Section title="Local storage">
        <p className="pb-2 text-[11px] leading-relaxed text-ink-300">
          This browser is the database. Save slots, the preset inbox, the changelog and every
          texture you have dropped live in its IndexedDB — nothing is uploaded, and the deployed
          app is static files with no server behind them. Clearing site data for this origin
          deletes all of it, so keep backup .zips of anything that matters (Versions panel).
        </p>

        <div className="flex items-center gap-2.5 rounded-md border border-ink-700 bg-ink-850 p-2.5">
          <HardDrive size={14} className="shrink-0 text-accent-500" />
          <div className="flex-1 text-[11px] leading-relaxed text-ink-100">
            {measuring ? (
              <span className="text-ink-300">Measuring…</span>
            ) : (
              <>
                {usage?.slots ?? 0} save slot{usage?.slots === 1 ? '' : 's'} ·{' '}
                {assetUsage?.count ?? 0} textures ({formatBytes(assetUsage?.bytes ?? 0)}) ·{' '}
                {usage?.presets ?? 0} inbox presets · {usage?.changelogEntries ?? 0} changelog
                entries
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            size="sm"
            variant="subtle"
            icon={sweeping ? <Spinner /> : <Trash2 size={12} />}
            disabled={sweeping || measuring}
            title="Delete texture bytes that no save slot and no open project references"
            onClick={async () => {
              setSweeping(true)
              try {
                // The open project counts as live even though it is not saved
                // yet — sweeping it out from under an unsaved edit would be a
                // data-loss bug wearing the costume of housekeeping.
                const live = await workspace.referencedAssetIds()
                for (const asset of project.assets) live.add(asset.id)
                const removed = await assets.sweep(live)
                await measure()
                toast({
                  tone: 'success',
                  title: removed > 0 ? `Freed ${removed} unused textures` : 'Nothing to clean up',
                })
              } catch (failure) {
                toast({
                  tone: 'error',
                  title: 'Could not clean up storage',
                  detail: failure instanceof Error ? failure.message : String(failure),
                })
              } finally {
                setSweeping(false)
              }
            }}
          >
            Clean up unused textures
          </Button>

          <Button
            size="sm"
            variant="danger"
            icon={<Trash2 size={12} />}
            disabled={measuring}
            onClick={async () => {
              if (
                !window.confirm(
                  'Delete every save slot, preset and changelog entry stored in this browser? Textures are kept until the next clean-up. This cannot be undone.',
                )
              ) {
                return
              }
              await workspace.clearAll()
              await measure()
              toast({ tone: 'info', title: 'Local workspace cleared' })
            }}
          >
            Erase all saved versions
          </Button>
        </div>
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
        <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-ink-300">
          <p className="flex items-center gap-2">
            <Package size={13} className="text-accent-500" />
            <span>
              App source: <span className="font-mono">{settings.appRepo}</span>
            </span>
          </p>
          <p className="flex items-center gap-2">
            <KeyRound size={13} className="text-ink-400" />
            Local by design — no account, no server, no credentials. Deployed as static files on
            Cloudflare Pages.
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

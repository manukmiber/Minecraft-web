/**
 * The top bar: project identity on the left, the two actions that matter on
 * the right. Save and Export are deliberately separate — one records progress,
 * the other produces something you can install.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Command, Download, GitBranch, Redo2, Save, Undo2 } from 'lucide-react'

import { Badge, Button, Spinner, cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import { useUi } from '../../state/ui'
import { useSettings, repoConfigured } from '../../state/settings'
import { ChangelogDialog, type ChangelogIntent } from '../../features/save-export/ChangelogDialog'
import { exportAddon, saveToSlot } from '../../features/save-export/actions'

/**
 * Mac uses Command, everything else uses Control. Showing "Ctrl" beside a ⌘
 * glyph on a Mac is a small lie about which key to press.
 */
const IS_APPLE =
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

export function TitleBar() {
  const { project, dirty, busy, activeSlot, past, futureStack, undo, redo, commit } = useProject()
  const setPaletteOpen = useUi((s) => s.setPaletteOpen)
  const settings = useSettings()

  const [dialog, setDialog] = useState<ChangelogIntent | null>(null)
  const [slot, setSlot] = useState(activeSlot)
  const [commitExport, setCommitExport] = useState(true)

  const configured = repoConfigured(settings)

  return (
    <>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-ink-800 bg-ink-900 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div
            aria-hidden="true"
            className="grid size-7 place-items-center rounded bg-accent-500/15 text-sm font-bold tracking-tight text-accent-400"
          >
            m
          </div>
          <input
            value={project.name}
            onChange={(event) => commit({ ...project, name: event.target.value })}
            aria-label="Project name"
            className={cn(
              'h-9 w-52 min-w-0 max-w-[45vw] rounded border border-transparent bg-transparent px-2 text-sm font-semibold text-ink-50',
              'transition-colors [transition-duration:var(--duration-state)]',
              'hover:border-ink-700 focus:border-accent-500 focus:bg-ink-850 focus:outline-none',
            )}
          />
        </div>

        <Badge tone="neutral" className="font-mono lowercase tracking-normal">
          {project.namespace}
        </Badge>

        <div className="flex items-center gap-1.5 text-xs text-ink-300">
          <GitBranch size={13} aria-hidden="true" />
          <span className="font-mono">{activeSlot}</span>
          {dirty ? (
            <motion.span
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              // The dot alone is a colour-only signal, so the word rides
              // along with it for anyone who cannot separate the two.
              className="flex items-center gap-1 font-medium text-amber-500"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
              Unsaved
            </motion.span>
          ) : null}
        </div>

        <div className="flex-1" />

        {busy ? (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-xs text-ink-200"
          >
            <Spinner />
            {busy}
          </motion.div>
        ) : null}

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={past.length === 0}
            icon={<Undo2 size={15} />}
            title={`Undo (${IS_APPLE ? '\u2318' : 'Ctrl+'}Z)`}
            aria-label="Undo"
            aria-keyshortcuts={IS_APPLE ? 'Meta+Z' : 'Control+Z'}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={futureStack.length === 0}
            icon={<Redo2 size={15} />}
            title={`Redo (${IS_APPLE ? '\u2318' : 'Ctrl+'}Shift+Z)`}
            aria-label="Redo"
            aria-keyshortcuts={IS_APPLE ? 'Meta+Shift+Z' : 'Control+Shift+Z'}
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPaletteOpen(true)}
          // A keyboard shortcut hint is noise on a device without a keyboard.
          className="max-sm:hidden"
          icon={IS_APPLE ? <Command size={14} /> : null}
          title={`Command palette (${IS_APPLE ? '\u2318' : 'Ctrl+'}K)`}
          aria-label="Open the command palette"
          aria-keyshortcuts={IS_APPLE ? 'Meta+K' : 'Control+K'}
        >
          <span aria-hidden="true" className="font-mono text-xs text-ink-300">
            {IS_APPLE ? 'K' : 'Ctrl K'}
          </span>
        </Button>

        <Button
          variant="subtle"
          icon={<Save size={15} />}
          onClick={() => {
            setSlot(activeSlot)
            setDialog('save')
          }}
          disabled={!configured}
          aria-describedby={configured ? undefined : 'save-disabled-reason'}
          title={
            configured
              ? 'Commit this version to the project repo'
              : 'Configure the project repository in Settings first'
          }
        >
          Save
        </Button>
        {configured ? null : (
          <span id="save-disabled-reason" className="sr-only">
            Saving needs a project repository. Set one up in Settings.
          </span>
        )}

        <Button
          variant="primary"
          icon={<Download size={15} />}
          onClick={() => setDialog('export')}
          title="Build a .mcaddon in the browser"
        >
          Export
        </Button>
      </header>

      <ChangelogDialog
        open={dialog !== null}
        intent={dialog ?? 'save'}
        slot={slot}
        onSlotChange={setSlot}
        commitExport={commitExport && configured}
        onCommitExportChange={setCommitExport}
        onCancel={() => setDialog(null)}
        onConfirm={async (changelog) => {
          if (dialog === 'save') {
            await saveToSlot(slot.trim() || 'main', changelog)
          } else {
            await exportAddon(changelog, commitExport && configured)
          }
          setDialog(null)
        }}
      />
    </>
  )
}

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
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-900 px-3">
        <div className="flex items-center gap-2">
          <div className="grid size-6 place-items-center rounded bg-accent-500/15 text-[10px] font-bold tracking-tight text-accent-400">
            m
          </div>
          <input
            value={project.name}
            onChange={(event) => commit({ ...project, name: event.target.value })}
            aria-label="Project name"
            className={cn(
              'h-7 w-52 rounded border border-transparent bg-transparent px-1.5 text-[13px] font-semibold text-ink-50',
              'transition-colors hover:border-ink-700 focus:border-accent-500 focus:bg-ink-850 focus:outline-none',
            )}
          />
        </div>

        <Badge tone="neutral" className="font-mono lowercase tracking-normal">
          {project.namespace}
        </Badge>

        <div className="flex items-center gap-1.5 text-[11px] text-ink-300">
          <GitBranch size={12} />
          <span className="font-mono">{activeSlot}</span>
          {dirty ? (
            <motion.span
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              className="size-1.5 rounded-full bg-amber-500"
              title="Unsaved changes"
            />
          ) : null}
        </div>

        <div className="flex-1" />

        {busy ? (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2 text-[11px] text-ink-200"
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
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={14} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={futureStack.length === 0}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={14} />
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPaletteOpen(true)}
          icon={<Command size={13} />}
          title="Command palette (Ctrl+K)"
        >
          <span className="font-mono text-[10px] text-ink-400">Ctrl K</span>
        </Button>

        <Button
          variant="subtle"
          icon={<Save size={14} />}
          onClick={() => {
            setSlot(activeSlot)
            setDialog('save')
          }}
          disabled={!configured}
          title={
            configured
              ? 'Commit this version to the project repo'
              : 'Configure the project repository in Settings first'
          }
        >
          Save
        </Button>

        <Button
          variant="primary"
          icon={<Download size={14} />}
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

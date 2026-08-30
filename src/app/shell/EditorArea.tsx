/**
 * The middle of the workspace: tabs, the wizard/code toggle, and the preview.
 *
 * Wizard and code are two views of the same thing rather than two documents —
 * switching between them never loses work, because the model is the source and
 * a hand-edit is an explicit, reversible override.
 */

import { Suspense, lazy } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Blocks, Code2, Eye, EyeOff, LayoutPanelLeft } from 'lucide-react'

import { Button, EmptyState, cn } from '../ui/primitives'
import { useProject } from '../../state/project'
import { useUi } from '../../state/ui'
import { EditorTabs } from './EditorTabs'
import { FormEditor } from '../../features/editor-form/FormEditor'

// Monaco and three.js are the two heavy dependencies in the app. Loading them
// on first use keeps the initial paint quick without giving up either feature.
const CodeEditor = lazy(async () => ({
  default: (await import('../../features/editor-code/CodeEditor')).CodeEditor,
}))
const Preview3D = lazy(async () => ({
  default: (await import('../../features/preview3d/Preview3D')).Preview3D,
}))

function Loading({ label }: { label: string }) {
  return (
    <div className="grid h-full place-items-center gap-2 text-xs text-ink-400">
      <span className="shimmer h-1 w-24 rounded-full" />
      {label}
    </div>
  )
}

export function EditorArea() {
  const {
    project,
    tabs,
    activeTabId,
    editorMode,
    setEditorMode,
    previewOpen,
    togglePreview,
    openFile,
  } = useProject()
  const setSideView = useUi((s) => s.setSideView)

  const tab = tabs.find((t) => t.id === activeTabId) ?? null
  const node = tab?.type === 'node' ? project.nodes.find((n) => n.id === tab.nodeId) : undefined

  /** The generated file that corresponds to the open node, if there is one. */
  const primaryFileForNode = node
    ? [...useProject.getState().files.values()].find((file) => file.origin.nodeId === node.id)
    : undefined

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ink-900">
      <EditorTabs />

      {tab === null ? (
        <div className="grid min-h-0 flex-1 place-items-center grid-backdrop">
          <EmptyState
            icon={<LayoutPanelLeft size={22} />}
            title="Nothing open"
            detail="Pick something from the content list, or press Ctrl+K to create a block, an entity or a recipe."
            action={
              <div className="mt-1 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => setSideView('presets')}>
                  Browse presets
                </Button>
                <Button size="sm" variant="subtle" onClick={() => setSideView('content')}>
                  Open content list
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {node ? (
            <div className="flex h-9 shrink-0 items-center gap-1.5 border-b border-ink-800 bg-ink-900 px-3">
              <div className="flex rounded-md border border-ink-600 bg-ink-850 p-0.5">
                {(
                  [
                    { mode: 'wizard' as const, icon: Blocks, label: 'Wizard' },
                    { mode: 'code' as const, icon: Code2, label: 'Code' },
                  ]
                ).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setEditorMode(mode)
                      if (mode === 'code' && primaryFileForNode) openFile(primaryFileForNode.path)
                    }}
                    className={cn(
                      'relative flex items-center gap-1.5 rounded px-2.5 py-1 text-[11px] transition-colors',
                      editorMode === mode ? 'text-ink-50' : 'text-ink-300 hover:text-ink-100',
                    )}
                  >
                    {editorMode === mode ? (
                      <motion.span
                        layoutId="mode-pill"
                        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                        className="absolute inset-0 rounded bg-ink-700"
                      />
                    ) : null}
                    <Icon size={12} className="relative" />
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              <Button
                size="sm"
                variant="ghost"
                icon={previewOpen ? <EyeOff size={12} /> : <Eye size={12} />}
                onClick={togglePreview}
              >
                {previewOpen ? 'Hide preview' : 'Show preview'}
              </Button>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${tab.id}-${editorMode}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full"
                >
                  {tab.type === 'file' ? (
                    <Suspense fallback={<Loading label="Loading editor…" />}>
                      <CodeEditor path={tab.path} />
                    </Suspense>
                  ) : node ? (
                    editorMode === 'wizard' ? (
                      <FormEditor node={node} />
                    ) : primaryFileForNode ? (
                      <Suspense fallback={<Loading label="Loading editor…" />}>
                        <CodeEditor path={primaryFileForNode.path} />
                      </Suspense>
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-ink-300">
                        This content does not generate a file yet.
                      </div>
                    )
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-ink-300">
                      That content was deleted.
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence initial={false}>
              {node && previewOpen ? (
                <motion.aside
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 360, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                  className="shrink-0 overflow-hidden border-l border-ink-800 bg-ink-950"
                >
                  <div className="h-full w-[360px]">
                    <Suspense fallback={<Loading label="Loading preview…" />}>
                      <Preview3D node={node} />
                    </Suspense>
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

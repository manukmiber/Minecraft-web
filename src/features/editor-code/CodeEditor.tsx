/**
 * Code view.
 *
 * Generated files are read-only until you choose to take one over. Pressing
 * "Edit this file" turns it into a tracked override: your text wins from then
 * on, the explorer flags it, and "Revert to generated" gives it back to the
 * generator. That is the honest version of two-way sync — no silent merging of
 * hand-edits into a model that cannot represent them.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { motion } from 'framer-motion'
import { FileWarning, PenLine, RotateCcw, ShieldCheck } from 'lucide-react'

import { Badge, Button, cn } from '../../app/ui/primitives'
import { SCHEMA_BINDINGS, schemaLabelFor } from '../../core/schema/schemas'
import { serializeBody } from '../../core/vfs/types'
import { useProject } from '../../state/project'
import { setupMonaco } from './setupMonaco'

setupMonaco()

/** VS Code Dark+ retuned to this app's palette. */
function defineTheme(monaco: Monaco): void {
  monaco.editor.defineTheme('mmm-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'string.key.json', foreground: '6db6ff' },
      { token: 'string.value.json', foreground: '37d6a5' },
      { token: 'number', foreground: 'f2b74a' },
      { token: 'keyword.json', foreground: 'a980ff' },
      { token: 'comment', foreground: '6b7688', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#00000000',
      'editor.foreground': '#c7cede',
      'editorLineNumber.foreground': '#4a5568',
      'editorLineNumber.activeForeground': '#98a2b3',
      'editor.selectionBackground': '#4aa3ff33',
      'editor.lineHighlightBackground': '#ffffff08',
      'editorCursor.foreground': '#4aa3ff',
      'editorIndentGuide.background1': '#242c3b',
      'editorGutter.background': '#00000000',
    },
  })
}

function configureJson(monaco: Monaco): void {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    // Lets Monaco fetch the community schemas from the CDN. When the request
    // fails it simply reports no schema rather than erroring.
    enableSchemaRequest: true,
    schemas: SCHEMA_BINDINGS.map((binding) => ({
      uri: binding.uri,
      fileMatch: binding.fileMatch,
    })),
  })
}

export function CodeEditor({ path }: { path: string }) {
  const { files, project, setOverride, toast } = useProject()
  const file = files.get(path)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const generated = useMemo(() => (file ? serializeBody(file.body) : ''), [file])
  const isOverride = Boolean(project.overrides[path])
  const [draft, setDraft] = useState(generated)

  // Follow the generator while the file is not taken over.
  useEffect(() => {
    if (!isOverride) setDraft(generated)
  }, [generated, isOverride])

  useEffect(() => {
    setDraft(project.overrides[path] ?? generated)
    // Switching files should always reset the buffer.
  }, [path])

  if (!file) {
    return (
      <div className="grid h-full place-items-center text-xs text-ink-300">
        {path} is no longer generated. Close this tab.
      </div>
    )
  }

  if (file.body.type === 'asset') {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-xs text-ink-300">
        <div>
          <p className="text-ink-100">This is a binary texture.</p>
          <p className="mt-1">Replace it from the texture slot in the wizard.</p>
        </div>
      </div>
    )
  }

  const language = path.endsWith('.js') ? 'javascript' : path.endsWith('.json') ? 'json' : 'plaintext'
  const schemaLabel = schemaLabelFor(path)
  const dirty = isOverride && draft !== project.overrides[path]

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-800 bg-ink-900 px-3">
        <span className="truncate font-mono text-xs text-ink-300">{path}</span>

        {schemaLabel ? (
          <Badge tone="accent" className="gap-1">
            <ShieldCheck size={9} />
            {schemaLabel}
          </Badge>
        ) : null}

        {isOverride ? (
          <Badge tone="warn" className="gap-1">
            <PenLine size={9} />
            hand-edited
          </Badge>
        ) : null}

        <div className="flex-1" />

        {isOverride ? (
          <>
            <Button
              size="sm"
              variant="primary"
              disabled={!dirty}
              onClick={() => setOverride(path, draft)}
              title="Save this hand-edit (Ctrl+S)"
            >
              Apply edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={12} />}
              onClick={() => {
                setOverride(path, null)
                setDraft(generated)
                toast({
                  tone: 'info',
                  title: 'Back to generated',
                  detail: `${path} follows the wizard again.`,
                })
              }}
            >
              Revert to generated
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            icon={<PenLine size={12} />}
            onClick={() => {
              setOverride(path, draft)
              toast({
                tone: 'warning',
                title: 'File taken over',
                detail: `${path} will now keep your text instead of following the wizard. Revert any time.`,
              })
            }}
          >
            Edit this file
          </Button>
        )}
      </div>

      {isOverride ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/8 px-3 py-1.5 text-xs text-amber-500"
        >
          <FileWarning size={12} className="shrink-0" />
          Wizard changes no longer reach this file. Revert to hand it back to the generator.
        </motion.div>
      ) : null}

      <div className="min-h-0 flex-1">
        <Editor
          path={`inmemory://pack/${path}`}
          language={language}
          value={draft}
          theme="mmm-dark"
          beforeMount={(monaco) => {
            defineTheme(monaco)
            configureJson(monaco)
          }}
          onMount={(instance, monaco) => {
            editorRef.current = instance
            instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
              if (useProject.getState().project.overrides[path] !== undefined) {
                setOverride(path, instance.getValue())
              }
            })
          }}
          onChange={(next) => setDraft(next ?? '')}
          options={{
            readOnly: !isOverride,
            domReadOnly: !isOverride,
            fontSize: 12.5,
            fontFamily: 'var(--font-mono)',
            fontLigatures: true,
            minimap: { enabled: true, scale: 1, renderCharacters: false },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            renderLineHighlight: 'all',
            scrollBeyondLastLine: false,
            padding: { top: 12, bottom: 24 },
            tabSize: 2,
            bracketPairColorization: { enabled: true },
            guides: { indentation: true, bracketPairs: true },
            automaticLayout: true,
          }}
          loading={
            <div className={cn('grid h-full place-items-center text-xs text-ink-300')}>
              Loading editor…
            </div>
          }
        />
      </div>
    </div>
  )
}

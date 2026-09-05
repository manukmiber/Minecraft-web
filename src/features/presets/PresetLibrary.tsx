/**
 * The built-in preset library.
 *
 * Applying one is the same operation as applying a preset from the repo inbox —
 * it goes through `applyPreset`, and the report says exactly what was created
 * or replaced.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Layers, Plus } from 'lucide-react'

import { Badge, Button, cn } from '../../app/ui/primitives'
import { BUILTIN_PRESET_PACKS } from '../../presets'
import { useProject } from '../../state/project'

export function PresetLibrary() {
  const { project, applyPresetFile, toast } = useProject()
  // A preset that ships artwork has to fetch it, so applying is no longer
  // instantaneous and the button says so.
  const [applying, setApplying] = useState<string | null>(null)
  const appliedIds = new Set(project.nodes.map((n) => n.presetId).filter(Boolean) as string[])

  return (
    <div className="h-full overflow-y-auto p-2">
      {BUILTIN_PRESET_PACKS.map((pack) => (
        <section key={pack.id} className="mb-4">
          <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
            {pack.label}
          </h3>

          <div className="flex flex-col gap-2">
            {pack.presets.map((preset, index) => {
              const applied = appliedIds.has(preset.id)
              return (
                <motion.article
                  key={preset.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'rounded-lg border p-2.5 transition-colors',
                    applied
                      ? 'border-mint-500/30 bg-mint-500/5'
                      : 'border-ink-700 bg-ink-850 hover:border-ink-600',
                  )}
                >
                  <header className="flex items-start gap-2">
                    <Layers size={13} className="mt-0.5 shrink-0 text-accent-500" />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-xs font-medium text-ink-50">{preset.label}</h4>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-300">
                        {preset.description}
                      </p>
                    </div>
                    {applied ? (
                      <Badge tone="good" className="shrink-0">
                        <Check size={9} /> in project
                      </Badge>
                    ) : null}
                  </header>

                  {preset.notes && preset.notes.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1 border-l border-ink-700 pl-2">
                      {preset.notes.map((note) => (
                        <li key={note} className="text-[10.5px] leading-relaxed text-ink-300">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <footer className="mt-2.5 flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={applied ? 'subtle' : 'primary'}
                      icon={<Plus size={12} />}
                      disabled={applying === preset.id}
                      onClick={async () => {
                        setApplying(preset.id)
                        try {
                          const report = await applyPresetFile(preset)
                          const created = report.changes.filter((c) => c.action === 'created').length
                          const replaced = report.changes.length - created
                          const problems = [...report.unresolved, ...report.textureFailures]
                          const counted = `${created} created, ${replaced} replaced`
                          toast({
                            tone: problems.length > 0 ? 'warning' : 'success',
                            title: `Applied ${preset.label}`,
                            detail:
                              problems.length > 0
                                ? `${counted}. Unresolved: ${problems.join(', ')}`
                                : report.textures.length > 0
                                  ? `${counted}, ${report.textures.length} textures included`
                                  : counted,
                          })
                        } catch (failure) {
                          toast({
                            tone: 'error',
                            title: `Could not apply ${preset.label}`,
                            detail: failure instanceof Error ? failure.message : String(failure),
                          })
                        } finally {
                          setApplying(null)
                        }
                      }}
                    >
                      <span className="whitespace-nowrap">
                        {applying === preset.id ? 'Applying…' : applied ? 'Re-apply' : 'Apply'}
                      </span>
                    </Button>
                    <span className="text-xs text-ink-300">
                      {preset.nodes.length} pieces of content
                    </span>
                  </footer>
                </motion.article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

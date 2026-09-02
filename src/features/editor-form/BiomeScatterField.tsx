/**
 * The plant list of a biome.
 *
 * A checklist rather than a drag target: assigning a crop to a biome is a yes/no
 * decision, and the interesting part is what comes after — how common it is
 * against the others, what ground it accepts and whether it needs water. Each
 * ticked plant expands into those three controls.
 *
 * The share percentages shown here are the same weights the generator writes
 * into the weighted_random_feature, so what you read is what the world does.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Droplets, Sprout } from 'lucide-react'

import { Badge, EmptyState, cn, inputClass } from '../../app/ui/primitives'
import {
  MATURITY_OPTIONS,
  MAX_WEIGHT,
  MIN_WEIGHT,
  readScatterEntries,
  type ScatterEntry,
  type ScatterMaturity,
} from '../../core/kinds/biome'
import { str } from '../../core/kinds/shared'
import type { ContentNode } from '../../core/model/types'
import { useProject } from '../../state/project'

export function BiomeScatterField({
  value,
  onChange,
}: {
  value: unknown
  onChange(next: ScatterEntry[]): void
}) {
  const { project } = useProject()

  const entries = readScatterEntries({ plants: value })
  // Crops only: scattering is about plants, and a crop is the one kind that
  // carries both a growth stage and a "plantable on" rule to inherit.
  const candidates = project.nodes.filter((node) => node.kind === 'crop')
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0)

  if (candidates.length === 0) {
    return (
      <EmptyState
        icon={<Sprout size={18} />}
        title="No crops in this add-on yet"
        detail="Create a crop first — every crop in the project can then be assigned to this biome."
      />
    )
  }

  const update = (plant: string, patch: Partial<ScatterEntry>): void => {
    onChange(entries.map((entry) => (entry.plant === plant ? { ...entry, ...patch } : entry)))
  }

  const toggle = (node: ContentNode): void => {
    const existing = entries.find((entry) => entry.plant === node.id)
    if (existing) {
      onChange(entries.filter((entry) => entry.plant !== node.id))
      return
    }
    onChange([
      ...entries,
      { plant: node.id, weight: 3, placeOn: [], needsWater: false, maturity: 'ripe' },
    ])
  }

  return (
    <div className="flex flex-col gap-1.5">
      {candidates.map((node) => {
        const entry = entries.find((item) => item.plant === node.id)
        const share = entry && totalWeight > 0 ? Math.round((entry.weight / totalWeight) * 100) : 0
        const plantOn = str(node.data, 'plantOn', 'minecraft:farmland')

        return (
          <div
            key={node.id}
            className={cn(
              'rounded-lg border transition-colors',
              entry ? 'border-mint-500/40 bg-mint-500/[0.06]' : 'border-ink-700 bg-ink-900',
            )}
          >
            <button
              type="button"
              onClick={() => toggle(node)}
              aria-pressed={Boolean(entry)}
              className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded border transition-colors',
                  entry ? 'border-mint-500 bg-mint-500/25' : 'border-ink-600 bg-ink-850',
                )}
              >
                {entry ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="size-1.5 rounded-full bg-mint-500"
                  />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-ink-50">{node.displayName}</span>
                <span className="block truncate font-mono text-xs text-ink-300">
                  {project.namespace}:{node.name}
                </span>
              </span>

              {entry ? (
                <Badge tone="good" className="shrink-0">
                  {share}%
                </Badge>
              ) : null}
            </button>

            <AnimatePresence initial={false}>
              {entry ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2.5 border-t border-ink-700/70 px-2.5 py-2.5">
                    <label className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 text-xs text-ink-200">How common</span>
                      <input
                        type="range"
                        min={MIN_WEIGHT}
                        max={MAX_WEIGHT}
                        step={1}
                        value={entry.weight}
                        onChange={(event) =>
                          update(entry.plant, { weight: Number(event.target.value) })
                        }
                        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-[var(--color-accent-500)]"
                      />
                      <span className="w-16 shrink-0 text-right font-mono text-xs text-ink-100">
                        {entry.weight}
                        <span className="text-ink-300"> / {totalWeight}</span>
                      </span>
                    </label>

                    <label className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 text-xs text-ink-200">Generates as</span>
                      <select
                        value={entry.maturity}
                        onChange={(event) =>
                          update(entry.plant, {
                            maturity: event.target.value as ScatterMaturity,
                          })
                        }
                        className={cn(inputClass, 'flex-1')}
                      >
                        {MATURITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label} — {option.hint}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2.5">
                      <span className="w-24 shrink-0 text-xs text-ink-200">Grows on</span>
                      <input
                        value={entry.placeOn.join(', ')}
                        onChange={(event) =>
                          update(entry.plant, {
                            placeOn: event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder={plantOn}
                        className={cn(inputClass, 'flex-1 font-mono')}
                      />
                    </label>
                    <p className="pl-[104px] text-[10.5px] leading-relaxed text-ink-300">
                      Empty means whatever the crop is already plantable on
                      {plantOn ? ` — ${plantOn}` : ''}. Separate several blocks with commas.
                    </p>

                    <button
                      type="button"
                      onClick={() => update(entry.plant, { needsWater: !entry.needsWater })}
                      aria-pressed={entry.needsWater}
                      className={cn(
                        'flex items-center gap-2 self-start rounded-md border px-2 py-1 text-xs transition-colors',
                        entry.needsWater
                          ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                          : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
                      )}
                    >
                      <Droplets size={12} />
                      Needs water beside it
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

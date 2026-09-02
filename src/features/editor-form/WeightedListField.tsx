/**
 * The weighted identifier list.
 *
 * Weights in Bedrock are relative, not percentages, which is a reliable source
 * of confusion — 3 and 1 is the same distribution as 30 and 10. So the row shows
 * the share it actually wins, recomputed as you type, and stores the raw weight.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { GripVertical, Plus, X } from 'lucide-react'

import { Button, cn, inputClass } from '../../app/ui/primitives'
import { type WeightedEntry, weightedEntries, weightedShares } from '../../core/kinds/weighted'
import { useProject } from '../../state/project'

export function WeightedListField({
  value,
  onChange,
  placeholder,
  listId,
}: {
  value: unknown
  onChange(next: WeightedEntry[]): void
  placeholder?: string
  listId: string
}) {
  const { project } = useProject()

  // Rows are edited in place, so the raw array is kept rather than the coerced
  // one — otherwise clearing the identifier field would delete the row you are
  // halfway through typing into.
  const rows: WeightedEntry[] = Array.isArray(value)
    ? (value as WeightedEntry[]).map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id : '',
        weight: typeof entry?.weight === 'number' && entry.weight > 0 ? entry.weight : 1,
      }))
    : []

  const shares = weightedShares(weightedEntries(rows))
  // `weightedEntries` drops blank rows, so shares line up by counting how many
  // valid rows came before each one.
  let valid = -1

  const update = (index: number, patch: Partial<WeightedEntry>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  return (
    <div className="flex flex-col gap-1.5">
      <datalist id={listId}>
        {project.nodes
          .filter((node) => ['block', 'crop', 'item'].includes(node.kind))
          .map((node) => (
            <option
              key={node.id}
              value={`${project.namespace}:${node.name}`}
              label={node.displayName}
            />
          ))}
        <option value="minecraft:short_grass" />
        <option value="minecraft:tall_grass" />
        <option value="minecraft:red_flower" />
        <option value="minecraft:yellow_flower" />
        <option value="minecraft:dirt" />
        <option value="minecraft:gravel" />
      </datalist>

      <AnimatePresence initial={false}>
        {rows.map((row, index) => {
          if (row.id.trim()) valid += 1
          const share = row.id.trim() ? shares[valid] : null

          return (
            <motion.div
              key={index}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-1.5"
            >
              <GripVertical size={12} className="shrink-0 text-ink-600" />

              <input
                list={listId}
                value={row.id}
                onChange={(event) => update(index, { id: event.target.value })}
                placeholder={placeholder ?? 'namespace:block'}
                aria-label={`Entry ${index + 1} identifier`}
                className={cn(inputClass, 'flex-1 font-mono')}
              />

              <input
                type="number"
                min={1}
                step={1}
                value={row.weight}
                onChange={(event) =>
                  update(index, { weight: Math.max(1, Math.round(Number(event.target.value) || 1)) })
                }
                aria-label={`Entry ${index + 1} weight`}
                className={cn(inputClass, 'w-16 shrink-0 text-center font-mono')}
              />

              <span
                className="w-12 shrink-0 text-right font-mono text-xs text-mint-500"
                title="Share of placements this entry wins"
              >
                {share === null ? '—' : `${share.toFixed(share < 10 ? 1 : 0)}%`}
              </span>

              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                aria-label={`Remove entry ${index + 1}`}
                className="grid size-7 shrink-0 place-items-center rounded text-ink-300 transition-colors hover:text-rose-500"
              >
                <X size={12} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>

      <div className="flex items-center gap-2 pt-0.5">
        <Button
          size="sm"
          icon={<Plus size={12} />}
          onClick={() => onChange([...rows, { id: '', weight: 1 }])}
        >
          Add block
        </Button>
        {rows.length > 1 ? (
          <span className="text-[10.5px] text-ink-300">
            Weights are relative — 3 and 1 is the same as 75% and 25%.
          </span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The 3x3 crafting grid.
 *
 * Click a slot and pick an ingredient, or drag one from the palette. The
 * pattern string and key map are worked out by the generator, so what you see
 * here is the arrangement, not the JSON.
 */

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, X } from 'lucide-react'

import { cn, inputClass } from '../../app/ui/primitives'
import { gridToPattern } from '../../core/kinds/recipe'
import { useProject } from '../../state/project'

/** Handy vanilla ingredients so the common cases need no typing. */
const COMMON_ITEMS = [
  'minecraft:egg',
  'minecraft:wheat',
  'minecraft:bowl',
  'minecraft:sugar',
  'minecraft:milk_bucket',
  'minecraft:stick',
  'minecraft:iron_ingot',
  'minecraft:coal',
  'minecraft:water_bucket',
  'minecraft:brown_mushroom',
  'minecraft:potato',
  'minecraft:carrot',
]

export function RecipeGridField({
  value,
  onChange,
}: {
  value: string[]
  onChange(next: string[]): void
}) {
  const { project } = useProject()
  const [selected, setSelected] = useState<number | null>(null)

  const cells = Array.from({ length: 9 }, (_, i) => value[i] ?? '')
  const pattern = gridToPattern(cells)

  const ownItems = project.nodes
    .filter((node) => node.kind === 'item' || node.kind === 'block' || node.kind === 'crop')
    .map((node) => ({
      id: `${project.namespace}:${node.name}`,
      label: node.displayName,
      kind: node.kind,
    }))

  const setCell = (index: number, next: string) => {
    const copy = [...cells]
    copy[index] = next
    onChange(copy)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="grid w-fit grid-cols-3 gap-1 rounded-lg border border-ink-600 bg-ink-900 p-1.5">
          {cells.map((cell, index) => {
            const own = ownItems.find((item) => item.id === cell)
            const short = cell ? (own?.label ?? cell.split(':')[1] ?? cell) : ''
            return (
              <motion.button
                key={index}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => setSelected(selected === index ? null : index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const dropped = event.dataTransfer.getData('text/plain')
                  if (dropped) setCell(index, dropped)
                }}
                title={cell || 'Empty slot'}
                className={cn(
                  'relative grid size-16 place-items-center rounded-md border p-1 text-center transition-colors',
                  selected === index
                    ? 'border-accent-500 bg-accent-500/12'
                    : cell
                      ? 'border-ink-600 bg-ink-800 hover:border-ink-500'
                      : 'border-dashed border-ink-700 bg-ink-850 hover:border-ink-500',
                )}
              >
                {cell ? (
                  <>
                    <span className="line-clamp-3 text-[9.5px] leading-tight text-ink-100">
                      {short}
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation()
                        setCell(index, '')
                      }}
                      className="absolute right-0.5 top-0.5 rounded p-0.5 text-ink-400 hover:text-rose-500"
                    >
                      <X size={9} />
                    </span>
                  </>
                ) : (
                  <span className="text-[9px] text-ink-500">·</span>
                )}
              </motion.button>
            )
          })}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Generated pattern
          </p>
          {pattern ? (
            <>
              <pre className="w-fit rounded border border-ink-700 bg-ink-950 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-mint-500">
                {pattern.pattern.map((row) => `"${row}"`).join('\n')}
              </pre>
              <ul className="flex flex-col gap-0.5">
                {Object.entries(pattern.key).map(([letter, entry]) => (
                  <li key={letter} className="flex items-center gap-1.5 text-[10.5px] text-ink-300">
                    <span className="font-mono text-accent-400">{letter}</span>
                    <ArrowRight size={9} className="text-ink-500" />
                    <span className="font-mono">{entry.item}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-[11px] text-ink-400">Place at least one ingredient.</p>
          )}
        </div>
      </div>

      {selected !== null ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-ink-700 bg-ink-850 p-2.5"
        >
          <p className="pb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Slot {selected + 1}
          </p>

          <input
            value={cells[selected]}
            onChange={(event) => setCell(selected, event.target.value.trim())}
            placeholder="namespace:item"
            className={cn(inputClass, 'mb-2 font-mono')}
          />

          {ownItems.length > 0 ? (
            <>
              <p className="pb-1 text-[10px] text-ink-400">From this add-on</p>
              <div className="flex flex-wrap gap-1 pb-2">
                {ownItems.map((item) => (
                  <Chip
                    key={item.id}
                    label={item.label}
                    value={item.id}
                    onPick={() => setCell(selected, item.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          <p className="pb-1 text-[10px] text-ink-400">Vanilla</p>
          <div className="flex flex-wrap gap-1">
            {COMMON_ITEMS.map((item) => (
              <Chip
                key={item}
                label={item.replace('minecraft:', '')}
                value={item}
                onPick={() => setCell(selected, item)}
              />
            ))}
          </div>
        </motion.div>
      ) : (
        <p className="text-[11px] text-ink-400">
          Click a slot to fill it, or drag an ingredient chip onto the grid.
        </p>
      )}
    </div>
  )
}

function Chip({
  label,
  value,
  onPick,
}: {
  label: string
  value: string
  onPick(): void
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', value)}
      onClick={onPick}
      title={value}
      className="cursor-grab rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-200 transition-colors hover:border-accent-500/60 hover:text-ink-50 active:cursor-grabbing"
    >
      {label}
    </button>
  )
}

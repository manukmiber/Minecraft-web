/**
 * The recipe builder.
 *
 * One tab per crafting station, the station's own slot layout underneath, and
 * an item browser you drag from. The tabs are generated from the station
 * registry — including a tab for every cookware block this add-on defines — so
 * a new station is data, not a new screen.
 *
 * Nothing here writes recipe JSON. It writes an arrangement into the model and
 * the generator turns that into a pattern, a key map and the right recipe type,
 * which is why switching stations can never leave a half-translated recipe
 * behind.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowRight,
  Box,
  CheckCircle2,
  CookingPot,
  Factory,
  Flame,
  Ghost,
  Grid3x3,
  Info,
  Scissors,
  Sparkles,
  Tent,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Badge, cn, inputClass } from '../../app/ui/primitives'
import type { ContentNode } from '../../core/model/types'
import {
  gridCellIndexes,
  resolveStation,
  stationsFor,
  type CraftingStation,
} from '../../core/recipes/stations'
import { gridToPattern } from '../../core/kinds/recipe'
import { useProject } from '../../state/project'
import { buildCatalog, findCatalogEntry, type CatalogEntry } from './catalog'
import { ItemBrowser, ITEM_DRAG_TYPE } from './ItemBrowser'
import { ItemTile } from './ItemTile'
import { NewItemDialog } from './NewItemDialog'
import { RecipePreview } from './RecipePreview'

const STATION_ICONS: Record<string, LucideIcon> = {
  Grid3x3,
  Flame,
  Factory,
  CookingPot,
  Tent,
  Ghost,
  Scissors,
  Box,
}

type SlotTarget =
  | { type: 'grid'; index: number }
  | { type: 'input' }
  | { type: 'fuel' }
  | { type: 'result' }

export function RecipeStationField({
  node,
  onPatch,
}: {
  node: ContentNode
  onPatch(patch: Record<string, unknown>): void
}) {
  const project = useProject((state) => state.project)
  const [selected, setSelected] = useState<SlotTarget | null>(null)
  const [creating, setCreating] = useState(false)

  const catalog = useMemo(() => buildCatalog(project), [project])
  const stations = useMemo(() => stationsFor(project), [project])
  const { station, fallback } = resolveStation(project, node.data)

  const cells = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => {
        const value = Array.isArray(node.data.grid) ? (node.data.grid as unknown[])[index] : ''
        return typeof value === 'string' ? value : ''
      }),
    [node.data.grid],
  )

  const input = typeof node.data.input === 'string' ? node.data.input : ''
  const fuel = typeof node.data.fuel === 'string' ? node.data.fuel : ''
  const result = typeof node.data.result === 'string' ? node.data.result : ''
  const resultCount = Number(node.data.resultCount ?? 1) || 1
  const shapeless =
    station.forceShapeless === true || (node.data.recipeType ?? 'shaped') === 'shapeless'

  const visibleIndexes =
    station.layout.kind === 'grid' ? gridCellIndexes(station.layout) : []
  const visibleCells = visibleIndexes.map((index) => cells[index]).filter(Boolean)
  const hiddenCells =
    station.layout.kind === 'grid'
      ? cells.filter((cell, index) => cell !== '' && !visibleIndexes.includes(index))
      : []

  const setCell = (index: number, value: string) => {
    const next = [...cells]
    next[index] = value
    onPatch({ grid: next })
  }

  const writeSlot = (target: SlotTarget, value: string) => {
    switch (target.type) {
      case 'grid':
        setCell(target.index, value)
        break
      case 'input':
        onPatch({ input: value })
        break
      case 'fuel':
        onPatch({ fuel: value })
        break
      case 'result':
        onPatch({ result: value })
        break
    }
  }

  const readSlot = (target: SlotTarget): string => {
    switch (target.type) {
      case 'grid':
        return cells[target.index]
      case 'input':
        return input
      case 'fuel':
        return fuel
      case 'result':
        return result
    }
  }

  /** Clicking a browser entry fills the selected slot, or the first free one. */
  const pick = (entry: CatalogEntry) => {
    if (selected) {
      writeSlot(selected, entry.id)
      return
    }
    if (station.layout.kind === 'cook') {
      writeSlot({ type: input ? 'result' : 'input' }, entry.id)
      return
    }
    const free = visibleIndexes.find((index) => cells[index] === '')
    if (free !== undefined) setCell(free, entry.id)
    else if (!result) onPatch({ result: entry.id })
  }

  const switchStation = (next: CraftingStation) => {
    const patch: Record<string, unknown> = { station: next.id }
    if (next.forceShapeless) patch.recipeType = 'shapeless'
    onPatch(patch)
    setSelected(null)
  }

  const problems = validate({
    station,
    ingredients: station.layout.kind === 'cook' ? [input].filter(Boolean) : visibleCells,
    result,
    shapeless,
    cells,
    trim: node.data.trimPattern !== false,
  })

  const pattern =
    station.layout.kind === 'grid' && !shapeless
      ? gridToPattern(cells, {
          rows: station.layout.rows,
          cols: station.layout.cols,
          trim: node.data.trimPattern !== false,
        })
      : null

  return (
    <div className="flex flex-col gap-3">
      {/* Station tabs ------------------------------------------------- */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
        {stations.map((entry) => {
          const Icon = STATION_ICONS[entry.icon] ?? Box
          const active = entry.id === station.id
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => switchStation(entry)}
              title={entry.hint}
              aria-pressed={active}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                active ? 'text-ink-50' : 'text-ink-300 hover:text-ink-100',
              )}
            >
              {active ? (
                <motion.span
                  layoutId="station-tab"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                  className="absolute inset-0 rounded-md border border-accent-500/50 bg-accent-500/15"
                />
              ) : null}
              <Icon size={12} className="relative" />
              <span className="relative">{entry.label}</span>
              {entry.blockNodeId ? (
                <span className="relative text-xs text-mint-500">yours</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {fallback ? (
        <Note tone="warn">
          The station this recipe was made at is gone, so it falls back to the crafting table. Pick
          the right tab to fix it.
        </Note>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        {/* Slots ------------------------------------------------------ */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-4 rounded-lg border border-ink-700 bg-ink-850/60 p-3">
            {station.layout.kind === 'grid' ? (
              <div className="flex flex-col gap-2">
                <div
                  className="grid w-fit gap-1"
                  style={{ gridTemplateColumns: `repeat(${station.layout.cols}, minmax(0, 1fr))` }}
                >
                  {visibleIndexes.map((index) => (
                    <Slot
                      key={index}
                      value={cells[index]}
                      catalog={catalog}
                      selected={selected?.type === 'grid' && selected.index === index}
                      onSelect={() =>
                        setSelected((current) =>
                          current?.type === 'grid' && current.index === index
                            ? null
                            : { type: 'grid', index },
                        )
                      }
                      onDrop={(value) => setCell(index, value)}
                      onClear={() => setCell(index, '')}
                      label={`Slot ${index + 1}`}
                    />
                  ))}
                </div>

                {station.forceShapeless ? null : (
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { value: 'shaped', label: 'Shaped' },
                        { value: 'shapeless', label: 'Shapeless' },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onPatch({ recipeType: option.value })}
                        className={cn(
                          'rounded border px-2 py-0.5 text-[10.5px] transition-colors',
                          (shapeless ? 'shapeless' : 'shaped') === option.value
                            ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                            : 'border-edge bg-ink-800 text-ink-200 hover:border-ink-300',
                        )}
                        title={
                          option.value === 'shaped'
                            ? 'Ingredients must sit in this arrangement'
                            : 'Any arrangement of the same ingredients works'
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Slot
                  value={input}
                  catalog={catalog}
                  selected={selected?.type === 'input'}
                  onSelect={() =>
                    setSelected((current) => (current?.type === 'input' ? null : { type: 'input' }))
                  }
                  onDrop={(value) => onPatch({ input: value })}
                  onClear={() => onPatch({ input: '' })}
                  label="Input"
                />
                <Flame size={14} className={fuel ? 'text-amber-500' : 'text-ink-500'} />
                {station.layout.fuel ? (
                  <Slot
                    value={fuel}
                    catalog={catalog}
                    selected={selected?.type === 'fuel'}
                    onSelect={() =>
                      setSelected((current) => (current?.type === 'fuel' ? null : { type: 'fuel' }))
                    }
                    onDrop={(value) => onPatch({ fuel: value })}
                    onClear={() => onPatch({ fuel: '' })}
                    label="Fuel"
                  />
                ) : (
                  <span className="text-xs text-ink-300">no fuel slot</span>
                )}
              </div>
            )}

            <ArrowRight size={16} className="mt-6 shrink-0 text-ink-500" />

            <div className="flex flex-col gap-1.5">
              <Slot
                value={result}
                catalog={catalog}
                selected={selected?.type === 'result'}
                onSelect={() =>
                  setSelected((current) => (current?.type === 'result' ? null : { type: 'result' }))
                }
                onDrop={(value) => onPatch({ result: value })}
                onClear={() => onPatch({ result: '' })}
                label="Result"
                large
              />
              <div className="flex items-center gap-1">
                <label className="text-xs text-ink-300" htmlFor="recipe-result-count">
                  x
                </label>
                <input
                  id="recipe-result-count"
                  type="number"
                  min={1}
                  max={64}
                  value={resultCount}
                  onChange={(event) =>
                    onPatch({ resultCount: Math.max(1, Number(event.target.value) || 1) })
                  }
                  className="h-8 w-16 rounded border border-edge bg-ink-850 px-1.5 font-mono text-xs text-ink-50 focus:border-accent-500 focus:outline-none focus:shadow-[0_0_0_3px_var(--color-accent-glow)]"
                />
              </div>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1 rounded border border-mint-500/40 bg-mint-500/10 px-2 py-1 text-[10.5px] text-mint-500 transition-colors hover:bg-mint-500/20"
              >
                <Sparkles size={10} />
                New item…
              </button>
            </div>
          </div>

          {/* Selected slot -------------------------------------------- */}
          <AnimatePresence initial={false}>
            {selected ? (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="rounded-lg border border-ink-700 bg-ink-850 p-2.5"
              >
                <p className="pb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-300">
                  {slotLabel(selected)} — type an identifier, or pick one on the right
                </p>
                <input
                  value={readSlot(selected)}
                  onChange={(event) => writeSlot(selected, event.target.value.trim())}
                  placeholder="namespace:item"
                  className={cn(inputClass, 'font-mono')}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Validation and translation ------------------------------- */}
          <div className="flex flex-col gap-2">
            {problems.map((problem) => (
              <Note key={problem.message} tone={problem.tone}>
                {problem.message}
              </Note>
            ))}

            {hiddenCells.length > 0 ? (
              <Note tone="info">
                {hiddenCells.length} ingredient{hiddenCells.length === 1 ? '' : 's'} sit outside this
                station&rsquo;s slots and will not be part of the recipe. They are kept in case you
                switch back to a larger station.
              </Note>
            ) : null}

            {pattern ? (
              <div className="rounded-lg border border-ink-700 bg-ink-850/60 p-2.5">
                <p className="pb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-300">
                  Generated pattern
                </p>
                <div className="flex flex-wrap items-start gap-4">
                  <pre className="rounded border border-ink-700 bg-ink-950 px-2 py-1.5 font-mono text-xs leading-relaxed text-mint-500">
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
                  <div className="ml-auto">
                    <Badge tone="neutral">tags: {station.tags.join(', ')}</Badge>
                  </div>
                </div>
              </div>
            ) : null}

            <RecipePreview
              station={station}
              cells={cells}
              input={input}
              fuel={fuel}
              result={result}
              resultCount={resultCount}
              catalog={catalog}
            />
          </div>
        </div>

        {/* Browser ---------------------------------------------------- */}
        <div className="flex max-h-[520px] min-h-[320px] flex-col">
          <ItemBrowser catalog={catalog} onPick={pick} onCreate={() => setCreating(true)} />
        </div>
      </div>

      <NewItemDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => onPatch({ result: created.identifier })}
      />
    </div>
  )
}

// -- pieces -----------------------------------------------------------------

function Slot({
  value,
  catalog,
  selected,
  onSelect,
  onDrop,
  onClear,
  label,
  large,
}: {
  value: string
  catalog: CatalogEntry[]
  selected: boolean
  onSelect(): void
  onDrop(value: string): void
  onClear(): void
  label: string
  large?: boolean
}) {
  const [over, setOver] = useState(false)
  const entry = value ? findCatalogEntry(catalog, value) : undefined
  const size = large ? 'size-[68px]' : 'size-[58px]'

  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const dropped =
          event.dataTransfer.getData(ITEM_DRAG_TYPE) || event.dataTransfer.getData('text/plain')
        if (dropped) onDrop(dropped.trim())
      }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onSelect}
        title={value || `${label} — empty`}
        aria-label={`${label}${value ? `: ${value}` : ''}`}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-md border p-1 transition-colors',
          size,
          over
            ? 'border-accent-500 bg-accent-500/15 shadow-[0_0_0_4px_var(--color-accent-glow)]'
            : selected
              ? 'border-accent-500 bg-accent-500/10'
              : value
                ? 'border-edge bg-ink-800 hover:border-ink-300'
                : 'border-dashed border-ink-700 bg-ink-900 hover:border-ink-500',
        )}
      >
        {value ? (
          <>
            <ItemTile entry={entry} id={value} size={large ? 34 : 28} />
            <span className="line-clamp-1 w-full text-center text-[8.5px] leading-tight text-ink-300">
              {entry?.label ?? value.split(':').pop()}
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-500">{label}</span>
        )}
      </button>

      {value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label}`}
          className="tap-target absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-ink-600 bg-ink-900 text-ink-300 opacity-0 transition-opacity [transition-duration:var(--duration-state)] hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={9} />
        </button>
      ) : null}
    </motion.div>
  )
}

function Note({ tone, children }: { tone: 'warn' | 'error' | 'info' | 'good'; children: React.ReactNode }) {
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <motion.p
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-start gap-1.5 rounded-md border px-2.5 py-1.5 text-xs leading-relaxed',
        tone === 'error' && 'border-rose-500/40 bg-rose-500/10 text-rose-500',
        tone === 'warn' && 'border-amber-500/40 bg-amber-500/10 text-amber-500',
        tone === 'info' && 'border-ink-600 bg-ink-850 text-ink-300',
        tone === 'good' && 'border-mint-500/40 bg-mint-500/10 text-mint-500',
      )}
    >
      <Icon size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </motion.p>
  )
}

function slotLabel(target: SlotTarget): string {
  switch (target.type) {
    case 'grid':
      return `Slot ${target.index + 1}`
    case 'input':
      return 'Input'
    case 'fuel':
      return 'Fuel'
    case 'result':
      return 'Result'
  }
}

interface RecipeProblem {
  tone: 'warn' | 'error' | 'info' | 'good'
  message: string
}

/**
 * What the builder can tell you before the generator runs. An empty recipe is
 * an error because it produces no file at all; a half-filled one is a warning,
 * since it is a perfectly normal state to be in halfway through.
 */
function validate({
  station,
  ingredients,
  result,
  shapeless,
  cells,
  trim,
}: {
  station: CraftingStation
  ingredients: string[]
  result: string
  shapeless: boolean
  cells: string[]
  trim: boolean
}): RecipeProblem[] {
  const problems: RecipeProblem[] = []
  const hasIngredients = ingredients.length > 0

  if (!hasIngredients && !result) {
    problems.push({
      tone: 'error',
      message: 'This recipe is empty. Fill at least one slot and set a result, or it generates no file.',
    })
    return problems
  }

  if (!hasIngredients) {
    problems.push({
      tone: 'warn',
      message:
        station.layout.kind === 'cook'
          ? 'There is a result but nothing to cook. Fill the input slot.'
          : 'There is a result but no ingredients. Fill at least one slot.',
    })
  }

  if (!result) {
    problems.push({ tone: 'warn', message: 'Ingredients are placed but nothing comes out yet. Fill the result slot.' })
  }

  if (station.layout.kind === 'grid' && !shapeless && hasIngredients && result) {
    const pattern = gridToPattern(cells, {
      rows: station.layout.rows,
      cols: station.layout.cols,
      trim,
    })
    if (pattern && Object.keys(pattern.key).length > 9) {
      problems.push({ tone: 'error', message: 'A shaped recipe can use at most nine distinct ingredients.' })
    }
  }

  if (problems.length === 0) {
    problems.push({ tone: 'good', message: 'Valid — this writes a complete recipe file.' })
  }

  return problems
}

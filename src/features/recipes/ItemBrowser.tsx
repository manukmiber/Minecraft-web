/**
 * The item browser beside the crafting grid.
 *
 * Everything the add-on makes sits at the top, the vanilla shortcuts below.
 * Entries are draggable onto any slot and clickable to fill the selected one,
 * because dragging nine ingredients one at a time gets old and clicking is
 * faster once you know which slot you want.
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Sparkles } from 'lucide-react'

import { Badge, cn, inputClass } from '../../app/ui/primitives'
import { PROJECT_GROUP, type CatalogEntry } from './catalog'
import { ItemTile } from './ItemTile'

/** The MIME the grid slots listen for, so a stray text drag cannot fill a slot. */
export const ITEM_DRAG_TYPE = 'application/x-bedrock-item'

export function ItemBrowser({
  catalog,
  onPick,
  onCreate,
}: {
  catalog: CatalogEntry[]
  /** Fills the slot the builder currently has selected. */
  onPick(entry: CatalogEntry): void
  /** Opens the "new item" form, for a result that does not exist yet. */
  onCreate?(): void
}) {
  const [query, setQuery] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = catalog.filter((entry) => {
      if (onlyMine && entry.source !== 'project') return false
      if (!needle) return true
      return (
        entry.label.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle)
      )
    })

    const order: string[] = []
    const byGroup = new Map<string, CatalogEntry[]>()
    for (const entry of filtered) {
      if (!byGroup.has(entry.group)) {
        byGroup.set(entry.group, [])
        order.push(entry.group)
      }
      byGroup.get(entry.group)!.push(entry)
    }
    return order.map((group) => ({ group, entries: byGroup.get(group)! }))
  }, [catalog, onlyMine, query])

  const mineCount = catalog.filter((entry) => entry.source === 'project').length

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-ink-700 bg-ink-850/60">
      <div className="flex shrink-0 flex-col gap-2 border-b border-ink-700 p-2">
        <div className="flex items-center gap-1.5">
          <Search size={13} className="shrink-0 text-ink-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items…"
            aria-label="Search items"
            className={cn(inputClass, 'h-7')}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOnlyMine((on) => !on)}
            className={cn(
              'min-w-0 truncate rounded border px-2 py-0.5 text-[10.5px] transition-colors',
              onlyMine
                ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
            )}
            title="Show only the items and blocks this add-on defines"
          >
            Mine ({mineCount})
          </button>
          {onCreate ? (
            <button
              type="button"
              onClick={onCreate}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-mint-500/40 bg-mint-500/10 px-2 py-0.5 text-[10.5px] text-mint-500 transition-colors hover:bg-mint-500/20"
            >
              <Sparkles size={10} />
              New item
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] text-ink-400">
            Nothing matches that. You can still type an identifier straight into a slot.
          </p>
        ) : null}

        {groups.map(({ group, entries }) => (
          <section key={group} className="pb-3">
            <h4 className="flex items-center gap-1.5 px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              {group}
              {group === PROJECT_GROUP ? <Badge tone="good">yours</Badge> : null}
            </h4>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] gap-1.5">
              {entries.map((entry) => (
                <motion.button
                  key={`${entry.group}:${entry.id}`}
                  type="button"
                  layout
                  whileTap={{ scale: 0.93 }}
                  draggable
                  onDragStart={(event) => {
                    const transfer = (event as unknown as React.DragEvent).dataTransfer
                    transfer.setData(ITEM_DRAG_TYPE, entry.id)
                    transfer.setData('text/plain', entry.id)
                    transfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onPick(entry)}
                  title={`${entry.label} — ${entry.id}`}
                  className="flex cursor-grab flex-col items-center gap-1 rounded-md border border-transparent p-1 transition-colors hover:border-ink-600 hover:bg-ink-800 active:cursor-grabbing"
                >
                  <ItemTile entry={entry} size={30} />
                  <span className="line-clamp-2 text-center text-[9px] leading-tight text-ink-300">
                    {entry.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

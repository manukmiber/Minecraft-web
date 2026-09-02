/**
 * What the recipe looks like in the game.
 *
 * A flat 2D mock of the crafting screen rather than anything 3D: the point is
 * to confirm the arrangement before saving, and the in-game screen is itself
 * flat. The palette is Minecraft's own grey UI so it reads as "the game", not
 * as another panel of this app.
 */

import { ArrowRight, Flame } from 'lucide-react'

import type { CraftingStation } from '../../core/recipes/stations'
import { gridCellIndexes } from '../../core/recipes/stations'
import type { CatalogEntry } from './catalog'
import { findCatalogEntry } from './catalog'
import { ItemTile } from './ItemTile'

export function RecipePreview({
  station,
  cells,
  input,
  fuel,
  result,
  resultCount,
  catalog,
}: {
  station: CraftingStation
  cells: string[]
  input: string
  fuel: string
  result: string
  resultCount: number
  catalog: CatalogEntry[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
        In-game preview
      </p>

      <div
        className="flex w-fit items-center gap-3 rounded-md p-3"
        // The vanilla GUI grey, with the light/dark bevel the game draws.
        style={{
          background: '#c6c6c6',
          boxShadow: 'inset 2px 2px 0 #ffffff, inset -2px -2px 0 #555555',
        }}
      >
        {station.layout.kind === 'grid' ? (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${station.layout.cols}, minmax(0, 1fr))` }}
          >
            {gridCellIndexes(station.layout).map((index) => (
              <PreviewSlot key={index} id={cells[index] ?? ''} catalog={catalog} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <PreviewSlot id={input} catalog={catalog} />
            <Flame size={13} style={{ color: fuel ? '#b04a1c' : '#7a7a7a' }} />
            {station.layout.fuel ? <PreviewSlot id={fuel} catalog={catalog} /> : null}
          </div>
        )}

        <ArrowRight size={16} style={{ color: '#555555' }} />

        <div className="relative">
          <PreviewSlot id={result} catalog={catalog} large />
          {resultCount > 1 ? (
            <span
              className="absolute -bottom-0.5 -right-0.5 rounded-sm px-1 font-mono text-xs font-bold leading-tight"
              style={{ background: '#3f3f3f', color: '#ffffff' }}
            >
              {resultCount}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PreviewSlot({
  id,
  catalog,
  large,
}: {
  id: string
  catalog: CatalogEntry[]
  large?: boolean
}) {
  const size = large ? 40 : 30
  const entry = id ? findCatalogEntry(catalog, id) : undefined

  return (
    <span
      className="grid place-items-center"
      style={{
        width: size,
        height: size,
        background: '#8b8b8b',
        boxShadow: 'inset 2px 2px 0 #373737, inset -2px -2px 0 #ffffff',
      }}
    >
      {id ? (
        <ItemTile
          entry={entry}
          id={id}
          size={size - 8}
          className="border-none bg-transparent"
        />
      ) : null}
    </span>
  )
}

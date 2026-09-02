/**
 * One item, drawn the same way everywhere it appears: the browser, a grid slot
 * and the in-game preview.
 *
 * Textures you made are shown for real, pixelated and unsmoothed. Vanilla
 * identifiers get a tinted monogram instead — this app ships no Minecraft
 * artwork, and a wrong icon would be worse than an honest placeholder.
 */

import { cn } from '../../app/ui/primitives'
import { useProject } from '../../state/project'
import { useAssetUrl } from '../textures/useAssetUrl'
import { monogram, shortLabel, tintFor, type CatalogEntry } from './catalog'

export function ItemTile({
  entry,
  id,
  size = 34,
  className,
}: {
  /** The catalogue entry, when the item is one the browser knows. */
  entry?: CatalogEntry
  /** Raw identifier, for a hand-typed item that is in no catalogue. */
  id?: string
  size?: number
  className?: string
}) {
  const project = useProject((state) => state.project)
  const identifier = entry?.id ?? id ?? ''
  const asset = entry?.assetId
    ? (project.assets.find((candidate) => candidate.id === entry.assetId) ?? null)
    : null
  const url = useAssetUrl(asset)
  const label = entry?.label ?? shortLabel(identifier)

  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded border border-ink-600 bg-ink-850',
        className,
      )}
      style={{ width: size, height: size }}
      title={identifier}
    >
      {url ? (
        <img
          src={url}
          alt={label}
          className="size-full object-contain p-0.5 [image-rendering:pixelated]"
        />
      ) : (
        <span
          className="grid size-full place-items-center text-xs font-semibold text-ink-50/90"
          style={{ background: tintFor(identifier || 'empty') }}
        >
          {monogram(label)}
        </span>
      )}
    </span>
  )
}

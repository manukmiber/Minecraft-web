/**
 * One item, drawn the same way everywhere it appears: the browser, a grid slot
 * and the in-game preview.
 *
 * Textures you made are shown for real, pixelated and unsmoothed. Vanilla
 * identifiers fall back to the Faithful artwork the app ships, and anything
 * neither source covers gets a tinted monogram — an honest placeholder beats a
 * wrong icon.
 */

import { cn } from '../../app/ui/primitives'
import { vanillaTexture, vanillaTextureUrl } from '../../core/data/vanillaTextures'
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
  const own = useAssetUrl(asset)
  const vanilla = vanillaTexture(identifier)
  const url = own ?? (vanilla ? vanillaTextureUrl(vanilla.icon) : null)
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

/**
 * The texture panel: everything this project has drawn or dropped, in one list.
 *
 * The pixel editor is reachable from every texture slot in the builder, but a
 * standalone list matters too — it is how you find the icon you drew twenty
 * minutes ago, fix a pixel, and have every slot using it pick up the change.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, ImageOff, Pencil, Plus, Trash2 } from 'lucide-react'

import { Badge, Button, EmptyState, cn, kindIcon } from '../../app/ui/primitives'
import type { AssetRef } from '../../core/model/types'
import { getKind } from '../../core/registry/types'
import { useProject } from '../../state/project'
import { openTextureMaker } from '../../state/textureMaker'
import { useAssetUrl } from '../textures/useAssetUrl'
import { CANVAS_SIZES } from './engine'

interface SlotTarget {
  nodeId: string
  nodeLabel: string
  slotKey: string
  slotLabel: string
  icon: string
}

export function TextureStudio() {
  const { project, setNodeTexture, replaceAssetEverywhere, forgetAsset, toast } = useProject()
  const [newSize, setNewSize] = useState(16)

  /** Every texture slot in the project, so any texture can be pointed at one. */
  const targets = useMemo<SlotTarget[]>(() => {
    const out: SlotTarget[] = []
    for (const node of project.nodes) {
      const kind = getKind(node.kind)
      if (!kind) continue
      for (const slot of kind.textureSlots(node)) {
        out.push({
          nodeId: node.id,
          nodeLabel: node.displayName,
          slotKey: slot.key,
          slotLabel: slot.label,
          icon: kind.icon,
        })
      }
    }
    return out
  }, [project.nodes])

  const usage = useMemo(() => {
    const map = new Map<string, SlotTarget[]>()
    for (const target of targets) {
      const node = project.nodes.find((n) => n.id === target.nodeId)
      const assetId = node?.textures[target.slotKey]
      if (!assetId) continue
      const list = map.get(assetId) ?? []
      list.push(target)
      map.set(assetId, list)
    }
    return map
  }, [project.nodes, targets])

  const drawNew = () => {
    openTextureMaker({
      title: `New ${newSize}x${newSize} texture`,
      size: newSize,
      fileName: `texture_${newSize}`,
      onSave: () =>
        toast({
          tone: 'success',
          title: 'Texture added to the studio',
          detail: 'Point it at a slot below to have it end up in the pack.',
        }),
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-800 p-2">
        {CANVAS_SIZES.filter((size) => size <= 64).map((size) => (
          <button
            key={size}
            type="button"
            onClick={() => setNewSize(size)}
            className={cn(
              'rounded border px-2 py-0.5 text-[10.5px] transition-colors',
              newSize === size
                ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
            )}
          >
            {size}px
          </button>
        ))}
        <Button size="sm" variant="primary" icon={<Plus size={11} />} onClick={drawNew}>
          Draw
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {project.assets.length === 0 ? (
          <EmptyState
            icon={<Pencil size={20} />}
            title="No textures yet"
            detail="Draw one here, or drop a PNG onto any texture slot in the builder. Both end up in the same place."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {project.assets.map((asset) => (
                <AssetRow
                  key={asset.id}
                  asset={asset}
                  used={usage.get(asset.id) ?? []}
                  targets={targets}
                  onAssign={(target) => setNodeTexture(target.nodeId, target.slotKey, asset.id)}
                  onEdit={() =>
                    openTextureMaker({
                      title: asset.fileName,
                      size: asset.width ?? 16,
                      startFrom: asset,
                      fileName: asset.fileName.replace(/\.png$/i, ''),
                      onSave: (next) => {
                        const moved = replaceAssetEverywhere(asset.id, next.id)
                        forgetAsset(asset.id)
                        toast({
                          tone: 'success',
                          title: 'Texture updated',
                          detail:
                            moved > 0
                              ? `${moved} slot${moved === 1 ? '' : 's'} now use the new version.`
                              : 'Saved. It is not pointed at a slot yet.',
                        })
                      },
                    })
                  }
                  onDelete={() => {
                    if (!forgetAsset(asset.id)) {
                      toast({
                        tone: 'warning',
                        title: 'Still in use',
                        detail: 'Clear the slots using this texture first, then remove it.',
                      })
                    }
                  }}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function AssetRow({
  asset,
  used,
  targets,
  onAssign,
  onEdit,
  onDelete,
}: {
  asset: AssetRef
  used: SlotTarget[]
  targets: SlotTarget[]
  onAssign(target: SlotTarget): void
  onEdit(): void
  onDelete(): void
}) {
  const url = useAssetUrl(asset)

  const download = () => {
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = asset.fileName
    link.click()
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="group flex flex-col gap-1.5 rounded-lg border border-ink-700 bg-ink-850/60 p-2"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-ink-600 bg-ink-900">
          {url ? (
            <img
              src={url}
              alt={asset.fileName}
              className="size-full object-contain p-0.5 [image-rendering:pixelated]"
            />
          ) : (
            <ImageOff size={13} className="text-ink-400" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-ink-100" title={asset.fileName}>
            {asset.fileName}
          </p>
          <p className="flex items-center gap-1.5 text-[10px] text-ink-400">
            {asset.width && asset.height ? `${asset.width}x${asset.height}` : 'unknown size'}
            {used.length === 0 ? <Badge tone="warn">unused</Badge> : null}
          </p>
        </div>

        <button
          type="button"
          onClick={onEdit}
          title="Edit in the texture maker"
          aria-label={`Edit ${asset.fileName}`}
          className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-750 hover:text-accent-400"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={download}
          title="Download the PNG"
          aria-label={`Download ${asset.fileName}`}
          className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-750 hover:text-ink-100"
        >
          <Download size={12} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Remove from the project"
          aria-label={`Remove ${asset.fileName}`}
          className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-750 hover:text-rose-500"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {used.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {used.map((target) => {
            const Icon = kindIcon(target.icon)
            return (
              <li
                key={`${target.nodeId}-${target.slotKey}`}
                className="flex items-center gap-1 rounded border border-ink-700 bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300"
              >
                <Icon size={9} />
                {target.nodeLabel} · {target.slotLabel}
              </li>
            )
          })}
        </ul>
      ) : targets.length > 0 ? (
        <select
          aria-label={`Use ${asset.fileName} in a slot`}
          value=""
          onChange={(event) => {
            const target = targets.find(
              (candidate) => `${candidate.nodeId}:${candidate.slotKey}` === event.target.value,
            )
            if (target) onAssign(target)
          }}
          className="h-6 w-full rounded border border-ink-600 bg-ink-850 px-1.5 text-[10.5px] text-ink-200 focus:border-accent-500 focus:outline-none"
        >
          <option value="">Use in…</option>
          {targets.map((target) => (
            <option
              key={`${target.nodeId}:${target.slotKey}`}
              value={`${target.nodeId}:${target.slotKey}`}
            >
              {target.nodeLabel} · {target.slotLabel}
            </option>
          ))}
        </select>
      ) : null}
    </motion.li>
  )
}

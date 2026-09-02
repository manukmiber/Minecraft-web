/**
 * A texture slot you can drop a PNG onto — or draw one for.
 *
 * Dropping validates the file, caches it locally, pushes it to R2 and points
 * the slot at it. From there the generator decides the atlas entry and the file
 * path — which is why nothing in this component knows or cares what a
 * `terrain_texture.json` is.
 *
 * The pencil opens the pixel editor on this exact slot and hands the finished
 * PNG back through the same pipeline, so an uploaded texture and a drawn one
 * are the same thing from here on.
 */

import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImageOff, Pencil, Upload, X } from 'lucide-react'

import { Badge, Spinner, cn } from '../../app/ui/primitives'
import type { ContentNode } from '../../core/model/types'
import type { TextureSlot } from '../../core/registry/types'
import { assets as assetStore } from '../../state/services'
import { useProject } from '../../state/project'
import { openTextureMaker } from '../../state/textureMaker'
import { useAssetUrl } from './useAssetUrl'

export function TextureSlotDrop({ node, slot }: { node: ContentNode; slot: TextureSlot }) {
  const { project, registerAsset, setNodeTexture, toast } = useProject()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const assetId = node.textures[slot.key] ?? null
  const asset = assetId ? (project.assets.find((a) => a.id === assetId) ?? null) : null
  const url = useAssetUrl(asset)

  const accept = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    setUploading(true)
    try {
      const result = await assetStore.importFile(file, project.id, slot.recommended)
      registerAsset(result.asset)
      setNodeTexture(node.id, slot.key, result.asset.id)
      if (result.warning) {
        toast({ tone: 'warning', title: 'Texture added, with a caveat', detail: result.warning })
      }
    } catch (failure) {
      toast({
        tone: 'error',
        title: 'Could not use that file',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setUploading(false)
    }
  }

  const uvTemplate = slot.uvTemplate?.(node) ?? null
  const size = slot.recommended ?? 16

  const draw = () => {
    openTextureMaker({
      title: `${node.displayName} · ${slot.label}`,
      size,
      // A UV-mapped slot has to keep the sheet the model expects; a plain item
      // or block icon is free to be any of the offered sizes.
      sheet: uvTemplate ? { width: size, height: size } : null,
      uvTemplate,
      startFrom: asset,
      fileName: `${node.name}_${slot.key}`,
      onSave: (next) => setNodeTexture(node.id, slot.key, next.id),
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void accept(event.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={
          asset ? `Replace the ${slot.label} texture` : `Add a ${slot.label} texture`
        }
        aria-busy={uploading}
        onKeyDown={(event) => {
          // Space scrolls the page by default, so both keys are handled here.
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        title={slot.help ?? `Drop a PNG for ${slot.label}`}
        className={cn(
          'group relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border transition-all duration-200',
          dragging
            ? 'border-accent-500 bg-accent-500/12 shadow-[0_0_0_4px_var(--color-accent-glow)]'
            : asset
              ? 'border-edge bg-ink-900 hover:border-ink-300'
              : 'border-dashed border-edge bg-ink-900/60 hover:border-accent-500/60',
        )}
      >
        <AnimatePresence mode="wait">
          {uploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-1.5"
            >
              <Spinner />
              <span className="text-xs text-ink-300">Uploading…</span>
            </motion.div>
          ) : url ? (
            <motion.img
              key={url}
              src={url}
              alt={slot.label}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              // Textures are tiny; nearest-neighbour keeps the pixels crisp.
              className="size-full object-contain p-1.5 [image-rendering:pixelated]"
            />
          ) : asset ? (
            <motion.div
              key="missing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-1 text-ink-300"
            >
              <ImageOff size={16} />
              <span className="px-1 text-center text-xs leading-tight">
                bytes not cached — re-drop the file
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-1 text-ink-300 transition-colors group-hover:text-ink-200"
            >
              <Upload size={15} />
              <span className="text-[9.5px]">Drop PNG</span>
              <span className="text-xs text-ink-500">or draw it</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            draw()
          }}
          title={asset ? `Edit ${slot.label} in the texture maker` : `Draw ${slot.label} pixel by pixel`}
          aria-label={asset ? `Edit ${slot.label}` : `Draw ${slot.label}`}
          className="tap-target absolute bottom-1 left-1 grid size-6 place-items-center rounded bg-ink-950/80 text-ink-300 opacity-0 transition-opacity [transition-duration:var(--duration-state)] hover:text-accent-400 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil size={11} />
        </button>

        {asset ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setNodeTexture(node.id, slot.key, null)
            }}
            aria-label={`Clear ${slot.label}`}
            className="tap-target absolute right-1 top-1 grid size-6 place-items-center rounded bg-ink-950/80 text-ink-300 opacity-0 transition-opacity [transition-duration:var(--duration-state)] hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X size={11} />
          </button>
        ) : null}

        {slot.required && !asset ? (
          <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-amber-500" title="Required" />
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-300" title={slot.label}>
          {slot.label}
        </span>
        {asset?.width ? (
          <Badge tone="neutral" className="px-1 py-0 text-xs tracking-normal normal-case">
            {asset.width}px
          </Badge>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png"
        hidden
        onChange={(event) => {
          void accept(event.target.files)
          event.target.value = ''
        }}
      />
    </div>
  )
}

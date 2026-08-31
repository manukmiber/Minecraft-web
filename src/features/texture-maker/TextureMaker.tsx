/**
 * The pixel art editor.
 *
 * Deliberately shaped like the tools people already know — a big zoomed canvas
 * with visible grid lines, a tool column, a colour panel — because a texture
 * editor that needs explaining is a texture editor nobody uses. Everything the
 * tools actually do lives in `engine.ts`; this file is the surface.
 *
 * Saving goes through the same asset pipeline a dropped PNG uses, so a drawn
 * texture and an uploaded one are indistinguishable from that point on: same
 * IndexedDB cache, same R2 upload, same commit into the project repo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Download,
  Droplet,
  Eraser,
  FlipHorizontal,
  FlipVertical,
  Grid2x2,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'

import { Badge, Button, Spinner, cn, inputClass } from '../../app/ui/primitives'
import type { UvRegion } from '../../core/generators/geometry'
import type { AssetRef } from '../../core/model/types'
import { assets as assetStore } from '../../state/services'
import { useProject } from '../../state/project'
import { canvasFromBlob } from './decode'
import {
  CANVAS_SIZES,
  cloneCanvas,
  createCanvas,
  floodFill,
  getPixel,
  hexToRgba,
  isBlank,
  paint,
  resizeCanvas,
  rgbaToCss,
  rgbaToHex,
  toPngBytes,
  toPngFile,
  type PixelCanvas,
  type Rgba,
  type SymmetryMode,
  type ToolId,
} from './engine'

/** A starting palette that reads well against Minecraft's own art direction. */
const PALETTE = [
  '#000000', '#3b3b3b', '#6e6e6e', '#a5a5a5', '#dcdcdc', '#ffffff',
  '#5c3a21', '#8a5a2b', '#b98d4d', '#e0c088', '#f5e6c8', '#3d2b1f',
  '#1f5f2e', '#2f8f3f', '#57c25a', '#9fe08a', '#2a4f7c', '#3f7fc4',
  '#69b7ff', '#a8dcff', '#7a1f2b', '#b8323f', '#ef5f6b', '#ff9aa2',
  '#7a5c1f', '#c99a2e', '#f2c14a', '#ffe08a', '#4a2a6b', '#7d4fb5',
]

const TOOLS: Array<{ id: ToolId; label: string; icon: typeof Pencil; hint: string; key: string }> = [
  { id: 'pencil', label: 'Pencil', icon: Pencil, hint: 'Paint one pixel per cell', key: 'B' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, hint: 'Clear pixels back to transparent', key: 'E' },
  { id: 'fill', label: 'Fill', icon: PaintBucket, hint: 'Flood the connected area', key: 'G' },
  { id: 'eyedropper', label: 'Pick colour', icon: Pipette, hint: 'Take a colour off the canvas', key: 'I' },
]

const HISTORY_LIMIT = 80

export interface TextureMakerProps {
  title: string
  size: number
  sheet?: { width: number; height: number } | null
  uvTemplate?: UvRegion[] | null
  startFrom?: AssetRef | null
  fileName?: string
  onSave(asset: AssetRef): void
  onClose(): void
}

export function TextureMaker({
  title,
  size,
  sheet,
  uvTemplate,
  startFrom,
  fileName,
  onSave,
  onClose,
}: TextureMakerProps) {
  const { project, registerAsset, toast } = useProject()

  const initialWidth = sheet?.width ?? size
  const initialHeight = sheet?.height ?? size

  const [canvas, setCanvas] = useState<PixelCanvas>(() => createCanvas(initialWidth, initialHeight))
  const [tool, setTool] = useState<ToolId>('pencil')
  const [color, setColor] = useState<Rgba>({ r: 122, g: 92, b: 31, a: 255 })
  const [recent, setRecent] = useState<string[]>([])
  const [symmetry, setSymmetry] = useState<SymmetryMode>('none')
  const [showGrid, setShowGrid] = useState(true)
  const [showTemplate, setShowTemplate] = useState(Boolean(uvTemplate?.length))
  const [zoom, setZoom] = useState(() => fitZoom(initialWidth, initialHeight))
  const [loading, setLoading] = useState(Boolean(startFrom))
  const [saving, setSaving] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)

  const past = useRef<PixelCanvas[]>([])
  const future = useRef<PixelCanvas[]>([])
  const drawing = useRef(false)
  const lastCell = useRef<{ x: number; y: number } | null>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  /** Bumped whenever the buffer is mutated in place, to force a repaint. */
  const [revision, setRevision] = useState(0)

  // -- opening an existing texture ------------------------------------------

  useEffect(() => {
    if (!startFrom) return
    let cancelled = false

    void (async () => {
      try {
        const bytes = await assetStore.read(startFrom)
        if (!bytes) throw new Error('Those pixels are not cached locally any more.')
        const loaded = await canvasFromBlob(new Blob([bytes], { type: 'image/png' }), size)
        if (cancelled) return
        setCanvas(loaded)
        setZoom(fitZoom(loaded.width, loaded.height))
      } catch (failure) {
        if (cancelled) return
        toast({
          tone: 'warning',
          title: 'Started from a blank canvas',
          detail: failure instanceof Error ? failure.message : String(failure),
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFrom?.id])

  // -- painting -------------------------------------------------------------

  const snapshot = useCallback(() => {
    past.current = [...past.current.slice(-HISTORY_LIMIT + 1), cloneCanvas(canvas)]
    future.current = []
  }, [canvas])

  const commitPixels = useCallback((changed: boolean) => {
    if (changed) setRevision((r) => r + 1)
  }, [])

  const applyAt = useCallback(
    (x: number, y: number) => {
      if (tool === 'eyedropper') {
        const picked = getPixel(canvas, x, y)
        if (picked.a > 0) {
          setColor(picked)
          pushRecent(picked)
        }
        setTool('pencil')
        return
      }

      const paintColor: Rgba = tool === 'eraser' ? { r: 0, g: 0, b: 0, a: 0 } : color

      if (tool === 'fill') {
        commitPixels(floodFill(canvas, x, y, paintColor, symmetry))
        return
      }

      commitPixels(paint(canvas, x, y, paintColor, symmetry))
    },
    [canvas, color, commitPixels, symmetry, tool],
  )

  const pushRecent = (next: Rgba) => {
    const hex = rgbaToHex(next)
    setRecent((prev) => [hex, ...prev.filter((entry) => entry !== hex)].slice(0, 12))
  }

  const cellFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height)
    return { x, y }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const cell = cellFromEvent(event)
    if (tool !== 'eyedropper') snapshot()
    drawing.current = true
    lastCell.current = cell
    applyAt(cell.x, cell.y)
    if (tool === 'pencil' || tool === 'eraser') pushRecent(color)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = cellFromEvent(event)
    setHover(cell)
    if (!drawing.current || tool === 'fill' || tool === 'eyedropper') return

    // A fast drag skips cells, so the gap between the last sample and this one
    // is walked rather than leaving a dotted line behind.
    const from = lastCell.current ?? cell
    for (const point of line(from.x, from.y, cell.x, cell.y)) applyAt(point.x, point.y)
    lastCell.current = cell
  }

  const endStroke = () => {
    drawing.current = false
    lastCell.current = null
  }

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push(cloneCanvas(canvas))
    setCanvas(previous)
  }, [canvas])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(cloneCanvas(canvas))
    setCanvas(next)
  }, [canvas])

  // -- keyboard -------------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return

      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod) return

      const match = TOOLS.find((entry) => entry.key.toLowerCase() === event.key.toLowerCase())
      if (match) {
        event.preventDefault()
        setTool(match.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [redo, undo])

  // -- drawing the canvas ---------------------------------------------------

  useEffect(() => {
    const surface = displayRef.current
    if (!surface) return
    const context = surface.getContext('2d')
    if (!context) return

    const width = canvas.width * zoom
    const height = canvas.height * zoom
    if (surface.width !== width || surface.height !== height) {
      surface.width = width
      surface.height = height
    }

    context.clearRect(0, 0, width, height)
    drawChecker(context, width, height, Math.max(4, Math.round(zoom / 2)))

    // Nearest-neighbour blit: pixel art must never be smoothed, in the editor
    // or in the preview.
    const source = document.createElement('canvas')
    source.width = canvas.width
    source.height = canvas.height
    const sourceContext = source.getContext('2d')
    if (sourceContext) {
      const image = sourceContext.createImageData(canvas.width, canvas.height)
      image.data.set(canvas.pixels)
      sourceContext.putImageData(image, 0, 0)
      context.imageSmoothingEnabled = false
      context.drawImage(source, 0, 0, width, height)
    }

    if (showGrid && zoom >= 6) {
      context.strokeStyle = 'rgba(148, 163, 184, 0.22)'
      context.lineWidth = 1
      context.beginPath()
      for (let x = 1; x < canvas.width; x++) {
        context.moveTo(x * zoom + 0.5, 0)
        context.lineTo(x * zoom + 0.5, height)
      }
      for (let y = 1; y < canvas.height; y++) {
        context.moveTo(0, y * zoom + 0.5)
        context.lineTo(width, y * zoom + 0.5)
      }
      context.stroke()

      // A heavier line every 8 pixels, the way sprite sheets are usually read.
      if (canvas.width % 8 === 0) {
        context.strokeStyle = 'rgba(148, 163, 184, 0.4)'
        context.beginPath()
        for (let x = 8; x < canvas.width; x += 8) {
          context.moveTo(x * zoom + 0.5, 0)
          context.lineTo(x * zoom + 0.5, height)
        }
        for (let y = 8; y < canvas.height; y += 8) {
          context.moveTo(0, y * zoom + 0.5)
          context.lineTo(width, y * zoom + 0.5)
        }
        context.stroke()
      }
    }

    if (showTemplate && uvTemplate?.length) {
      // Regions are in the model's UV units. Drawing a skin at twice the sheet
      // size is legitimate — Bedrock scales it — so the template scales with
      // the canvas rather than sitting in the wrong corner.
      const unit = (sheet ? canvas.width / sheet.width : 1) * zoom

      context.save()
      context.lineWidth = 2
      context.strokeStyle = 'rgba(74, 163, 255, 0.75)'
      context.fillStyle = 'rgba(74, 163, 255, 0.9)'
      context.font = `${Math.max(9, Math.min(13, unit))}px ui-sans-serif, system-ui, sans-serif`
      for (const region of uvTemplate) {
        context.strokeRect(
          region.x * unit + 1,
          region.y * unit + 1,
          region.width * unit - 2,
          region.height * unit - 2,
        )
        context.fillText(region.label, region.x * unit + 3, region.y * unit + 12)
      }
      context.restore()
    }
  }, [canvas, revision, sheet, showGrid, showTemplate, uvTemplate, zoom])

  // -- saving ---------------------------------------------------------------

  const suggestedName = useMemo(() => {
    const base = (fileName ?? title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return `${base || 'texture'}.png`
  }, [fileName, title])

  const saveAndUse = async () => {
    if (isBlank(canvas)) {
      toast({
        tone: 'warning',
        title: 'Nothing drawn yet',
        detail: 'Every pixel is still transparent, so there is nothing to save.',
      })
      return
    }

    setSaving(true)
    try {
      const file = toPngFile(canvas, suggestedName)
      const result = await assetStore.importFile(file, project.id, size)
      registerAsset(result.asset)
      onSave(result.asset)
      if (result.warning) {
        toast({ tone: 'warning', title: 'Texture saved, with a caveat', detail: result.warning })
      } else {
        toast({
          tone: 'success',
          title: 'Texture saved',
          detail: `${canvas.width}x${canvas.height} PNG assigned and queued for the next save.`,
        })
      }
      onClose()
    } catch (failure) {
      toast({
        tone: 'error',
        title: 'Could not save that texture',
        detail: failure instanceof Error ? failure.message : String(failure),
      })
    } finally {
      setSaving(false)
    }
  }

  const exportPng = () => {
    const bytes = toPngBytes(canvas)
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/png' }))
    const link = document.createElement('a')
    link.href = url
    link.download = suggestedName
    link.click()
    URL.revokeObjectURL(url)
  }

  const changeSize = (next: number) => {
    snapshot()
    setCanvas((current) => resizeCanvas(current, next))
    setZoom(fitZoom(next, next))
  }

  const clear = () => {
    snapshot()
    setCanvas((current) => createCanvas(current.width, current.height))
  }

  const hoverColor = hover ? getPixel(canvas, hover.x, hover.y) : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-ink-700 px-3">
        <Pencil size={14} className="text-accent-500" />
        <h2 className="truncate text-xs font-semibold text-ink-50">{title}</h2>
        <Badge tone="neutral">
          {canvas.width}x{canvas.height}
        </Badge>
        {sheet ? <Badge tone="accent">UV sheet</Badge> : null}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the texture maker"
          className="rounded p-1 text-ink-300 transition-colors hover:bg-ink-750 hover:text-ink-50"
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tools ------------------------------------------------------- */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-ink-700 py-2">
          {TOOLS.map((entry) => {
            const Icon = entry.icon
            const active = tool === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTool(entry.id)}
                title={`${entry.label} (${entry.key}) — ${entry.hint}`}
                aria-pressed={active}
                className={cn(
                  'relative grid size-9 place-items-center rounded-lg transition-colors',
                  active ? 'bg-accent-500/18 text-accent-400' : 'text-ink-300 hover:bg-ink-750 hover:text-ink-50',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="tool-active"
                    transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                    className="absolute inset-0 rounded-lg border border-accent-500/50"
                  />
                ) : null}
                <Icon size={16} className="relative" />
              </button>
            )
          })}

          <div className="my-1 h-px w-6 bg-ink-700" />

          <IconToggle
            icon={FlipHorizontal}
            label="Mirror left/right"
            active={symmetry === 'horizontal' || symmetry === 'both'}
            onClick={() => setSymmetry((mode) => toggleSymmetry(mode, 'horizontal'))}
          />
          <IconToggle
            icon={FlipVertical}
            label="Mirror top/bottom"
            active={symmetry === 'vertical' || symmetry === 'both'}
            onClick={() => setSymmetry((mode) => toggleSymmetry(mode, 'vertical'))}
          />
          <IconToggle
            icon={Grid2x2}
            label="Grid lines"
            active={showGrid}
            onClick={() => setShowGrid((on) => !on)}
          />

          <div className="my-1 h-px w-6 bg-ink-700" />

          <IconToggle icon={Undo2} label="Undo (Ctrl+Z)" active={false} onClick={undo} />
          <IconToggle icon={Redo2} label="Redo (Ctrl+Shift+Z)" active={false} onClick={redo} />
          <IconToggle icon={Trash2} label="Clear the canvas" active={false} onClick={clear} danger />
        </div>

        {/* Canvas ------------------------------------------------------ */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-ink-800 px-3">
            <div className="flex items-center gap-1">
              {CANVAS_SIZES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeSize(option)}
                  className={cn(
                    'rounded border px-2 py-0.5 text-[11px] transition-colors',
                    canvas.width === option && canvas.height === option
                      ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                      : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
                  )}
                  title={`Resize to ${option}x${option} (nearest neighbour, so no new colours appear)`}
                >
                  {option}px
                </button>
              ))}
            </div>

            {uvTemplate?.length ? (
              <button
                type="button"
                onClick={() => setShowTemplate((on) => !on)}
                className={cn(
                  'rounded border px-2 py-0.5 text-[11px] transition-colors',
                  showTemplate
                    ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
                    : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
                )}
              >
                UV template
              </button>
            ) : null}

            <div className="flex-1" />

            <span className="font-mono text-[11px] text-ink-400">
              {hover ? `${hover.x}, ${hover.y}` : `${canvas.width}x${canvas.height}`}
            </span>
            <div className="flex items-center gap-1">
              <IconToggle
                icon={Minus}
                label="Zoom out"
                active={false}
                onClick={() => setZoom((z) => Math.max(2, z - 2))}
                small
              />
              <span className="w-8 text-center font-mono text-[11px] text-ink-300">{zoom}x</span>
              <IconToggle
                icon={Plus}
                label="Zoom in"
                active={false}
                onClick={() => setZoom((z) => Math.min(48, z + 2))}
                small
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6 grid-backdrop">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-xs text-ink-300">
                <Spinner />
                Loading the existing texture…
              </div>
            ) : (
              <div className="flex min-h-full items-center justify-center">
                <canvas
                  ref={displayRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endStroke}
                  onPointerLeave={() => {
                    endStroke()
                    setHover(null)
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                  className="touch-none rounded border border-ink-600 shadow-panel [image-rendering:pixelated]"
                  style={{ cursor: tool === 'eyedropper' ? 'crosshair' : 'cell' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Colour ------------------------------------------------------ */}
        <div className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-l border-ink-700 p-3">
          <div>
            <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              Colour
            </p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={rgbaToHex(color)}
                onChange={(event) => setColor(hexToRgba(event.target.value, color.a))}
                aria-label="Colour picker"
                className="size-9 cursor-pointer rounded border border-ink-600 bg-ink-850"
              />
              <input
                value={rgbaToHex(color)}
                onChange={(event) => setColor(hexToRgba(event.target.value, color.a))}
                aria-label="Hex colour"
                className={cn(inputClass, 'font-mono')}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between pb-1 text-[11px] text-ink-200">
              Opacity
              <span className="font-mono text-[10px] text-ink-400">
                {Math.round((color.a / 255) * 100)}%
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={255}
              value={color.a}
              onChange={(event) => setColor({ ...color, a: Number(event.target.value) })}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-[var(--color-accent-500)]"
            />
          </div>

          <div>
            <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              Palette
            </p>
            <div className="grid grid-cols-6 gap-1">
              {PALETTE.map((hex) => (
                <Swatch key={hex} hex={hex} onPick={() => setColor(hexToRgba(hex, color.a))} />
              ))}
            </div>
          </div>

          <div>
            <p className="pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-300">
              Recent
            </p>
            {recent.length === 0 ? (
              <p className="text-[11px] text-ink-400">Colours you use show up here.</p>
            ) : (
              <div className="grid grid-cols-6 gap-1">
                <AnimatePresence initial={false}>
                  {recent.map((hex) => (
                    <motion.div key={hex} layout initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                      <Swatch hex={hex} onPick={() => setColor(hexToRgba(hex, color.a))} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {hoverColor && hoverColor.a > 0 ? (
            <div className="flex items-center gap-2 rounded border border-ink-700 bg-ink-850 px-2 py-1.5">
              <span
                className="size-4 rounded border border-ink-600"
                style={{ background: rgbaToCss(hoverColor) }}
              />
              <span className="font-mono text-[10.5px] text-ink-200">{rgbaToHex(hoverColor)}</span>
              <Droplet size={11} className="ml-auto text-ink-400" />
            </div>
          ) : null}
        </div>
      </div>

      <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-ink-700 px-3">
        <p className="min-w-0 flex-1 truncate text-[11px] text-ink-400">
          Saved textures go through the same upload and commit path as a dropped PNG.
        </p>
        <Button size="sm" variant="ghost" icon={<Download size={12} />} onClick={exportPng}>
          Export as PNG
        </Button>
        <Button size="sm" variant="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={saving}
          icon={saving ? <Spinner /> : <Save size={12} />}
          onClick={() => void saveAndUse()}
        >
          Save &amp; use
        </Button>
      </footer>
    </div>
  )
}

function Swatch({ hex, onPick }: { hex: string; onPick(): void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={hex}
      aria-label={hex}
      className="size-6 rounded border border-ink-600 transition-transform hover:scale-110 hover:border-ink-400"
      style={{ background: hex }}
    />
  )
}

function IconToggle({
  icon: Icon,
  label,
  active,
  onClick,
  danger,
  small,
}: {
  icon: typeof Pencil
  label: string
  active: boolean
  onClick(): void
  danger?: boolean
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'grid place-items-center rounded-lg transition-colors',
        small ? 'size-6' : 'size-9',
        active
          ? 'bg-accent-500/18 text-accent-400'
          : danger
            ? 'text-ink-300 hover:bg-rose-500/15 hover:text-rose-500'
            : 'text-ink-300 hover:bg-ink-750 hover:text-ink-50',
      )}
    >
      <Icon size={small ? 12 : 16} />
    </button>
  )
}

function toggleSymmetry(current: SymmetryMode, axis: 'horizontal' | 'vertical'): SymmetryMode {
  const horizontal = current === 'horizontal' || current === 'both'
  const vertical = current === 'vertical' || current === 'both'
  const next = {
    horizontal: axis === 'horizontal' ? !horizontal : horizontal,
    vertical: axis === 'vertical' ? !vertical : vertical,
  }
  if (next.horizontal && next.vertical) return 'both'
  if (next.horizontal) return 'horizontal'
  if (next.vertical) return 'vertical'
  return 'none'
}

/** A zoom that puts the canvas at a comfortable size without overflowing. */
function fitZoom(width: number, height: number): number {
  const target = 460
  return Math.max(3, Math.min(30, Math.floor(target / Math.max(width, height))))
}

function drawChecker(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell: number,
): void {
  context.fillStyle = '#12161f'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#1a2030'
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      if (((x / cell) | 0) % 2 === ((y / cell) | 0) % 2) context.fillRect(x, y, cell, cell)
    }
  }
}

/** Bresenham, so a fast drag paints a continuous stroke. */
function line(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const stepX = x0 < x1 ? 1 : -1
  const stepY = y0 < y1 ? 1 : -1
  let error = dx + dy

  for (;;) {
    points.push({ x, y })
    if (x === x1 && y === y1) break
    const doubled = 2 * error
    if (doubled >= dy) {
      error += dy
      x += stepX
    }
    if (doubled <= dx) {
      error += dx
      y += stepY
    }
  }
  return points
}

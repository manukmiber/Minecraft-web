/**
 * The structure painter.
 *
 * A build is edited one Y layer at a time, looking straight down, because that
 * is how a plan is drawn and it keeps the whole thing on a flat grid instead of
 * needing a 3D editor. The layer below shows through as a ghost so walls line up
 * between floors, and the 3D preview panel is the real check on the result.
 */

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Eraser, Layers, PaintBucket, Trash2 } from 'lucide-react'

import { Button, cn, inputClass } from '../../app/ui/primitives'
import { vanillaTexture, vanillaTextureUrl } from '../../core/data/vanillaTextures'
import {
  MAX_GRID_BLOCKS,
  MAX_GRID_SIDE,
  type VoxelGrid,
  cellIndex,
  filledCells,
  resizeGrid,
  voxelGrid,
} from '../../core/kinds/voxels'
import { useProject } from '../../state/project'

/**
 * Stable, readable swatch per identifier, for blocks with no artwork to show.
 *
 * Comma-separated on purpose: `THREE.Color` only parses the legacy `hsl()`
 * syntax, and the space-separated form silently comes out white.
 */
export function blockColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360}, 52%, ${38 + (hash % 5) * 4}%)`
}

/**
 * What a cell of this block looks like: its Faithful texture where the app has
 * one, and the hashed swatch otherwise, so the painter and the 3D preview stay
 * recognisably the same build.
 *
 * `dimmed` is the ghost of the layer below — a flat wash over the texture,
 * since `color-mix` has nothing to mix with once the background is an image.
 */
export function blockBackground(id: string, dimmed = false): string {
  const texture = vanillaTexture(id)
  if (!texture) {
    return dimmed ? `color-mix(in srgb, ${blockColor(id)} 22%, transparent)` : blockColor(id)
  }
  const image = `url("${vanillaTextureUrl(texture.icon)}") center/cover`
  return dimmed ? `linear-gradient(#0f131ac2, #0f131ac2), ${image}` : image
}

const VANILLA = [
  'minecraft:oak_planks',
  'minecraft:cobblestone',
  'minecraft:stone_bricks',
  'minecraft:oak_log',
  'minecraft:glass',
  'minecraft:oak_stairs',
  'minecraft:dirt',
  'minecraft:hay_block',
  'minecraft:torch',
]

export function LayerGridField({
  value,
  onChange,
  fieldId,
}: {
  value: unknown
  onChange(next: VoxelGrid): void
  fieldId: string
}) {
  const { project } = useProject()
  const grid = voxelGrid(value)
  const [layer, setLayer] = useState(0)
  const [brush, setBrush] = useState('minecraft:oak_planks')
  const [erasing, setErasing] = useState(false)
  /** Held down means paint a stroke, not a single cell. */
  const painting = useRef(false)

  const [width, height, depth] = grid.size
  const y = Math.min(layer, height - 1)
  const used = filledCells(grid).length
  const overCap = used > MAX_GRID_BLOCKS

  const setCells = (next: string[]) => onChange({ size: grid.size, cells: next })

  const paint = (x: number, z: number) => {
    const index = cellIndex(grid.size, x, y, z)
    const target = erasing ? '' : brush.trim()
    if (grid.cells[index] === target) return
    const next = [...grid.cells]
    next[index] = target
    setCells(next)
  }

  const fillLayer = () => {
    const next = [...grid.cells]
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) next[cellIndex(grid.size, x, y, z)] = brush.trim()
    }
    setCells(next)
  }

  const clearLayer = () => {
    const next = [...grid.cells]
    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) next[cellIndex(grid.size, x, y, z)] = ''
    }
    setCells(next)
  }

  const resize = (axis: 0 | 1 | 2, next: number) => {
    const size: [number, number, number] = [...grid.size]
    size[axis] = next
    const resized = resizeGrid(grid, size)
    if (axis === 1 && layer > resized.size[1] - 1) setLayer(resized.size[1] - 1)
    onChange(resized)
  }

  const ownBlocks = project.nodes
    .filter((node) => node.kind === 'block' || node.kind === 'crop')
    .map((node) => ({ id: `${project.namespace}:${node.name}`, label: node.displayName }))

  return (
    <div className="flex flex-col gap-3">
      {/* -- size ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        {(
          [
            [0, 'Width (X)', width],
            [2, 'Depth (Z)', depth],
            [1, 'Height (Y)', height],
          ] as const
        ).map(([axis, label, current]) => (
          <label key={axis} className="flex items-center gap-1.5 text-[11px] text-ink-300">
            {label}
            <input
              type="number"
              min={1}
              max={MAX_GRID_SIDE}
              value={current}
              onChange={(event) => resize(axis, Number(event.target.value))}
              className={cn(inputClass, 'h-7 w-14 text-center font-mono')}
            />
          </label>
        ))}

        <span
          className={cn(
            'ml-auto font-mono text-[11px]',
            overCap ? 'text-rose-500' : 'text-ink-400',
          )}
          title={`Painted blocks, out of the ${MAX_GRID_BLOCKS}-block limit`}
        >
          {used} / {MAX_GRID_BLOCKS} blocks
        </span>
      </div>

      {/* -- brush ------------------------------------------------------ */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-ink-700 bg-ink-850 p-2.5">
        <div className="flex items-center gap-1.5">
          <span
            className="size-6 shrink-0 rounded border border-ink-600 [image-rendering:pixelated]"
            style={{ background: erasing ? 'transparent' : blockBackground(brush) }}
          />
          <input
            id={fieldId}
            list={`${fieldId}-blocks`}
            value={brush}
            onChange={(event) => {
              setBrush(event.target.value)
              setErasing(false)
            }}
            placeholder="namespace:block"
            aria-label="Block to paint with"
            className={cn(inputClass, 'flex-1 font-mono')}
          />
          <datalist id={`${fieldId}-blocks`}>
            {ownBlocks.map((block) => (
              <option key={block.id} value={block.id} label={block.label} />
            ))}
            {VANILLA.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>

          <Button
            size="sm"
            variant={erasing ? 'primary' : 'subtle'}
            icon={<Eraser size={12} />}
            onClick={() => setErasing((on) => !on)}
            title="Erase instead of paint"
          >
            Erase
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {[...ownBlocks.map((b) => b.id), ...VANILLA].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setBrush(id)
                setErasing(false)
              }}
              title={id}
              className={cn(
                'flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors',
                brush === id && !erasing
                  ? 'border-accent-500/60 bg-accent-500/12 text-ink-50'
                  : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
              )}
            >
              <span
                className="size-2.5 rounded-[2px] [image-rendering:pixelated]"
                style={{ background: blockBackground(id) }}
                aria-hidden
              />
              {id.replace(/^[a-z0-9_]+:/, '')}
            </button>
          ))}
        </div>
      </div>

      {/* -- layer ------------------------------------------------------ */}
      <div className="flex items-center gap-2">
        <Layers size={13} className="text-ink-400" />
        <span className="text-[11px] text-ink-200">
          Layer <span className="font-mono text-accent-400">Y {y}</span>
          <span className="text-ink-500"> of {height - 1}</span>
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowDown size={12} />}
            disabled={y === 0}
            onClick={() => setLayer(y - 1)}
            aria-label="Layer below"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={<ArrowUp size={12} />}
            disabled={y >= height - 1}
            onClick={() => setLayer(y + 1)}
            aria-label="Layer above"
          />
          <Button size="sm" icon={<PaintBucket size={12} />} onClick={fillLayer}>
            Fill
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={clearLayer}>
            Clear
          </Button>
        </div>
      </div>

      <div
        className="w-fit rounded-lg border border-ink-600 bg-ink-900 p-1.5"
        onPointerDown={() => {
          painting.current = true
        }}
        onPointerUp={() => {
          painting.current = false
        }}
        onPointerLeave={() => {
          painting.current = false
        }}
      >
        <div
          className="grid gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: depth * width }, (_, i) => {
            const x = i % width
            const z = Math.floor(i / width)
            const block = grid.cells[cellIndex(grid.size, x, y, z)] ?? ''
            const below = y > 0 ? (grid.cells[cellIndex(grid.size, x, y - 1, z)] ?? '') : ''

            return (
              <motion.button
                key={i}
                type="button"
                whileTap={{ scale: 0.9 }}
                title={`${x}, ${y}, ${z}${block ? ` — ${block}` : ''}`}
                aria-label={`Cell ${x}, ${y}, ${z}`}
                onPointerDown={() => paint(x, z)}
                onPointerEnter={() => {
                  if (painting.current) paint(x, z)
                }}
                className={cn(
                  'size-7 rounded-[3px] border transition-colors [image-rendering:pixelated]',
                  block ? 'border-ink-500' : 'border-dashed border-ink-700 hover:border-ink-500',
                )}
                style={{
                  background: block
                    ? blockBackground(block)
                    : // The floor below shows through faintly, which is what makes
                      // stacking a wall across layers possible without guessing.
                      below
                        ? blockBackground(below, true)
                        : undefined,
                }}
              />
            )
          })}
        </div>
      </div>

      <p className="text-[10.5px] leading-relaxed text-ink-400">
        Drag to paint a run of cells. Empty cells are left as-is when the structure generates, so a
        doorway is a hole, not air. Each painted block becomes its own feature file — past{' '}
        {MAX_GRID_BLOCKS} blocks, export the build as a <code>.mcstructure</code> instead.
      </p>
    </div>
  )
}

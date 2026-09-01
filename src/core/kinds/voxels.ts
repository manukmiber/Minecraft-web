/**
 * The value shape behind the `layer-grid` field: a small box of blocks.
 *
 * The grid carries its own dimensions rather than reading them from sibling
 * fields, so the editor component and the generator agree on the shape without
 * the registry having to know anything about structures.
 *
 * Cells are stored flat, `y` slowest and `x` fastest, which is the order the
 * layer editor draws them in.
 */

export interface VoxelGrid {
  /** `[width, height, depth]` in blocks — X, Y, Z. */
  size: [number, number, number]
  /** `size[0] * size[1] * size[2]` entries; empty string means "leave alone". */
  cells: string[]
}

export const MAX_GRID_SIDE = 9
/**
 * Each filled cell becomes its own feature file, so a structure is capped
 * rather than allowed to bury the pack in thousands of tiny JSON files.
 */
export const MAX_GRID_BLOCKS = 128

export function gridVolume(size: readonly [number, number, number]): number {
  return size[0] * size[1] * size[2]
}

export function cellIndex(
  size: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): number {
  return y * size[0] * size[2] + z * size[0] + x
}

function clampSide(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(MAX_GRID_SIDE, Math.max(1, n))
}

/** Coerces anything found in `node.data` into a usable grid. */
export function voxelGrid(value: unknown): VoxelGrid {
  const fallback: VoxelGrid = { size: [5, 3, 5], cells: Array(75).fill('') }
  if (!value || typeof value !== 'object') return fallback

  const raw = value as Partial<VoxelGrid>
  const source = Array.isArray(raw.size) ? raw.size : []
  const size: [number, number, number] = [
    clampSide(source[0], 5),
    clampSide(source[1], 3),
    clampSide(source[2], 5),
  ]

  const volume = gridVolume(size)
  const cells = Array.from({ length: volume }, (_, i) => {
    const cell = Array.isArray(raw.cells) ? raw.cells[i] : ''
    return typeof cell === 'string' ? cell.trim() : ''
  })

  return { size, cells }
}

/**
 * Resizes without losing work: cells keep their coordinates, so shrinking and
 * growing back leaves the overlap exactly where it was.
 */
export function resizeGrid(grid: VoxelGrid, size: [number, number, number]): VoxelGrid {
  const next: [number, number, number] = [
    clampSide(size[0], grid.size[0]),
    clampSide(size[1], grid.size[1]),
    clampSide(size[2], grid.size[2]),
  ]
  const cells = Array<string>(gridVolume(next)).fill('')
  for (let y = 0; y < Math.min(next[1], grid.size[1]); y++) {
    for (let z = 0; z < Math.min(next[2], grid.size[2]); z++) {
      for (let x = 0; x < Math.min(next[0], grid.size[0]); x++) {
        cells[cellIndex(next, x, y, z)] = grid.cells[cellIndex(grid.size, x, y, z)] ?? ''
      }
    }
  }
  return { size: next, cells }
}

export interface FilledCell {
  x: number
  y: number
  z: number
  block: string
}

/** Every non-empty cell, in draw order. */
export function filledCells(grid: VoxelGrid): FilledCell[] {
  const out: FilledCell[] = []
  for (let y = 0; y < grid.size[1]; y++) {
    for (let z = 0; z < grid.size[2]; z++) {
      for (let x = 0; x < grid.size[0]; x++) {
        const block = grid.cells[cellIndex(grid.size, x, y, z)]
        if (block) out.push({ x, y, z, block })
      }
    }
  }
  return out
}

/** Distinct block identifiers used by the grid, in first-seen order. */
export function gridPalette(grid: VoxelGrid): string[] {
  return [...new Set(filledCells(grid).map((cell) => cell.block))]
}

/**
 * A short string that changes whenever the grid's *shape* changes — its size or
 * the bounds of what has been painted. The 3D preview reframes its camera on
 * this rather than on the whole grid, so swapping one block for another does not
 * jerk the view, but building a wall does bring it back into frame.
 */
export function gridSignature(grid: VoxelGrid): string {
  const cells = filledCells(grid)
  if (cells.length === 0) return `${grid.size.join('x')}:empty`

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x
    if (cell.y < minY) minY = cell.y
    if (cell.z < minZ) minZ = cell.z
    if (cell.x > maxX) maxX = cell.x
    if (cell.y > maxY) maxY = cell.y
    if (cell.z > maxZ) maxZ = cell.z
  }
  return `${grid.size.join('x')}:${minX},${minY},${minZ}-${maxX},${maxY},${maxZ}`
}

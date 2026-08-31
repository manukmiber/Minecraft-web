/**
 * Small helpers shared by the content kinds.
 *
 * `node.data` is loosely typed on purpose — presets, hand-edits and files that
 * arrive from the preset inbox all write into it — so every generator reads it
 * through these coercions rather than trusting the shape.
 */

import type { TargetProfile } from '../targets/profiles'
import type { FieldOption } from '../registry/types'

export function str(data: Record<string, unknown>, key: string, fallback = ''): string {
  const value = data[key]
  return typeof value === 'string' ? value : fallback
}

export function num(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return fallback
}

export function bool(data: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = data[key]
  return typeof value === 'boolean' ? value : fallback
}

export function list(data: Record<string, unknown>, key: string): string[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Creative-inventory tabs a custom block or item can appear under. */
export const MENU_CATEGORY_OPTIONS: FieldOption[] = [
  { value: 'construction', label: 'Construction', hint: 'Building blocks tab' },
  { value: 'nature', label: 'Nature', hint: 'Plants, soil, natural blocks' },
  { value: 'equipment', label: 'Equipment', hint: 'Tools, armour, weapons' },
  { value: 'items', label: 'Items', hint: 'Everything else' },
  { value: 'none', label: 'Hidden', hint: 'Not shown in the creative inventory' },
]

/**
 * `menu_category` under the modern parser: `category` is mandatory once the
 * object exists, and an empty `group` is rejected outright — so when the user
 * picks "Hidden" we omit the whole object instead of emitting a half-filled one.
 */
export function menuCategory(
  target: TargetProfile,
  category: string,
  group?: string,
): Record<string, unknown> | undefined {
  if (!category || category === 'none') return undefined
  const out: Record<string, unknown> = { category }
  const trimmed = group?.trim()
  if (trimmed) out.group = trimmed
  if (target.rules.menuCategoryRequired && !out.category) return undefined
  return out
}

export const RENDER_METHOD_OPTIONS: FieldOption[] = [
  { value: 'opaque', label: 'Opaque', hint: 'Solid block, no transparency' },
  { value: 'alpha_test', label: 'Alpha test', hint: 'Hard cut-out — crops, leaves, glass panes' },
  { value: 'blend', label: 'Blend', hint: 'Soft transparency — stained glass, water-like' },
  { value: 'double_sided', label: 'Double sided', hint: 'Both faces drawn, no culling' },
]

export interface MaterialFaces {
  /** Atlas key applied to every face that has no override. */
  all: string | null
  up?: string | null
  down?: string | null
  north?: string | null
  south?: string | null
  east?: string | null
  west?: string | null
}

/**
 * Builds `minecraft:material_instances`. Note `ambient_occlusion` is a float on
 * the modern parser and a boolean on older ones — the profile decides.
 */
export function materialInstances(
  target: TargetProfile,
  faces: MaterialFaces,
  renderMethod: string,
  ambientOcclusion: number,
  faceDimming: boolean,
): Record<string, unknown> | undefined {
  if (!faces.all && !faces.up && !faces.down && !faces.north && !faces.south && !faces.east && !faces.west) {
    return undefined
  }

  const instance = (texture: string): Record<string, unknown> => ({
    texture,
    render_method: renderMethod,
    face_dimming: faceDimming,
    ambient_occlusion: target.rules.ambientOcclusionIsFloat
      ? clamp(ambientOcclusion, 0, 10)
      : ambientOcclusion > 0,
  })

  const out: Record<string, unknown> = {}
  if (faces.all) out['*'] = instance(faces.all)

  // Per-face overrides reference a named instance so the JSON stays compact and
  // matches how vanilla blocks are written.
  const sides: Array<[keyof MaterialFaces, string]> = [
    ['up', 'up'],
    ['down', 'down'],
    ['north', 'north'],
    ['south', 'south'],
    ['east', 'east'],
    ['west', 'west'],
  ]
  for (const [key, face] of sides) {
    const texture = faces[key]
    if (texture) out[face] = instance(texture)
  }

  return Object.keys(out).length > 0 ? out : undefined
}

/** Drops undefined values so generated JSON has no empty keys. */
export function compact<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value
  }
  return out as T
}

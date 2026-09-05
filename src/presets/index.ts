/**
 * Presets shipped with the app.
 *
 * Kept separate from the repo inbox so it is always obvious which came from
 * where, and grouped into packs so the library has something to head each
 * section with.
 */

import type { PresetFile } from '../core/presets/format'
import { COMPANION_PRESETS } from './companion'
import { FARMING_PRESETS } from './farming'

export const BUILTIN_PRESET_PACKS: Array<{ id: string; label: string; presets: PresetFile[] }> = [
  { id: 'companion', label: 'Companions', presets: COMPANION_PRESETS },
  { id: 'farming', label: 'Farming', presets: FARMING_PRESETS },
]

export { COMPANION_PRESETS, FARMING_PRESETS }

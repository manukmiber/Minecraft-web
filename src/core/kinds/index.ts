/**
 * Registers the built-in content kinds.
 *
 * Import this once at app start (and at the top of core tests). Anything
 * imported later — a future kind, a plugin — just calls `registerKind` and the
 * whole UI picks it up.
 */

import { registerKind } from '../registry/types'
import { blockKind } from './block'
import { cropKind } from './crop'
import { entityKind } from './entity'
import { itemKind } from './item'
import { recipeKind } from './recipe'

let installed = false

export function installBuiltinKinds(): void {
  if (installed) return
  installed = true
  registerKind(blockKind)
  registerKind(cropKind)
  registerKind(itemKind)
  registerKind(entityKind)
  registerKind(recipeKind)
}

export { blockKind, cropKind, itemKind, entityKind, recipeKind }

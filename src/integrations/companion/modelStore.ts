/**
 * Where the companion's model lives between visits.
 *
 * IndexedDB, and nowhere else. The model is not pushed to R2 and never reaches
 * the project repo, which is the one design decision in this feature that is
 * not about convenience: MMD models are distributed under terms that routinely
 * forbid redistribution, and a copy in a git repo or an object store is
 * redistribution however private the bucket feels. Keeping it in the browser
 * that imported it is the only storage that is unambiguously the user's own.
 *
 * The cost is that the model has to be imported again in a different browser,
 * which is a fair trade for not quietly publishing someone else's work.
 */

import { del, get, set } from 'idb-keyval'

import type { ModelBundle } from '../../core/companion/bundle'

const KEY = 'companion:model'
const FORMAT = 1

export interface StoredModel {
  format: number
  /** What to call it in the interface — the archive's own name for the file. */
  label: string
  modelPath: string
  alternates: string[]
  files: Map<string, Uint8Array>
  displayNames: Map<string, string>
  savedAt: string
  bytes: number
}

/** The bundle as it comes back out, ready to hand to the loader again. */
export function storedToBundle(stored: StoredModel): ModelBundle {
  const bytes = stored.files.get(stored.modelPath)
  if (!bytes) throw new Error('The saved model is missing its own .pmx file. Import it again.')
  return {
    files: stored.files,
    displayNames: stored.displayNames,
    modelPath: stored.modelPath,
    modelBytes: bytes.slice().buffer,
    alternates: stored.alternates,
  }
}

export async function saveCompanionModel(bundle: ModelBundle, label: string): Promise<StoredModel> {
  let bytes = 0
  for (const file of bundle.files.values()) bytes += file.byteLength

  const stored: StoredModel = {
    format: FORMAT,
    label,
    modelPath: bundle.modelPath,
    alternates: bundle.alternates,
    files: bundle.files,
    displayNames: bundle.displayNames,
    savedAt: new Date().toISOString(),
    bytes,
  }

  // Maps and typed arrays go through structured clone as themselves, so there
  // is no serialisation step to get wrong.
  await set(KEY, stored)
  return stored
}

export async function loadCompanionModel(): Promise<StoredModel | null> {
  const stored = await get<StoredModel>(KEY)
  if (!stored || stored.format !== FORMAT) return null
  // A partially written record is worse than none: it would fail deep inside
  // the parser instead of at the import step where it can be explained.
  if (!(stored.files instanceof Map) || !stored.files.has(stored.modelPath)) return null
  return stored
}

export async function clearCompanionModel(): Promise<void> {
  await del(KEY)
}

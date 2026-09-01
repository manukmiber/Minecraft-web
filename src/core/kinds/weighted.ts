/**
 * The value shape behind the `weighted-list` field.
 *
 * Kept next to the kinds rather than in the registry because it is data, not
 * UI: the field editor and the generators both read it through `weightedEntries`
 * so a hand-edited `project.json` or a preset written by another tool cannot
 * feed a generator a half-typed row.
 */

export interface WeightedEntry {
  /** Block or item identifier. */
  id: string
  /** Relative weight. The game normalises these, so only the ratio matters. */
  weight: number
}

/** Coerces whatever is in `node.data` into usable entries, dropping the rest. */
export function weightedEntries(value: unknown): WeightedEntry[] {
  if (!Array.isArray(value)) return []
  const out: WeightedEntry[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as Partial<WeightedEntry>
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!id) continue
    const weight =
      typeof entry.weight === 'number' && Number.isFinite(entry.weight) && entry.weight > 0
        ? entry.weight
        : 1
    out.push({ id, weight })
  }
  return out
}

/** The share each entry actually wins, for display. Empty in, empty out. */
export function weightedShares(entries: WeightedEntry[]): number[] {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  if (total <= 0) return entries.map(() => 0)
  return entries.map((entry) => (entry.weight / total) * 100)
}

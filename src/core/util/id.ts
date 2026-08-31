/**
 * Identifier helpers.
 *
 * Bedrock is unforgiving about identifiers: namespaces and names must be
 * lowercase `[a-z0-9_]`, and a collision with the `minecraft:` namespace
 * silently breaks a pack. Everything that produces an identifier in this app
 * funnels through here so those rules are enforced in exactly one place.
 */

/** Namespaces the game reserves. Using any of them is a hard error. */
export const RESERVED_NAMESPACES = new Set(['minecraft', 'mc', 'vanilla'])

const NAME_RE = /^[a-z][a-z0-9_]*$/

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'x$1')
}

export function isValidName(name: string): boolean {
  return NAME_RE.test(name)
}

export function isValidNamespace(ns: string): boolean {
  return NAME_RE.test(ns) && !RESERVED_NAMESPACES.has(ns)
}

/** `namespace:name`, the only form the generators ever write. */
export function makeIdentifier(namespace: string, name: string): string {
  return `${namespace}:${name}`
}

/** Splits an identifier, tolerating a bare name (assumed vanilla). */
export function splitIdentifier(identifier: string): { namespace: string; name: string } {
  const idx = identifier.indexOf(':')
  if (idx === -1) return { namespace: 'minecraft', name: identifier }
  return { namespace: identifier.slice(0, idx), name: identifier.slice(idx + 1) }
}

/**
 * Short, flat name used for texture atlas keys and file names. Prefixing with
 * the namespace is what keeps a pack's `item_texture.json` entries from
 * shadowing vanilla ones.
 */
export function atlasKey(namespace: string, name: string, suffix?: string): string {
  return suffix ? `${namespace}_${name}_${suffix}` : `${namespace}_${name}`
}

let counter = 0

/** Stable-enough local id for model nodes (never written into pack output). */
export function nodeId(prefix = 'n'): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`
}

/**
 * UUID v4. Uses `crypto.randomUUID` where available and falls back to a
 * `getRandomValues` implementation so the core stays usable in plain Node for
 * tests.
 */
export function uuid(): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID()

  const bytes = new Uint8Array(16)
  cryptoObj.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * Generates `count` UUIDs guaranteed distinct from each other and from
 * `existing`. Manifest headers and modules must never collide, including
 * across the behavior and resource pack of the same project.
 */
export function uniqueUuids(count: number, existing: Iterable<string> = []): string[] {
  const seen = new Set(existing)
  const out: string[] = []
  while (out.length < count) {
    const candidate = uuid()
    if (seen.has(candidate)) continue
    seen.add(candidate)
    out.push(candidate)
  }
  return out
}

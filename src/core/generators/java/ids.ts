/**
 * Naming, for the Java side.
 *
 * Bedrock only ever needs one name per piece of content: the identifier
 * `namespace:name`, used verbatim in every file. Java needs four, and they are
 * not interchangeable:
 *
 *   registry id   `mmm:rice`               — the identifier, same idea as Bedrock
 *   class name    `RiceBlock`              — PascalCase, for the generated source
 *   field name    `RICE`                   — SCREAMING_SNAKE, the registry constant
 *   lang key      `block.mmm.rice`         — the translation key, dots not colons
 *
 * Getting one of these subtly wrong produces a mod that compiles and then does
 * nothing, so they are derived in one place and nowhere else.
 */

import type { ContentNode, ProjectModel } from '../../model/types'

/** Words the Java language will not accept as a package segment or identifier. */
const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'record', 'sealed', 'permits', 'var', 'yield',
])

/** Makes one path segment safe to use as a Java package component. */
export function packageSegment(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'addon'
  const prefixed = /^[0-9]/.test(cleaned) ? `m${cleaned}` : cleaned
  return JAVA_KEYWORDS.has(prefixed) ? `${prefixed}_` : prefixed
}

/**
 * Root package for the generated mod.
 *
 * `com.<namespace>` rather than something derived from the author's name: the
 * author field is free text and frequently empty, and a package that changes
 * when someone fills in their name would rename every file in the export.
 */
export function rootPackage(project: ProjectModel): string {
  return `com.${packageSegment(project.namespace)}`
}

export function packagePath(pkg: string): string {
  return pkg.replace(/\./g, '/')
}

/** `rice_crop` -> `RiceCrop`. */
export function pascalCase(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('') || 'Unnamed'
}

/** `rice_crop` -> `RICE_CROP`, the shape a registry constant takes. */
export function constantCase(name: string): string {
  return (
    name
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || 'UNNAMED'
  )
}

/** The mod id. Java requires `[a-z0-9_-]`, which a valid namespace already is. */
export function modId(project: ProjectModel): string {
  return packageSegment(project.namespace)
}

/** `mmm:rice`. */
export function javaId(project: ProjectModel, name: string): string {
  return `${modId(project)}:${name}`
}

export function nodeJavaId(project: ProjectModel, node: ContentNode): string {
  return javaId(project, node.name)
}

/**
 * Translation key. Java uses `block.<namespace>.<path>` and
 * `item.<namespace>.<path>` — dots throughout, where Bedrock uses a colon.
 */
export function langKey(kind: 'block' | 'item' | 'entity', project: ProjectModel, name: string): string {
  return `${kind}.${modId(project)}.${name}`
}

/**
 * Splits a possibly-namespaced identifier into its parts, defaulting to
 * `minecraft` the way the game does.
 */
export function splitId(identifier: string): { namespace: string; path: string } {
  const trimmed = identifier.trim()
  const colon = trimmed.indexOf(':')
  if (colon === -1) return { namespace: 'minecraft', path: trimmed }
  return { namespace: trimmed.slice(0, colon), path: trimmed.slice(colon + 1) }
}

/**
 * Identifiers Bedrock spells differently from Java. There is no general rule
 * here — these are simply different games that named the same block twice — so
 * the ones that actually come up in the builder's own item catalogue are listed
 * rather than guessed at.
 */
export const BEDROCK_TO_JAVA_ITEMS: Record<string, string> = {
  'minecraft:wheat_seeds': 'minecraft:wheat_seeds',
  'minecraft:beetroot_seeds': 'minecraft:beetroot_seeds',
  'minecraft:melon_seeds': 'minecraft:melon_seeds',
  'minecraft:pumpkin_seeds': 'minecraft:pumpkin_seeds',
  // Bedrock's "grass" became "short_grass" on Java in 1.20.3, and a pack that
  // says the wrong one places nothing without any error at all.
  'minecraft:grass': 'minecraft:short_grass',
  'minecraft:tallgrass': 'minecraft:short_grass',
  'minecraft:log': 'minecraft:oak_log',
  'minecraft:leaves': 'minecraft:oak_leaves',
  'minecraft:planks': 'minecraft:oak_planks',
  'minecraft:red_flower': 'minecraft:poppy',
  'minecraft:yellow_flower': 'minecraft:dandelion',
  'minecraft:double_plant': 'minecraft:sunflower',
  'minecraft:waterlily': 'minecraft:lily_pad',
  'minecraft:snow_layer': 'minecraft:snow',
  'minecraft:monster_egg': 'minecraft:infested_stone',
}

/** Rewrites a vanilla identifier that Java spells differently. */
export function mapVanillaIdentifier(identifier: string): string {
  return BEDROCK_TO_JAVA_ITEMS[identifier.trim()] ?? identifier.trim()
}

/**
 * Rewrites an identifier that points at this project's own content from the
 * Bedrock namespace to the Java mod id.
 *
 * These are the same string in practice — the mod id is derived from the
 * namespace — but routing every reference through one function means a future
 * change to `modId` cannot leave dangling references behind.
 */
export function toJavaIdentifier(project: ProjectModel, identifier: string): string {
  const { namespace, path } = splitId(identifier)
  if (namespace === project.namespace) return `${modId(project)}:${path}`
  // A vanilla identifier may simply be spelled differently on Java, so the
  // rewrite happens here rather than being left to whoever typed it.
  return mapVanillaIdentifier(`${namespace}:${path}`)
}

/**
 * Java expression for a registry object reference, used when generating code
 * that mentions another registered entry.
 */
export function itemExpression(project: ProjectModel, identifier: string): string {
  const { namespace, path } = splitId(identifier)
  if (namespace === project.namespace) return `ModItems.${constantCase(path)}.get()`
  return `net.minecraft.world.item.Items.${constantCase(path)}`
}

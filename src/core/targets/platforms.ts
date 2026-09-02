/**
 * Platforms and mod loaders.
 *
 * The builder used to have exactly one output — a Bedrock `.mcaddon` — so the
 * word "target" meant a Bedrock engine version and nothing else. It now has
 * two platforms with genuinely different rules, so the vocabulary is split:
 *
 *   platform  the game edition:  Bedrock, or Java
 *   loader    *how* a Java build is delivered: a plain data pack that needs no
 *             mod loader at all, or a Fabric / Quilt / Forge / NeoForge mod
 *   profile   the version slice inside a platform, holding every schema number
 *
 * The split matters because the platforms are not equally capable. Bedrock is
 * entirely data-driven: a JSON file registers a block and the game loads it,
 * with no compiler in sight. Java has no such door — vanilla only reads data
 * packs, which can add recipes, loot, tags and world generation but *cannot*
 * add a new block or item. Getting those onto Java means shipping real compiled
 * code, which is what a mod loader is for.
 *
 * So "export to Java" is two different products depending on what the project
 * contains, and `docs/PLATFORMS.md` spells out which is which. See
 * `capabilities.ts` for the per-feature matrix the UI reads.
 */

export type Platform = 'bedrock' | 'java'

/**
 * How a Java build is delivered.
 *
 * `datapack` is the odd one out and is deliberately in the same list: it is a
 * real delivery mechanism with no loader involved, and treating it as "one of
 * the loaders" is what lets the export dialog offer it beside the others
 * instead of hiding it in a separate concept.
 */
export type ModLoader = 'datapack' | 'fabric' | 'quilt' | 'forge' | 'neoforge'

export const ALL_LOADERS: ModLoader[] = ['datapack', 'fabric', 'quilt', 'forge', 'neoforge']

/** Loaders that produce a compiled mod, i.e. everything except the data pack. */
export const CODE_LOADERS: ModLoader[] = ['fabric', 'quilt', 'forge', 'neoforge']

export interface LoaderInfo {
  id: ModLoader
  label: string
  /** One line, shown beside the checkbox in the export dialog. */
  summary: string
  /** True when the output is Java source that still has to be compiled. */
  compiled: boolean
  /** Where the loader reads its mod metadata from, relative to `resources/`. */
  metadataPath: string | null
  /** Documentation link shown next to the loader in the UI. */
  homepage: string
}

export const LOADERS: Record<ModLoader, LoaderInfo> = {
  datapack: {
    id: 'datapack',
    label: 'Data pack + resource pack',
    summary:
      'No mod loader, no build step — drop the two zips into a world and a resource pack folder. Cannot add new blocks or items.',
    compiled: false,
    metadataPath: null,
    homepage: 'https://minecraft.wiki/w/Data_pack',
  },
  fabric: {
    id: 'fabric',
    label: 'Fabric',
    summary: 'Lightweight loader with the fastest version updates. Needs Fabric API.',
    compiled: true,
    metadataPath: 'fabric.mod.json',
    homepage: 'https://fabricmc.net/',
  },
  quilt: {
    id: 'quilt',
    label: 'Quilt',
    summary: 'Fabric-compatible fork. The generated mod also carries a Fabric entrypoint.',
    compiled: true,
    metadataPath: 'quilt.mod.json',
    homepage: 'https://quiltmc.org/',
  },
  forge: {
    id: 'forge',
    label: 'Forge',
    summary: 'The long-standing loader. Largest existing mod ecosystem on older versions.',
    compiled: true,
    metadataPath: 'META-INF/mods.toml',
    homepage: 'https://files.minecraftforge.net/',
  },
  neoforge: {
    id: 'neoforge',
    label: 'NeoForge',
    summary: 'Forge fork and the de-facto Forge successor from 1.20.2 onwards.',
    compiled: true,
    metadataPath: 'META-INF/neoforge.mods.toml',
    homepage: 'https://neoforged.net/',
  },
}

export interface PlatformInfo {
  id: Platform
  label: string
  /** What you install, in the words a player would use. */
  artifactLabel: string
  summary: string
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  bedrock: {
    id: 'bedrock',
    label: 'Bedrock',
    artifactLabel: '.mcaddon',
    summary:
      'Windows, console, mobile and Realms. Fully data-driven: everything this builder makes ships as JSON, with no compile step anywhere.',
  },
  java: {
    id: 'java',
    label: 'Java',
    artifactLabel: 'data pack, resource pack or mod',
    summary:
      'Windows, macOS and Linux. Data packs cover recipes, loot, tags and world generation; new blocks, items and entities need a mod loader and a Gradle build.',
  },
}

export function loaderLabel(loader: ModLoader): string {
  return LOADERS[loader].label
}

/** True for loaders whose export is a source tree rather than a finished file. */
export function isCompiledLoader(loader: ModLoader): loader is Exclude<ModLoader, 'datapack'> {
  return LOADERS[loader].compiled
}

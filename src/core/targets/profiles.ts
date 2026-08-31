/**
 * Bedrock target profiles.
 *
 * Every `format_version` and `min_engine_version` the generators emit lives
 * here and nowhere else. When Mojang ships a new stable slice you add a profile
 * to this file — no generator changes, no scattered version literals to hunt
 * down.
 *
 * Defaults below were checked against the 1.26.x creator changelogs (stable at
 * the time of writing was 1.26.40, released 2026-08-04). See docs/SCHEMA.md for
 * the reasoning behind each value.
 */

export interface FormatVersions {
  /** Behaviour pack */
  block: string
  item: string
  entity: string
  spawnRules: string
  recipe: string
  lootTable: string
  /** Resource pack */
  clientEntity: string
  renderController: string
  animation: string
  animationController: string
  geometry: string
  attachable: string
  /** Texture atlases use a plain string version rather than a format_version. */
  itemAtlas: string
  terrainAtlas: string
}

export interface TargetProfile {
  id: string
  label: string
  /** Shown in Settings so it is obvious which game build this targets. */
  engineLabel: string
  /** manifest.json `format_version`. v3 is Preview-only and deliberately unused. */
  manifestFormatVersion: number
  minEngineVersion: [number, number, number]
  formats: FormatVersions
  /**
   * Script API contract, used only when a generator needs a custom component
   * (crop growth is the one in the built-in kinds). Depending on a lower 2.x
   * version is deliberate: the game resolves it upwards to whatever the client
   * actually ships.
   */
  script: {
    serverModule: string
    serverModuleVersion: string
    entry: string
  }
  /**
   * Schema quirks the generators must honour for this profile. Surfaced in the
   * UI so the rules are visible rather than buried in code.
   */
  rules: {
    /** 1.26.20+: tags must sit inside `minecraft:tags`, not as loose components. */
    tagsAsComponent: boolean
    /** 1.26.20+: `menu_category.category` is mandatory once menu_category exists. */
    menuCategoryRequired: boolean
    /** 1.26.20+: `ambient_occlusion` is a float 0.0-10.0, no longer a boolean. */
    ambientOcclusionIsFloat: boolean
    /** 1.26.30+: an item with an empty components object fails to register. */
    itemsNeedComponent: boolean
    /** 1.26.40+: numeric ranges in entity goals must be `{min,max}` objects. */
    strictEntityRanges: boolean
  }
  notes: string[]
}

export const TARGET_PROFILES: TargetProfile[] = [
  {
    id: 'bedrock-1.26.40',
    label: 'Bedrock 1.26.40 (stable)',
    engineLabel: '1.26.40 — released 2026-08-04',
    manifestFormatVersion: 2,
    minEngineVersion: [1, 26, 40],
    formats: {
      block: '1.26.40',
      item: '1.26.40',
      entity: '1.26.40',
      spawnRules: '1.8.0',
      recipe: '1.20.10',
      lootTable: '1.20.10',
      clientEntity: '1.10.0',
      renderController: '1.10.0',
      animation: '1.10.0',
      animationController: '1.10.0',
      geometry: '1.16.0',
      attachable: '1.10.0',
      itemAtlas: '1.0.0',
      terrainAtlas: '1.0.0',
    },
    script: {
      serverModule: '@minecraft/server',
      serverModuleVersion: '2.0.0',
      entry: 'scripts/main.js',
    },
    rules: {
      tagsAsComponent: true,
      menuCategoryRequired: true,
      ambientOcclusionIsFloat: true,
      itemsNeedComponent: true,
      strictEntityRanges: true,
    },
    notes: [
      'manifest format_version stays at 2 — v3 is still Preview-only.',
      'Blocks use the modern JSON parser (1.26.20): tags live in minecraft:tags.',
      'Items must declare at least one component or they fail to register (1.26.30).',
      'Entity goal ranges must be {min,max} objects under the 1.26.40 strict schema.',
    ],
  },
  {
    id: 'bedrock-1.21.90',
    label: 'Bedrock 1.21.90 (legacy)',
    engineLabel: '1.21.90 — for packs that must run on older clients',
    manifestFormatVersion: 2,
    minEngineVersion: [1, 21, 90],
    formats: {
      block: '1.21.60',
      item: '1.21.60',
      entity: '1.21.50',
      spawnRules: '1.8.0',
      recipe: '1.20.10',
      lootTable: '1.20.10',
      clientEntity: '1.10.0',
      renderController: '1.10.0',
      animation: '1.10.0',
      animationController: '1.10.0',
      geometry: '1.16.0',
      attachable: '1.10.0',
      itemAtlas: '1.0.0',
      terrainAtlas: '1.0.0',
    },
    script: {
      serverModule: '@minecraft/server',
      serverModuleVersion: '1.13.0',
      entry: 'scripts/main.js',
    },
    rules: {
      tagsAsComponent: false,
      menuCategoryRequired: false,
      ambientOcclusionIsFloat: false,
      itemsNeedComponent: false,
      strictEntityRanges: false,
    },
    notes: [
      'Pre-modern block parser: loose tag components are still accepted.',
      'Use only when a pack has to run on clients older than 1.26.',
    ],
  },
]

export const DEFAULT_TARGET_ID = 'bedrock-1.26.40'

export function getTargetProfile(id: string): TargetProfile {
  return TARGET_PROFILES.find((p) => p.id === id) ?? TARGET_PROFILES[0]
}

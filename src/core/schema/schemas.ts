/**
 * JSON schemas for the code editor.
 *
 * Bedrock's own schemas are not published in a machine-readable form, so this
 * uses the community set maintained by Blockception, served from jsDelivr and
 * fetched by Monaco's JSON language service. If the network is unavailable the
 * editor quietly falls back to plain syntax checking — validation is a help,
 * not a gate, and the generator is the thing that actually guarantees a valid
 * pack.
 */

const CDN = 'https://cdn.jsdelivr.net/gh/Blockception/Minecraft-bedrock-json-schemas@main'

export interface SchemaBinding {
  /** Schema document URL. */
  uri: string
  /** Monaco glob patterns matched against the model's URI. */
  fileMatch: string[]
  label: string
}

/**
 * Ordered most-specific first. `fileMatch` patterns are matched against the
 * in-editor path, which mirrors the pack path exactly.
 */
export const SCHEMA_BINDINGS: SchemaBinding[] = [
  {
    label: 'Pack manifest',
    uri: `${CDN}/general/manifest.json`,
    fileMatch: ['*/manifest.json', '**/manifest.json'],
  },
  {
    label: 'Block',
    uri: `${CDN}/behavior/blocks/blocks.json`,
    fileMatch: ['**/behavior_pack/blocks/*.json'],
  },
  {
    label: 'Item',
    uri: `${CDN}/behavior/items/items.json`,
    fileMatch: ['**/behavior_pack/items/*.json'],
  },
  {
    label: 'Entity',
    uri: `${CDN}/behavior/entities/entities.json`,
    fileMatch: ['**/behavior_pack/entities/*.json'],
  },
  {
    label: 'Spawn rules',
    uri: `${CDN}/behavior/spawn_rules/spawn_rules.json`,
    fileMatch: ['**/behavior_pack/spawn_rules/*.json'],
  },
  {
    label: 'Recipe',
    uri: `${CDN}/behavior/recipes/recipes.json`,
    fileMatch: ['**/behavior_pack/recipes/*.json'],
  },
  {
    label: 'Biome',
    uri: `${CDN}/behavior/biomes/biomes.json`,
    fileMatch: ['**/behavior_pack/biomes/*.json'],
  },
  {
    label: 'Feature',
    uri: `${CDN}/behavior/features/features.json`,
    fileMatch: ['**/behavior_pack/features/*.json'],
  },
  {
    label: 'Feature rule',
    uri: `${CDN}/behavior/feature_rules/feature_rules.json`,
    fileMatch: ['**/behavior_pack/feature_rules/*.json'],
  },
  {
    label: 'Loot table',
    uri: `${CDN}/behavior/loot_tables/loot_tables.json`,
    fileMatch: ['**/behavior_pack/loot_tables/**/*.json'],
  },
  {
    label: 'Client entity',
    uri: `${CDN}/resource/entity/entity.json`,
    fileMatch: ['**/resource_pack/entity/*.json'],
  },
  {
    label: 'Geometry',
    uri: `${CDN}/resource/models/entity/model_entity.json`,
    fileMatch: ['**/resource_pack/models/entity/*.json'],
  },
  {
    label: 'Render controller',
    uri: `${CDN}/resource/render_controllers/render_controllers.json`,
    fileMatch: ['**/resource_pack/render_controllers/*.json'],
  },
  {
    label: 'Animation',
    uri: `${CDN}/resource/animations/actor_animation.json`,
    fileMatch: ['**/resource_pack/animations/*.json'],
  },
  {
    label: 'Animation controller',
    uri: `${CDN}/resource/animation_controllers/animation_controller.json`,
    fileMatch: ['**/resource_pack/animation_controllers/*.json'],
  },
  {
    label: 'Fog',
    uri: `${CDN}/resource/fog/fog.json`,
    fileMatch: ['**/resource_pack/fogs/*.json'],
  },
  {
    label: 'Terrain atlas',
    uri: `${CDN}/resource/textures/terrain_texture.json`,
    fileMatch: ['**/resource_pack/textures/terrain_texture.json'],
  },
  {
    label: 'Item atlas',
    uri: `${CDN}/resource/textures/item_texture.json`,
    fileMatch: ['**/resource_pack/textures/item_texture.json'],
  },
]

/**
 * Converts a Monaco `fileMatch` glob into a regular expression. Splitting on
 * `**` first avoids the usual placeholder trick, so single `*` never has to be
 * distinguished from double after escaping.
 */
function globToRegExp(pattern: string): RegExp {
  const segments = pattern
    .split('**')
    .map((segment) => segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
  return new RegExp(`^${segments.join('.*')}$`)
}

/** Which schema, if any, applies to a generated path. Used for the status line. */
export function schemaLabelFor(path: string): string | null {
  const normalised = `/${path}`
  for (const binding of SCHEMA_BINDINGS) {
    if (binding.fileMatch.some((pattern) => globToRegExp(pattern).test(normalised))) {
      return binding.label
    }
  }
  return null
}

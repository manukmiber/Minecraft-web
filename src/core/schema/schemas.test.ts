import { describe, expect, it } from 'vitest'

import { schemaLabelFor } from './schemas'

describe('schemaLabelFor', () => {
  it('matches the pack paths the generator produces', () => {
    expect(schemaLabelFor('behavior_pack/manifest.json')).toBe('Pack manifest')
    expect(schemaLabelFor('resource_pack/manifest.json')).toBe('Pack manifest')
    expect(schemaLabelFor('behavior_pack/blocks/rice_plant.json')).toBe('Block')
    expect(schemaLabelFor('behavior_pack/items/rice.json')).toBe('Item')
    expect(schemaLabelFor('behavior_pack/entities/crow.json')).toBe('Entity')
    expect(schemaLabelFor('behavior_pack/spawn_rules/crow.json')).toBe('Spawn rules')
    expect(schemaLabelFor('behavior_pack/recipes/fried_egg.json')).toBe('Recipe')
    expect(schemaLabelFor('behavior_pack/features/mango_feature.json')).toBe('Feature')
    expect(schemaLabelFor('behavior_pack/feature_rules/mango_rule.json')).toBe('Feature rule')
    expect(schemaLabelFor('resource_pack/entity/crow.entity.json')).toBe('Client entity')
    expect(schemaLabelFor('resource_pack/models/entity/crow.geo.json')).toBe('Geometry')
    expect(schemaLabelFor('resource_pack/textures/terrain_texture.json')).toBe('Terrain atlas')
  })

  it('matches a nested loot table but not a sibling folder', () => {
    expect(schemaLabelFor('behavior_pack/loot_tables/blocks/rice_plant_mature.json')).toBe(
      'Loot table',
    )
    // A single * must not cross a path separator.
    expect(schemaLabelFor('behavior_pack/blocks/nested/deep.json')).toBeNull()
  })

  it('returns null for files no schema covers', () => {
    expect(schemaLabelFor('behavior_pack/scripts/main.js')).toBeNull()
    expect(schemaLabelFor('resource_pack/texts/en_US.lang')).toBeNull()
  })
})

/**
 * The farming batch.
 *
 * These are plain preset files — the same format a hand-written preset in the
 * inbox uses. Nothing here is special-cased in the engine; every value
 * below is a field the generic kinds already expose, which is the test that the
 * builder really is reusable for other themes.
 *
 * References are written as `#kind:name` so a preset never has to know which
 * namespace it will be applied into.
 */

import { PRESET_FORMAT } from '../../core/presets/format'
import type { PresetFile } from '../../core/presets/format'

const ricePaddy: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.rice',
  label: 'Rice paddy',
  description:
    'A rice crop with four growth stages, its seed, and the harvested grain as an edible item.',
  notes: [
    'Growth uses the scripted crop component, so the pack ships a script module.',
    'Drop a PNG into each stage slot after applying — the atlas wires itself up.',
  ],
  nodes: [
    {
      kind: 'item',
      name: 'rice',
      displayName: 'Rice',
      data: {
        category: 'items',
        creativeGroup: 'minecraft:itemGroup.name.crop',
        maxStackSize: 64,
        isFood: true,
        nutrition: 2,
        saturation: 0.4,
        useDuration: 1.4,
      },
    },
    {
      kind: 'crop',
      name: 'rice_plant',
      displayName: 'Rice',
      notes: 'Grows on farmland. Ripe plants drop grain plus extra seed.',
      data: {
        stages: 4,
        growthMode: 'script',
        growthChance: 0.3,
        plantOn: 'minecraft:farmland',
        category: 'nature',
        generateSeed: true,
        seedName: 'rice_seeds',
        seedDisplayName: 'Rice Seeds',
        produce: '#item:rice',
        produceMin: 1,
        produceMax: 3,
        seedDropMax: 2,
        tags: ['minecraft:crop'],
      },
    },
  ],
}

const farmStructures: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.structures',
  label: 'Farm structures',
  description: 'A greenhouse panel that lets light through and a storage crate.',
  nodes: [
    {
      kind: 'block',
      name: 'greenhouse_panel',
      displayName: 'Greenhouse Panel',
      data: {
        category: 'construction',
        renderMethod: 'blend',
        ambientOcclusion: 0,
        faceDimming: false,
        destroyTime: 0.4,
        explosionResistance: 0.5,
        // Glass should not stop crops below it from growing.
        lightDampening: 0,
        mapColor: '#bcd7d8',
        tags: ['greenhouse'],
      },
    },
    {
      kind: 'block',
      name: 'storage_crate',
      displayName: 'Storage Crate',
      data: {
        category: 'construction',
        creativeGroup: 'minecraft:itemGroup.name.chest',
        renderMethod: 'opaque',
        destroyTime: 2,
        explosionResistance: 3,
        flammable: true,
        mapColor: '#8a6a3c',
        tags: ['storage'],
      },
    },
  ],
}

const cookware: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.cookware',
  label: 'Cookware',
  description:
    'A cooking pot and a frying pan, plus cooking oil. The cookware is used as an ingredient in normal crafting-table recipes rather than opening a custom screen.',
  notes: [
    'Placing the pan in a recipe slot is what makes a dish "fried" — no scripted UI needed.',
    'Both blocks can be flipped to real crafting stations later with one toggle if you want that instead.',
  ],
  nodes: [
    {
      kind: 'block',
      name: 'cooking_pot',
      displayName: 'Cooking Pot',
      data: {
        category: 'equipment',
        renderMethod: 'alpha_test',
        destroyTime: 1.2,
        explosionResistance: 2,
        solid: true,
        mapColor: '#4a4a4f',
        tags: ['cookware'],
      },
    },
    {
      kind: 'block',
      name: 'frying_pan',
      displayName: 'Frying Pan',
      data: {
        category: 'equipment',
        renderMethod: 'alpha_test',
        destroyTime: 1,
        explosionResistance: 2,
        solid: true,
        mapColor: '#3d3d42',
        tags: ['cookware'],
      },
    },
    {
      kind: 'item',
      name: 'cooking_oil',
      displayName: 'Cooking Oil',
      data: {
        category: 'items',
        maxStackSize: 16,
        usingConvertsTo: 'minecraft:glass_bottle',
      },
    },
  ],
}

const farmhands: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.farmhands',
  label: 'Farmhand',
  description: 'A passive farmer NPC that wanders the farm and follows anyone holding wheat.',
  nodes: [
    {
      kind: 'entity',
      name: 'farmer',
      displayName: 'Farmer',
      data: {
        families: ['mob', 'farmer'],
        bodyPreset: 'biped',
        health: 20,
        movementSpeed: 0.25,
        collisionWidth: 0.6,
        collisionHeight: 1.9,
        temperament: 'passive',
        tempted: ['minecraft:wheat', 'minecraft:wheat_seeds'],
        hasSpawnEgg: true,
        eggBaseColor: '#7a6a4f',
        eggOverlayColor: '#c9b28a',
        despawns: false,
      },
    },
  ],
}

/**
 * The scarecrow mechanic, expressed entirely through existing fields:
 *
 *  - The scarecrow is a stationary entity that does nothing but exist in the
 *    `scarecrow` family.
 *  - The crow avoids that family within a radius, at a higher goal priority
 *    than eating, so inside the radius the crow leaves and outside it behaves
 *    normally. That is the whole "less attractive near a scarecrow" effect, with
 *    no per-tick scripting.
 *  - Crow spawning is tied to the presence of the crop block, so density
 *    follows the farm without anyone measuring its area.
 */
const pests: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.pests',
  label: 'Crows & scarecrows',
  description:
    'A crow that raids ripe crops, and a scarecrow that keeps it away within a radius. Both are pure data-driven AI — nothing runs per tick.',
  notes: [
    'Apply the Rice paddy preset first: the crow references the rice crop.',
    'Widen or narrow the effect by changing the crow’s Avoidance radius.',
    'Eating a ripe plant resets it to stage 0 rather than destroying it.',
  ],
  nodes: [
    {
      kind: 'entity',
      name: 'scarecrow',
      displayName: 'Scarecrow',
      notes: 'Does nothing actively. Its only job is to be in the "scarecrow" family.',
      data: {
        families: ['scarecrow'],
        bodyPreset: 'post',
        health: 20,
        movementSpeed: 0,
        collisionWidth: 0.7,
        collisionHeight: 2.4,
        temperament: 'stationary',
        hasSpawnEgg: true,
        isSummonable: true,
        eggBaseColor: '#c9a227',
        eggOverlayColor: '#5a4326',
        despawns: false,
      },
    },
    {
      kind: 'entity',
      name: 'crow',
      displayName: 'Crow',
      notes: 'Flees scarecrows first, eats ripe rice second, wanders otherwise.',
      data: {
        families: ['crow', 'pest'],
        bodyPreset: 'bird',
        scale: 0.9,
        health: 4,
        movementSpeed: 0.35,
        collisionWidth: 0.5,
        collisionHeight: 0.6,
        temperament: 'skittish',
        canFly: true,
        despawns: true,

        avoidFamilies: ['scarecrow'],
        avoidRadius: 16,

        eatsBlocks: true,
        eatTarget: '#crop:rice_plant',
        eatOnlyWhenRipe: true,
        eatChance: 0.12,
        eatTime: 3,

        spawnEnabled: true,
        spawnWeight: 6,
        spawnDensityLimit: 2,
        spawnAboveBlocks: ['#crop:rice_plant'],
        spawnOnBlocks: ['minecraft:farmland', 'minecraft:grass_block', 'minecraft:dirt'],
        spawnBiomeTag: 'overworld',
        spawnBrightnessMin: 8,
        spawnBrightnessMax: 15,
        spawnHerdMin: 1,
        spawnHerdMax: 3,

        hasSpawnEgg: true,
        eggBaseColor: '#1c1c22',
        eggOverlayColor: '#4a4a55',
      },
    },
  ],
}

/**
 * Dishes. The fried egg reproduces the layout asked for: egg in the centre,
 * oil to its right, pan directly below it.
 */
const dishes: PresetFile = {
  presetFormat: PRESET_FORMAT,
  id: 'farming.dishes',
  label: 'Cooked dishes',
  description: 'A fried egg and a rice bowl, each requiring the matching cookware in the grid.',
  notes: ['Apply Cookware and Rice paddy first — both recipes reference them.'],
  nodes: [
    {
      kind: 'item',
      name: 'fried_egg',
      displayName: 'Fried Egg',
      data: {
        category: 'items',
        creativeGroup: 'minecraft:itemGroup.name.miscFood',
        maxStackSize: 16,
        isFood: true,
        nutrition: 5,
        saturation: 0.6,
        useDuration: 1.6,
      },
    },
    {
      kind: 'recipe',
      name: 'fried_egg',
      displayName: 'Fried Egg',
      notes: 'Egg centre, oil to the right, pan below.',
      data: {
        recipeType: 'shaped',
        grid: [
          '', '', '',
          '', 'minecraft:egg', '#item:cooking_oil',
          '', '#block:frying_pan', '',
        ],
        trimPattern: true,
        result: '#item:fried_egg',
        resultCount: 1,
        stations: ['crafting_table'],
        unlockItems: ['minecraft:egg'],
      },
    },
    {
      kind: 'item',
      name: 'rice_bowl',
      displayName: 'Bowl of Rice',
      data: {
        category: 'items',
        creativeGroup: 'minecraft:itemGroup.name.miscFood',
        maxStackSize: 1,
        isFood: true,
        nutrition: 7,
        saturation: 0.8,
        useDuration: 1.6,
        usingConvertsTo: 'minecraft:bowl',
      },
    },
    {
      kind: 'recipe',
      name: 'rice_bowl',
      displayName: 'Bowl of Rice',
      notes: 'Two rice over a bowl, cooked in the pot.',
      data: {
        recipeType: 'shaped',
        grid: [
          '', '#item:rice', '',
          '', '#item:rice', '',
          '', 'minecraft:bowl', '#block:cooking_pot',
        ],
        trimPattern: true,
        result: '#item:rice_bowl',
        resultCount: 1,
        stations: ['crafting_table'],
      },
    },
  ],
}

export const FARMING_PRESETS: PresetFile[] = [
  ricePaddy,
  farmStructures,
  cookware,
  farmhands,
  pests,
  dishes,
]

/**
 * Presets shipped with the app. Kept separate from the drop-in inbox so it is
 * always obvious which came from where.
 */
export const BUILTIN_PRESET_PACKS: Array<{ id: string; label: string; presets: PresetFile[] }> = [
  { id: 'farming', label: 'Farming', presets: FARMING_PRESETS },
]

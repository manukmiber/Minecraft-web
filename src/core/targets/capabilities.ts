/**
 * What each platform can actually do.
 *
 * This file exists because the honest answer to "does this add-on work on Java
 * too?" is *it depends on what is in it*, and that answer is useless unless the
 * builder can be specific. So every feature the app can produce is declared
 * here against three delivery routes:
 *
 *   bedrock       a `.mcaddon`, which is pure JSON and needs no build step
 *   javaDatapack  a data pack + resource pack pair, no mod loader involved
 *   javaMod       a Fabric / Quilt / Forge / NeoForge mod, compiled from the
 *                 sources the builder generates
 *
 * The one structural difference that drives most of the table: **Bedrock lets
 * JSON register new content, Java does not.** A Bedrock behaviour pack can add
 * a block by dropping a file in `blocks/`. A Java data pack has no such door —
 * it can add recipes, loot, tags, advancements and world generation, but a new
 * block or item has to be registered by running code, which is what a mod
 * loader is for. That single fact is why the middle column is so much emptier
 * than the other two, and it is not something a better exporter could fix.
 *
 * The other direction exists too, and is easy to miss: a few things are
 * genuinely *better* on Java. Custom crafting stations are the clearest case —
 * see `docs/CRAFTING_STATIONS.md` — because Bedrock has no way to define a new
 * container screen, while a Java mod defines one in a couple of classes.
 *
 * `CompatibilityView` renders this table filtered to the kinds a project
 * actually uses, so the warnings are about your add-on rather than a generic
 * list of caveats.
 */

import type { ProjectModel } from '../model/types'
import type { ModLoader } from './platforms'

export type SupportLevel = 'full' | 'partial' | 'none'

export interface FeatureSupport {
  level: SupportLevel
  /** Always written — a bare "partial" with no reason is not worth showing. */
  note: string
}

export interface FeatureCapability {
  id: string
  label: string
  group: 'content' | 'crafting' | 'world' | 'presentation' | 'systems'
  /**
   * Content kinds that exercise this feature, so the panel can hide rows the
   * project has nothing to do with. An empty list means "always relevant".
   */
  kinds: string[]
  bedrock: FeatureSupport
  javaDatapack: FeatureSupport
  javaMod: FeatureSupport
  /** Loaders where the Java-mod answer differs from the general one. */
  loaderNotes?: Partial<Record<ModLoader, string>>
}

const FULL = (note: string): FeatureSupport => ({ level: 'full', note })
const PARTIAL = (note: string): FeatureSupport => ({ level: 'partial', note })
const NONE = (note: string): FeatureSupport => ({ level: 'none', note })

/** The one sentence that explains most of the "none" cells in the middle column. */
export const DATAPACK_CANNOT_REGISTER =
  'A data pack cannot register new content. Vanilla Java only reads data packs for recipes, loot, tags, advancements and world generation — anything that needs a new registry entry needs a mod loader.'

export const CAPABILITIES: FeatureCapability[] = [
  // -- content ---------------------------------------------------------------
  {
    id: 'custom-block',
    label: 'Custom blocks',
    group: 'content',
    kinds: ['block'],
    bedrock: FULL(
      'A JSON file in blocks/ registers the block. Textures, hardness, light and collision are all data-driven.',
    ),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL(
      'Registered in the generated ModBlocks class, with its blockstate, model, item model and loot table written alongside.',
    ),
  },
  {
    id: 'custom-item',
    label: 'Custom items',
    group: 'content',
    kinds: ['item'],
    bedrock: FULL('A JSON file in items/ registers the item, icon and components included.'),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL('Registered in ModItems with a generated item model pointing at your PNG.'),
  },
  {
    id: 'food',
    label: 'Edible items',
    group: 'content',
    kinds: ['item', 'crop'],
    bedrock: FULL('minecraft:food carries nutrition, saturation and what the item leaves behind.'),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL(
      'FoodProperties on the item, including the bowl-style leftover through usingConvertsTo.',
    ),
  },
  {
    id: 'fuel',
    label: 'Items usable as fuel',
    group: 'content',
    kinds: ['item'],
    bedrock: FULL('minecraft:fuel gives the item a burn duration in seconds.'),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL('Burn time is registered per loader; the duration is converted to ticks.'),
    loaderNotes: {
      fabric: 'Registered through FuelRegistry, which is part of Fabric API.',
      quilt: 'Registered through FuelRegistry, which is part of Fabric API.',
      forge: 'Implemented as getBurnTime on the generated item class.',
      neoforge: 'Implemented as getBurnTime on the generated item class.',
    },
  },
  {
    id: 'crop-growth',
    label: 'Crops with growth stages',
    group: 'content',
    kinds: ['crop'],
    bedrock: PARTIAL(
      'The stages and their textures are data-driven, but growth itself needs a script: the modern block parser dropped data-driven block events, so the builder registers a custom component in scripts/main.js. That means the behaviour pack declares a script module, and script-enabled packs cannot be used on a Realm without the experiment toggle.',
    ),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL(
      'A CropBlock subclass gets random-tick growth, bonemeal, trampling and the seed/produce drops for free from vanilla — no scripting layer involved.',
    ),
  },
  {
    id: 'custom-entity',
    label: 'Custom entities',
    group: 'content',
    kinds: ['entity'],
    bedrock: FULL(
      'Behaviour, client entity, render controller, animations, geometry and spawn egg are all JSON, and the builder writes all six.',
    ),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: PARTIAL(
      'The builder registers the entity type, its attributes and a spawn egg, but a Java mob needs a rendering layer and a model class the generator does not write — the export leaves a clearly marked stub renderer that shows a placeholder model until you fill it in.',
    ),
  },
  {
    id: 'spawn-rules',
    label: 'Natural spawning',
    group: 'content',
    kinds: ['entity'],
    bedrock: FULL('spawn_rules JSON with biome filters, brightness, herd size and density caps.'),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL('Spawn placement and biome spawn entries are registered from the generated code.'),
  },

  // -- crafting --------------------------------------------------------------
  {
    id: 'vanilla-recipes',
    label: 'Recipes at vanilla stations',
    group: 'crafting',
    kinds: ['recipe'],
    bedrock: FULL('Shaped, shapeless and furnace-family recipes are plain JSON.'),
    javaDatapack: FULL(
      'This is what data packs are for. Recipes for the crafting table, the furnace family and the stonecutter all work with no loader at all.',
    ),
    javaMod: FULL('The same recipe JSON ships inside the mod jar.'),
  },
  {
    id: 'custom-station',
    label: 'Custom crafting stations',
    group: 'crafting',
    kinds: ['block', 'recipe'],
    bedrock: PARTIAL(
      'minecraft:crafting_table gives a block its own crafting screen, but that screen is always the vanilla 3x3 grid: the slot count and arrangement cannot be changed, there is no custom UI, no progress bar, no fuel or energy slot, and the recipe book does not list recipes carrying a custom tag. See docs/CRAFTING_STATIONS.md for the full list.',
    ),
    javaDatapack: NONE(
      'A data pack can add recipes to stations that already exist, but a new station is a new block plus a new container screen, and neither can be registered from JSON.',
    ),
    javaMod: FULL(
      'A real AbstractContainerMenu and Screen, so the grid can be any size the builder allows, with your own background texture and title. The builder generates the menu, the screen and the recipe matcher.',
    ),
  },
  {
    id: 'creative-tab',
    label: 'Creative inventory placement',
    group: 'crafting',
    kinds: ['block', 'item', 'crop'],
    bedrock: FULL('menu_category puts the entry in one of the four vanilla tabs, or hides it.'),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: FULL(
      'A dedicated creative tab is generated for the project, so everything it adds sits together.',
    ),
  },
  {
    id: 'loot',
    label: 'Block drops',
    group: 'crafting',
    kinds: ['block', 'crop'],
    bedrock: FULL('minecraft:loot points at a loot table, or the block drops itself.'),
    javaDatapack: PARTIAL(
      'Loot tables for blocks that already exist can be replaced. Tables for the project’s own blocks are written but have nothing to attach to without a mod.',
    ),
    javaMod: FULL('A block loot table per block, including the age-gated crop drops.'),
  },

  // -- world -----------------------------------------------------------------
  {
    id: 'custom-biome',
    label: 'Custom biomes',
    group: 'world',
    kinds: ['biome'],
    bedrock: FULL(
      'A biome JSON plus a client biome for its colours. Placement is by climate and the surface builder rules the builder writes.',
    ),
    javaDatapack: PARTIAL(
      'The biome file itself is a data pack file and works. Getting it to actually generate means overriding the dimension’s multi-noise preset, which the builder writes — but that override replaces the whole overworld preset, so two packs that both do it will conflict.',
    ),
    javaMod: FULL(
      'Same biome JSON, with the region registration the loader needs so it slots into world generation without replacing the vanilla preset.',
    ),
  },
  {
    id: 'scatter',
    label: 'Scattering plants and blocks',
    group: 'world',
    kinds: ['scatter', 'biome', 'crop'],
    bedrock: FULL('A feature plus a feature rule, scoped by biome tag, pass and height band.'),
    javaDatapack: PARTIAL(
      'The configured and placed features are correct data pack files. Attaching them to an existing vanilla biome, however, needs the whole biome file to be overwritten, which conflicts with any other pack doing the same.',
    ),
    javaMod: FULL(
      'The same features, attached through the loader’s biome modification hook so nothing is overwritten.',
    ),
    loaderNotes: {
      forge: 'Attached with a data-driven forge:biome_modifier — no code involved.',
      neoforge: 'Attached with a data-driven neoforge:biome_modifier — no code involved.',
      fabric: 'Attached with Fabric API’s BiomeModifications, in the generated ModWorldgen class.',
      quilt: 'Attached with Fabric API’s BiomeModifications, in the generated ModWorldgen class.',
    },
  },
  {
    id: 'trees',
    label: 'Trees',
    group: 'world',
    kinds: ['tree'],
    bedrock: FULL(
      'Bedrock’s tree feature takes a shape, a trunk and a canopy description directly.',
    ),
    javaDatapack: PARTIAL(
      'Java trees are a configured feature with a trunk placer and a foliage placer, which the builder maps the shape onto. The same biome-attachment caveat as scattering applies.',
    ),
    javaMod: FULL('The same tree feature, attached through the loader’s biome hook.'),
  },
  {
    id: 'structures',
    label: 'Painted structures',
    group: 'world',
    kinds: ['structure'],
    bedrock: FULL(
      'The painted grid becomes an aggregate feature that places each block, so nothing binary is involved.',
    ),
    javaDatapack: NONE(
      'Java places structures from binary .nbt files written by the in-game structure block. The builder writes JSON, not NBT, so there is nothing for a data pack to point at.',
    ),
    javaMod: FULL(
      'The painted grid is baked into a generated Feature class that places the blocks itself, which sidesteps NBT entirely.',
    ),
  },

  // -- presentation ----------------------------------------------------------
  {
    id: 'textures',
    label: 'Textures',
    group: 'presentation',
    kinds: [],
    bedrock: FULL(
      'PNGs are written into the resource pack and registered in item_texture.json or terrain_texture.json.',
    ),
    javaDatapack: PARTIAL(
      'The resource pack half carries every PNG, but with no blocks or items to attach them to they only cover textures that replace vanilla ones.',
    ),
    javaMod: FULL(
      'Java has no texture atlas file to maintain — a model referring to ns:item/name is enough, and the builder writes both.',
    ),
  },
  {
    id: 'custom-geometry',
    label: 'Custom block shapes',
    group: 'presentation',
    kinds: ['block'],
    bedrock: PARTIAL(
      'A block can point at a geometry identifier, but the builder only ships the full-block and cross shapes; anything else needs a .geo.json you supply yourself.',
    ),
    javaDatapack: NONE(DATAPACK_CANNOT_REGISTER),
    javaMod: PARTIAL(
      'Full-block and cross models are generated. A bespoke shape means writing a block model JSON by hand — Java models are far easier to hand-write than Bedrock geometry, but the builder still does not draw them for you.',
    ),
  },
  {
    id: 'lang',
    label: 'Display names',
    group: 'presentation',
    kinds: [],
    bedrock: FULL('Written to texts/en_US.lang with the key shape each content type expects.'),
    javaDatapack: PARTIAL('Written to assets/<namespace>/lang/en_us.json, which needs the resource pack half.'),
    javaMod: FULL('The same en_us.json, shipped inside the jar.'),
  },

  // -- systems ---------------------------------------------------------------
  {
    id: 'scripting',
    label: 'Scripted behaviour',
    group: 'systems',
    kinds: ['crop'],
    bedrock: PARTIAL(
      'The Script API covers custom block components, which is how crop growth works. It is JavaScript running in the game’s own sandbox, so it is limited to the API surface Mojang exposes — and a pack that uses it needs the Beta APIs experiment on a Realm.',
    ),
    javaDatapack: NONE('Data packs run commands and functions, not code.'),
    javaMod: FULL(
      'A mod is arbitrary Java against the whole game. Anything the builder does not generate you can write yourself in the exported project.',
    ),
  },
  {
    id: 'no-build-step',
    label: 'Installable without compiling',
    group: 'systems',
    kinds: [],
    bedrock: FULL('The .mcaddon opens straight into the game. Nothing to build, ever.'),
    javaDatapack: FULL('Two zips, dropped into a world folder and the resource pack folder.'),
    javaMod: NONE(
      'The export is a Gradle source project, not a jar: compiling Java in a browser tab is not possible. One ./gradlew build produces the jar.',
    ),
  },
]

export const SUPPORT_ORDER: Record<SupportLevel, number> = { none: 0, partial: 1, full: 2 }

export function worstLevel(levels: SupportLevel[]): SupportLevel {
  return levels.reduce<SupportLevel>(
    (worst, level) => (SUPPORT_ORDER[level] < SUPPORT_ORDER[worst] ? level : worst),
    'full',
  )
}

/** The capabilities a project actually exercises, in declaration order. */
export function capabilitiesForProject(project: ProjectModel): FeatureCapability[] {
  const used = new Set(project.nodes.map((node) => node.kind))
  return CAPABILITIES.filter(
    (capability) =>
      capability.kinds.length === 0 || capability.kinds.some((kind) => used.has(kind)),
  )
}

export interface RouteVerdict {
  level: SupportLevel
  /** Capabilities that are less than full on this route, worst first. */
  gaps: FeatureCapability[]
}

/** How well one delivery route covers a given project. */
export function verdictFor(
  project: ProjectModel,
  route: 'bedrock' | 'javaDatapack' | 'javaMod',
): RouteVerdict {
  const relevant = capabilitiesForProject(project)
  const gaps = relevant
    .filter((capability) => capability[route].level !== 'full')
    .sort((a, b) => SUPPORT_ORDER[a[route].level] - SUPPORT_ORDER[b[route].level])
  return { level: worstLevel(relevant.map((c) => c[route].level)), gaps }
}

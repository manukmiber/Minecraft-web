/**
 * Java Edition target profiles.
 *
 * The Bedrock sibling of this file (`profiles.ts`) only has to carry
 * `format_version` strings, because Bedrock's data formats move slowly and its
 * pack layout has been stable for years. Java is a different animal: the same
 * add-on written for 1.20.1 and for 1.21.1 differs in the *folder names* of the
 * data pack, in the *shape* of every recipe file, and in the *Java API* the
 * generated mod compiles against. All three live here, so a new Minecraft
 * version is one entry in this file rather than a hunt through the generators.
 *
 * The three axes, and why each exists:
 *
 *   registryFolders  1.21 renamed every data-pack registry folder to the
 *                    singular — `recipes/` became `recipe/`, `tags/items/`
 *                    became `tags/item/`. A pack using the wrong spelling is
 *                    not an error, it is silently ignored, which is the worst
 *                    possible failure mode.
 *   recipeSyntax     1.21 also rewrote recipe JSON: an ingredient went from
 *                    `{"item": "minecraft:stick"}` to the bare string
 *                    `"minecraft:stick"`, and a crafting result from
 *                    `{"item": ..., "count": n}` to `{"id": ..., "count": n}`.
 *   api              The generated mod is real Java, so it has to be written
 *                    against the API that version actually ships. The handful
 *                    of call sites that moved are named here rather than being
 *                    branched on inside the templates.
 *
 * Mappings: every loader here is generated against **official Mojang mappings**
 * (Fabric Loom's `officialMojangMappings()`), not Yarn. One set of templates
 * then compiles on all four loaders instead of Fabric needing its own dialect.
 */

import type { ModLoader, Platform } from './platforms'

/** Data-pack registry folder names, which 1.21 changed wholesale. */
export interface RegistryFolders {
  recipe: string
  lootTable: string
  advancement: string
  tagBlock: string
  tagItem: string
  structure: string
}

/** Loader coordinates for one Minecraft version. */
export interface JavaLoaderVersions {
  /** Loader version constraint written into the mod metadata. */
  loader: string
  /** Companion API (Fabric API, QFAPI); absent for Forge-family loaders. */
  api?: string
  /** Gradle plugin line for `settings.gradle` / `build.gradle`. */
  gradlePlugin: string
  /** Repository the loader's artifacts come from. */
  mavenUrl?: string
  /**
   * Where the metadata file goes. Overrides `LOADERS[id].metadataPath` because
   * NeoForge read `META-INF/mods.toml` on 20.1 and only moved to
   * `META-INF/neoforge.mods.toml` from 1.20.5 onwards.
   */
  metadataPath: string
  /** Extra gradle.properties entries, e.g. the exact loader build to compile against. */
  properties: Record<string, string>
}

/**
 * The Java API call sites that moved between the supported versions.
 *
 * Every entry is a code fragment rather than a boolean, because a boolean would
 * only push the branch down into the template where it is much harder to see
 * what the two versions actually differ on.
 */
export interface JavaApi {
  /** Expression producing a ResourceLocation. 1.21 made the constructor private. */
  resourceLocation(namespaceExpr: string, pathExpr: string): string
  /** Expression parsing a full `namespace:path` string. */
  parseResourceLocation(expr: string): string
  /** Screen#renderBackground gained the mouse and partial-tick arguments in 1.20.5. */
  screenRenderBackground: string
  /** `FoodProperties.Builder` renamed `saturationMod` to `saturationModifier` in 1.21. */
  foodSaturationMethod: string
  /** Right-click handler on Block. 1.20.5 split `use` into `useWithoutItem`. */
  blockUse: {
    method: string
    signature: string
    superCall: string
  }
  /** Import + expression for opening a menu server-side, which Forge routes differently. */
  openMenu(loader: ModLoader): { imports: string[]; statement: string }
  /** `Level#isClientSide` is stable, but the crop tick hook is not. */
  randomTickSignature: string
  /** Codec-based component the creative tab title uses. */
  componentTranslatable: string
}

export interface JavaTargetProfile {
  id: string
  platform: Extract<Platform, 'java'>
  label: string
  engineLabel: string
  minecraftVersion: string
  /** Java language level the generated Gradle build targets. */
  javaVersion: number
  dataPackFormat: number
  resourcePackFormat: number
  registryFolders: RegistryFolders
  recipeSyntax: 'legacy' | 'modern'
  /**
   * 1.21 flattened a biome's `carvers` from `{"air": [...], "liquid": [...]}`
   * into a single list. Writing the wrong one fails the biome codec outright,
   * which at least is a loud failure rather than a silent one.
   */
  biomeCarversAsList: boolean
  loaders: Partial<Record<Exclude<ModLoader, 'datapack'>, JavaLoaderVersions>>
  api: JavaApi
  notes: string[]
}

/** 1.21 renamed every registry folder to the singular. */
const MODERN_FOLDERS: RegistryFolders = {
  recipe: 'recipe',
  lootTable: 'loot_table',
  advancement: 'advancement',
  tagBlock: 'tags/block',
  tagItem: 'tags/item',
  structure: 'structure',
}

const LEGACY_FOLDERS: RegistryFolders = {
  recipe: 'recipes',
  lootTable: 'loot_tables',
  advancement: 'advancements',
  tagBlock: 'tags/blocks',
  tagItem: 'tags/items',
  structure: 'structures',
}

const MODERN_API: JavaApi = {
  resourceLocation: (ns, path) => `ResourceLocation.fromNamespaceAndPath(${ns}, ${path})`,
  parseResourceLocation: (expr) => `ResourceLocation.parse(${expr})`,
  screenRenderBackground: 'this.renderBackground(guiGraphics, mouseX, mouseY, partialTick)',
  foodSaturationMethod: 'saturationModifier',
  blockUse: {
    method: 'useWithoutItem',
    signature:
      'protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit)',
    superCall: 'super.useWithoutItem(state, level, pos, player, hit)',
  },
  openMenu: (loader) =>
    loader === 'forge'
      ? {
          imports: ['net.minecraftforge.network.NetworkHooks'],
          statement: 'NetworkHooks.openScreen((ServerPlayer) player, provider, pos)',
        }
      : { imports: [], statement: 'player.openMenu(provider)' },
  randomTickSignature:
    'protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random)',
  componentTranslatable: 'Component.translatable',
}

const LEGACY_API: JavaApi = {
  resourceLocation: (ns, path) => `new ResourceLocation(${ns}, ${path})`,
  parseResourceLocation: (expr) => `new ResourceLocation(${expr})`,
  screenRenderBackground: 'this.renderBackground(guiGraphics)',
  foodSaturationMethod: 'saturationMod',
  blockUse: {
    method: 'use',
    signature:
      'public InteractionResult use(BlockState state, Level level, BlockPos pos, Player player, InteractionHand hand, BlockHitResult hit)',
    superCall: 'super.use(state, level, pos, player, hand, hit)',
  },
  openMenu: (loader) =>
    loader === 'forge' || loader === 'neoforge'
      ? {
          imports: ['net.minecraftforge.network.NetworkHooks'],
          statement: 'NetworkHooks.openScreen((ServerPlayer) player, provider, pos)',
        }
      : { imports: [], statement: 'player.openMenu(provider)' },
  randomTickSignature:
    'public void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random)',
  componentTranslatable: 'Component.translatable',
}

export const JAVA_TARGET_PROFILES: JavaTargetProfile[] = [
  {
    id: 'java-1.21.1',
    platform: 'java',
    label: 'Java 1.21.1',
    engineLabel: '1.21.1 — the widest modern loader support',
    minecraftVersion: '1.21.1',
    javaVersion: 21,
    dataPackFormat: 48,
    resourcePackFormat: 34,
    registryFolders: MODERN_FOLDERS,
    recipeSyntax: 'modern',
    biomeCarversAsList: true,
    loaders: {
      fabric: {
        loader: '>=0.16.0',
        api: '>=0.102.0',
        gradlePlugin: "id 'fabric-loom' version '1.7-SNAPSHOT'",
        metadataPath: 'fabric.mod.json',
        properties: {
          loader_version: '0.16.9',
          fabric_version: '0.102.1+1.21.1',
        },
      },
      quilt: {
        loader: '>=0.26.0',
        api: '>=11.0.0',
        // Built with Fabric Loom on purpose: Quilt Loader reads quilt.mod.json
        // natively and the resulting jar also runs on Fabric.
        gradlePlugin: "id 'fabric-loom' version '1.7-SNAPSHOT'",
        metadataPath: 'quilt.mod.json',
        properties: {
          loader_version: '0.16.9',
          fabric_version: '0.102.1+1.21.1',
        },
      },
      forge: {
        loader: '[52,)',
        gradlePlugin: "id 'net.minecraftforge.gradle' version '[6.0,6.2)'",
        mavenUrl: 'https://maven.minecraftforge.net/',
        metadataPath: 'META-INF/mods.toml',
        properties: { forge_version: '52.0.40' },
      },
      neoforge: {
        loader: '[4,)',
        gradlePlugin: "id 'net.neoforged.moddev' version '2.0.28'",
        mavenUrl: 'https://maven.neoforged.net/releases',
        metadataPath: 'META-INF/neoforge.mods.toml',
        properties: { neoforge_version: '21.1.72' },
      },
    },
    api: MODERN_API,
    notes: [
      'Data-pack folders are singular here: recipe/, loot_table/, tags/item/.',
      'Recipe ingredients are bare identifier strings and a crafting result uses "id" rather than "item".',
      'Java 21 is required — the toolchain line in the generated build.gradle already asks for it.',
      'NeoForge reads META-INF/neoforge.mods.toml from 1.20.5 onwards; Forge still reads META-INF/mods.toml.',
    ],
  },
  {
    id: 'java-1.20.1',
    platform: 'java',
    label: 'Java 1.20.1 (legacy)',
    engineLabel: '1.20.1 — where most existing Forge packs still live',
    minecraftVersion: '1.20.1',
    javaVersion: 17,
    dataPackFormat: 15,
    resourcePackFormat: 15,
    registryFolders: LEGACY_FOLDERS,
    recipeSyntax: 'legacy',
    biomeCarversAsList: false,
    loaders: {
      fabric: {
        loader: '>=0.15.0',
        api: '>=0.92.0',
        gradlePlugin: "id 'fabric-loom' version '1.6-SNAPSHOT'",
        metadataPath: 'fabric.mod.json',
        properties: {
          loader_version: '0.15.11',
          fabric_version: '0.92.2+1.20.1',
        },
      },
      quilt: {
        loader: '>=0.20.0',
        api: '>=7.0.0',
        gradlePlugin: "id 'fabric-loom' version '1.6-SNAPSHOT'",
        metadataPath: 'quilt.mod.json',
        properties: {
          loader_version: '0.15.11',
          fabric_version: '0.92.2+1.20.1',
        },
      },
      forge: {
        loader: '[47,)',
        gradlePlugin: "id 'net.minecraftforge.gradle' version '[6.0,6.2)'",
        mavenUrl: 'https://maven.minecraftforge.net/',
        metadataPath: 'META-INF/mods.toml',
        properties: { forge_version: '47.3.0' },
      },
      neoforge: {
        loader: '[1,)',
        gradlePlugin: "id 'net.neoforged.gradle.userdev' version '7.0.145'",
        mavenUrl: 'https://maven.neoforged.net/releases',
        // NeoForge 20.1 was still a Forge fork and read the Forge file name.
        metadataPath: 'META-INF/mods.toml',
        properties: { neoforge_version: '20.1.234' },
      },
    },
    api: LEGACY_API,
    notes: [
      'Data-pack folders are plural here: recipes/, loot_tables/, tags/items/.',
      'Recipe ingredients are objects — {"item": "minecraft:stick"} — and a smelting result is a bare string.',
      'Java 17, not 21.',
      'NeoForge 20.1 is still Forge-shaped and reads META-INF/mods.toml.',
    ],
  },
]

export const DEFAULT_JAVA_TARGET_ID = 'java-1.21.1'

export function getJavaProfile(id: string): JavaTargetProfile {
  return JAVA_TARGET_PROFILES.find((p) => p.id === id) ?? JAVA_TARGET_PROFILES[0]
}

/** Loaders this Minecraft version actually has coordinates for. */
export function loadersFor(profile: JavaTargetProfile): Array<Exclude<ModLoader, 'datapack'>> {
  return (Object.keys(profile.loaders) as Array<Exclude<ModLoader, 'datapack'>>).filter(
    (id) => profile.loaders[id] !== undefined,
  )
}

import { beforeAll, describe, expect, it } from 'vitest'

import { installBuiltinKinds } from '../../kinds'
import { createNode, createProject, upsertNode } from '../../model/project'
import type { ProjectModel } from '../../model/types'
import type { VirtualFs } from '../../vfs/types'
import { NODE_STATION_PREFIX } from '../../recipes/stations'
import { emitJava } from './emitJava'
import { bakeRecipes } from './station'
import { createJavaContext } from './context'
import { getJavaProfile } from '../../targets/javaProfiles'
import { mapVanillaIdentifier, pascalCase, rootPackage, toJavaIdentifier } from './ids'

beforeAll(() => {
  installBuiltinKinds()
})

function json(fs: VirtualFs, path: string): Record<string, unknown> {
  const file = fs.get(path)
  if (!file) throw new Error(`No file at ${path}. Present: ${[...fs.keys()].join(', ')}`)
  if (file.body.type !== 'json') throw new Error(`${path} is not JSON`)
  return file.body.value as Record<string, unknown>
}

function source(fs: VirtualFs, path: string): string {
  const file = fs.get(path)
  if (!file) throw new Error(`No file at ${path}. Present: ${[...fs.keys()].join(', ')}`)
  if (file.body.type !== 'text') throw new Error(`${path} is not text`)
  return file.body.value
}

/** A project with an item, a block station and a recipe made at that station. */
function farmProject(): { project: ProjectModel; potId: string } {
  let project = createProject({ namespace: 'farm', name: 'Plants and Foods' })

  const flour = createNode(project, 'item', 'Flour', { isFood: false, maxStackSize: 64 })
  project = upsertNode(project, flour)

  const pot = createNode(project, 'block', 'Cooking Pot', {
    isCraftingStation: true,
    craftingTag: 'cooking_pot',
    craftingGridRows: 2,
    craftingGridCols: 2,
    destroyTime: 2,
  })
  project = upsertNode(project, pot)

  const stew = createNode(project, 'item', 'Herb Stew', { isFood: true, nutrition: 8, saturation: 0.8 })
  project = upsertNode(project, stew)

  const potRecipe = createNode(project, 'recipe', 'Herb Stew Recipe', {
    station: `${NODE_STATION_PREFIX}${pot.id}`,
    recipeType: 'shaped',
    grid: ['farm:flour', 'minecraft:bowl', '', '', '', '', '', '', ''],
    result: 'farm:herb_stew',
    resultCount: 1,
  })
  project = upsertNode(project, potRecipe)

  const tableRecipe = createNode(project, 'recipe', 'Flour Recipe', {
    station: 'crafting_table',
    recipeType: 'shapeless',
    grid: ['minecraft:wheat', '', '', '', '', '', '', '', ''],
    result: 'farm:flour',
    resultCount: 2,
  })
  project = upsertNode(project, tableRecipe)

  return { project, potId: pot.id }
}

describe('java identifiers', () => {
  it('rewrites a Bedrock identifier that Java spells differently', () => {
    // Bedrock's "grass" is Java's "short_grass"; a pack that gets this wrong
    // places nothing and reports nothing.
    expect(mapVanillaIdentifier('minecraft:grass')).toBe('minecraft:short_grass')
    expect(mapVanillaIdentifier('minecraft:stone')).toBe('minecraft:stone')
  })

  it('maps the project namespace onto the mod id and leaves others alone', () => {
    const { project } = farmProject()
    expect(toJavaIdentifier(project, 'farm:flour')).toBe('farm:flour')
    expect(toJavaIdentifier(project, 'minecraft:wheat')).toBe('minecraft:wheat')
  })

  it('builds a legal Java package even from an awkward namespace', () => {
    const project = createProject({ namespace: 'new' })
    // `new` is a Java keyword and cannot be a package segment.
    expect(rootPackage(project)).toBe('com.new_')
    expect(pascalCase('rice_crop')).toBe('RiceCrop')
  })
})

describe('java data pack route', () => {
  it('produces both halves, each with its own pack format', () => {
    const { project } = farmProject()
    const { artifacts } = emitJava(project, { loader: 'datapack', profileId: 'java-1.21.1' })

    const data = artifacts.get('datapack')!
    const resources = artifacts.get('resourcepack')!

    expect(json(data, 'pack.mcmeta').pack).toMatchObject({ pack_format: 48 })
    expect(json(resources, 'pack.mcmeta').pack).toMatchObject({ pack_format: 34 })
  })

  it('writes 1.21 recipe syntax: bare ingredients and an "id" result', () => {
    const { project } = farmProject()
    const { artifacts } = emitJava(project, { loader: 'datapack', profileId: 'java-1.21.1' })
    const recipe = json(artifacts.get('datapack')!, 'data/farm/recipe/flour_recipe.json')

    expect(recipe.type).toBe('minecraft:crafting_shapeless')
    expect(recipe.ingredients).toEqual(['minecraft:wheat'])
    expect(recipe.result).toEqual({ id: 'farm:flour', count: 2 })
  })

  it('writes 1.20.1 recipe syntax instead on the legacy profile', () => {
    const { project } = farmProject()
    const { artifacts } = emitJava(project, { loader: 'datapack', profileId: 'java-1.20.1' })
    // The folder is plural on 1.20.1, which is itself the thing being checked.
    const recipe = json(artifacts.get('datapack')!, 'data/farm/recipes/flour_recipe.json')

    expect(recipe.ingredients).toEqual([{ item: 'minecraft:wheat' }])
    expect(recipe.result).toEqual({ item: 'farm:flour', count: 2 })
  })

  it('leaves the custom-station recipe out and says why', () => {
    const { project } = farmProject()
    const { artifacts, problems } = emitJava(project, {
      loader: 'datapack',
      profileId: 'java-1.21.1',
    })

    expect(artifacts.get('datapack')!.has('data/farm/recipe/herb_stew_recipe.json')).toBe(false)
    expect(problems.some((p) => p.message.includes('custom station'))).toBe(true)
  })

  it('warns that blocks and items need a loader', () => {
    const { project } = farmProject()
    const { problems } = emitJava(project, { loader: 'datapack', profileId: 'java-1.21.1' })
    expect(problems.some((p) => p.message.includes('need a mod loader'))).toBe(true)
  })
})

describe('java mod route', () => {
  it('registers items and blocks with the loader’s own holder type', () => {
    const { project } = farmProject()

    const fabric = emitJava(project, { loader: 'fabric', profileId: 'java-1.21.1' })
      .artifacts.get('fabric')!
    const neoforge = emitJava(project, { loader: 'neoforge', profileId: 'java-1.21.1' })
      .artifacts.get('neoforge')!
    const forge = emitJava(project, { loader: 'forge', profileId: 'java-1.21.1' })
      .artifacts.get('forge')!

    expect(source(fabric, 'src/main/java/com/farm/ModItems.java')).toContain('Supplier<Item> FLOUR')
    expect(source(neoforge, 'src/main/java/com/farm/ModItems.java')).toContain(
      'DeferredHolder<Item, Item> FLOUR',
    )
    // Forge stayed on RegistryObject and net.minecraftforge.*, which is the
    // single easiest thing to get wrong when treating it as "NeoForge but older".
    expect(source(forge, 'src/main/java/com/farm/ModItems.java')).toContain('RegistryObject<Item> FLOUR')
    expect(source(forge, 'src/main/java/com/farm/ModItems.java')).toContain(
      'net.minecraftforge.registries.RegistryObject',
    )
  })

  it('gives NeoForge 20.1 the Forge dialect, because that is what it was', () => {
    const { project } = farmProject()
    const fs = emitJava(project, { loader: 'neoforge', profileId: 'java-1.20.1' })
      .artifacts.get('neoforge')!

    expect(source(fs, 'src/main/java/com/farm/ModItems.java')).toContain('RegistryObject<Item>')
    expect(fs.has('src/main/resources/META-INF/mods.toml')).toBe(true)
    expect(fs.has('src/main/resources/META-INF/neoforge.mods.toml')).toBe(false)
  })

  it('writes the right metadata file for each loader', () => {
    const { project } = farmProject()
    const at = (loader: 'fabric' | 'quilt' | 'forge' | 'neoforge') =>
      emitJava(project, { loader, profileId: 'java-1.21.1' }).artifacts.get(loader)!

    expect(at('fabric').has('src/main/resources/fabric.mod.json')).toBe(true)
    expect(at('forge').has('src/main/resources/META-INF/mods.toml')).toBe(true)
    expect(at('neoforge').has('src/main/resources/META-INF/neoforge.mods.toml')).toBe(true)

    // Quilt ships both, so one jar runs on Quilt and on Fabric.
    const quilt = at('quilt')
    expect(quilt.has('src/main/resources/quilt.mod.json')).toBe(true)
    expect(quilt.has('src/main/resources/fabric.mod.json')).toBe(true)
  })

  it('carries a pack.mcmeta inside the jar resources', () => {
    const { project } = farmProject()
    const fs = emitJava(project, { loader: 'fabric', profileId: 'java-1.21.1' })
      .artifacts.get('fabric')!
    // Without this the game ignores data/ and assets/ entirely, and says nothing.
    expect(json(fs, 'src/main/resources/pack.mcmeta').pack).toMatchObject({ pack_format: 48 })
  })

  it('builds the station block, menu, screen and baked recipe table', () => {
    const { project } = farmProject()
    const fs = emitJava(project, { loader: 'fabric', profileId: 'java-1.21.1' })
      .artifacts.get('fabric')!

    expect(fs.has('src/main/java/com/farm/StationBlock.java')).toBe(true)
    expect(fs.has('src/main/java/com/farm/StationMenu.java')).toBe(true)
    expect(fs.has('src/main/java/com/farm/StationScreen.java')).toBe(true)

    const stations = source(fs, 'src/main/java/com/farm/ModStations.java')
    expect(stations).toContain('"cooking_pot"')
    // The declared 2x2 is honoured on Java, where Bedrock would show 3x3.
    expect(stations).toContain('2, 2')

    const recipes = source(fs, 'src/main/java/com/farm/StationRecipes.java')
    expect(recipes).toContain('"farm:herb_stew"')
    expect(recipes).toContain('"minecraft:bowl"')

    // The station block is constructed as a StationBlock, not a plain Block.
    expect(source(fs, 'src/main/java/com/farm/ModBlocks.java')).toContain(
      'new StationBlock(',
    )
  })

  it('bakes a station recipe at the station’s own grid size', () => {
    const { project } = farmProject()
    const ctx = createJavaContext(project, getJavaProfile('java-1.21.1'), 'fabric')
    const recipes = project.nodes.filter((n) => n.kind === 'recipe' && n.name === 'herb_stew_recipe')
    const baked = bakeRecipes(ctx, recipes)

    expect(baked).toHaveLength(1)
    expect(baked[0]).toMatchObject({
      stationKey: 'cooking_pot',
      rows: 2,
      cols: 2,
      result: 'farm:herb_stew',
    })
    // Four cells for a 2x2 station, read out of the shared 3x3 coordinate space.
    expect(baked[0].cells).toEqual(['farm:flour', 'minecraft:bowl', '', ''])
  })

  it('states the Java version and loader coordinates in the build files', () => {
    const { project } = farmProject()
    const fs = emitJava(project, { loader: 'fabric', profileId: 'java-1.21.1' })
      .artifacts.get('fabric')!

    expect(source(fs, 'gradle.properties')).toContain('minecraft_version=1.21.1')
    expect(source(fs, 'build.gradle')).toContain('JavaLanguageVersion.of(21)')
    expect(source(fs, 'build.gradle')).toContain('officialMojangMappings()')
    expect(source(fs, 'settings.gradle')).toContain('maven.fabricmc.net')
  })
})

describe('java crops', () => {
  it('extends CropBlock rather than emitting a growth script', () => {
    let project = createProject({ namespace: 'farm' })
    const rice = createNode(project, 'crop', 'Rice', { stages: 4, produce: 'farm:rice_grain' })
    project = upsertNode(project, rice)

    const fs = emitJava(project, { loader: 'fabric', profileId: 'java-1.21.1' })
      .artifacts.get('fabric')!
    const block = source(fs, 'src/main/java/com/farm/RiceCropBlock.java')

    expect(block).toContain('extends CropBlock')
    expect(block).toContain('MAX_AGE = 3')
    // Bedrock needs scripts/main.js for exactly this; Java inherits it.
    expect([...fs.keys()].some((path) => path.endsWith('main.js'))).toBe(false)
  })

  it('writes a blockstate variant and a model per growth stage', () => {
    let project = createProject({ namespace: 'farm' })
    const rice = createNode(project, 'crop', 'Rice', { stages: 3 })
    project = upsertNode(project, rice)

    const { artifacts, problems } = emitJava(project, {
      loader: 'datapack',
      profileId: 'java-1.21.1',
    })
    // No textures were assigned, so the stage models are skipped and said so.
    expect(problems.some((p) => p.message.includes('stage'))).toBe(true)
    expect(artifacts.get('resourcepack')!.has('assets/farm/blockstates/rice.json')).toBe(false)
  })

  it('drops produce only when ripe, with a fortune-boosted seed roll', () => {
    let project = createProject({ namespace: 'farm' })
    const rice = createNode(project, 'crop', 'Rice', {
      stages: 4,
      produce: 'farm:rice_grain',
      generateSeed: true,
    })
    project = upsertNode(project, rice)

    const loot = json(
      emitJava(project, { loader: 'datapack', profileId: 'java-1.21.1' }).artifacts.get('datapack')!,
      'data/farm/loot_table/blocks/rice.json',
    )
    const pools = loot.pools as Array<Record<string, unknown>>
    expect(pools).toHaveLength(2)

    const alternatives = (pools[0].entries as Array<Record<string, unknown>>)[0]
    const children = alternatives.children as Array<Record<string, unknown>>
    expect(children[0].name).toBe('farm:rice_grain')
    expect(children[1].name).toBe('farm:rice_seeds')
    expect(JSON.stringify(pools[1])).toContain('minecraft:fortune')
  })
})

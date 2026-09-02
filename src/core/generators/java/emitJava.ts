/**
 * ProjectModel -> a complete Java artifact.
 *
 * The Bedrock emitter produces one tree because Bedrock has one answer. Java
 * has two, and they are different products rather than two settings of the same
 * one:
 *
 *   `datapack`  two zips — a data pack and a resource pack — that a player
 *               drops into a world and a folder. No loader, no build, and no
 *               new blocks or items, because a data pack cannot register any.
 *   a loader    a Gradle source project. Everything the data pack had, plus the
 *               Java that actually registers the content, plus the build files.
 *               One `./gradlew build` away from a jar.
 *
 * Both routes reuse the same `data/` and `assets/` files: a mod's
 * `src/main/resources` *is* a data pack, so generating them twice would be
 * generating them wrong. That shared core is what the `emitJavaCommon` split
 * below is for.
 */

import type { EmitProblem } from '../emit'
import type { ProjectModel } from '../../model/types'
import type { VirtualFile, VirtualFs } from '../../vfs/types'
import type { ModLoader } from '../../targets/platforms'
import { getJavaProfile } from '../../targets/javaProfiles'
import type { JavaTargetProfile } from '../../targets/javaProfiles'
import { createJavaContext } from './context'
import type { JavaContext } from './context'
import { collectRecipeProblems } from './validate'
import { collectLang, emitLootTables, emitRecipes, emitTags, langFileFor } from './datapack'
import { biomeModifierFiles, emitWorldgen } from './worldgen'
import { emitResources, packMeta } from './resources'
import { emitSources } from './sources'
import { emitStations } from './station'
import { emitBuildFiles } from './build'

export interface JavaEmitResult {
  /** One tree per artifact this route produces, keyed by artifact name. */
  artifacts: Map<string, VirtualFs>
  problems: EmitProblem[]
}

export interface JavaEmitOptions {
  loader: ModLoader
  profileId: string
}

/** Adds a file to a tree, reporting a collision rather than silently winning. */
function put(fs: VirtualFs, file: VirtualFile, problems: EmitProblem[]): void {
  if (fs.has(file.path)) {
    problems.push({
      severity: 'error',
      path: file.path,
      message: `Two pieces of content both want to write ${file.path}. Rename one of them.`,
    })
    return
  }
  fs.set(file.path, file)
}

/**
 * The files both routes share: the data pack, the resource pack and the
 * language file. Returned flat, without a root prefix, because the two routes
 * mount them at different places.
 */
function emitJavaCommon(ctx: JavaContext): { data: VirtualFile[]; assets: VirtualFile[] } {
  collectLang(ctx)

  const { files: recipeFiles } = emitRecipes(ctx)
  const worldgen = emitWorldgen(ctx)

  const data: VirtualFile[] = [
    ...recipeFiles,
    ...emitLootTables(ctx),
    ...emitTags(ctx),
    ...worldgen.files,
    ...biomeModifierFiles(ctx, worldgen.placements),
  ]

  const assets: VirtualFile[] = [...emitResources(ctx)]
  const lang = langFileFor(ctx)
  if (lang) assets.push(lang)

  // Textures are registered during `emitResources`, so this has to run after it.
  for (const [path, assetId] of ctx.usedAssets) {
    assets.push({ path, origin: { label: 'Texture' }, body: { type: 'asset', assetId } })
  }

  return { data, assets }
}

export function emitJava(project: ProjectModel, options: JavaEmitOptions): JavaEmitResult {
  const profile = getJavaProfile(options.profileId)
  return options.loader === 'datapack'
    ? emitDataPackRoute(project, profile)
    : emitModRoute(project, profile, options.loader)
}

/**
 * The no-loader route: two zips, nothing to compile.
 *
 * Both halves are produced even when one is nearly empty, because a resource
 * pack with no data pack (or the other way round) is a support question waiting
 * to happen — a player who is handed one file assumes that is all there is.
 */
function emitDataPackRoute(project: ProjectModel, profile: JavaTargetProfile): JavaEmitResult {
  const ctx = createJavaContext(project, profile, 'datapack')
  const { data, assets } = emitJavaCommon(ctx)

  const dataPack: VirtualFs = new Map()
  const resourcePack: VirtualFs = new Map()

  put(dataPack, packMeta(ctx, 'data'), ctx.problems)
  for (const file of data) put(dataPack, file, ctx.problems)

  put(resourcePack, packMeta(ctx, 'resource'), ctx.problems)
  for (const file of assets) put(resourcePack, file, ctx.problems)

  ctx.problems.push(...collectRecipeProblems(ctx))

  // The one thing a player has to be told, rather than discovering in game.
  const registrable = project.nodes.filter(
    (node) => node.kind === 'block' || node.kind === 'item' || node.kind === 'crop' || node.kind === 'entity',
  )
  if (registrable.length > 0) {
    ctx.problems.push({
      severity: 'warning',
      message: `${registrable.length} pieces of content need a mod loader and are not in this data pack: Java data packs cannot register new blocks, items or entities. Export a Fabric, Quilt, Forge or NeoForge target to include them.`,
    })
  }

  return {
    artifacts: new Map([
      ['datapack', dataPack],
      ['resourcepack', resourcePack],
    ]),
    problems: ctx.problems,
  }
}

/** The loader route: one Gradle project holding everything. */
function emitModRoute(
  project: ProjectModel,
  profile: JavaTargetProfile,
  loader: Exclude<ModLoader, 'datapack'>,
): JavaEmitResult {
  const ctx = createJavaContext(project, profile, loader)

  // Recipes have to be split before the sources are written: a recipe made at
  // one of the project's own stations is not a data pack file at all, it is a
  // row in the station's baked matcher.
  const { files: recipeFiles, stationRecipes } = emitRecipes(ctx)
  const stations = emitStations(ctx, stationRecipes)
  const sources = emitSources(ctx, stations.stationBlocks)

  collectLang(ctx)
  const worldgen = emitWorldgen(ctx)

  const fs: VirtualFs = new Map()
  const resources = 'src/main/resources'

  for (const file of [
    ...recipeFiles,
    ...emitLootTables(ctx),
    ...emitTags(ctx),
    ...worldgen.files,
    ...biomeModifierFiles(ctx, worldgen.placements),
  ]) {
    put(fs, { ...file, path: `${resources}/${file.path}` }, ctx.problems)
  }

  for (const file of emitResources(ctx)) {
    put(fs, { ...file, path: `${resources}/${file.path}` }, ctx.problems)
  }

  const lang = langFileFor(ctx)
  if (lang) put(fs, { ...lang, path: `${resources}/${lang.path}` }, ctx.problems)

  for (const [path, assetId] of ctx.usedAssets) {
    put(
      fs,
      { path: `${resources}/${path}`, origin: { label: 'Texture' }, body: { type: 'asset', assetId } },
      ctx.problems,
    )
  }

  // A mod jar carries a pack.mcmeta too — without it the game refuses to load
  // the data and assets inside, which is a silent and very confusing failure.
  put(fs, { ...packMeta(ctx, 'data'), path: `${resources}/pack.mcmeta` }, ctx.problems)

  for (const file of [...stations.files, ...sources.files]) put(fs, file, ctx.problems)
  for (const file of emitBuildFiles(ctx, loader, sources.mainClass)) put(fs, file, ctx.problems)

  ctx.problems.push(...collectRecipeProblems(ctx))

  return { artifacts: new Map([[loader, fs]]), problems: ctx.problems }
}

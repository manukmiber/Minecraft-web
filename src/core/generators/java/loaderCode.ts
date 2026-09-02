/**
 * What each loader calls the same thing.
 *
 * "Fabric versus the Forge family" is the shape most multi-loader mods take,
 * and it is almost right — but not quite, and the exception bites. Forge and
 * NeoForge are the same design and different packages: Forge stayed on
 * `net.minecraftforge.*` and hands you a `RegistryObject`, while NeoForge moved
 * to `net.neoforged.*` with a `DeferredHolder`. And the split is version-
 * dependent, because NeoForge 20.1 predates its own rename and is still
 * Forge-shaped down to the package name.
 *
 * So the mapping is a function of *both* the loader and the Minecraft version,
 * which is exactly what this file is. Everything downstream reads these
 * fragments instead of testing which loader it is generating for, so adding a
 * fifth loader later is one entry here.
 */

import type { ModLoader } from '../../targets/platforms'
import type { JavaTargetProfile } from '../../targets/javaProfiles'

export type LoaderFamily = 'fabric' | 'forge' | 'neoforge'

export interface LoaderCode {
  family: LoaderFamily
  /** Root package of the loader's own API, for everything below. */
  api: string
  /** Import lines a registry-holding class needs. */
  registryImports: string[]
  /** `DeferredHolder<Item, Item>` on NeoForge, `RegistryObject<Item>` on Forge. */
  holderType(registryType: string, valueType: string): string
  /** Imports the `@Mod` entry class needs. */
  modImports: string[]
  /** The entry class's constructor signature and body prelude. */
  modConstructor(className: string): { signature: string; busExpression: string }
  /** Imports the client-setup class needs. */
  clientImports: string[]
  /** The annotation that subscribes a class to the mod event bus, client only. */
  clientAnnotation(modIdExpression: string): string
}

const FABRIC: LoaderCode = {
  family: 'fabric',
  api: 'net.fabricmc',
  registryImports: [],
  holderType: (_registry, value) => `Supplier<${value}>`,
  modImports: ['net.fabricmc.api.ModInitializer'],
  modConstructor: () => ({ signature: '', busExpression: '' }),
  clientImports: ['net.fabricmc.api.ClientModInitializer'],
  clientAnnotation: () => '',
}

/**
 * Forge, and NeoForge 20.1 — which had not renamed its packages yet, so the two
 * are genuinely the same target.
 */
const FORGE: LoaderCode = {
  family: 'forge',
  api: 'net.minecraftforge',
  registryImports: [
    'net.minecraftforge.registries.DeferredRegister',
    'net.minecraftforge.registries.RegistryObject',
  ],
  holderType: (_registry, value) => `RegistryObject<${value}>`,
  modImports: ['net.minecraftforge.fml.common.Mod', 'net.minecraftforge.eventbus.api.IEventBus',
    'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext'],
  modConstructor: (className) => ({
    // Forge constructs the mod with no arguments and expects the bus to be
    // fetched from the loading context, unlike NeoForge which passes it in.
    signature: `public ${className}()`,
    busExpression: 'IEventBus modBus = FMLJavaModLoadingContext.get().getModEventBus();',
  }),
  clientImports: [
    'net.minecraftforge.api.distmarker.Dist',
    'net.minecraftforge.eventbus.api.SubscribeEvent',
    'net.minecraftforge.fml.common.Mod',
    'net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent',
  ],
  clientAnnotation: (modId) =>
    `@Mod.EventBusSubscriber(modid = ${modId}, bus = Mod.EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)`,
}

/** NeoForge from 1.20.2 onwards, after the package rename. */
const NEOFORGE: LoaderCode = {
  family: 'neoforge',
  api: 'net.neoforged',
  registryImports: [
    'net.neoforged.neoforge.registries.DeferredRegister',
    'net.neoforged.neoforge.registries.DeferredHolder',
  ],
  holderType: (registry, value) => `DeferredHolder<${registry}, ${value}>`,
  modImports: ['net.neoforged.fml.common.Mod', 'net.neoforged.bus.api.IEventBus'],
  modConstructor: (className) => ({
    signature: `public ${className}(IEventBus modBus)`,
    busExpression: '',
  }),
  clientImports: [
    'net.neoforged.api.distmarker.Dist',
    'net.neoforged.bus.api.SubscribeEvent',
    'net.neoforged.fml.common.EventBusSubscriber',
    'net.neoforged.fml.event.lifecycle.FMLClientSetupEvent',
  ],
  clientAnnotation: (modId) =>
    `@EventBusSubscriber(modid = ${modId}, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)`,
}

export function loaderCode(loader: ModLoader, profile: JavaTargetProfile): LoaderCode {
  if (loader === 'fabric' || loader === 'quilt') return FABRIC
  if (loader === 'forge') return FORGE
  if (loader === 'neoforge') {
    // NeoForge 20.1 is pre-rename and indistinguishable from Forge at the
    // source level; the metadata file name is the giveaway.
    return profile.loaders.neoforge?.metadataPath === 'META-INF/mods.toml' ? FORGE : NEOFORGE
  }
  // The data pack route generates no Java at all, but a descriptor keeps the
  // callers total rather than needing a null check they cannot act on.
  return FABRIC
}

/** Convenience: true when this loader's generated code is the Fabric dialect. */
export function isFabricFamily(loader: ModLoader): boolean {
  return loader === 'fabric' || loader === 'quilt'
}

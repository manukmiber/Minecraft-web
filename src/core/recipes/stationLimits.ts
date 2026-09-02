/**
 * What a custom crafting station can and cannot be, per platform.
 *
 * A custom station is the clearest case in the whole builder of the two
 * platforms not being equivalent, so the rules are gathered in one file instead
 * of being scattered between a validator, a tooltip and a paragraph of prose.
 *
 * **Bedrock.** There is exactly one mechanism: give a block the
 * `minecraft:crafting_table` component and it opens a crafting screen. That is
 * the whole feature. The screen it opens is the vanilla 3x3 grid — you cannot
 * change the slot count, the arrangement, the background, the title bar beyond
 * its text, or add a progress bar, a fuel slot or an energy meter. There is no
 * "custom container" in the data-driven API at all. Recipes reach the station
 * by carrying a matching entry in their `tags`, and that tag matching is the
 * only knob there is.
 *
 * **Java, with a mod loader.** A station is an `AbstractContainerMenu` plus an
 * `AbstractContainerScreen`, both of which are ordinary classes. The grid can be
 * any shape, the background is your own texture, and the matching logic is
 * whatever you write. The builder generates all of it.
 *
 * **Java, data pack only.** Neither: a new station is a new block *and* a new
 * screen, and a data pack can register neither.
 *
 * The numbers below come from the Bedrock block component schema; the builder
 * enforces them at author time rather than letting the game reject the pack.
 */

import type { Platform } from '../targets/platforms'

export const BEDROCK_CRAFTING_TABLE_LIMITS = {
  /** `crafting_tags` accepts at most this many entries. */
  maxTags: 64,
  /** Each entry in `crafting_tags` is capped at this many characters. */
  maxTagLength: 64,
  /** The screen the component opens is always this size. Not configurable. */
  screenRows: 3,
  screenCols: 3,
  /** `table_name` is the string drawn at the top of that screen. */
  maxTableNameLength: 64,
} as const

/**
 * Vanilla tags. Reusing one is legal and occasionally what you want — it makes
 * your block a second crafting table — but it is almost always a mistake, so
 * the validator warns rather than staying quiet.
 */
export const VANILLA_CRAFTING_TAGS = [
  'crafting_table',
  'furnace',
  'blast_furnace',
  'smoker',
  'campfire',
  'soul_campfire',
  'stonecutter',
  'brewing_stand',
  'anvil',
  'cartography_table',
  'grindstone',
  'loom',
  'smithing_table',
] as const

export interface TagProblem {
  severity: 'error' | 'warning'
  message: string
}

/**
 * Checks one crafting tag against the Bedrock schema.
 *
 * Returns the first problem rather than a list: the field shows one line, and
 * fixing the first problem usually reveals whether there is a second.
 */
export function validateCraftingTag(tag: string): TagProblem | null {
  const trimmed = tag.trim()
  if (!trimmed) {
    return { severity: 'error', message: 'A station needs a crafting tag before recipes can reach it.' }
  }
  if (trimmed.length > BEDROCK_CRAFTING_TABLE_LIMITS.maxTagLength) {
    return {
      severity: 'error',
      message: `Too long — Bedrock caps a crafting tag at ${BEDROCK_CRAFTING_TABLE_LIMITS.maxTagLength} characters.`,
    }
  }
  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
    return {
      severity: 'error',
      message:
        'Use lowercase letters, digits and underscores, starting with a letter. Spaces and capitals are not matched reliably.',
    }
  }
  if ((VANILLA_CRAFTING_TAGS as readonly string[]).includes(trimmed)) {
    return {
      severity: 'warning',
      message: `"${trimmed}" is a vanilla tag, so every vanilla recipe made at that station will also be craftable here.`,
    }
  }
  return null
}

/** Checks the whole tag list, including the count cap. */
export function validateCraftingTags(tags: string[]): TagProblem | null {
  if (tags.length > BEDROCK_CRAFTING_TABLE_LIMITS.maxTags) {
    return {
      severity: 'error',
      message: `Bedrock accepts at most ${BEDROCK_CRAFTING_TABLE_LIMITS.maxTags} crafting tags on one block.`,
    }
  }
  const seen = new Set<string>()
  for (const tag of tags) {
    const problem = validateCraftingTag(tag)
    if (problem) return problem
    if (seen.has(tag.trim())) {
      return { severity: 'warning', message: `"${tag.trim()}" is listed twice.` }
    }
    seen.add(tag.trim())
  }
  return null
}

export interface StationLimitation {
  id: string
  /** Platforms the limitation applies to. */
  platforms: Platform[]
  /** True when the builder works around it, false when you simply cannot have it. */
  workaround: string | null
  headline: string
  detail: string
}

/**
 * The honest list. Every entry here is something someone will otherwise try to
 * do, fail at, and assume was a bug in this builder.
 */
export const STATION_LIMITATIONS: StationLimitation[] = [
  {
    id: 'fixed-grid',
    platforms: ['bedrock'],
    workaround:
      'The builder still lets you declare a smaller recipe shape, and constrains the recipes you author to it — so a 2x2 pot only ever produces 2x2 recipes even though the screen shows nine slots.',
    headline: 'The screen is always the vanilla 3x3 grid',
    detail:
      'minecraft:crafting_table opens the crafting table screen and nothing else. The slot count, their arrangement and the window size are fixed. A two-slot cooking pot and a nine-slot workbench look identical in game.',
  },
  {
    id: 'no-custom-ui',
    platforms: ['bedrock'],
    workaround: null,
    headline: 'No custom background, progress bar or extra slots',
    detail:
      'There is no data-driven way to define a container screen on Bedrock. A fuel slot, a cook-time bar, an energy meter or a second output slot cannot be added — the JSON UI system is not a supported extension point and breaks between versions.',
  },
  {
    id: 'no-recipe-book',
    platforms: ['bedrock'],
    workaround:
      'Give the recipe an "Unlocked by" entry so it is at least discoverable, and document the station in your pack description.',
    headline: 'The recipe book does not list custom-tag recipes',
    detail:
      'The recipe book only knows about vanilla tags. A recipe tagged for your own station is craftable but never suggested, so players have to be told the pattern.',
  },
  {
    id: 'no-cooking',
    platforms: ['bedrock'],
    workaround:
      'Model a cooking station on the furnace family instead — those accept custom recipes through the vanilla furnace tags, at the cost of using the vanilla furnace screen.',
    headline: 'A custom station cannot smelt or cook',
    detail:
      'minecraft:recipe_furnace only matches the vanilla furnace-family tags. A custom tag on a furnace recipe is ignored, so there is no way to make your own block cook over time.',
  },
  {
    id: 'no-persistence',
    platforms: ['bedrock'],
    workaround: null,
    headline: 'Nothing is stored in the block',
    detail:
      'Like the vanilla crafting table, ingredients left in the grid are returned to the player when the screen closes. The block has no inventory of its own and no way to gain one.',
  },
  {
    id: 'no-craft-event',
    platforms: ['bedrock'],
    workaround:
      'Watch the player’s inventory from a script instead, which is approximate but usually good enough for a quest trigger.',
    headline: 'No script event fires when something is crafted here',
    detail:
      'The Script API exposes block components and player interaction, but not a "crafted at this station" event, so bespoke crafting side-effects are out of reach.',
  },
  {
    id: 'datapack-none',
    platforms: ['java'],
    workaround:
      'Export the Fabric, Quilt, Forge or NeoForge target instead — those carry a real station.',
    headline: 'A Java data pack cannot have a custom station at all',
    detail:
      'A station is a new block plus a new container screen. Data packs register neither, so the data-pack export simply omits the station and keeps the recipes that target vanilla stations.',
  },
]

export function limitationsFor(platform: Platform): StationLimitation[] {
  return STATION_LIMITATIONS.filter((limit) => limit.platforms.includes(platform))
}

/**
 * What the Java mod export gains over Bedrock, for the same declared station.
 * Kept beside the limitations so the comparison is in one place.
 */
export const JAVA_STATION_CAPABILITIES = [
  'The grid is exactly the size you declared — a 2x2 pot shows four slots, not nine.',
  'The screen has its own background texture, drawn from the station block’s own PNG.',
  'The window title is the block’s display name, translated through the same lang file.',
  'Recipes are matched by generated Java rather than by tag, so two stations never collide.',
  'Shapeless and shaped matching both work, including mirrored placement for shaped recipes.',
] as const

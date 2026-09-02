# Custom crafting stations

You want a cooking pot. Not a furnace with a different texture — a block with
its own screen, its own recipes, and a name at the top of the window.

You can have that. On Java you can have exactly that. On Bedrock you can have
something that *works* but looks like a crafting table, and the gap between
those two sentences is what this document is about.

---

## Bedrock: one mechanism, and a ceiling

There is exactly one way to make a custom crafting station on Bedrock. Give a
block the `minecraft:crafting_table` component:

```json
{
  "format_version": "1.26.40",
  "minecraft:block": {
    "description": { "identifier": "mmm:cooking_pot" },
    "components": {
      "minecraft:crafting_table": {
        "table_name": "Cooking Pot",
        "crafting_tags": ["cooking_pot"]
      }
    }
  }
}
```

Right-click the block, a crafting screen opens. Any recipe carrying
`cooking_pot` in its `tags` can be made there and nowhere else. That works, it
is stable, and it is genuinely useful.

It is also the whole feature. Here is what you cannot do, all of it, so you can
stop looking:

### The screen is always the vanilla 3×3 grid

Not "3×3 by default" — always. The slot count, their arrangement and the window
size are fixed. A two-slot cooking pot and a nine-slot workbench are
pixel-identical in game.

The builder still lets you declare a smaller recipe shape, and constrains the
recipes you author to it, so a 2×2 pot only ever produces 2×2 recipes. That is
a design aid, not a visual one: the player still sees nine slots.

### No custom background, progress bar or extra slots

There is no data-driven way to define a container screen on Bedrock. A fuel
slot, a cook-time bar, an energy meter, a second output slot, a tabbed
interface — none of these can be added. The JSON UI system is not a supported
extension point and breaks between versions; treating it as one is how packs
end up broken by a Tuesday update.

### The recipe book does not list your recipes

The recipe book only knows vanilla tags. A recipe tagged for your own station is
craftable but never suggested, so players have to be told the pattern. Give the
recipe an **Unlocked by** entry so it is at least discoverable, and document the
station in your pack description — that is the whole mitigation available.

### A custom station cannot smelt or cook over time

`minecraft:recipe_furnace` only matches the vanilla furnace-family tags. A
custom tag on a furnace recipe is ignored outright. There is no way to make your
own block cook something over time.

If you want cooking, model it on the furnace family instead — those accept
custom recipes through the vanilla furnace tags. The cost is that you get the
vanilla furnace screen, and your block is not the station; the furnace is.

### Nothing is stored in the block

Like the vanilla crafting table, ingredients left in the grid come back to the
player when the screen closes. The block has no inventory of its own and no way
to gain one.

### No script event fires when something is crafted there

The Script API exposes block components and player interaction, but not a
"crafted at this station" event. Bespoke crafting side-effects — a quest
trigger, an advancement, a sound — are out of reach. Watching the player's
inventory from a script is the approximation, and it is approximate.

### The numbers

| Limit | Value |
|---|---|
| Entries in `crafting_tags` | 64 |
| Characters per tag | 64 |
| Screen size | 3×3, fixed |
| `table_name` length | 64 |

The builder enforces these while you type. A tag has to be lowercase letters,
digits and underscores starting with a letter — spaces and capitals are not
matched reliably — and reusing a vanilla tag like `crafting_table` warns you,
because it silently makes your block a second crafting table with every vanilla
recipe available at it. Occasionally that is what you want, which is why it is a
warning and not an error.

---

## Java: the ceiling is not there

On Java a crafting station is an `AbstractContainerMenu` and an
`AbstractContainerScreen`, both of which are ordinary classes you write. The
grid can be any shape. The background is your own texture. The matching logic is
whatever you code. None of that is a special capability — it is just what having
code available means.

The mod export generates all of it:

| File | What it does |
|---|---|
| `StationBlock.java` | Opens the menu on right-click. Stateless, like the vanilla crafting table. |
| `StationMenu.java` | The container: your declared grid size, a result slot, the player's inventory, and shift-click handling. |
| `StationScreen.java` | The screen. Slots centred inside the vanilla crafting frame. |
| `StationRecipes.java` | Every station recipe, baked in, with shaped, shapeless and mirrored matching. |
| `ModStations.java` | One `MenuType` per station. |

So the same cooking pot, exported to Fabric, shows **four slots** because you
said 2×2 — not nine with five of them decorative.

### Two design decisions in the generated code

**One `MenuType` per station.** The alternative is one shared type plus a
network payload naming which station was opened, which drags in codec APIs that
moved between the Minecraft versions this builder targets. The set of stations
is fixed at export time, so a type each is simpler and cheaper.

**Recipes are baked into a class, not read from the data pack.** A data-pack
recipe has to name a registered recipe type, and a custom station's type would
be a class the builder must write twice over — Java's recipe API was rewritten
between 1.20.1 and 1.21 (`Recipe<Container>` became `Recipe<RecipeInput>`,
serializers moved to codecs). Matching item identifiers in a static table needs
neither implementation.

The consequence, and it is a real one: **editing a station recipe means
re-exporting**, not editing a JSON file inside the jar. Recipes for *vanilla*
stations are still ordinary data-pack files and can be edited in place.

### What is still yours

The screen reuses the vanilla crafting table background
(`minecraft:textures/gui/container/crafting_table.png`). Generating a bespoke
GUI texture is possible but would be artwork nobody asked for, so a smaller grid
is centred inside the vanilla frame — visibly a smaller station. To use your
own, swap `BACKGROUND` in `StationScreen.java` and drop the PNG in
`assets/<modid>/textures/gui/`.

### Java data packs: no stations at all

A station is a new block *and* a new container screen. A data pack registers
neither. The data-pack export omits your stations entirely and keeps only the
recipes targeting vanilla stations — and tells you which recipes it dropped.

---

## Side by side

| | Bedrock | Java data pack | Java mod |
|---|---|---|---|
| Custom station exists | Yes | **No** | Yes |
| Grid size you declared | No — always 3×3 | — | **Yes** |
| Custom background | No | — | Yes |
| Progress bar / fuel slot | No | — | Yes, if you write it |
| Recipe book support | No | — | Yes, if you write it |
| Cooking over time | No | — | Yes, if you write it |
| Stored inventory | No | — | Yes, if you write it |
| Craft event hook | No | — | Yes |
| Works without compiling | **Yes** | — | No |

That last row is why Bedrock's limits are worth accepting rather than working
around. A Bedrock station is less capable and it installs by double-clicking a
file on a phone.

---

## Building one

1. **Content → New → Block.** Give it a name and a texture.
2. Under **Advanced**, turn on **Works as a crafting station**.
3. Set a **Crafting tag** — `cooking_pot`. This is what recipes carry, so it has
   to be unique to this station.
4. Optionally **Also accepts**: extra tags the station answers to. Adding
   `crafting_table` makes the block double as a workbench.
5. Optionally a **Screen title**, if the window should not say the block's name.
6. Set **Recipe rows** and **Recipe columns**. On Bedrock this constrains the
   recipes you can author; on Java it is the screen you get.

The station appears as its own tab in the Recipe builder the moment the tag is
set. Drag ingredients onto its grid, drop the result in the output slot, and the
pattern, the key map and the tags are worked out for you.

### One thing to check before you ship

Open **Compatibility** and look at the *Custom crafting stations* row. If you
are exporting a Java data pack it will tell you the station is being dropped —
which is fine if the recipes you care about are crafting-table recipes, and a
problem if they are not. Better to know before someone else installs it.

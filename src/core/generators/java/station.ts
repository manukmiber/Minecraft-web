/**
 * Custom crafting stations, Java side — the whole feature, in code.
 *
 * On Bedrock a custom station is one component (`minecraft:crafting_table`) and
 * a hard ceiling: the screen it opens is the vanilla 3x3 grid, always, and no
 * amount of JSON changes that. `core/recipes/stationLimits.ts` lists what that
 * rules out. Java has no such ceiling, but it also has no shortcut — a station
 * is a block, a menu, a screen and a matcher, all of which have to be written.
 * So this file writes them.
 *
 * Three decisions worth knowing about, because they are the difference between
 * a generator that works and one that almost works:
 *
 *   **One MenuType per station.** The alternative is a single shared type plus
 *   a network payload carrying which station was opened, which drags in
 *   version-specific codec APIs for no benefit. Baking the station into its own
 *   type means the client already knows what it is opening.
 *
 *   **Recipes are baked into the class, not read from the data pack.** Java's
 *   recipe API was rewritten between the versions this builder targets —
 *   `Recipe<Container>` became `Recipe<RecipeInput>`, serializers moved to
 *   codecs — so a generated custom recipe type would need two incompatible
 *   implementations. A plain static table matching on item identifiers needs
 *   none, and a station's recipes are fixed at build time anyway.
 *
 *   **The vanilla crafting table background is reused.** Generating a bespoke
 *   GUI PNG is possible but would be a texture nobody asked for; the slots are
 *   positioned inside the vanilla frame instead, centred for grids smaller than
 *   3x3.
 */

import type { ContentNode } from '../../model/types'
import type { VirtualFile } from '../../vfs/types'
import { num, str } from '../../kinds/shared'
import { gridCellIndexes, resolveStation, stationFromBlock } from '../../recipes/stations'
import type { CraftingStation } from '../../recipes/stations'
import type { JavaContext } from './context'
import { packagePath, pascalCase, rootPackage, toJavaIdentifier } from './ids'
import { isFabricFamily, loaderCode } from './loaderCode'

/** The vanilla crafting table GUI is 176x166 with its grid at (30, 17). */
const GUI_WIDTH = 176
const GUI_HEIGHT = 166
const GRID_ORIGIN_X = 30
const GRID_ORIGIN_Y = 17
const SLOT_PITCH = 18

function lit(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function javaFile(pkg: string, className: string, body: string): VirtualFile {
  return {
    path: `src/main/java/${packagePath(pkg)}/${className}.java`,
    origin: { label: `Java · ${className}` },
    body: { type: 'text', value: body },
  }
}

export interface BakedRecipe {
  stationKey: string
  shapeless: boolean
  rows: number
  cols: number
  /** rows*cols entries, row-major, empty string for a blank slot. */
  cells: string[]
  result: string
  count: number
}

export interface StationOutput {
  files: VirtualFile[]
  /** Blocks that turned out to be stations, so ModBlocks constructs them right. */
  stationBlocks: ContentNode[]
}

/** Every station this project defines, as (block node, station) pairs. */
export function projectStations(ctx: JavaContext): Array<{ node: ContentNode; station: CraftingStation }> {
  const out: Array<{ node: ContentNode; station: CraftingStation }> = []
  for (const node of ctx.project.nodes.filter((n) => n.kind === 'block')) {
    const station = stationFromBlock(ctx.project, node.id)
    if (station) out.push({ node, station })
  }
  return out
}

/** Turns the recipes made at project stations into the baked table. */
export function bakeRecipes(ctx: JavaContext, recipes: ContentNode[]): BakedRecipe[] {
  const baked: BakedRecipe[] = []

  for (const node of recipes) {
    const { station } = resolveStation(ctx.project, node.data)
    if (!station.blockNodeId || station.layout.kind !== 'grid') continue

    const target = ctx.project.nodes.find((n) => n.id === station.blockNodeId)
    if (!target) continue

    const raw = Array.isArray(node.data.grid) ? (node.data.grid as unknown[]) : []
    const { rows, cols } = station.layout
    const cells = gridCellIndexes(station.layout).map((index) => {
      const cell = raw[index]
      return typeof cell === 'string' && cell.trim()
        ? toJavaIdentifier(ctx.project, cell.trim())
        : ''
    })
    if (cells.every((cell) => cell === '')) continue

    baked.push({
      stationKey: target.name,
      shapeless: str(node.data, 'recipeType', 'shaped') === 'shapeless',
      rows,
      cols,
      cells,
      result: toJavaIdentifier(ctx.project, str(node.data, 'result').trim()),
      count: Math.max(1, Math.round(num(node.data, 'resultCount', 1))),
    })
  }

  return baked
}

export function emitStations(
  ctx: JavaContext,
  stationRecipes: ContentNode[],
): StationOutput {
  const pkg = rootPackage(ctx.project)
  const stations = projectStations(ctx)
  const baked = bakeRecipes(ctx, stationRecipes)

  // Recipes made at a station whose block was deleted have nowhere to go.
  for (const recipe of stationRecipes) {
    const { station } = resolveStation(ctx.project, recipe.data)
    if (!station.blockNodeId) {
      ctx.warn(
        `Recipe "${recipe.displayName}" is made at a station that no longer exists, so the Java export omits it.`,
        recipe.id,
      )
    }
  }

  const files: VirtualFile[] = [
    emitStationBlock(ctx, pkg),
    emitStationMenu(pkg),
    emitStationRecipes(ctx, pkg, baked),
    emitModStations(ctx, pkg, stations),
    emitStationScreen(ctx, pkg),
    emitClientEntry(ctx, pkg, stations),
  ]

  return { files, stationBlocks: stations.map((entry) => entry.node) }
}

// -- the block ---------------------------------------------------------------

function emitStationBlock(ctx: JavaContext, pkg: string): VirtualFile {
  const { blockUse, openMenu } = ctx.profile.api
  const open = openMenu(ctx.loader)
  const extraImports = open.imports.map((name) => `import ${name};`).join('\n')

  const body = `package ${pkg};

import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
${extraImports}

/**
 * A block that opens one of this add-on's crafting stations.
 *
 * Deliberately stateless, exactly like the vanilla crafting table: the grid
 * belongs to the open screen, not to the block, so nothing has to be saved and
 * nothing is lost when the world unloads. Ingredients left in the grid are
 * returned to the player when the menu closes.
 *
 * Generated by the add-on builder.
 */
public class StationBlock extends Block {
    /** Which station this block opens, matched against ModStations. */
    private final String stationKey;

    public StationBlock(Properties properties, String stationKey) {
        super(properties);
        this.stationKey = stationKey;
    }

    public String stationKey() {
        return this.stationKey;
    }

    @Override
    ${blockUse.signature} {
        if (level.isClientSide()) {
            return InteractionResult.SUCCESS;
        }

        ModStations.Definition definition = ModStations.get(this.stationKey);
        if (definition == null) {
            return ${blockUse.superCall};
        }

        SimpleMenuProvider provider = new SimpleMenuProvider(
                (containerId, inventory, ignored) -> new StationMenu(
                        containerId,
                        inventory,
                        ContainerLevelAccess.create(level, pos),
                        definition),
                Component.translatable(definition.titleKey()));

        ${open.statement};
        return InteractionResult.CONSUME;
    }
}
`
  return javaFile(pkg, 'StationBlock', body)
}

// -- the menu ----------------------------------------------------------------

function emitStationMenu(pkg: string): VirtualFile {
  const body = `package ${pkg};

import net.minecraft.world.Container;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

/**
 * The container behind a custom station.
 *
 * Slot order is load-bearing and matches what StationScreen draws: the
 * ingredient grid first, row by row, then the single result slot, then the
 * player's inventory and hotbar. quickMoveStack below indexes into that order
 * directly, so inserting a slot anywhere but the end means fixing it too.
 *
 * Generated by the add-on builder.
 */
public class StationMenu extends AbstractContainerMenu {
    private final ContainerLevelAccess access;
    private final Player player;
    private final ModStations.Definition definition;
    private final SimpleContainer input;
    private final SimpleContainer result = new SimpleContainer(1);

    public StationMenu(
            int containerId,
            Inventory inventory,
            ContainerLevelAccess access,
            ModStations.Definition definition) {
        // The menu reads its own type off the definition rather than being
        // handed one, so there is a single place a station's type is bound and
        // no way for the two to disagree.
        super(definition.menuType().get(), containerId);
        this.access = access;
        this.player = inventory.player;
        this.definition = definition;
        this.input = new SimpleContainer(definition.rows() * definition.cols());

        int gridOriginX = ${GRID_ORIGIN_X} + (3 - definition.cols()) * ${SLOT_PITCH / 2};
        int gridOriginY = ${GRID_ORIGIN_Y} + (3 - definition.rows()) * ${SLOT_PITCH / 2};

        for (int row = 0; row < definition.rows(); row++) {
            for (int col = 0; col < definition.cols(); col++) {
                this.addSlot(new Slot(
                        this.input,
                        row * definition.cols() + col,
                        gridOriginX + col * ${SLOT_PITCH},
                        gridOriginY + row * ${SLOT_PITCH}) {
                    @Override
                    public void setChanged() {
                        super.setChanged();
                        StationMenu.this.recalculate();
                    }
                });
            }
        }

        // The result slot takes nothing and, when emptied, consumes one of each
        // ingredient — the same contract the vanilla crafting result has.
        this.addSlot(new Slot(this.result, 0, 124, 35) {
            @Override
            public boolean mayPlace(ItemStack stack) {
                return false;
            }

            @Override
            public void onTake(Player taker, ItemStack taken) {
                StationMenu.this.consumeIngredients();
                super.onTake(taker, taken);
            }
        });

        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                this.addSlot(new Slot(inventory, col + row * 9 + 9, 8 + col * 18, 84 + row * 18));
            }
        }
        for (int col = 0; col < 9; col++) {
            this.addSlot(new Slot(inventory, col, 8 + col * 18, 142));
        }

        this.recalculate();
    }

    private int gridSlotCount() {
        return this.definition.rows() * this.definition.cols();
    }

    private void recalculate() {
        String[] cells = new String[this.gridSlotCount()];
        for (int i = 0; i < cells.length; i++) {
            cells[i] = StationRecipes.identifierOf(this.input.getItem(i));
        }
        ItemStack match = StationRecipes.match(this.definition.key(), cells, this.definition.rows(), this.definition.cols());
        this.result.setItem(0, match);
        this.broadcastChanges();
    }

    private void consumeIngredients() {
        for (int i = 0; i < this.gridSlotCount(); i++) {
            ItemStack stack = this.input.getItem(i);
            if (!stack.isEmpty()) {
                stack.shrink(1);
            }
        }
        this.recalculate();
    }

    @Override
    public boolean stillValid(Player who) {
        return this.access.evaluate(
                (level, pos) -> who.distanceToSqr(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5) <= 64.0,
                true);
    }

    @Override
    public void removed(Player who) {
        super.removed(who);
        // Nothing is stored in the block, so whatever is still in the grid goes
        // back to the player rather than quietly disappearing.
        this.access.execute((level, pos) -> this.clearContainer(who, this.input));
    }

    @Override
    public ItemStack quickMoveStack(Player who, int index) {
        int gridEnd = this.gridSlotCount();
        int resultIndex = gridEnd;
        int inventoryStart = gridEnd + 1;
        int inventoryEnd = inventoryStart + 36;

        Slot slot = this.slots.get(index);
        if (!slot.hasItem()) {
            return ItemStack.EMPTY;
        }

        ItemStack stack = slot.getItem();
        ItemStack original = stack.copy();

        if (index == resultIndex) {
            if (!this.moveItemStackTo(stack, inventoryStart, inventoryEnd, true)) {
                return ItemStack.EMPTY;
            }
            slot.onQuickCraft(stack, original);
        } else if (index < gridEnd) {
            if (!this.moveItemStackTo(stack, inventoryStart, inventoryEnd, true)) {
                return ItemStack.EMPTY;
            }
        } else if (!this.moveItemStackTo(stack, 0, gridEnd, false)) {
            return ItemStack.EMPTY;
        }

        if (stack.isEmpty()) {
            slot.setByPlayer(ItemStack.EMPTY);
        } else {
            slot.setChanged();
        }
        if (stack.getCount() == original.getCount()) {
            return ItemStack.EMPTY;
        }
        slot.onTake(who, stack);
        return original;
    }

    public ModStations.Definition definition() {
        return this.definition;
    }

    public Container inputContainer() {
        return this.input;
    }

    public Player owner() {
        return this.player;
    }
}
`
  return javaFile(pkg, 'StationMenu', body)
}

// -- the recipe table --------------------------------------------------------

function emitStationRecipes(ctx: JavaContext, pkg: string, baked: BakedRecipe[]): VirtualFile {
  const entries = baked
    .map((recipe) => {
      const cells = recipe.cells.map((cell) => (cell ? lit(cell) : 'null')).join(', ')
      return `        RECIPES.add(new Entry(${lit(recipe.stationKey)}, ${recipe.shapeless}, ${recipe.rows}, ${recipe.cols},
                new String[]{${cells}}, ${lit(recipe.result)}, ${recipe.count}));`
    })
    .join('\n')

  const body = `package ${pkg};

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayList;
import java.util.List;

/**
 * Every recipe made at one of this add-on's own stations, baked in at export.
 *
 * These are not data pack recipes and cannot be: a data pack recipe has to name
 * a registered recipe type, and a custom station's type would be a class this
 * builder would have to write twice over, because Java's recipe API was
 * rewritten between the versions supported here. Matching item identifiers in a
 * static table needs neither, and a station's recipes do not change at runtime.
 *
 * The consequence worth knowing: editing these means re-exporting, not editing
 * a JSON file in the jar.
 *
 * Generated by the add-on builder.
 */
public final class StationRecipes {
    public record Entry(
            String station,
            boolean shapeless,
            int rows,
            int cols,
            String[] cells,
            String result,
            int count) {}

    public static final List<Entry> RECIPES = new ArrayList<>();

    static {
${entries || '        // This add-on has no custom-station recipes.'}
    }

    private StationRecipes() {}

    /** The registry identifier of a stack, or null for an empty slot. */
    public static String identifierOf(ItemStack stack) {
        if (stack.isEmpty()) return null;
        return BuiltInRegistries.ITEM.getKey(stack.getItem()).toString();
    }

    /**
     * Finds what the given grid produces at the given station.
     *
     * Shaped recipes are matched at every offset the grid allows and in mirror,
     * which is what makes a recipe placeable anywhere in the grid rather than
     * pinned to the top-left corner — the same behaviour vanilla shaped recipes
     * have, and the thing players notice immediately when it is missing.
     */
    public static ItemStack match(String station, String[] cells, int rows, int cols) {
        for (Entry entry : RECIPES) {
            if (!entry.station().equals(station)) continue;
            boolean matched = entry.shapeless()
                    ? matchesShapeless(entry, cells)
                    : matchesShaped(entry, cells, rows, cols);
            if (matched) {
                return stackOf(entry.result(), entry.count());
            }
        }
        return ItemStack.EMPTY;
    }

    private static boolean matchesShapeless(Entry entry, String[] cells) {
        List<String> wanted = new ArrayList<>();
        for (String cell : entry.cells()) {
            if (cell != null) wanted.add(cell);
        }
        List<String> present = new ArrayList<>();
        for (String cell : cells) {
            if (cell != null) present.add(cell);
        }
        if (wanted.size() != present.size()) return false;
        for (String cell : wanted) {
            if (!present.remove(cell)) return false;
        }
        return true;
    }

    private static boolean matchesShaped(Entry entry, String[] cells, int rows, int cols) {
        int[] bounds = trimmedBounds(entry);
        if (bounds == null) return false;
        int height = bounds[2] - bounds[0] + 1;
        int width = bounds[3] - bounds[1] + 1;
        if (height > rows || width > cols) return false;

        for (int offsetRow = 0; offsetRow <= rows - height; offsetRow++) {
            for (int offsetCol = 0; offsetCol <= cols - width; offsetCol++) {
                if (matchesAt(entry, bounds, cells, rows, cols, offsetRow, offsetCol, false)
                        || matchesAt(entry, bounds, cells, rows, cols, offsetRow, offsetCol, true)) {
                    return true;
                }
            }
        }
        return false;
    }

    /** {minRow, minCol, maxRow, maxCol} of the non-empty part of a recipe. */
    private static int[] trimmedBounds(Entry entry) {
        int minRow = Integer.MAX_VALUE;
        int minCol = Integer.MAX_VALUE;
        int maxRow = -1;
        int maxCol = -1;
        for (int row = 0; row < entry.rows(); row++) {
            for (int col = 0; col < entry.cols(); col++) {
                if (entry.cells()[row * entry.cols() + col] == null) continue;
                minRow = Math.min(minRow, row);
                minCol = Math.min(minCol, col);
                maxRow = Math.max(maxRow, row);
                maxCol = Math.max(maxCol, col);
            }
        }
        return maxRow < 0 ? null : new int[]{minRow, minCol, maxRow, maxCol};
    }

    private static boolean matchesAt(
            Entry entry,
            int[] bounds,
            String[] cells,
            int rows,
            int cols,
            int offsetRow,
            int offsetCol,
            boolean mirrored) {
        int height = bounds[2] - bounds[0] + 1;
        int width = bounds[3] - bounds[1] + 1;

        for (int row = 0; row < rows; row++) {
            for (int col = 0; col < cols; col++) {
                String present = cells[row * cols + col];
                int localRow = row - offsetRow;
                int localCol = col - offsetCol;

                String wanted = null;
                if (localRow >= 0 && localRow < height && localCol >= 0 && localCol < width) {
                    int sourceCol = mirrored ? width - 1 - localCol : localCol;
                    wanted = entry.cells()[(bounds[0] + localRow) * entry.cols() + bounds[1] + sourceCol];
                }

                if (wanted == null ? present != null : !wanted.equals(present)) {
                    return false;
                }
            }
        }
        return true;
    }

    private static ItemStack stackOf(String identifier, int count) {
        ResourceLocation key = ${ctx.profile.api.parseResourceLocation('identifier')};
        Item item = BuiltInRegistries.ITEM.get(key);
        return item == null ? ItemStack.EMPTY : new ItemStack(item, count);
    }
}
`
  return javaFile(pkg, 'StationRecipes', body)
}

// -- the registry ------------------------------------------------------------

function emitModStations(
  ctx: JavaContext,
  pkg: string,
  stations: Array<{ node: ContentNode; station: CraftingStation }>,
): VirtualFile {
  const fabric = isFabricFamily(ctx.loader)
  const code = loaderCode(ctx.loader, ctx.profile)

  const definitions = stations
    .map(({ node, station }) => {
      const layout = station.layout.kind === 'grid' ? station.layout : { rows: 3, cols: 3 }
      const constant = node.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
      return `    public static final Definition ${constant} = define(
            ${lit(node.name)}, ${layout.rows}, ${layout.cols}, ${lit(`block.${ctx.modId}.${node.name}`)});`
    })
    .join('\n\n')

  // The menu type is created as each Definition is built rather than in a
  // separate register() pass. That was a real bug on the Forge family: a
  // DeferredRegister entry created inside a method nobody calls never fires,
  // so every station opened with a null type.
  const createType = fabric
    ? `    private static Supplier<MenuType<StationMenu>> createType(String key, Definition definition) {
        MenuType<StationMenu> type = new MenuType<>(
                (containerId, inventory) -> new StationMenu(
                        containerId, inventory, ContainerLevelAccess.NULL, definition),
                FeatureFlags.VANILLA_SET);
        Registry.register(BuiltInRegistries.MENU, ModRegistry.id(key), type);
        return () -> type;
    }`
    : `    @SuppressWarnings("unchecked")
    private static Supplier<MenuType<StationMenu>> createType(String key, Definition definition) {
        // DeferredRegister is typed on the wildcard, so the cast is unavoidable
        // — the factory above only ever builds a StationMenu, so it is sound.
        var holder = MENUS.register(key, () -> new MenuType<>(
                (containerId, inventory) -> new StationMenu(
                        containerId, inventory, ContainerLevelAccess.NULL, definition),
                FeatureFlags.VANILLA_SET));
        return () -> (MenuType<StationMenu>) holder.get();
    }`

  const header = fabric
    ? `package ${pkg};

import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.MenuType;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
`
    : `package ${pkg};

import net.minecraft.core.registries.Registries;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.MenuType;
${code.registryImports
  // Only the register itself is used here — the holder type is inferred with
  // `var`, so importing it would be an unused import in every export.
  .filter((name) => name.endsWith('DeferredRegister'))
  .map((name) => `import ${name};`)
  .join('\n')}

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;
`

  const body = `${header}
/**
 * Every custom crafting station this add-on defines.
 *
 * Each station gets its own MenuType rather than sharing one. The alternative
 * — a single type plus a network payload naming the station — needs codec APIs
 * that moved between the Minecraft versions this builder targets, and buys
 * nothing: the set of stations is fixed at export time, so a type each is both
 * simpler and cheaper.
 *
 * Generated by the add-on builder.
 */
public final class ModStations {
${fabric ? '' : `    public static final DeferredRegister<MenuType<?>> MENUS =
            DeferredRegister.create(Registries.MENU, ModRegistry.MOD_ID);\n`}
    /** One station: its block key, its grid size and the menu type it opens. */
    public static final class Definition {
        private final String key;
        private final int rows;
        private final int cols;
        private final String titleKey;
        private Supplier<MenuType<StationMenu>> type = () -> null;

        Definition(String key, int rows, int cols, String titleKey) {
            this.key = key;
            this.rows = rows;
            this.cols = cols;
            this.titleKey = titleKey;
        }

        public String key() { return this.key; }
        public int rows() { return this.rows; }
        public int cols() { return this.cols; }
        public String titleKey() { return this.titleKey; }

        void bind(Supplier<MenuType<StationMenu>> bound) { this.type = bound; }

        public Supplier<MenuType<StationMenu>> menuType() { return this.type; }
    }

    private static final Map<String, Definition> DEFINITIONS = new LinkedHashMap<>();

${definitions || '    // This add-on defines no custom stations.'}

    private ModStations() {}

    private static Definition define(String key, int rows, int cols, String titleKey) {
        Definition definition = new Definition(key, rows, cols, titleKey);
        DEFINITIONS.put(key, definition);
        definition.bind(createType(key, definition));
        return definition;
    }

${createType}

    public static Definition get(String key) {
        return DEFINITIONS.get(key);
    }

    public static Iterable<Definition> all() {
        return DEFINITIONS.values();
    }

    /** Touching this class runs the static initialisers that do the work. */
    public static void register() {
    }
}
`
  return javaFile(pkg, 'ModStations', body)
}

// -- the screen --------------------------------------------------------------

function emitStationScreen(ctx: JavaContext, pkg: string): VirtualFile {
  const rl = ctx.profile.api.resourceLocation('"minecraft"', '"textures/gui/container/crafting_table.png"')

  const body = `package ${pkg};

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Inventory;

/**
 * The screen a custom station opens.
 *
 * The vanilla crafting table background is reused rather than generating a
 * bespoke PNG. A grid smaller than 3x3 is centred inside the same frame, which
 * leaves a little empty space either side — visibly a smaller station, which is
 * the point, and something Bedrock cannot do at all.
 *
 * Generated by the add-on builder.
 */
public class StationScreen extends AbstractContainerScreen<StationMenu> {
    private static final ResourceLocation BACKGROUND = ${rl};

    public StationScreen(StationMenu menu, Inventory inventory, Component title) {
        super(menu, inventory, title);
        this.imageWidth = ${GUI_WIDTH};
        this.imageHeight = ${GUI_HEIGHT};
        this.inventoryLabelY = this.imageHeight - 94;
    }

    @Override
    protected void renderBg(GuiGraphics guiGraphics, float partialTick, int mouseX, int mouseY) {
        int left = (this.width - this.imageWidth) / 2;
        int top = (this.height - this.imageHeight) / 2;
        guiGraphics.blit(BACKGROUND, left, top, 0, 0, this.imageWidth, this.imageHeight);
    }

    @Override
    public void render(GuiGraphics guiGraphics, int mouseX, int mouseY, float partialTick) {
        ${ctx.profile.api.screenRenderBackground};
        super.render(guiGraphics, mouseX, mouseY, partialTick);
        this.renderTooltip(guiGraphics, mouseX, mouseY);
    }
}
`
  return javaFile(pkg, 'StationScreen', body)
}

/** Client-side registration of the screens, which only the client may touch. */
function emitClientEntry(
  ctx: JavaContext,
  pkg: string,
  stations: Array<{ node: ContentNode; station: CraftingStation }>,
): VirtualFile {
  const fabric = isFabricFamily(ctx.loader)
  const code = loaderCode(ctx.loader, ctx.profile)
  const modClass = `${pascalCase(ctx.project.namespace)}Mod`

  const registrations = stations
    .map(
      ({ node }) =>
        `        MenuScreens.register(ModStations.get(${lit(node.name)}).menuType().get(), StationScreen::new);`,
    )
    .join('\n')

  const body = fabric
    ? `package ${pkg};

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.gui.screens.MenuScreens;

/**
 * Client entry point. Screens must be registered here and nowhere else: the
 * dedicated server has no client classes on its classpath at all, so touching
 * MenuScreens from the common initialiser crashes it on start.
 *
 * Generated by the add-on builder.
 */
public class ${modClass}Client implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
${registrations || '        // No custom stations to draw.'}
    }
}
`
    : `package ${pkg};

import net.minecraft.client.gui.screens.MenuScreens;
${code.clientImports.map((name) => `import ${name};`).join('\n')}

/**
 * Client setup. Screens must be registered here and nowhere else: the dedicated
 * server has no client classes on its classpath at all, so touching MenuScreens
 * from common code crashes it on start.
 *
 * Generated by the add-on builder.
 */
${code.clientAnnotation(`${modClass}.MOD_ID`)}
public final class ${modClass}Client {
    private ${modClass}Client() {}

    @SubscribeEvent
    public static void onClientSetup(FMLClientSetupEvent event) {
        event.enqueueWork(() -> {
${registrations || '            // No custom stations to draw.'}
        });
    }
}
`

  return javaFile(pkg, `${modClass}Client`, body)
}

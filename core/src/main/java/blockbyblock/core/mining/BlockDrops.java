package blockbyblock.core.mining;

import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.DropRule;

/** Port of blockDrops (src/block-types.js): what breaking a block yields for a held item and game mode. */
public final class BlockDrops {
    private BlockDrops() {}

    /** An item id and how many of it drop. */
    public static final class Drop {
        public final String id;
        public final int count;

        public Drop(String id, int count) {
            this.id = id;
            this.count = count;
        }
    }

    private static final Drop[] NONE = new Drop[0];

    /**
     * @param held the held item's definition, or null for an empty hand
     * @param doubleSlab whether the block's state is a double slab (only slabs read it)
     * @param random used only by random-range drops (lapis, redstone)
     */
    public static Drop[] of(BlockDefinition block, ItemDefinition held, boolean creative, boolean doubleSlab, RandomSource random) {
        if (creative) return NONE;
        if (!Mining.canHarvest(block, held)) return NONE;
        if (block.hasTag("leaves") && held != null && "shears".equals(held.toolType)) return new Drop[] {new Drop(block.id, 1)};
        switch (block.dropRule) {
            case SELF: return new Drop[] {new Drop(block.id, 1)};
            case LIST: return block.dropItem == null ? NONE : new Drop[] {new Drop(block.dropItem, block.dropCount)};
            case SLAB: return new Drop[] {new Drop(block.id, doubleSlab ? 2 : 1)};
            case RANGE: {
                int span = block.dropMax - block.dropCount + 1;
                return new Drop[] {new Drop(block.dropItem, block.dropCount + (int) Math.floor(random.next() * span))};
            }
            default: throw new IllegalStateException("Unhandled drop rule " + block.dropRule);
        }
    }
}

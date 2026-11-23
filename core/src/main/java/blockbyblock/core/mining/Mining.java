package blockbyblock.core.mining;

import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.world.shape.BlockDefinition;

/** Port of miningProgress and canHarvest (src/breaking-properties.js). */
public final class Mining {
    private Mining() {}

    /** Whether a held item (null for an empty hand) can harvest a block; blocks without a tool requirement always can. */
    public static boolean canHarvest(BlockDefinition block, ItemDefinition held) {
        return !block.requiresTool
            || held != null && held.isTool() && held.toolType.equals(block.preferredTool) && held.toolLevel >= block.harvestLevel;
    }

    /** Break progress added per tick; 1 or more breaks the block at once. */
    public static double progress(BlockDefinition block, ItemDefinition held, boolean grounded, boolean underwater) {
        if (block.hardness < 0) return 0;
        if (block.hardness == 0) return 1;
        boolean tool = held != null && held.isTool();
        boolean effective = tool && held.toolType.equals(block.preferredTool);
        boolean harvest = canHarvest(block, held);
        double speed = effective ? held.toolSpeed : 1;
        if (tool && held.toolType.equals("sword") && (block.hasTag("leaves") || block.hasTag("plants"))) speed = 1.5;
        if (underwater) speed /= 5;
        if (!grounded) speed /= 5;
        return speed / block.hardness / (harvest ? 30 : 100);
    }
}

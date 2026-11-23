package blockbyblock.core.mining;

import blockbyblock.core.inventory.PlayerInventory;
import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.world.shape.BlockDefinition;

/** Port of miningToolWear (src/tool-use.js): how much a mined block wears the held tool. */
public final class ToolWear {
    private ToolWear() {}

    public static void miningToolWear(PlayerInventory inventory, boolean creative, BlockDefinition block) {
        if (!(block.hardness > 0)) return;
        var held = inventory.mainHand();
        String type = held == null ? null : ItemDefinition.forId(held.id).toolType;
        int cost = "sword".equals(type) ? 2
            : "pickaxe".equals(type) || "axe".equals(type) || "shovel".equals(type) || "shears".equals(type) && block.hasTag("leaves") ? 1 : 0;
        inventory.damageMainTool(creative, cost);
    }
}

package blockbyblock.core.world;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import org.junit.jupiter.api.Test;

/** The world stores per-block state (axis, lit, door half, ...) and treats a state change as an edit. */
class WorldStateTest {
    private static BlockState defaults(String id) { return BlockState.defaults(BlockDefinition.forId(id)); }

    @Test void changingOnlyTheStateIsAnEdit() {
        var w = new VoxelWorld();
        assertTrue(w.setBlock(2, 5, 2, "furnace", defaults("furnace"), 0, false));
        assertFalse(w.setBlock(2, 5, 2, "furnace", defaults("furnace"), 0, false), "identical block and state is not an edit");
        assertTrue(w.setBlock(2, 5, 2, "furnace", defaults("furnace").with("lit", true), 0, false));
        assertTrue(w.blockAt(2, 5, 2).state.getBool("lit"));
        assertFalse(w.setBlock(2, 5, 2, "furnace", defaults("furnace").with("lit", true), 0, false));
        assertTrue(w.setBlock(2, 5, 2, "furnace", defaults("furnace").with("lit", true).with("facing", "south"), 0, false));
        assertEquals("south", w.blockAt(2, 5, 2).state.facing);
    }

    @Test void logAxisAndDoorHalvesSurviveStorage() {
        var w = new VoxelWorld();
        assertTrue(w.setBlock(0, 5, 0, "oak.log", defaults("oak.log").with("axis", "x"), 0, false));
        assertEquals("x", w.blockAt(0, 5, 0).state.get("axis"));
        assertTrue(w.setBlock(0, 5, 0, "oak.log", defaults("oak.log"), 0, false), "back to the default axis is still a change");
        assertEquals("y", w.blockAt(0, 5, 0).state.get("axis"));
        BlockState lower = defaults("oak.door"), upper = lower.with("half", "upper");
        assertTrue(w.setBlock(4, 5, 4, "oak.door", lower, 0, false));
        assertTrue(w.setBlock(4, 6, 4, "oak.door", upper, 0, false));
        assertEquals("lower", w.blockAt(4, 5, 4).state.get("half"));
        assertEquals("upper", w.blockAt(4, 6, 4).state.get("half"));
        assertTrue(w.setBlock(4, 6, 4, "oak.door", upper.with("open", true), 0, false));
        assertTrue(w.blockAt(4, 6, 4).state.open);
    }

    @Test void defaultStateOfABaseBlockLeavesNoEdit() {
        var w = new VoxelWorld(0, new String[] {"bedrock", "dirt", "dirt", "grass.block"});
        assertTrue(w.setBlock(1, 3, 1, "grass.block", null, 0, false) == false, "already the base block");
        assertTrue(w.setBlock(1, 3, 1, null, null, 0, false));
        assertNull(w.blockAt(1, 3, 1));
        assertTrue(w.setBlock(1, 3, 1, "grass.block", null, 0, false));
        assertEquals("grass.block", w.blockIdAt(1, 3, 1));
    }
}

package blockbyblock.core.world;

import static org.junit.jupiter.api.Assertions.assertEquals;

import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import org.junit.jupiter.api.Test;

/** Wall links to full cubes and walls but not to a bottom slab or a fence (confirmed against src/block-shapes.js). */
class WallLinkTest {
    private static BlockState plain(String id) {
        return BlockState.of(BlockDefinition.forId(id), "", "", "", "", "", false);
    }

    private static boolean solidAt(VoxelWorld w, double x0, double z0) {
        // A thin probe inside the wall's arm height, centred in the cell's arm corridor.
        return w.hasSolidInBox(new double[] {x0, 1.0, z0}, new double[] {x0 + .1, 1.2, z0 + .1});
    }

    @Test void linksOnlyToFullCubesAndWalls() {
        var w = new VoxelWorld();
        w.setBlock(0, 0, 0, "cobblestone.wall", plain("cobblestone.wall"), 0, false);
        w.setBlock(1, 0, 0, "stone", plain("stone"), 0, false);
        w.setBlock(0, 0, -1, "oak.slab", BlockState.of(BlockDefinition.forId("oak.slab"), "bottom", "", "", "", "", false), 0, false);
        w.setBlock(0, 0, 1, "cobblestone.wall", plain("cobblestone.wall"), 0, false);
        w.setBlock(-1, 0, 0, "oak.fence", plain("oak.fence"), 0, false);
        // JS collision boxes: post plus east and south arms only.
        assertEquals(true, solidAt(w, .8, .45), "east arm (stone neighbour)");
        assertEquals(true, solidAt(w, .45, .8), "south arm (wall neighbour)");
        assertEquals(false, solidAt(w, .45, .05), "no north arm (bottom slab)");
        assertEquals(false, solidAt(w, .05, .45), "no west arm (fence)");
    }
}

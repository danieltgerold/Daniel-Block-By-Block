package blockbyblock.core.world;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class VoxelWorldTest {
    @Test void defaultTerrainIsThreeLayersBelowZero() {
        var w = new VoxelWorld(3);
        assertTrue(w.hasBlock(0, -1, 0));
        assertTrue(w.hasBlock(-7, -3, -9));
        assertFalse(w.hasBlock(0, -4, 0));
        assertFalse(w.hasBlock(0, 0, 0));
    }

    @Test void editsOverrideDefaultsAndRevertingRemovesThem() {
        var w = new VoxelWorld(3);
        assertTrue(w.setBlock(-1, -2, -1, false));
        assertFalse(w.hasBlock(-1, -2, -1));
        assertTrue(w.setBlock(-1, -2, -1, true));
        assertFalse(w.setBlock(-1, -2, -1, true));
    }

    @Test void negativeAndLargeCoordinatesDoNotCollide() {
        var w = new VoxelWorld(3);
        w.setBlock(-1_000_000, 300, 1_000_000, true);
        assertTrue(w.hasBlock(-1_000_000, 300, 1_000_000));
        assertFalse(w.hasBlock(1_000_000, 300, -1_000_000));
        w.setBlock(5, -64, 5, true);
        assertTrue(w.hasBlock(5, -64, 5));
        assertFalse(w.hasBlock(5, -65, 5));
        assertTrue(w.setBlock(9007199254740991.0, 0, 0, true));
        assertTrue(w.hasBlock(9007199254740991.0, 0, 0));
    }

    @Test void setBlockRejectsCoordinatesThatAreNotSafeIntegers() {
        var w = new VoxelWorld(3);
        assertFalse(w.setBlock(0.5, 0, 0, true));
        assertFalse(w.setBlock(9007199254740992.0, 0, 0, true));
        assertFalse(w.setBlock(0, Double.NaN, 0, true));
        assertFalse(w.setBlock(0, 0, Double.POSITIVE_INFINITY, true));
    }

    /**
     * Equal-distance hits keep the first edit found, so edits must iterate in insertion order (ruling R9).
     * Each geometry is checked in both insertion orders; the expected winners were confirmed against
     * src/voxel-world.js. Three geometries: one plane, one across a chunk border, one whose keys land in
     * different hash buckets, so a hash-ordered map cannot pass by accident.
     */
    @Test void raycastTieBreakFollowsInsertionOrder() {
        assertTieWinner(new double[] {0.5, 2.5, 0.5}, new double[] {1, -1, 0}, new double[] {1, 2, 0}, new double[] {0, 1, 0});
        assertTieWinner(new double[] {0.5, 0.5, 2.5}, new double[] {1, 0, -1}, new double[] {1, 0, 2}, new double[] {0, 0, 1});
        assertTieWinner(new double[] {15.5, 2.5, 0.5}, new double[] {1, -1, 0}, new double[] {16, 2, 0}, new double[] {15, 1, 0});
    }

    private static void assertTieWinner(double[] o, double[] d, double[] a, double[] b) {
        for (double[][] order : new double[][][] {{a, b}, {b, a}}) {
            var w = new VoxelWorld(3);
            for (double[] block : order) w.setBlock(block[0], block[1], block[2], true);
            RaycastHit hit = w.raycast(o[0], o[1], o[2], d[0], d[1], d[2], 4.5);
            assertNotNull(hit);
            double[] winner = order[0];
            assertEquals(winner[0], hit.x, "tie winner x");
            assertEquals(winner[1], hit.y, "tie winner y");
            assertEquals(winner[2], hit.z, "tie winner z");
        }
    }

    @Test void removedPitLeavesNoSupport() {
        var w = new VoxelWorld(3);
        assertTrue(w.isSupported(0.5, 0, 0.5, VoxelWorld.PLAYER_HALF_WIDTH));
        w.setBlock(0, -1, 0, false);
        w.setBlock(0, -2, 0, false);
        assertFalse(w.isSupported(0.5, 0, 0.5, VoxelWorld.PLAYER_HALF_WIDTH));
    }
}

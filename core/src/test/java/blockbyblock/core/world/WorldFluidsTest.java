package blockbyblock.core.world;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class WorldFluidsTest {
    @Test void waterOccupiesCellsWithoutCollidingAndSweptFootprintUsesAllAxes() {
        VoxelWorld world = VoxelWorld.current();
        assertTrue(world.setBlock(0, 4, 0, "water", null, 0, false));
        assertTrue(world.hasBlock(0, 4, 0));
        assertTrue(world.isReplaceable(0, 4, 0));
        assertFalse(world.intersectsPlayer(.5, 4, .5, .3, 1.8));
        assertTrue(world.touchesWater(new double[] {.5, 7, .5}, new double[] {.5, 2, .5}, .3, 1.8));
        assertFalse(world.touchesWater(new double[] {.5, 7, 8}, new double[] {.5, 2, 8}, .3, 1.8));
    }

    @Test void emptyFluidAndCollapsedHugeFootprintsCannotEnumerateUnboundedSpans() {
        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            VoxelWorld world = VoxelWorld.current();
            assertFalse(world.touchesWater(new double[] {0, 4, 1e20}, new double[] {1e100, 3, 1e20}, .3, 1.8));
            assertTrue(world.setBlock(0, 4, 0, "water", null, 0, false));
            assertFalse(world.touchesWater(new double[] {0, 4, 1e20}, new double[] {1e100, 3, 1e20}, .3, 1.8));
            // Three unsafe-coordinate spans; double +1 cannot progress at 2^53.
            for (int axis = 0; axis < 3; axis++) {
                double[] min = {0, 4, 0}, max = {1, 5, 1};
                min[axis] = 0x1p53; max[axis] = 0x1p53 + 2;
                assertFalse(world.sample(min, max).inWater);
            }
        });
    }
}

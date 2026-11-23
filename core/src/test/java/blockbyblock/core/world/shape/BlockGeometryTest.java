package blockbyblock.core.world.shape;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BlockGeometryTest {
    private static final BlockDefinition STONE = BlockDefinition.forId("stone");
    private static final BlockDefinition SLAB = BlockDefinition.forId("oak.slab");
    private static final BlockDefinition STAIRS = BlockDefinition.forId("oak.stairs");
    private static final BlockDefinition DOOR = BlockDefinition.forId("oak.door");
    private static final BlockDefinition FENCE = BlockDefinition.forId("oak.fence");
    private static final BlockState CUBE_STATE = BlockState.of(STONE, "", "", "", "", "", false);

    @Test void rejectsUnknownIdsAndNullDefinition() {
        assertThrows(IllegalArgumentException.class, () -> BlockDefinition.forId(null));
        assertThrows(IllegalArgumentException.class, () -> BlockDefinition.forId(""));
        assertThrows(IllegalArgumentException.class, () -> BlockDefinition.forId("missing.block"));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(null, "", "", "", "", "", false));
    }

    @Test void rejectsMalformedOrIrrelevantGeometryState() {
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(SLAB, "sideways", "", "", "", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(SLAB, "", "", "", "", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(SLAB, "bottom", "north", "", "", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(STAIRS, "", "up", "bottom", "straight", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(STAIRS, "", "north", "middle", "straight", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(STAIRS, "", "north", "bottom", "curved", "", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(DOOR, "", "north", "", "", "center", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(DOOR, "", "north", "middle", "", "left", false));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(DOOR, "", "north", "bottom", "", "left", false)); // stairs vocabulary
        assertEquals("upper", BlockState.of(DOOR, "", "north", "upper", "", "left", false).half, "doors have upper and lower halves");
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(STONE, "", "", "", "", "", true));
        assertThrows(IllegalArgumentException.class, () -> BlockState.of(STONE, null, "", "", "", "", false));
    }

    @Test void rejectsNullQueryInputsAndInvalidNeighborMasks() {
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.boxes(null, CUBE_STATE, QueryKind.COLLISION, 0, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.boxes(STONE, null, QueryKind.COLLISION, 0, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.boxes(STONE, CUBE_STATE, null, 0, 0, 0, 0));
        // Three explicit invalid-mask boundaries, independent of shape family.
        for (int mask : new int[] {-2, 16, Integer.MAX_VALUE})
            assertThrows(IllegalArgumentException.class, () -> BlockGeometry.boxes(STONE, CUBE_STATE, QueryKind.COLLISION, mask, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.fullCube(null, CUBE_STATE));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.opaque(STONE, null));
    }

    @Test void rejectsNonfiniteTranslationsAndCollapsedSolidBoxes() {
        // Four invalid values on each of three axes: 12 bounded cases.
        for (double invalid : new double[] {Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, Double.MAX_VALUE}) {
            assertThrows(IllegalArgumentException.class, () -> boxesAt(invalid, 0, 0));
            assertThrows(IllegalArgumentException.class, () -> boxesAt(0, invalid, 0));
            assertThrows(IllegalArgumentException.class, () -> boxesAt(0, 0, invalid));
        }
        assertEquals(1, boxesAt(-17, -3, -.5).length);
    }

    @Test void stateCompatibilityUsesShapeFamilyInsteadOfIdentity() {
        BlockState slab = BlockState.of(SLAB, "double", "", "", "", "", false);
        BlockDefinition pine = BlockDefinition.forId("pine.slab");
        assertTrue(BlockGeometry.fullCube(pine, slab));
        assertTrue(BlockGeometry.opaque(pine, slab));
        assertEquals(1, BlockGeometry.boxes(pine, slab, QueryKind.SELECTION, -1, 0, 0, 0).length);
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.boxes(STONE, slab, QueryKind.COLLISION, -1, 0, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.fullCube(STONE, slab));
        assertThrows(IllegalArgumentException.class, () -> BlockGeometry.opaque(STONE, slab));
    }

    @Test void callersCannotMutateLaterGeometryResults() {
        BlockState fence = BlockState.of(FENCE, "", "", "", "", "", false);
        double[][] first = BlockGeometry.boxes(FENCE, fence, QueryKind.SELECTION, 15, 0, 0, 0);
        assertEquals(9, first.length);
        first[0][0] = -100;
        first[1] = new double[] {-1};
        double[][] next = BlockGeometry.boxes(FENCE, fence, QueryKind.SELECTION, 15, 0, 0, 0);
        assertEquals(.375, next[0][0]);
        assertEquals(6, next[1].length);
        assertTrue(next[1][0] >= 0);
        assertFalse(BlockGeometry.fullCube(FENCE, fence));
    }

    private static double[][] boxesAt(double x, double y, double z) {
        return BlockGeometry.boxes(STONE, CUBE_STATE, QueryKind.COLLISION, -1, x, y, z);
    }
}

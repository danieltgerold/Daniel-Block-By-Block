package blockbyblock.core.world.shape;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BlockStateTest {
    private static BlockDefinition def(String id) { return BlockDefinition.forId(id); }

    @Test void defaultsFollowTheJsRegistry() {
        assertEquals("axis=y", BlockState.defaults(def("oak.log")).toString());
        assertEquals("persistent=true|distance=7", BlockState.defaults(def("oak.leaves")).toString());
        assertEquals("facing=north|lit=false", BlockState.defaults(def("furnace")).toString());
        assertEquals("moisture=0|dryTicks=0", BlockState.defaults(def("farmland")).toString());
        assertEquals("facing=north|hinge=left|open=false|half=lower", BlockState.defaults(def("oak.door")).toString());
        assertEquals("", BlockState.defaults(def("stone")).toString());
        assertEquals(0, BlockState.defaults(def("water")).size(), "water level/falling live on the world block");
    }

    @Test void typedAccessorsAndMissingProperties() {
        BlockState furnace = BlockState.defaults(def("furnace"));
        assertEquals("north", furnace.get("facing"));
        assertFalse(furnace.getBool("lit"));
        assertNull(furnace.get("axis"));
        assertFalse(furnace.has("axis"));
        assertThrows(IllegalArgumentException.class, () -> furnace.getInt("axis"));
        assertEquals(7, BlockState.defaults(def("oak.leaves")).getInt("distance"));
    }

    @Test void withReturnsAValidatedCopyAndLeavesTheOriginalAlone() {
        BlockState lit = BlockState.defaults(def("furnace"));
        BlockState next = lit.with("lit", true).with("facing", "west");
        assertTrue(next.getBool("lit"));
        assertEquals("west", next.facing, "geometry view follows the property");
        assertFalse(lit.getBool("lit"));
        assertEquals("north", lit.facing);
        assertEquals("moisture=5|dryTicks=2", BlockState.defaults(def("farmland")).with("moisture", 5).with("dryTicks", 2).toString());
        assertEquals("z", BlockState.defaults(def("pine.log")).with("axis", "z").get("axis"));
    }

    @Test void invalidValuesAndUnknownPropertiesAreRejected() {
        BlockState door = BlockState.defaults(def("oak.door")), log = BlockState.defaults(def("oak.log")), farm = BlockState.defaults(def("farmland"));
        assertThrows(IllegalArgumentException.class, () -> log.with("axis", "w"));
        assertThrows(IllegalArgumentException.class, () -> log.with("facing", "north"), "a log has no facing");
        assertThrows(IllegalArgumentException.class, () -> door.with("half", "top"), "doors are lower or upper");
        assertThrows(IllegalArgumentException.class, () -> door.with("hinge", "middle"));
        assertThrows(IllegalArgumentException.class, () -> door.with("open", "yes"));
        assertThrows(IllegalArgumentException.class, () -> farm.with("moisture", 8));
        assertThrows(IllegalArgumentException.class, () -> farm.with("moisture", -1));
        assertThrows(IllegalArgumentException.class, () -> farm.with("dryTicks", -1));
        assertThrows(IllegalArgumentException.class, () -> farm.with("moisture", "07"), "numbers must be canonical");
        assertThrows(IllegalArgumentException.class, () -> farm.with("moisture", "x"));
        assertThrows(IllegalArgumentException.class, () -> BlockState.defaults(def("oak.stairs")).with("half", "lower"), "stairs are top or bottom");
        assertThrows(IllegalArgumentException.class, () -> BlockState.defaults(null));
    }

    @Test void equalityIsSamePropertiesSameValues() {
        BlockState a = BlockState.defaults(def("furnace")), b = BlockState.defaults(def("furnace"));
        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());
        assertNotEquals(a, a.with("lit", true));
        assertEquals(a, a.with("lit", true).with("lit", false));
        assertNotEquals(BlockState.defaults(def("oak.log")), BlockState.defaults(def("pine.log")).with("axis", "x"));
        assertNotEquals(BlockState.defaults(def("stone")), BlockState.defaults(def("oak.slab")), "different shapes never match");
    }
}

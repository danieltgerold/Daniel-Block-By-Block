package blockbyblock.core.item;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.world.shape.BlockDefinition;
import java.nio.file.Files;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The generated item table must say what the JS registry says (tests/golden/registry/items.csv). */
class ItemRegistryTest {
    private static final String HEADER = "id,maxStack,isBlock,toolType,toolSpeed,toolLevel,durability,foodHunger,foodSaturation";

    @Test void everyJsItemMatchesFieldForField() throws Exception {
        var path = GoldenCsv.dir().resolve("registry").resolve("items.csv");
        assertEquals(HEADER, Files.readAllLines(path).get(0), "fixture schema");
        List<String[]> rows = GoldenCsv.read(path);
        ItemDefinition[] all = ItemDefinition.all();
        assertEquals(rows.size(), all.length, "item count");
        assertTrue(rows.size() >= 100, "registry shrank");
        // One row per registered item, in registration order.
        for (int i = 0; i < rows.size(); i++) {
            String[] r = rows.get(i);
            ItemDefinition d = all[i];
            assertEquals(r[0], d.id, "order at " + i);
            assertEquals(d, ItemDefinition.forId(r[0]), "lookup " + r[0]);
            assertEquals(Integer.parseInt(r[1]), d.maxStack, "maxStack " + r[0]);
            assertEquals(r[2].equals("1"), d.isBlock, "isBlock " + r[0]);
            assertEquals(r[3].isEmpty() ? null : r[3], d.toolType, "toolType " + r[0]);
            assertTrue(sameBits(num(r[4]), d.toolSpeed), "toolSpeed " + r[0]);
            assertEquals(Integer.parseInt(r[5]), d.toolLevel, "toolLevel " + r[0]);
            assertEquals(Integer.parseInt(r[6]), d.durability, "durability " + r[0]);
            assertEquals(Integer.parseInt(r[7]), d.foodHunger, "foodHunger " + r[0]);
            assertTrue(sameBits(num(r[8]), d.foodSaturation), "foodSaturation " + r[0]);
        }
    }

    @Test void blockItemsAgreeWithTheBlockRegistry() {
        // Registered blocks that can be held are items with the same id and stack size.
        for (BlockDefinition block : BlockDefinition.all()) {
            if (!ItemDefinition.exists(block.id)) continue;
            ItemDefinition item = ItemDefinition.forId(block.id);
            assertTrue(item.isBlock, block.id);
            assertEquals(block.maxStack, item.maxStack, block.id);
        }
        assertFalse(ItemDefinition.exists("water"), "water is not an inventory item");
        assertTrue(ItemDefinition.forId("stone").isBlock);
    }

    @Test void unknownAndNullIdsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> ItemDefinition.forId("nope"));
        assertThrows(IllegalArgumentException.class, () -> ItemDefinition.forId(null));
    }
}

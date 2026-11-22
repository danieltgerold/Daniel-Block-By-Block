package blockbyblock.core.world.shape;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;

/** The generated Java table must say what the JS registry says, field for field (tests/golden/registry/blocks.csv). */
class BlockRegistryTest {
    private static final String HEADER = "id,shape,solid,opaque,hardness,breakTicks,requiresTool,preferredTool,harvestLevel,maxStack,falling,dropRule,dropId,dropCount,dropMax,tags";

    @Test void everyJsBlockMatchesFieldForField() throws Exception {
        var path = GoldenCsv.dir().resolve("registry").resolve("blocks.csv");
        assertEquals(HEADER, Files.readAllLines(path).get(0), "fixture schema");
        List<String[]> rows = GoldenCsv.read(path);
        BlockDefinition[] all = BlockDefinition.all();
        assertEquals(rows.size(), all.length, "block count");
        assertTrue(rows.size() >= 67, "registry shrank");
        // One row per registered block, in registration order.
        for (int i = 0; i < rows.size(); i++) {
            String[] r = rows.get(i);
            BlockDefinition d = all[i];
            assertEquals(r[0], d.id, "order at " + i);
            assertEquals(d, BlockDefinition.forId(r[0]), "lookup " + r[0]);
            assertEquals(r[1], d.shape.name().toLowerCase(Locale.ROOT), "shape " + r[0]);
            assertEquals(r[2].equals("1"), d.solid, "solid " + r[0]);
            assertEquals(r[3].equals("1"), d.opaque, "opaque " + r[0]);
            assertTrue(sameBits(num(r[4]), d.hardness), "hardness " + r[0]);
            assertTrue(sameBits(num(r[5]), d.breakTicks), "breakTicks " + r[0]);
            assertEquals(r[6].equals("1"), d.requiresTool, "requiresTool " + r[0]);
            assertEquals(r[7].isEmpty() ? null : r[7], d.preferredTool, "preferredTool " + r[0]);
            assertEquals(Integer.parseInt(r[8]), d.harvestLevel, "harvestLevel " + r[0]);
            assertEquals(Integer.parseInt(r[9]), d.maxStack, "maxStack " + r[0]);
            assertEquals(r[10].equals("1"), d.falling, "falling " + r[0]);
            assertEquals(r[11], d.dropRule.name().toLowerCase(Locale.ROOT), "dropRule " + r[0]);
            assertEquals(r[12].isEmpty() ? null : r[12], d.dropItem, "dropItem " + r[0]);
            assertEquals(Integer.parseInt(r[13]), d.dropCount, "dropCount " + r[0]);
            assertEquals(Integer.parseInt(r[14]), d.dropMax, "dropMax " + r[0]);
            for (String tag : r[15].isEmpty() ? new String[0] : r[15].split("\\|")) assertTrue(d.hasTag(tag), r[0] + " tag " + tag);
        }
    }

    @Test void unknownAndNullIdsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> BlockDefinition.forId("nope"));
        assertThrows(IllegalArgumentException.class, () -> BlockDefinition.forId(null));
    }
}

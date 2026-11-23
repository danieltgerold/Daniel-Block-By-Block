package blockbyblock.core.inventory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Replays every recorded JS inventory operation and compares the full state after each one. */
class InventoryParityTest {
    @Test void basicOperationsMatchJsStateByState() throws Exception {
        var path = GoldenCsv.dir().resolve("inventory").resolve("basic.csv");
        assertEquals("seed,step,op,state", Files.readAllLines(path).get(0), "fixture schema");
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 2864, "fixture shrank");
        List<String> mismatches = new ArrayList<>();
        PlayerInventory inv = null;
        List<ItemStack> drops = new ArrayList<>();
        String seed = "";
        for (String[] r : rows) {
            if (!r[0].equals(seed)) { seed = r[0]; drops.clear(); inv = new PlayerInventory(drops::add); }
            drops.clear();
            String ret = InventoryTrace.apply(inv, r[2], drops);
            String actual = InventoryTrace.state(inv, drops, ret);
            if (!actual.equals(r[3]) && mismatches.size() < 4)
                mismatches.add("seed " + r[0] + " step " + r[1] + " op " + r[2] + "\n  expected " + r[3] + "\n  actual   " + actual);
            if (!actual.equals(r[3])) break; // later steps depend on this one
        }
        assertTrue(mismatches.isEmpty(), "first divergence:\n" + String.join("\n", mismatches));
    }
}

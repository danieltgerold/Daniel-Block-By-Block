package blockbyblock.core.world;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.inventory.ItemStack;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Replays every recorded placement and destruction and compares all edits, furnaces and drops after each one. */
class BlockActionsParityTest {
    private static Double opt(String t) { return t.equals("-") ? null : Double.valueOf(t); }

    private static String apply(WorldRulesParityTest.Ctx c, String op) {
        String[] a = op.split(":", -1);
        if (a[0].equals("place")) {
            BlockActions.Hit hit = new BlockActions.Hit(Double.parseDouble(a[2]), Double.parseDouble(a[3]), Double.parseDouble(a[4]),
                Double.parseDouble(a[5]), Double.parseDouble(a[6]), Double.parseDouble(a[7]),
                a[8].equals("-") && a[9].equals("-") && a[10].equals("-") ? null : opt(a[8]),
                a[8].equals("-") && a[9].equals("-") && a[10].equals("-") ? null : opt(a[9]),
                a[8].equals("-") && a[9].equals("-") && a[10].equals("-") ? null : opt(a[10]));
            List<BlockActions.Body> players = new ArrayList<>();
            if (!a[12].equals("-")) for (String p : a[12].split("\\|")) {
                String[] f = p.split("~");
                players.add(new BlockActions.Body(Double.parseDouble(f[0]), Double.parseDouble(f[1]), Double.parseDouble(f[2]), Double.parseDouble(f[3]), f[4].equals("1")));
            }
            BlockActions.Placed placed = BlockActions.placeBlock(c.rules, a[1], hit, Double.parseDouble(a[11]), players);
            return placed == null ? "0" : (long) placed.x + ":" + (long) placed.y + ":" + (long) placed.z;
        }
        if (a[0].equals("destroy")) {
            ItemStack tool = a[5].equals("-") ? null : new ItemStack(a[5], 1);
            return BlockActions.destroyBlock(c.rules, Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]), a[4].equals("creative"), tool) ? "1" : "0";
        }
        return WorldRulesParityTest.apply(c, op);
    }

    @Test void placementAndDestructionMatchJsAfterEveryOperation() throws Exception {
        var path = GoldenCsv.dir().resolve("blockactions").resolve("trace.csv");
        assertEquals("seed,step,op,ret,edits,furnaces,drops", Files.readAllLines(path).get(0));
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 1153, "fixture shrank");
        WorldRulesParityTest.Ctx c = null;
        String seed = "";
        for (String[] r : rows) {
            if (!r[0].equals(seed)) { seed = r[0]; c = WorldRulesParityTest.fresh(); }
            c.drops.clear();
            String ret = apply(c, r[2]);
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertEquals(r[3], ret, "return at " + where);
            assertEquals(r[4], WorldRulesParityTest.editsText(c), "edits at " + where);
            assertEquals(r[5], WorldRulesParityTest.furnacesText(c), "furnaces at " + where);
            String[] expected = r[6].equals("-") ? new String[0] : r[6].split(";");
            assertEquals(expected.length, c.drops.size(), "drop count at " + where);
            for (int i = 0; i < expected.length; i++) {
                String[] parts = expected[i].split("@");
                String[] stack = parts[0].split(":"), at = parts[1].split(":");
                Object[] actual = c.drops.get(i);
                ItemStack s = (ItemStack) actual[0];
                assertTrue(s.id.equals(stack[0]) && s.count == Long.parseLong(stack[1]) && sameBits(num(at[0]), (double) actual[1])
                    && sameBits(num(at[1]), (double) actual[2]) && sameBits(num(at[2]), (double) actual[3]), "drop " + i + " at " + where + ": expected " + expected[i]);
            }
        }
    }
}

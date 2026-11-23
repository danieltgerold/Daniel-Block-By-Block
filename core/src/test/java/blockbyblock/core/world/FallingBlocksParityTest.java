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

/** Replays every recorded falling-block operation and compares edits, drops, the scheduler and every entity. */
class FallingBlocksParityTest {
    private static final class Run {
        final WorldRulesParityTest.Ctx ctx = WorldRulesParityTest.fresh();
        final List<BlockActions.Body> players = new ArrayList<>();
        final FallingBlocks falling = new FallingBlocks(ctx.rules);

        Run() { falling.setPlayers(() -> players); }
    }

    private static String apply(Run r, String op) {
        String[] a = op.split(":", -1);
        if (a[0].equals("tick")) {
            int n = Integer.parseInt(a[1]);
            // At most 300 ticks per recorded operation.
            for (int i = 0; i < n; i++) r.falling.tick();
            return "-";
        }
        if (a[0].equals("players")) {
            r.players.clear();
            if (!a[1].equals("-")) for (String p : a[1].split("\\|")) {
                String[] f = p.split("~");
                r.players.add(new BlockActions.Body(Double.parseDouble(f[0]), Double.parseDouble(f[1]), Double.parseDouble(f[2]), Double.parseDouble(f[3]), f[4].equals("1")));
            }
            return "-";
        }
        return WorldRulesParityTest.apply(r.ctx, op);
    }

    @Test void blocksFallAndSettleLikeTheJs() throws Exception {
        var path = GoldenCsv.dir().resolve("falling").resolve("trace.csv");
        assertEquals("seed,step,op,ret,edits,furnaces,drops,clock,pending,entities", Files.readAllLines(path).get(0));
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 1123, "fixture shrank");
        Run run = null;
        String seed = "";
        for (String[] r : rows) {
            if (!r[0].equals(seed)) { seed = r[0]; run = new Run(); }
            run.ctx.drops.clear();
            String ret = apply(run, r[2]);
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertEquals(r[3], ret, "return at " + where);
            assertEquals(r[4], WorldRulesParityTest.editsText(run.ctx), "edits at " + where);
            assertEquals(r[5], WorldRulesParityTest.furnacesText(run.ctx), "furnaces at " + where);
            String[] drops = r[6].equals("-") ? new String[0] : r[6].split(";");
            assertEquals(drops.length, run.ctx.drops.size(), "drop count at " + where);
            for (int i = 0; i < drops.length; i++) {
                String[] parts = drops[i].split("@");
                String[] stack = parts[0].split(":"), at = parts[1].split(":");
                Object[] actual = run.ctx.drops.get(i);
                ItemStack s = (ItemStack) actual[0];
                assertTrue(s.id.equals(stack[0]) && s.count == Long.parseLong(stack[1]) && sameBits(num(at[0]), (double) actual[1])
                    && sameBits(num(at[1]), (double) actual[2]) && sameBits(num(at[2]), (double) actual[3]), "drop " + i + " at " + where + ": expected " + drops[i]);
            }
            assertEquals(r[7], run.falling.time() + ":" + run.falling.serial(), "clock at " + where);
            assertEquals(r[8], run.falling.pendingText(), "pending at " + where);
            String[] entities = r[9].equals("-") ? new String[0] : r[9].split(";");
            List<FallingBlocks.Entity> actual = run.falling.entities();
            assertEquals(entities.length, actual.size(), "entity count at " + where);
            for (int i = 0; i < entities.length; i++) {
                String[] f = entities[i].split("~");
                FallingBlocks.Entity e = actual.get(i);
                String state = e.state.size() == 0 ? "-" : e.state.toString();
                assertTrue(Integer.parseInt(f[0]) == e.serial && f[1].equals(e.id) && f[2].equals(state) && sameBits(num(f[3]), e.x)
                    && sameBits(num(f[4]), e.y) && sameBits(num(f[5]), e.z) && sameBits(num(f[6]), e.vy) && Integer.parseInt(f[7]) == e.age,
                    "entity " + i + " at " + where + "\n  expected " + entities[i] + "\n  actual   " + e.serial + "~" + e.id + "~" + state + "~" + e.x + "~" + e.y + "~" + e.z + "~" + e.vy + "~" + e.age);
            }
        }
    }
}

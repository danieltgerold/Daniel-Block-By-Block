package blockbyblock.core.world;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.inventory.FurnaceEntity;
import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.Shape;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Replays every recorded JS edit and compares all edits, furnaces and drops after each one. */
class WorldRulesParityTest {
    private static final class Ctx {
        WorldRules rules;
        boolean creative;
        final List<Object[]> drops = new ArrayList<>();
    }

    private static Ctx fresh() {
        Ctx c = new Ctx();
        c.rules = new WorldRules(new VoxelWorld(0, new String[] {"bedrock", "dirt", "dirt", "grass.block"}));
        c.rules.setDropListener((stack, x, y, z) -> c.drops.add(new Object[] {stack.copy(), x, y, z}));
        c.rules.setCreativeMode(() -> c.creative);
        return c;
    }

    private static BlockState stateFor(String id, String props) {
        BlockState state = BlockState.defaults(BlockDefinition.forId(id));
        if (props.equals("-")) return state;
        for (String kv : props.split("\\|")) {
            String[] p = kv.split("=");
            state = state.with(p[0], p[1]);
        }
        return state;
    }

    private static String apply(Ctx c, String op) {
        String[] a = op.split(":", -1);
        switch (a[0]) {
            case "set": {
                String id = a[4].equals("-") ? null : a[4];
                BlockState state = id == null || !isKnown(id) ? null : stateFor(id, a.length > 5 ? a[5] : "-");
                return c.rules.setBlock(Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]), id, state) ? "1" : "0";
            }
            case "placedoor": {
                double x = Double.parseDouble(a[1]), y = Double.parseDouble(a[2]), z = Double.parseDouble(a[3]);
                boolean guard = c.rules.changingDoors();
                c.rules.setChangingDoors(true);
                BlockState base = stateFor(a[4], a[5]);
                boolean lower = c.rules.setBlock(x, y, z, a[4], base.with("half", "lower"));
                boolean upper = c.rules.setBlock(x, y + 1, z, a[4], base.with("half", "upper"));
                c.rules.setChangingDoors(guard);
                return (lower ? "1" : "0") + (upper ? "1" : "0");
            }
            case "placedoor2": {
                double x = Double.parseDouble(a[1]), y = Double.parseDouble(a[2]), z = Double.parseDouble(a[3]);
                boolean guard = c.rules.changingDoors();
                c.rules.setChangingDoors(true);
                boolean lower = c.rules.setBlock(x, y, z, a[4], stateFor(a[4], a[5]).with("half", "lower"));
                boolean upper = c.rules.setBlock(x, y + 1, z, a[4], stateFor(a[4], a[6]).with("half", "upper"));
                c.rules.setChangingDoors(guard);
                return (lower ? "1" : "0") + (upper ? "1" : "0");
            }
            case "toggle": {
                WorldBlock b = c.rules.world().blockAt(Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]));
                return b != null && b.definition.shape == Shape.DOOR && c.rules.toggleDoor(b) ? "1" : "0";
            }
            case "fill": {
                FurnaceEntity f = c.rules.furnaceAt(Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]));
                if (f == null) return "0";
                f.setSlot(Integer.parseInt(a[4]), a[5].equals("-") ? null : new ItemStack(a[5], Long.parseLong(a[6])));
                return "1";
            }
            case "mode": c.creative = a[1].equals("creative"); return "-";
            case "loading": c.rules.loading = a[1].equals("1"); return "-";
            default: throw new IllegalArgumentException(op);
        }
    }

    private static boolean isKnown(String id) {
        try { BlockDefinition.forId(id); return true; } catch (IllegalArgumentException e) { return false; }
    }

    private static String editsText(Ctx c) {
        List<WorldBlock> edits = new ArrayList<>(c.rules.world().storage().allEdits());
        edits.sort(Comparator.<WorldBlock>comparingDouble(b -> b.x).thenComparingDouble(b -> b.y).thenComparingDouble(b -> b.z));
        StringBuilder text = new StringBuilder();
        for (WorldBlock b : edits) {
            if (text.length() > 0) text.append(';');
            text.append((long) b.x).append(':').append((long) b.y).append(':').append((long) b.z).append(':');
            if (b.id == null) text.append('-');
            else text.append(b.id).append(':').append(b.state.size() == 0 ? "-" : b.state.toString());
        }
        return text.length() == 0 ? "-" : text.toString();
    }

    private static String furnacesText(Ctx c) {
        List<String> entries = new ArrayList<>();
        for (WorldBlock b : c.rules.world().storage().allEdits()) {
            if (!"furnace".equals(b.id)) continue;
            FurnaceEntity f = c.rules.furnaceAt(b.x, b.y, b.z);
            assertTrue(f != null, "a furnace block has its entity");
            entries.add((long) b.x + ":" + (long) b.y + ":" + (long) b.z + "=" + slot(f.slot(0)) + "/" + slot(f.slot(1)) + "/" + slot(f.slot(2)));
        }
        entries.sort(String::compareTo);
        return entries.isEmpty() ? "-" : String.join(";", entries);
    }

    private static String slot(ItemStack s) { return s == null ? "-" : s.id + "x" + s.count; }

    @Test void editsMatchJsAfterEveryOperation() throws Exception {
        var path = GoldenCsv.dir().resolve("worldrules").resolve("trace.csv");
        assertEquals("seed,step,op,ret,edits,furnaces,drops", Files.readAllLines(path).get(0));
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 1265, "fixture shrank");
        Ctx c = null;
        String seed = "";
        for (String[] r : rows) {
            if (!r[0].equals(seed)) { seed = r[0]; c = fresh(); }
            c.drops.clear();
            String ret = apply(c, r[2]);
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertEquals(r[3], ret, "return at " + where);
            assertEquals(r[4], editsText(c), "edits at " + where);
            assertEquals(r[5], furnacesText(c), "furnaces at " + where);
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

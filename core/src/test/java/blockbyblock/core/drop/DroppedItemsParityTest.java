package blockbyblock.core.drop;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.inventory.PlayerInventory;
import blockbyblock.core.world.VoxelWorld;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Replays every recorded JS DroppedItems operation and compares every pile and the inventory after each one. */
class DroppedItemsParityTest {
    private static final class Ctx {
        VoxelWorld world;
        PlayerInventory inv;
        DroppedItems drops;
    }

    private static Ctx fresh() {
        Ctx c = new Ctx();
        c.world = new VoxelWorld(0, new String[] {"bedrock", "dirt", "dirt", "grass.block"});
        for (int y = 4; y <= 6; y++) for (int x = -3; x <= 3; x++) c.world.setBlock(x, y, 6, "stone", null, 0, false);
        c.world.setBlock(0, 3, 0, null, null, 0, false);
        c.world.setBlock(1, 3, 0, null, null, 0, false);
        for (int x = 4; x <= 6; x++) for (int z = -1; z <= 1; z++) {
            c.world.setBlock(x, 3, z, null, null, 0, false);
            c.world.setBlock(x, 3, z, "water", null, 0, false);
        }
        c.inv = new PlayerInventory(stack -> {});
        c.drops = new DroppedItems(c.world, c.inv);
        return c;
    }

    private static Double opt(String t) { return t.equals("-") ? null : Double.valueOf(t); }

    private static void apply(Ctx c, String op) {
        String[] a = op.split(":", -1);
        switch (a[0]) {
            case "spawn":
                c.drops.spawn(a[1], Long.parseLong(a[2]), Double.parseDouble(a[3]), Double.parseDouble(a[4]), Double.parseDouble(a[5]),
                    a[6].equals("1"), opt(a[7]), opt(a[8]), opt(a[9]), a[10].equals("-") ? 0 : Integer.parseInt(a[10]));
                break;
            case "step": {
                int n = Integer.parseInt(a[1]);
                // At most 400 ticks per recorded operation.
                for (int i = 0; i < n; i++) c.drops.step(Double.parseDouble(a[2]), Double.parseDouble(a[3]), Double.parseDouble(a[4]),
                    Double.parseDouble(a[5]), a[6].equals("1"), !a[7].equals("0"));
                break;
            }
            case "waterlevel": c.world.setBlock(Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]), "water", null, Integer.parseInt(a[4]), a[5].equals("1")); break;
            case "give": c.inv.insert(a[1], Long.parseLong(a[2]), PlayerInventory.STORAGE, 0); break;
            case "block": c.world.setBlock(Double.parseDouble(a[1]), Double.parseDouble(a[2]), Double.parseDouble(a[3]),
                a[4].equals("-") ? null : a[4], null, 0, false); break;
            case "clear": for (int i = 0; i < 50; i++) c.inv.dropCarried(s -> {}); break;
            default: throw new IllegalArgumentException(op);
        }
    }

    private static String lotsText(DroppedItems.Pile p) {
        StringBuilder sb = new StringBuilder();
        for (DroppedItems.Lot l : p.lots) sb.append(sb.length() == 0 ? "" : ";").append(l.count).append('@').append(l.expires).append('@').append(l.pickup);
        return sb.length() == 0 ? "-" : sb.toString();
    }

    private static boolean sameLots(String expected, DroppedItems.Pile p) {
        if (expected.equals("-")) return p.lots.isEmpty();
        String[] parts = expected.split(";");
        if (parts.length != p.lots.size()) return false;
        for (int i = 0; i < parts.length; i++) {
            String[] f = parts[i].split("@");
            DroppedItems.Lot l = p.lots.get(i);
            if (Long.parseLong(f[0]) != l.count || !sameBits(num(f[1]), l.expires) || !sameBits(num(f[2]), l.pickup)) return false;
        }
        return true;
    }

    private static String slotText(PlayerInventory inv) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 50; i++) if (inv.get(i) != null) sb.append(sb.length() == 0 ? "" : "|").append(i).append(':').append(inv.get(i));
        return sb.length() == 0 ? "-" : sb.toString();
    }

    @Test void pilesMatchJsAfterEveryOperation() throws Exception {
        var path = GoldenCsv.dir().resolve("drops").resolve("trace.csv");
        assertEquals("seed,step,op,kind,a,b,c,d,e,f,g,h,i,j,k", Files.readAllLines(path).get(0));
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 40500, "fixture shrank");
        Ctx ctx = null;
        String key = "";
        int i = 0;
        List<String[]> pileRows = new ArrayList<>();
        // One summary row then one row per pile for each recorded operation.
        while (i < rows.size()) {
            String[] r = rows.get(i);
            String opKey = r[0] + "," + r[1];
            if (!r[0].equals(key.split(",")[0])) ctx = fresh();
            key = opKey;
            assertEquals("S", r[3], "summary row first at " + opKey);
            apply(ctx, r[2]);
            pileRows.clear();
            int j = i + 1;
            while (j < rows.size() && rows.get(j)[3].equals("P") && (rows.get(j)[0] + "," + rows.get(j)[1]).equals(opKey)) pileRows.add(rows.get(j++));
            String where = "seed " + r[0] + " step " + r[1] + " op " + r[2];
            assertTrue(sameBits(num(r[4]), ctx.drops.time()), "time at " + where);
            assertEquals(Long.parseLong(r[5]), ctx.drops.total(), "total at " + where);
            assertEquals(Integer.parseInt(r[6]), ctx.drops.piles().size(), "pile count at " + where);
            assertEquals(r[7], slotText(ctx.inv), "inventory at " + where);
            List<DroppedItems.Pile> actual = new ArrayList<>(ctx.drops.piles());
            actual.sort(Comparator.comparingInt(p -> p.id));
            assertEquals(pileRows.size(), actual.size(), "pile rows at " + where);
            for (int k = 0; k < actual.size(); k++) {
                String[] p = pileRows.get(k);
                DroppedItems.Pile q = actual.get(k);
                boolean ok = Integer.parseInt(p[4]) == q.id && p[5].equals(q.item) && Integer.parseInt(p[6]) == q.damage
                    && sameBits(num(p[7]), q.x) && sameBits(num(p[8]), q.y) && sameBits(num(p[9]), q.z)
                    && sameBits(num(p[10]), q.vx) && sameBits(num(p[11]), q.vy) && sameBits(num(p[12]), q.vz)
                    && Long.parseLong(p[13]) == q.count && sameLots(p[14], q);
                assertTrue(ok, "pile " + p[4] + " at " + where + "\n  expected " + String.join(",", p) + "\n  actual   " + q.id + "," + q.item + "," + q.damage + "," + q.x + "," + q.y + "," + q.z
                    + "," + q.vx + "," + q.vy + "," + q.vz + "," + q.count + "," + lotsText(q));
            }
            i = j;
        }
    }
}

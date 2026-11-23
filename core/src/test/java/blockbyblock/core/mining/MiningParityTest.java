package blockbyblock.core.mining;

import static blockbyblock.core.golden.GoldenCsv.num;
import static blockbyblock.core.golden.GoldenCsv.sameBits;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.inventory.PlayerInventory;
import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.world.shape.BlockDefinition;
import java.nio.file.Files;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The mining rules must agree with the JS on every recorded block / held item / condition. */
class MiningParityTest {
    private static List<String[]> table(String file, String header, int minRows) throws Exception {
        var path = GoldenCsv.dir().resolve("mining").resolve(file);
        assertEquals(header, Files.readAllLines(path).get(0), "fixture schema: " + file);
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= minRows, file + " shrank");
        return rows;
    }

    private static ItemDefinition held(String id) { return id.equals("-") ? null : ItemDefinition.forId(id); }

    @Test void progressAndHarvestMatchJs() throws Exception {
        for (String[] r : table("progress.csv", "block,held,grounded,underwater,harvest,progress", 8040)) {
            BlockDefinition block = BlockDefinition.forId(r[0]);
            String where = r[0] + " held " + r[1] + " grounded " + r[2] + " underwater " + r[3];
            assertEquals(r[4].equals("1"), Mining.canHarvest(block, held(r[1])), "harvest " + where);
            double actual = Mining.progress(block, held(r[1]), r[2].equals("1"), r[3].equals("1"));
            assertTrue(sameBits(num(r[5]), actual), "progress " + where + ": expected " + r[5] + " got " + actual);
        }
    }

    @Test void dropsMatchJs() throws Exception {
        for (String[] r : table("drops.csv", "block,mode,held,slab,random,drops", 8100)) {
            BlockDefinition block = BlockDefinition.forId(r[0]);
            double random = num(r[4]);
            var drops = BlockDrops.of(block, held(r[2]), r[1].equals("creative"), r[3].equals("double"), () -> random);
            StringBuilder text = new StringBuilder();
            // At most one drop per block.
            for (int i = 0; i < drops.length; i++) text.append(i == 0 ? "" : ";").append(drops[i].id).append(':').append(drops[i].count);
            assertEquals(r[5], drops.length == 0 ? "-" : text.toString(),
                "drops " + r[0] + " " + r[1] + " held " + r[2] + " slab " + r[3] + " random " + r[4]);
        }
    }

    @Test void toolWearMatchesJs() throws Exception {
        for (String[] r : table("wear.csv", "tool,block,mode,damage,after", 3364)) {
            PlayerInventory inv = new PlayerInventory(stack -> {});
            if (r[1].startsWith("direct")) {
                inv.insert("iron.pickaxe", 1, PlayerInventory.HOTBAR, Integer.parseInt(r[3]));
                boolean ret = inv.damageMainTool(false, Integer.parseInt(r[1].substring(6)));
                ItemStack after = inv.get(0);
                assertEquals(r[4], (ret ? "y" : "n") + (after == null ? "broken" : Integer.toString(after.damage)), "direct " + r[1]);
                continue;
            }
            int worn = Integer.parseInt(r[3]);
            boolean durable = ItemDefinition.forId(r[0]).durability > 0;
            inv.insert(r[0], 1, PlayerInventory.HOTBAR, worn != 0 && durable ? worn : 0);
            ToolWear.miningToolWear(inv, r[2].equals("creative"), BlockDefinition.forId(r[1]));
            ItemStack after = inv.get(0);
            assertEquals(r[4], after == null ? "broken" : Integer.toString(after.damage), "wear " + String.join(",", r));
        }
    }
}

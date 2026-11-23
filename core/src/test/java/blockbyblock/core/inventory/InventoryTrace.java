package blockbyblock.core.inventory;

import java.util.ArrayList;
import java.util.List;

/** Replays a recorded operation on the Java inventory and renders the state as the JS recorder does. */
final class InventoryTrace {
    private InventoryTrace() {}

    static String stackText(ItemStack s) { return s == null ? "-" : s.toString(); }

    static int[] target(String name) {
        return switch (name) {
            case "storage" -> PlayerInventory.STORAGE;
            case "main" -> PlayerInventory.MAIN;
            case "hotbar" -> PlayerInventory.HOTBAR;
            default -> throw new IllegalArgumentException(name);
        };
    }

    static SavedInventory parseLoad(String text) {
        String[] parts = text.split(":", -1);
        SavedInventory data = new SavedInventory();
        if (!parts[0].equals("-")) for (String part : parts[0].split("\\|")) {
            String[] kv = part.split("=", 2);
            data.slots.put(Integer.parseInt(kv[0]), parseSaved(kv[1]));
        }
        data.cursor = parseSaved(parts[1]);
        data.selected = parts[2].equals("-") ? null : Double.valueOf(parts[2]);
        return data;
    }

    private static SavedInventory.SavedStack parseSaved(String part) {
        if (part.equals("-")) return null;
        int x = part.lastIndexOf('x');
        String id = part.substring(0, x), rest = part.substring(x + 1);
        int d = rest.indexOf('d');
        return new SavedInventory.SavedStack(id, Double.parseDouble(d < 0 ? rest : rest.substring(0, d)), d < 0 ? 0 : Integer.parseInt(rest.substring(d + 1)));
    }

    /** Applies one op; returns the "ret" field. Drops are appended to {@code drops}. */
    static String apply(PlayerInventory inv, String op, List<ItemStack> drops) {
        String[] t = op.split(":", -1);
        String name = t[0];
        switch (name) {
            case "insert": {
                int damage = Integer.parseInt(t[4]);
                boolean worn = damage != 0 && blockbyblock.core.item.ItemDefinition.forId(t[1]).durability > 0;
                return Long.toString(inv.insert(t[1], Long.parseLong(t[2]), target(t[3]), worn ? damage : 0));
            }
            case "click": inv.click(Integer.parseInt(t[1]), Integer.parseInt(t[2])); return "-";
            case "drag": {
                List<Integer> indices = new ArrayList<>();
                for (String i : t[1].split("\\|")) indices.add(Integer.parseInt(i));
                inv.drag(indices, Integer.parseInt(t[2]));
                return "-";
            }
            case "shift": inv.shift(Integer.parseInt(t[1])); return "-";
            case "select": inv.select(Integer.parseInt(t[1])); return "-";
            case "consume": return inv.consumeSelected() ? "1" : "0";
            case "collect": inv.collect(t[1]); return "-";
            case "swap": return inv.swap(Integer.parseInt(t[1]), Integer.parseInt(t[2])) ? "1" : "0";
            case "drop": return inv.drop(Integer.parseInt(t[1]), t[2].equals("1")) ? "1" : "0";
            case "dropcursor": inv.dropCursor(t[1].equals("1")); return "-";
            case "pick": return inv.pick(t[1], t[2].equals("1")) ? "1" : "0";
            case "shiftmatching": inv.shiftMatching(t[1], t[2].equals("1"), t.length > 3 && t[3].equals("1")); return "-";
            case "begin": inv.beginCrafting(Integer.parseInt(t[1])); return "-";
            case "end": inv.endCrafting(); return "-";
            case "take": return Integer.toString(inv.takeCrafted(PlayerInventory.Destination.valueOf(t[1].toUpperCase()), t[2].equals("1"), Integer.parseInt(t[3])));
            case "fill": {
                var r = inv.fillCraftingGrid(t[1], t[2].equals("1"));
                return r.ok ? "ok" + r.crafts : "no:" + r.reason;
            }
            case "canmake": return inv.canMakeRecipe(blockbyblock.core.recipe.Recipes.recipe(t[1])) ? "1" : "0";
            case "capacity": return Long.toString(inv.capacity(t[1], target(t[2]), 0));
            case "close": inv.close(); return "-";
            case "dropcarried": inv.dropCarried(drops::add); return "-";
            case "reload": inv.load(inv.save()); return "-";
            case "load": inv.load(parseLoad(op.substring(5))); return "-";
            default: throw new IllegalArgumentException("unknown op " + op);
        }
    }

    static String state(PlayerInventory inv, List<ItemStack> drops, String ret) {
        StringBuilder slots = new StringBuilder();
        // 50 slots at most.
        for (int i = 0; i < 50; i++) if (inv.get(i) != null) slots.append(slots.length() == 0 ? "" : "|").append(i).append(':').append(stackText(inv.get(i)));
        StringBuilder dropText = new StringBuilder();
        for (ItemStack d : drops) dropText.append(dropText.length() == 0 ? "" : "|").append(stackText(d));
        CraftMatch result = inv.craftingResult();
        String out = result == null ? "-" : result.recipe.outputId + "x" + result.recipe.outputCount;
        return "sel=" + inv.selected() + ";cur=" + stackText(inv.cursor()) + ";slots=" + (slots.length() == 0 ? "-" : slots)
            + ";craft=" + (inv.craftingActive() ? Integer.toString(inv.craftingSize()) : "off") + ";out=" + out
            + ";drops=" + (dropText.length() == 0 ? "-" : dropText) + ";ret=" + ret;
    }
}

package blockbyblock.core.inventory;

import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.recipe.Ingredient;
import blockbyblock.core.recipe.RecipeDefinition;
import blockbyblock.core.recipe.Recipes;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Port of RecipeRegistry.match in src/recipes.js: same recipe order, same offsets, same consume order. */
public final class RecipeMatcher {
    private RecipeMatcher() {}

    private static boolean accepts(ItemStack stack, Ingredient input) {
        if (input == null) return stack == null;
        return stack != null && stack.count >= input.count && input.matches(stack.id, ItemDefinition.forId(stack.id));
    }

    private static int filledCells(RecipeDefinition recipe) {
        int n = 0;
        // At most nine cells per recipe.
        for (int i = 0; i < recipe.cellCount(); i++) if (recipe.cell(i) != null) n++;
        return n;
    }

    /** The first recipe, in registration order, that fits {@code grid} (row-major, size x size), or null. */
    public static CraftMatch match(ItemStack[] grid, int size) {
        int filled = 0;
        for (ItemStack stack : grid) if (stack != null) filled++;
        // The registry holds a few dozen recipes; each is tried in order, as the JS does per (size, count) bucket.
        for (RecipeDefinition recipe : Recipes.all()) {
            if (!(size == 2 ? recipe.fitsGrid2 : recipe.fitsGrid3) || filledCells(recipe) != filled) continue;
            CraftMatch found = recipe.shaped ? matchShaped(recipe, grid, size) : matchShapeless(recipe, grid);
            if (found != null) return found;
        }
        return null;
    }

    private static CraftMatch matchShaped(RecipeDefinition recipe, ItemStack[] grid, int size) {
        boolean[] mirrors = recipe.mirror && recipe.width > 1 ? new boolean[] {false, true} : new boolean[] {false};
        // Offsets and mirrors are bounded by the 3x3 grid.
        for (int y = 0; y <= size - recipe.height; y++) for (int x = 0; x <= size - recipe.width; x++) {
            for (boolean mirrored : mirrors) {
                List<int[]> consume = new ArrayList<>();
                boolean matches = true;
                for (int i = 0; i < size * size; i++) {
                    int cx = i % size - x, cy = i / size - y;
                    Ingredient input = cx >= 0 && cx < recipe.width && cy >= 0 && cy < recipe.height
                        ? recipe.cell(cy * recipe.width + (mirrored ? recipe.width - cx - 1 : cx)) : null;
                    if (!accepts(grid[i], input)) { matches = false; break; }
                    if (input != null) consume.add(new int[] {i, input.count});
                }
                if (matches) return result(recipe, consume);
            }
        }
        return null;
    }

    private static CraftMatch result(RecipeDefinition recipe, List<int[]> consume) {
        int[] index = new int[consume.size()], count = new int[consume.size()];
        for (int i = 0; i < index.length; i++) { index[i] = consume.get(i)[0]; count[i] = consume.get(i)[1]; }
        return new CraftMatch(recipe, index, count);
    }

    private static CraftMatch matchShapeless(RecipeDefinition recipe, ItemStack[] grid) {
        List<Integer> slots = new ArrayList<>(); // grid indices of the filled cells
        for (int i = 0; i < grid.length; i++) if (grid[i] != null) slots.add(i);
        // Insertion order matters: the consume list follows it, exactly like a JS Map.
        Map<Integer, Integer> owners = new LinkedHashMap<>();
        for (int input = 0; input < recipe.cellCount(); input++) {
            if (!assign(recipe, grid, slots, owners, input, new HashSet<>())) return null;
        }
        List<int[]> consume = new ArrayList<>();
        for (Map.Entry<Integer, Integer> owner : owners.entrySet())
            consume.add(new int[] {slots.get(owner.getKey()), recipe.cell(owner.getValue()).count});
        return result(recipe, consume);
    }

    /** Bipartite assignment of recipe inputs to filled slots (augmenting paths), as in the JS. */
    private static boolean assign(RecipeDefinition recipe, ItemStack[] grid, List<Integer> slots,
                                  Map<Integer, Integer> owners, int inputIndex, Set<Integer> seen) {
        // At most nine slots; recursion depth is bounded by the number of inputs.
        for (int s = 0; s < slots.size(); s++) {
            if (seen.contains(s) || !accepts(grid[slots.get(s)], recipe.cell(inputIndex))) continue;
            seen.add(s);
            if (!owners.containsKey(s) || assign(recipe, grid, slots, owners, owners.get(s), seen)) {
                owners.put(s, inputIndex);
                return true;
            }
        }
        return false;
    }
}

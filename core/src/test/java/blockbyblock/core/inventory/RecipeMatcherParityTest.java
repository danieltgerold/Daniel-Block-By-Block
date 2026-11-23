package blockbyblock.core.inventory;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Every grid in tests/golden/crafting/match.csv must pick the same recipe and consume the same cells as the JS matcher. */
class RecipeMatcherParityTest {
    static ItemStack[] parseGrid(String text) {
        String[] cells = text.split(";", -1);
        ItemStack[] grid = new ItemStack[cells.length];
        // At most nine cells.
        for (int i = 0; i < cells.length; i++) {
            if (cells[i].equals("-")) continue;
            int colon = cells[i].lastIndexOf(':');
            grid[i] = new ItemStack(cells[i].substring(0, colon), Integer.parseInt(cells[i].substring(colon + 1)));
        }
        return grid;
    }

    @Test void matchesJsOnEveryRecordedGrid() throws Exception {
        var path = GoldenCsv.dir().resolve("crafting").resolve("match.csv");
        assertEquals("case,size,grid,recipe,consume", Files.readAllLines(path).get(0), "fixture schema");
        List<String[]> rows = GoldenCsv.read(path);
        assertTrue(rows.size() >= 2578, "fixture shrank");
        List<String> mismatches = new ArrayList<>();
        int matched = 0;
        for (String[] r : rows) {
            ItemStack[] grid = parseGrid(r[2]);
            CraftMatch match = RecipeMatcher.match(grid, Integer.parseInt(r[1]));
            String recipe = match == null ? "" : match.recipe.id;
            StringBuilder consume = new StringBuilder();
            if (match != null) {
                matched++;
                // At most nine consumed cells.
                for (int i = 0; i < match.cellCount(); i++) consume.append(i == 0 ? "" : ";").append(match.index(i)).append(':').append(match.count(i));
            }
            if ((!recipe.equals(r[3]) || !consume.toString().equals(r[4])) && mismatches.size() < 8)
                mismatches.add("case " + r[0] + " grid " + r[2] + ": expected " + r[3] + " [" + r[4] + "] got " + recipe + " [" + consume + "]");
        }
        assertTrue(mismatches.isEmpty(), mismatches.size() + "+ mismatches:\n" + String.join("\n", mismatches));
        assertTrue(matched >= 1063, "matched count " + matched);
    }
}

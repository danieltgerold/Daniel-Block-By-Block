package blockbyblock.core.recipe;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import blockbyblock.core.golden.GoldenCsv;
import blockbyblock.core.item.ItemDefinition;
import java.nio.file.Files;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The generated recipe, smelting and fuel tables must say what the JS registries say. */
class RecipeRegistryTest {
    private static List<String[]> table(String file, String header) throws Exception {
        var path = GoldenCsv.dir().resolve("registry").resolve(file);
        assertEquals(header, Files.readAllLines(path).get(0), "fixture schema: " + file);
        return GoldenCsv.read(path);
    }

    private static String cellText(Ingredient cell) {
        return cell == null ? "-" : cell.kind.name().toLowerCase() + ":" + cell.value() + "*" + cell.count;
    }

    @Test void everyRecipeMatchesFieldForField() throws Exception {
        var rows = table("recipes.csv", "id,type,width,height,grids,mirror,category,outputId,outputCount,cells");
        RecipeDefinition[] all = Recipes.all();
        assertEquals(rows.size(), all.length, "recipe count");
        assertTrue(rows.size() >= 74, "registry shrank");
        // One row per registered recipe, in registration order.
        for (int i = 0; i < rows.size(); i++) {
            String[] r = rows.get(i);
            RecipeDefinition d = all[i];
            assertEquals(r[0], d.id, "order at " + i);
            assertEquals(d, Recipes.recipe(r[0]), "lookup " + r[0]);
            assertEquals(r[1].equals("shaped"), d.shaped, "type " + r[0]);
            assertEquals(Integer.parseInt(r[2]), d.width, "width " + r[0]);
            assertEquals(Integer.parseInt(r[3]), d.height, "height " + r[0]);
            List<String> grids = List.of(r[4].split("\\|"));
            assertEquals(grids.contains("2"), d.fitsGrid2, "grid 2 " + r[0]);
            assertEquals(grids.contains("3"), d.fitsGrid3, "grid 3 " + r[0]);
            assertEquals(r[5].equals("1"), d.mirror, "mirror " + r[0]);
            assertEquals(r[6], d.category, "category " + r[0]);
            assertEquals(r[7], d.outputId, "output " + r[0]);
            assertTrue(ItemDefinition.exists(d.outputId), "output is a known item: " + r[0]);
            assertEquals(Integer.parseInt(r[8]), d.outputCount, "outputCount " + r[0]);
            StringBuilder cells = new StringBuilder();
            // One entry per recipe cell, at most nine.
            for (int c = 0; c < d.cellCount(); c++) cells.append(c == 0 ? "" : ";").append(cellText(d.cell(c)));
            assertEquals(r[9], cells.toString(), "cells " + r[0]);
        }
    }

    @Test void smeltingAndFuelsMatch() throws Exception {
        var smelting = table("smelting.csv", "id,input,output,count,ticks");
        SmeltingRecipe[] all = Recipes.smelting();
        assertEquals(smelting.size(), all.length);
        for (int i = 0; i < all.length; i++) {
            String[] r = smelting.get(i);
            assertEquals(r[0], all[i].id);
            assertEquals(r[1], all[i].input);
            assertEquals(r[2], all[i].output);
            assertEquals(Integer.parseInt(r[3]), all[i].count);
            assertEquals(Integer.parseInt(r[4]), all[i].ticks);
            assertEquals(all[i], Recipes.smeltingFor(r[1]), "lookup by input " + r[1]);
        }
        var fuels = table("fuels.csv", "id,ticks");
        assertEquals(fuels.size(), Recipes.fuels().length);
        for (String[] r : fuels) assertEquals(Integer.parseInt(r[1]), Recipes.fuelTicks(r[0]), "fuel " + r[0]);
        assertEquals(0, Recipes.fuelTicks("stone"));
        assertNull(Recipes.smeltingFor("dirt"));
        assertNull(Recipes.recipe("nope"));
    }

    @Test void tagIngredientsMatchByItemTags() {
        Ingredient planks = Recipes.recipe("sticks").cell(0);
        assertNotNull(planks);
        assertEquals(Ingredient.Kind.TAG, planks.kind);
        assertTrue(planks.matches("pine.planks", ItemDefinition.forId("pine.planks")));
        assertTrue(planks.matches("oak.planks", ItemDefinition.forId("oak.planks")));
        assertFalse(planks.matches("oak.log", ItemDefinition.forId("oak.log")));
        assertFalse(planks.matches("stick", ItemDefinition.forId("stick")));
    }
}

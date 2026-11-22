package blockbyblock.core.recipe;

import java.util.HashMap;
import java.util.Map;

/** Read access to the generated crafting, smelting and fuel tables. */
public final class Recipes {
    private Recipes() {}

    private static final RecipeDefinition[] RECIPES = GeneratedRecipes.recipes();
    private static final SmeltingRecipe[] SMELTING = GeneratedRecipes.smelting();
    private static final Fuel[] FUELS = GeneratedRecipes.fuels();
    // Lookup tables only; never iterated, so hash order cannot matter.
    private static final Map<String, RecipeDefinition> RECIPE_BY_ID = new HashMap<>();
    private static final Map<String, SmeltingRecipe> SMELTING_BY_INPUT = new HashMap<>();
    private static final Map<String, Fuel> FUEL_BY_ID = new HashMap<>();
    static {
        for (RecipeDefinition r : RECIPES) RECIPE_BY_ID.put(r.id, r);
        for (SmeltingRecipe r : SMELTING) SMELTING_BY_INPUT.put(r.input, r);
        for (Fuel f : FUELS) FUEL_BY_ID.put(f.id, f);
    }

    /** Crafting recipes in registration order (the order the JS matcher tries them). */
    public static RecipeDefinition[] all() { return RECIPES.clone(); }
    public static SmeltingRecipe[] smelting() { return SMELTING.clone(); }
    public static Fuel[] fuels() { return FUELS.clone(); }

    public static RecipeDefinition recipe(String id) { return RECIPE_BY_ID.get(id); }
    /** The furnace recipe for an input item, or null. */
    public static SmeltingRecipe smeltingFor(String inputId) { return SMELTING_BY_INPUT.get(inputId); }
    /** Burn ticks for a fuel item, or 0 when it is not a fuel. */
    public static int fuelTicks(String id) { Fuel fuel = FUEL_BY_ID.get(id); return fuel == null ? 0 : fuel.ticks; }
}

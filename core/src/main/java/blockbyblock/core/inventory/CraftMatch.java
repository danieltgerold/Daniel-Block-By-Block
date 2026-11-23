package blockbyblock.core.inventory;

import blockbyblock.core.recipe.RecipeDefinition;

/** A recipe chosen for a grid, with the cells to consume from (in the order the JS matcher reports them). */
public final class CraftMatch {
    public final RecipeDefinition recipe;
    private final int[] index;
    private final int[] count;

    CraftMatch(RecipeDefinition recipe, int[] index, int[] count) {
        this.recipe = recipe;
        this.index = index;
        this.count = count;
    }

    public int cellCount() { return index.length; }
    /** Grid cell index of the i-th consumed input. */
    public int index(int i) { return index[i]; }
    /** How many items the i-th consumed input takes. */
    public int count(int i) { return count[i]; }
}

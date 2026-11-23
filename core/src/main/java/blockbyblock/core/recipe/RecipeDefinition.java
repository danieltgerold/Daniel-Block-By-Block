package blockbyblock.core.recipe;

/** A crafting recipe as registered in src/recipes.js. Shapeless recipes have width and height 0. */
public final class RecipeDefinition {
    public final String id;
    public final boolean shaped;
    public final int width, height;
    public final boolean fitsGrid2, fitsGrid3;
    public final boolean mirror;
    public final String category;
    public final String outputId;
    public final int outputCount;
    private final Ingredient[] cells;

    RecipeDefinition(String id, boolean shaped, int width, int height, boolean fitsGrid2, boolean fitsGrid3, boolean mirror,
                     String category, String outputId, int outputCount, Ingredient[] cells) {
        this.id = id;
        this.shaped = shaped;
        this.width = width;
        this.height = height;
        this.fitsGrid2 = fitsGrid2;
        this.fitsGrid3 = fitsGrid3;
        this.mirror = mirror;
        this.category = category;
        this.outputId = outputId;
        this.outputCount = outputCount;
        this.cells = cells.clone();
    }

    public int cellCount() { return cells.length; }

    /** The ingredient at a cell of the recipe's own grid (row-major, width columns), or null for an empty cell. */
    public Ingredient cell(int index) { return cells[index]; }
}

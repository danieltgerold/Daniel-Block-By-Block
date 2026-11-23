package blockbyblock.core.recipe;

/** Furnace recipe: one input item becomes {@code count} of the output after {@code ticks} ticks. */
public final class SmeltingRecipe {
    public final String id, input, output;
    public final int count, ticks;

    SmeltingRecipe(String id, String input, String output, int count, int ticks) {
        this.id = id;
        this.input = input;
        this.output = output;
        this.count = count;
        this.ticks = ticks;
    }
}

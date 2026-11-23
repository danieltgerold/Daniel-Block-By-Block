package blockbyblock.core.recipe;

/** An item a furnace can burn, and for how many ticks. */
public final class Fuel {
    public final String id;
    public final int ticks;

    Fuel(String id, int ticks) {
        this.id = id;
        this.ticks = ticks;
    }
}

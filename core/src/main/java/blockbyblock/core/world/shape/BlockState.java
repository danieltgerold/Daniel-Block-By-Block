package blockbyblock.core.world.shape;

/** Immutable geometry state: callers supply resolved stairs and projected properties. */
public final class BlockState {
    public final Shape shape;
    public final String type;
    public final String facing;
    public final String half;
    public final String stairShape;
    public final String hinge;
    public final boolean open;

    private BlockState(Shape shape, String type, String facing, String half,
                       String stairShape, String hinge, boolean open) {
        this.shape = shape;
        this.type = type;
        this.facing = facing;
        this.half = half;
        this.stairShape = stairShape;
        this.hinge = hinge;
        this.open = open;
    }

    /** Relevant fields are explicit; irrelevant string fields must be empty. */
    public static BlockState of(BlockDefinition definition, String type, String facing,
                                String half, String stairShape, String hinge, boolean open) {
        if (definition == null) throw new IllegalArgumentException("Definition must not be null");
        if (type == null || facing == null || half == null || stairShape == null || hinge == null)
            throw new IllegalArgumentException("State fields must not be null");
        Shape shape = definition.shape;
        if (shape == Shape.SLAB) requireOneOf(type, "bottom", "top", "double");
        else requireEmpty(type);
        if (shape == Shape.STAIRS || shape == Shape.DOOR)
            requireOneOf(facing, "north", "east", "south", "west");
        else requireEmpty(facing);
        if (shape == Shape.STAIRS) {
            requireOneOf(half, "bottom", "top");
            requireOneOf(stairShape, "straight", "inner-left", "inner-right", "outer-left", "outer-right");
        } else {
            requireEmpty(half);
            requireEmpty(stairShape);
        }
        if (shape == Shape.DOOR) requireOneOf(hinge, "left", "right");
        else {
            requireEmpty(hinge);
            if (open) throw new IllegalArgumentException("Only doors have an open state");
        }
        return new BlockState(shape, type, facing, half, stairShape, hinge, open);
    }

    private static void requireEmpty(String value) {
        if (!value.isEmpty()) throw new IllegalArgumentException("Irrelevant geometry state: " + value);
    }

    private static void requireOneOf(String value, String... choices) {
        // The largest geometry enum has five values; no dynamic registry scan.
        for (String choice : choices) if (choice.equals(value)) return;
        throw new IllegalArgumentException("Invalid geometry state: " + value);
    }
}

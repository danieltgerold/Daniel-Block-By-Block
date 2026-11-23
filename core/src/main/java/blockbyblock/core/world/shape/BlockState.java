package blockbyblock.core.world.shape;

import java.util.Arrays;

/**
 * Immutable state of a block: the properties its definition declares (generated from the JS registry's default
 * state), each holding a validated value. Values are kept as canonical text, so two states are equal exactly
 * when the JS would call them the same: same properties, same values.
 *
 * <p>The geometry fields (type, facing, half, stairShape, hinge, open) are read-only views of the matching
 * properties, empty or false when the block does not have them.
 */
public final class BlockState {
    public final Shape shape;
    public final String type;
    public final String facing;
    public final String half;
    public final String stairShape;
    public final String hinge;
    public final boolean open;
    private final String[] keys;
    private final String[] values;

    private BlockState(Shape shape, String[] keys, String[] values) {
        this.shape = shape;
        this.keys = keys;
        this.values = values;
        this.type = text("type");
        this.facing = text("facing");
        this.half = text("half");
        this.stairShape = text("shape");
        this.hinge = text("hinge");
        this.open = "true".equals(text("open"));
    }

    private String text(String key) {
        String value = get(key);
        return value == null ? "" : value;
    }

    /** The definition's own default state. */
    public static BlockState defaults(BlockDefinition definition) {
        if (definition == null) throw new IllegalArgumentException("Definition must not be null");
        String[] keys = definition.stateKeys(), values = definition.stateDefaults();
        // A handful of properties per block.
        for (int i = 0; i < keys.length; i++) validate(definition.shape, keys[i], values[i]);
        return new BlockState(definition.shape, keys, values);
    }

    /**
     * Geometry-oriented factory kept from before the generic model: starts from the defaults and applies every
     * non-empty argument. Setting something the block does not have is an error.
     */
    public static BlockState of(BlockDefinition definition, String type, String facing,
                                String half, String stairShape, String hinge, boolean open) {
        if (definition == null) throw new IllegalArgumentException("Definition must not be null");
        if (type == null || facing == null || half == null || stairShape == null || hinge == null)
            throw new IllegalArgumentException("State fields must not be null");
        // Relevant fields are explicit: a slab needs its type, stairs their facing, half and shape, a door its
        // facing and hinge. A door's half is optional (it defaults to the lower half).
        Shape shape = definition.shape;
        if (shape == Shape.SLAB && type.isEmpty() || shape == Shape.STAIRS && (facing.isEmpty() || half.isEmpty() || stairShape.isEmpty())
            || shape == Shape.DOOR && (facing.isEmpty() || hinge.isEmpty()))
            throw new IllegalArgumentException("Relevant geometry state must be explicit");
        BlockState state = defaults(definition);
        state = apply(state, "type", type);
        state = apply(state, "facing", facing);
        state = apply(state, "half", half);
        state = apply(state, "shape", stairShape);
        state = apply(state, "hinge", hinge);
        if (open) state = apply(state, "open", "true");
        return state;
    }

    private static BlockState apply(BlockState state, String key, String value) {
        if (value.isEmpty()) return state;
        if (!state.has(key)) throw new IllegalArgumentException("Irrelevant geometry state: " + value);
        return state.with(key, value);
    }

    public boolean has(String key) { return indexOf(key) >= 0; }

    private int indexOf(String key) {
        // A handful of properties per block.
        for (int i = 0; i < keys.length; i++) if (keys[i].equals(key)) return i;
        return -1;
    }

    /** The value of a property as text, or null when this block has no such property. */
    public String get(String key) {
        int i = indexOf(key);
        return i < 0 ? null : values[i];
    }

    public int getInt(String key) { return Integer.parseInt(required(key)); }

    public boolean getBool(String key) { return required(key).equals("true"); }

    private String required(String key) {
        String value = get(key);
        if (value == null) throw new IllegalArgumentException("Block state has no property " + key);
        return value;
    }

    public int size() { return keys.length; }
    public String key(int i) { return keys[i]; }
    public String value(int i) { return values[i]; }

    /** A copy with one property changed; the property must exist and the value must be valid for it. */
    public BlockState with(String key, String value) {
        int i = indexOf(key);
        if (i < 0) throw new IllegalArgumentException("Block state has no property " + key);
        validate(shape, key, value);
        String[] next = values.clone();
        next[i] = value;
        return new BlockState(shape, keys, next);
    }

    public BlockState with(String key, int value) { return with(key, Integer.toString(value)); }

    public BlockState with(String key, boolean value) { return with(key, Boolean.toString(value)); }

    private static void validate(Shape shape, String key, String value) {
        if (value == null) throw new IllegalArgumentException("State value must not be null for " + key);
        switch (key) {
            case "type": oneOf(key, value, "bottom", "top", "double"); break;
            case "facing": oneOf(key, value, "north", "east", "south", "west"); break;
            case "half":
                if (shape == Shape.DOOR) oneOf(key, value, "lower", "upper");
                else oneOf(key, value, "bottom", "top");
                break;
            case "shape": oneOf(key, value, "straight", "inner-left", "inner-right", "outer-left", "outer-right"); break;
            case "hinge": oneOf(key, value, "left", "right"); break;
            case "open": case "lit": case "persistent": oneOf(key, value, "true", "false"); break;
            case "axis": oneOf(key, value, "x", "y", "z"); break;
            case "moisture": case "distance": wholeNumber(key, value, 0, 7); break;
            case "dryTicks": wholeNumber(key, value, 0, Integer.MAX_VALUE); break;
            default: throw new IllegalArgumentException("Unknown state property: " + key);
        }
    }

    private static void oneOf(String key, String value, String... choices) {
        // The largest value set has five entries.
        for (String choice : choices) if (choice.equals(value)) return;
        throw new IllegalArgumentException("Invalid value for " + key + ": " + value);
    }

    private static void wholeNumber(String key, String value, int min, int max) {
        int parsed;
        try { parsed = Integer.parseInt(value); } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid value for " + key + ": " + value);
        }
        if (parsed < min || parsed > max || !Integer.toString(parsed).equals(value))
            throw new IllegalArgumentException("Invalid value for " + key + ": " + value);
    }

    @Override public boolean equals(Object o) {
        return o instanceof BlockState s && s.shape == shape && Arrays.equals(keys, s.keys) && Arrays.equals(values, s.values);
    }

    @Override public int hashCode() { return shape.hashCode() * 31 + Arrays.hashCode(keys) * 17 + Arrays.hashCode(values); }

    /** Canonical text, {@code key=value} joined by {@code |}; the golden CSV uses the same form. */
    @Override public String toString() {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < keys.length; i++) text.append(i == 0 ? "" : "|").append(keys[i]).append('=').append(values[i]);
        return text.toString();
    }
}

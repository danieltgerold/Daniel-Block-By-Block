package blockbyblock.core.world.shape;

import java.util.HashMap;
import java.util.Map;

/**
 * Immutable projection of the JS block registry. The table is generated into {@link GeneratedBlocks}
 * from src/block-types.js; nothing here is edited by hand when a block is added.
 */
public final class BlockDefinition {
    public final String id;
    public final Shape shape;
    public final boolean solid;
    public final boolean opaque;
    public final double hardness;
    public final double breakTicks;
    public final boolean requiresTool;
    /** "pickaxe", "axe", "shovel" or "shears"; null when no tool is preferred. */
    public final String preferredTool;
    public final int harvestLevel;
    public final int maxStack;
    public final boolean falling;
    public final DropRule dropRule;
    /** Item dropped; null when the block drops nothing. For SELF it equals {@link #id}. */
    public final String dropItem;
    public final int dropCount;
    /** Upper bound for RANGE drops; 0 otherwise. */
    public final int dropMax;
    private final String[] tags;
    private final String[] stateKeys;
    private final String[] stateDefaults;

    BlockDefinition(String id, Shape shape, boolean solid, boolean opaque, double hardness, double breakTicks,
                    boolean requiresTool, String preferredTool, int harvestLevel, int maxStack, boolean falling,
                    DropRule dropRule, String dropItem, int dropCount, int dropMax, String[] tags,
                    String[] stateKeys, String[] stateDefaults) {
        this.id = id;
        this.shape = shape;
        this.solid = solid;
        this.opaque = opaque;
        this.hardness = hardness;
        this.breakTicks = breakTicks;
        this.requiresTool = requiresTool;
        this.preferredTool = preferredTool;
        this.harvestLevel = harvestLevel;
        this.maxStack = maxStack;
        this.falling = falling;
        this.dropRule = dropRule;
        this.dropItem = dropItem;
        this.dropCount = dropCount;
        this.dropMax = dropMax;
        this.tags = tags.clone();
        this.stateKeys = stateKeys.clone();
        this.stateDefaults = stateDefaults.clone();
    }

    public boolean hasTag(String tag) {
        // Short fixed arrays from the generated table.
        for (String t : tags) if (t.equals(tag)) return true;
        return false;
    }

    /** The state properties this block has, in the JS registry's order (empty for most blocks). */
    public String[] stateKeys() { return stateKeys.clone(); }

    /** Default values for {@link #stateKeys()}, as canonical text. */
    public String[] stateDefaults() { return stateDefaults.clone(); }

    private static final Map<String, BlockDefinition> BY_ID = new HashMap<>(); // lookup only; never iterated
    private static final BlockDefinition[] ALL = GeneratedBlocks.all();
    static {
        for (BlockDefinition definition : ALL) BY_ID.put(definition.id, definition);
    }

    /** Every block in registration order. */
    public static BlockDefinition[] all() { return ALL.clone(); }

    /** Exact known identities only; prefix/suffix guesses must not register new IDs. */
    public static BlockDefinition forId(String id) {
        if (id == null) throw new IllegalArgumentException("Block ID must not be null");
        BlockDefinition definition = BY_ID.get(id);
        if (definition == null) throw new IllegalArgumentException("Unknown block ID: " + id);
        return definition;
    }
}

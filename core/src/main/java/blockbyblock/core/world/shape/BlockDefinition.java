package blockbyblock.core.world.shape;

/** Immutable geometry projection of the current JS registry; no gameplay hooks. */
public final class BlockDefinition {
    public final String id;
    public final Shape shape;
    public final boolean solid;
    public final boolean opaque;

    private BlockDefinition(String id, Shape shape, boolean solid, boolean opaque) {
        this.id = id;
        this.shape = shape;
        this.solid = solid;
        this.opaque = opaque;
    }

    /** Exact known identities only; prefix/suffix guesses must not register new IDs. */
    public static BlockDefinition forId(String id) {
        if (id == null) throw new IllegalArgumentException("Block ID must not be null");
        return switch (id) {
            case "bedrock", "stone", "cobblestone", "dirt", "grass.block", "sand", "gravel",
                 "oak.log", "oak.planks", "pine.log", "pine.planks", "crafting.table", "furnace" ->
                new BlockDefinition(id, Shape.CUBE, true, true);
            case "glass", "oak.leaves", "pine.leaves" ->
                new BlockDefinition(id, Shape.CUBE, true, false);
            case "oak.slab", "pine.slab" -> new BlockDefinition(id, Shape.SLAB, true, false);
            case "oak.stairs", "pine.stairs" -> new BlockDefinition(id, Shape.STAIRS, true, false);
            case "oak.door", "pine.door" -> new BlockDefinition(id, Shape.DOOR, true, false);
            case "oak.fence", "pine.fence" -> new BlockDefinition(id, Shape.FENCE, true, false);
            case "water" -> new BlockDefinition(id, Shape.FLUID, false, false);
            default -> throw new IllegalArgumentException("Unknown block ID: " + id);
        };
    }
}

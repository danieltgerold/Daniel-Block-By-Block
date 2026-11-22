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
            case "bedrock", "stone", "cobblestone", "dirt", "grass.block", "sand", "gravel", "oak.log",
                 "oak.planks", "pine.log", "pine.planks", "crafting.table", "furnace",
                 "mossy.cobblestone", "stone.bricks", "mossy.stone.bricks", "cracked.stone.bricks",
                 "chiseled.stone.bricks", "granite", "diorite", "andesite", "polished.granite",
                 "polished.diorite", "polished.andesite", "coal.ore", "coal.block", "iron.ore",
                 "iron.block", "gold.ore", "gold.block", "lapis.ore", "lapis.block", "redstone.ore",
                 "redstone.block", "diamond.ore", "diamond.block", "emerald.ore", "emerald.block",
                 "nether.quartz.ore" ->
                new BlockDefinition(id, Shape.CUBE, true, true);
            case "glass", "oak.leaves", "pine.leaves" ->
                new BlockDefinition(id, Shape.CUBE, true, false);
            case "oak.slab", "pine.slab", "stone.slab", "cobblestone.slab", "mossy.cobblestone.slab",
                 "stone.bricks.slab", "mossy.stone.bricks.slab" ->
                new BlockDefinition(id, Shape.SLAB, true, false);
            case "oak.stairs", "pine.stairs", "stone.stairs", "cobblestone.stairs", "mossy.cobblestone.stairs",
                 "stone.bricks.stairs", "mossy.stone.bricks.stairs" ->
                new BlockDefinition(id, Shape.STAIRS, true, false);
            case "oak.door", "pine.door" -> new BlockDefinition(id, Shape.DOOR, true, false);
            case "oak.fence", "pine.fence" -> new BlockDefinition(id, Shape.FENCE, true, false);
            case "stone.wall", "cobblestone.wall", "mossy.cobblestone.wall", "stone.bricks.wall",
                 "mossy.stone.bricks.wall" -> new BlockDefinition(id, Shape.WALL, true, false);
            case "farmland" -> new BlockDefinition(id, Shape.FARMLAND, true, false);
            case "water" -> new BlockDefinition(id, Shape.FLUID, false, false);
            default -> throw new IllegalArgumentException("Unknown block ID: " + id);
        };
    }
}

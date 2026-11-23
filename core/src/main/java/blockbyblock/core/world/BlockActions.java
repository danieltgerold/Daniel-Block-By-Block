package blockbyblock.core.world;

import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.item.ItemDefinition;
import blockbyblock.core.mining.BlockDrops;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockGeometry;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.QueryKind;
import blockbyblock.core.world.shape.Shape;
import java.util.List;

/**
 * Placing and destroying blocks, ported from placeBlock (src/block-actions.js) and destroyBlock plus canFitBlock and
 * canPlaceBlock (src/voxel-world.js). Input handling, held-item use and swing animation stay in the client.
 */
public final class BlockActions {
    private BlockActions() {}

    /** The block face a placement targets: its cell, the face normal, and optionally where on the face the ray hit. */
    public static final class Hit {
        public final double x, y, z, nx, ny, nz;
        /** Null when the ray recorded no hit point. */
        public final Double px, py, pz;

        public Hit(double x, double y, double z, double nx, double ny, double nz, Double px, Double py, Double pz) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.nx = nx;
            this.ny = ny;
            this.nz = nz;
            this.px = px;
            this.py = py;
            this.pz = pz;
        }
    }

    /** A player body that can stand in the way of a new block. */
    public static final class Body {
        public final double x, y, z, size;
        public final boolean crouching;

        public Body(double x, double y, double z, double size, boolean crouching) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.size = size;
            this.crouching = crouching;
        }
    }

    /** The cell the new block (the lower half, for doors) was placed in. */
    public static final class Placed {
        public final double x, y, z;

        Placed(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    /** True when no listed player's body overlaps the block's collision boxes. */
    public static boolean canFitBlock(WorldRules rules, WorldBlock block, List<Body> players) {
        for (Body player : players) {
            double half = .3 * player.size, height = (player.crouching ? 1.5 : 1.8) * player.size;
            double[] min = {player.x - half, player.y, player.z - half}, max = {player.x + half, player.y + height, player.z + half};
            for (double[] box : rules.world().queries().boxes(block, QueryKind.COLLISION)) if (WorldQueries.overlap(min, max, box)) return false;
        }
        return true;
    }

    /** True when a block of this kind may be put at the cell: it holds nothing solid and no player is in the way. */
    public static boolean canPlaceBlock(WorldRules rules, double x, double y, double z, List<Body> players, String id, BlockState state) {
        if (!WorldStorage.safe(x) || !WorldStorage.safe(y) || !WorldStorage.safe(z) || !rules.world().isReplaceable(x, y, z)) return false;
        return canFitBlock(rules, new WorldBlock(x, y, z, id, state, 0, false), players);
    }

    private static boolean upperHalf(Hit hit) {
        return hit.ny < 0 || hit.ny == 0 && (hit.py != null ? hit.py : hit.y) - hit.y > .5;
    }

    /** Places the block a player would get from a click, or returns null when the click places nothing. */
    public static Placed placeBlock(WorldRules rules, String id, Hit hit, double yaw, List<Body> players) {
        VoxelWorld world = rules.world();
        WorldStorage storage = world.storage();
        BlockDefinition definition;
        try { definition = BlockDefinition.forId(id); } catch (IllegalArgumentException e) { return null; }
        double normal = Math.sqrt(hit.nx * hit.nx + hit.ny * hit.ny + hit.nz * hit.nz);
        if (!(normal > 0) || !Double.isFinite(yaw)) return null;
        WorldBlock target = storage.blockAt(hit.x, hit.y, hit.z);
        Shape shape = definition.shape;
        double x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
        BlockState state = BlockState.defaults(definition);
        if (definition.hasTag("wood.logs")) state = state.with("axis", hit.nx != 0 ? "x" : hit.nz != 0 ? "z" : "y");
        if (id.equals("furnace")) state = state.with("facing", Facing.opposite(Facing.fromYaw(yaw)));
        if (shape == Shape.STAIRS) {
            state = state.with("facing", Facing.fromYaw(yaw)).with("half", upperHalf(hit) ? "top" : "bottom");
            state = state.with("shape", storage.stairShape(new WorldBlock(x, y, z, id, state, 0, false)));
        }
        if (shape == Shape.SLAB) {
            boolean mergeTarget = target != null && id.equals(target.id) && !target.state.type.equals("double")
                && (target.state.type.equals("top") ? hit.ny < 0 : hit.ny > 0);
            if (mergeTarget) {
                x = hit.x;
                y = hit.y;
                z = hit.z;
                state = state.with("type", "double");
            } else {
                state = state.with("type", upperHalf(hit) ? "top" : "bottom");
                WorldBlock at = storage.blockAt(x, y, z);
                if (at != null && id.equals(at.id) && !at.state.type.equals("double") && !at.state.type.equals(state.type)) state = state.with("type", "double");
            }
        }
        if (!WorldStorage.safe(x) || !WorldStorage.safe(y) || !WorldStorage.safe(z)) return null;
        WorldBlock existing = storage.blockAt(x, y, z);
        boolean combine = shape == Shape.SLAB && state.type.equals("double") && existing != null && id.equals(existing.id) && !existing.state.type.equals("double");
        if (existing != null && !combine && !world.isReplaceable(x, y, z)) return null;
        if (shape == Shape.DOOR) return placeDoor(rules, id, definition, state, hit, yaw, players, x, y, z);
        if (!canFitBlock(rules, new WorldBlock(x, y, z, id, state, 0, false), players)) return null;
        return rules.setBlock(x, y, z, id, state) ? new Placed(x, y, z) : null;
    }

    private static Placed placeDoor(WorldRules rules, String id, BlockDefinition definition, BlockState state, Hit hit, double yaw,
                                    List<Body> players, double x, double y, double z) {
        VoxelWorld world = rules.world();
        WorldStorage storage = world.storage();
        if (!WorldStorage.safe(y + 1) || !rules.topSupport(x, y - 1, z) || !world.isReplaceable(x, y + 1, z)) return null;
        String facing = Facing.fromYaw(yaw);
        state = state.with("facing", facing);
        int[] forward = Facing.STEP[Facing.index(facing)];
        int rx = -forward[1], rz = forward[0];
        WorldBlock leftDoor = storage.blockAt(x - rx, y, z - rz), rightDoor = storage.blockAt(x + rx, y, z + rz);
        int left = fullCubes(storage, x - rx, y, z - rz), right = fullCubes(storage, x + rx, y, z + rz);
        String hinge;
        if (isDoor(leftDoor) && leftDoor.state.facing.equals(facing)) hinge = "right";
        else if (isDoor(rightDoor) && rightDoor.state.facing.equals(facing)) hinge = "left";
        else if (left > right) hinge = "left";
        else if (right > left) hinge = "right";
        else {
            double hx = (hit.px != null ? hit.px : x + .5) - x - .5, hz = (hit.pz != null ? hit.pz : z + .5) - z - .5;
            hinge = hx * rx + hz * rz > 0 ? "right" : "left";
        }
        state = state.with("hinge", hinge);
        BlockState upper = state.with("half", "upper");
        if (!canFitBlock(rules, new WorldBlock(x, y, z, id, state, 0, false), players)
            || !canFitBlock(rules, new WorldBlock(x, y + 1, z, id, upper, 0, false), players)) return null;
        boolean guard = rules.changingDoors();
        rules.setChangingDoors(true);
        rules.setBlock(x, y, z, id, state);
        rules.setBlock(x, y + 1, z, id, upper);
        rules.setChangingDoors(guard);
        return new Placed(x, y, z);
    }

    private static boolean isDoor(WorldBlock block) { return block != null && block.definition.shape == Shape.DOOR; }

    /** How many of the two cells beside a door's two halves are full cubes. */
    private static int fullCubes(WorldStorage storage, double x, double y, double z) {
        int n = 0;
        for (int dy = 0; dy < 2; dy++) {
            WorldBlock block = storage.blockAt(x, y + dy, z);
            if (block != null && BlockGeometry.fullCube(block.definition, block.state)) n++;
        }
        return n;
    }

    /**
     * Breaks the block at a cell: removes it (both halves of a door), then drops what the held tool and game mode
     * allow. Unbreakable blocks (bedrock) only break in creative. Returns false when nothing was broken.
     */
    public static boolean destroyBlock(WorldRules rules, double x, double y, double z, boolean creative, ItemStack tool) {
        WorldBlock block = rules.world().storage().blockAt(x, y, z);
        if (block == null || block.definition.hardness < 0 && !creative) return false;
        if (block.definition.shape == Shape.DOOR) rules.removeDoor(block);
        else rules.setBlock(x, y, z, null);
        ItemDefinition held = tool == null ? null : ItemDefinition.forId(tool.id);
        BlockDrops.Drop[] drops = BlockDrops.of(block.definition, held, creative, block.state.type.equals("double"), rules.random());
        for (BlockDrops.Drop drop : drops) rules.emitDrop(new ItemStack(drop.id, drop.count), x + .5, y + .25, z + .5);
        return true;
    }
}

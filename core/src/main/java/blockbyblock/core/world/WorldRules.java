package blockbyblock.core.world;

import blockbyblock.core.inventory.FurnaceEntity;
import blockbyblock.core.inventory.ItemStack;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.Shape;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BooleanSupplier;

/**
 * The world's edit rules, ported from VoxelWorld.setBlock and its helpers in src/voxel-world.js. An edit is not just
 * a store: it moves furnace contents out, makes neighbouring grass and farmland react, checks and removes broken
 * doors, and reshapes stairs, in that order, and each of those can edit the world again. The recursion and the
 * order are part of the rules, so they are kept exactly.
 *
 * <p>Not here yet: fluid flow and falling-block scheduling (observers can hook {@link ChangeListener#settled}),
 * and the random block ticks of the world's step.
 */
public final class WorldRules {
    /** Receives drops the world emits: broken doors, furnace contents, mined blocks. */
    @FunctionalInterface
    public interface DropListener {
        void onDrop(ItemStack stack, double x, double y, double z);
    }

    /** Observes edits. {@code edited} runs right after the store, {@code settled} after every reaction has run. */
    public interface ChangeListener {
        default void edited(double x, double y, double z, String previousId, String id) {}

        default void settled(double x, double y, double z) {}
    }

    private static final int[][] NEIGHBOURS = {{0, 0, 0}, {1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
    private static final int[][] STAIR_CELLS = {{0, 0}, {0, -1}, {1, 0}, {0, 1}, {-1, 0}}; // centre, then north/east/south/west

    private final VoxelWorld world;
    private final WorldStorage storage;
    private final Map<String, FurnaceEntity> furnaces = new HashMap<>(); // lookup only; never iterated
    private final List<ChangeListener> listeners = new ArrayList<>();
    private DropListener drops = (stack, x, y, z) -> {};
    private BooleanSupplier creative = () -> false;
    /** True while a save is being loaded: no furnace drops and no stair reshaping. */
    public boolean loading;
    private boolean changingDoors;
    private boolean updatingStairs;

    public WorldRules(VoxelWorld world) {
        this.world = world;
        this.storage = world.storage();
    }

    public VoxelWorld world() { return world; }
    public void setDropListener(DropListener drops) { this.drops = drops; }
    public void setCreativeMode(BooleanSupplier creative) { this.creative = creative; }
    public void addListener(ChangeListener listener) { listeners.add(listener); }

    /** While true, door edits do not trigger door checks; placing a two-block door sets it around its two edits. */
    public boolean changingDoors() { return changingDoors; }
    public void setChangingDoors(boolean value) { changingDoors = value; }

    public FurnaceEntity furnaceAt(double x, double y, double z) { return furnaces.get(furnaceKey(x, y, z)); }
    public int furnaceCount() { return furnaces.size(); }

    private static String furnaceKey(double x, double y, double z) { return x + "," + y + "," + z; }

    private void emitDrop(ItemStack stack, double x, double y, double z) { drops.onDrop(stack, x, y, z); }

    public boolean isOpaqueSolid(double x, double y, double z) {
        WorldBlock block = storage.blockAt(x, y, z);
        return block != null && block.opaque();
    }

    /** True when the block's top face can carry something standing on it (a door). */
    public boolean topSupport(double x, double y, double z) {
        WorldBlock block = storage.blockAt(x, y, z);
        if (block == null) return false;
        return block.fullCube()
            || block.definition.shape == Shape.SLAB && block.state.type.equals("top")
            || block.definition.shape == Shape.STAIRS && block.state.half.equals("top");
    }

    /** Sets a block to its default state, or removes it when {@code id} is null. */
    public boolean setBlock(double x, double y, double z, String id) {
        return setBlock(x, y, z, id, null, 0, false);
    }

    public boolean setBlock(double x, double y, double z, String id, BlockState state) {
        return setBlock(x, y, z, id, state, 0, false);
    }

    /** The full edit: store, furnace lifecycle, neighbour reactions, door checks, stair reshaping. */
    public boolean setBlock(double x, double y, double z, String id, BlockState state, int level, boolean falling) {
        if (!WorldStorage.safe(x) || !WorldStorage.safe(y) || !WorldStorage.safe(z)) return false;
        if (id != null) {
            BlockDefinition definition;
            try { definition = BlockDefinition.forId(id); } catch (IllegalArgumentException e) { return false; }
            if (state == null) state = BlockState.defaults(definition);
            if (state.shape != definition.shape || level < 0 || level > 7) return false;
        }
        WorldBlock previous = storage.blockAt(x, y, z);
        WorldBlock next = new WorldBlock(x, y, z, id, state, level, falling);
        if (WorldStorage.same(previous, next)) return false;
        String previousId = previous == null ? null : previous.id;
        boolean waterLevelOnly = "water".equals(id) && "water".equals(previousId);
        String key = furnaceKey(x, y, z);
        if ("furnace".equals(previousId) && !"furnace".equals(id)) {
            FurnaceEntity entity = furnaces.remove(key);
            if (entity != null) {
                ItemStack[] contents = new ItemStack[3];
                for (int i = 0; i < 3; i++) { contents[i] = entity.slot(i); entity.setSlot(i, null); }
                entity.removed = true;
                if (!loading) for (ItemStack stack : contents) if (stack != null) emitDrop(stack, x + .5, y + .25, z + .5);
            }
        }
        if ("furnace".equals(id) && !furnaces.containsKey(key)) furnaces.put(key, new FurnaceEntity());
        storage.setBlock(x, y, z, id, state, level, falling, false);
        for (ChangeListener listener : listeners) listener.edited(x, y, z, previousId, id);
        if (!waterLevelOnly) {
            for (int[] d : NEIGHBOURS) {
                WorldBlock block = storage.blockAt(x + d[0], y + d[1], z + d[2]);
                if (block != null && block.definition.behavior != null) neighbourChanged(block);
                if (!changingDoors && block != null && block.definition.shape == Shape.DOOR) checkDoor(block);
            }
        }
        if (!loading && !updatingStairs && (WorldStorage.isStair(previous) || WorldStorage.isStair(next))) updateStairs(x, y, z);
        for (ChangeListener listener : listeners) listener.settled(x, y, z);
        return true;
    }

    /** Grass and farmland turn to dirt when something opaque covers them. */
    private void neighbourChanged(WorldBlock block) {
        if (isOpaqueSolid(block.x, block.y + 1, block.z)) setBlock(block.x, block.y, block.z, "dirt");
    }

    private void updateStairs(double x, double y, double z) {
        boolean guard = updatingStairs;
        updatingStairs = true;
        for (int[] cell : STAIR_CELLS) {
            WorldBlock block = storage.blockAt(x + cell[0], y, z + cell[1]);
            if (!WorldStorage.isStair(block)) continue;
            String shape = storage.stairShape(block);
            if (!shape.equals(block.state.stairShape)) setBlock(block.x, block.y, block.z, block.id, block.state.with("shape", shape), block.level, block.falling);
        }
        updatingStairs = guard;
    }

    /** Removes both halves of the door the block belongs to. */
    public void removeDoor(WorldBlock block) {
        double y = block.y - (block.state.half.equals("upper") ? 1 : 0);
        boolean guard = changingDoors;
        changingDoors = true;
        for (int dy = 0; dy < 2; dy++) if (block.id.equals(storage.blockIdAt(block.x, y + dy, block.z))) setBlock(block.x, y + dy, block.z, null);
        changingDoors = guard;
    }

    /** Keeps a door whole and supported: mismatched halves are synced, a broken or unsupported door is removed and dropped. */
    public void checkDoor(WorldBlock block) {
        if (changingDoors || !block.id.equals(storage.blockIdAt(block.x, block.y, block.z))) return;
        double y = block.y - (block.state.half.equals("upper") ? 1 : 0);
        WorldBlock lower = storage.blockAt(block.x, y, block.z), upper = storage.blockAt(block.x, y + 1, block.z);
        if (lower != null && upper != null && lower.id.equals(block.id) && upper.id.equals(block.id)
            && lower.state.half.equals("lower") && upper.state.half.equals("upper") && topSupport(block.x, y - 1, block.z)) {
            boolean mismatch = !lower.state.facing.equals(upper.state.facing) || !lower.state.hinge.equals(upper.state.hinge) || lower.state.open != upper.state.open;
            if (mismatch) {
                changingDoors = true;
                setBlock(block.x, y + 1, block.z, block.id, lower.state.with("half", "upper"));
                changingDoors = false;
            }
            return;
        }
        removeDoor(block);
        if (!creative.getAsBoolean()) emitDrop(new ItemStack(block.id, 1), block.x + .5, y + .25, block.z + .5);
    }

    /** Opens or closes both halves of a door; always succeeds. */
    public boolean toggleDoor(WorldBlock block) {
        double y = block.y - (block.state.half.equals("upper") ? 1 : 0);
        boolean guard = changingDoors;
        changingDoors = true;
        for (int dy = 0; dy < 2; dy++) {
            setBlock(block.x, y + dy, block.z, block.id, block.state.with("half", dy != 0 ? "upper" : "lower").with("open", !block.state.open));
        }
        changingDoors = guard;
        return true;
    }
}

package blockbyblock.core.golden;

import blockbyblock.core.world.VoxelWorld;
import blockbyblock.core.world.WorldBlock;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.Shape;

/** Converts explicit fixture state, never infers collision from occupancy. */
public final class WorldFixture {
    private WorldFixture() {}

    public static void loadEdit(VoxelWorld world, String[] row, int offset) {
        if (row.length < offset + 12) throw new IllegalArgumentException("Short typed edit");
        double x = Double.parseDouble(row[offset]), y = Double.parseDouble(row[offset + 1]);
        double z = Double.parseDouble(row[offset + 2]);
        if (world == null || !safe(x) || !safe(y) || !safe(z)) throw new IllegalArgumentException("Invalid edit coordinates");
        String id = row[offset + 3];
        BlockState state = id.isEmpty() ? null : state(id, row, offset + 4);
        int level = Integer.parseInt(row[offset + 10]);
        boolean falling = flag(row[offset + 11]);
        if (level < 0 || level > 7) throw new IllegalArgumentException("Invalid water level");
        boolean changed = world.setBlock(x, y, z, id.isEmpty() ? null : id, state, level, falling);
        // Rejected edits cannot be mistaken for intentional no-ops.
        if (!changed && !matches(world.blockAt(x, y, z), id, state, level, falling))
            throw new IllegalArgumentException("Rejected fixture edit: " + id);
    }

    public static BlockState state(String id, String[] row, int offset) {
        BlockDefinition d = BlockDefinition.forId(id);
        BlockState state = BlockState.defaults(d);
        // Columns: type, facing, half, shape, hinge, open. Empty means "the block's default".
        if (d.shape == Shape.SLAB) state = state.with("type", or(row[offset], "bottom"));
        if (d.shape == Shape.STAIRS) {
            state = state.with("facing", or(row[offset + 1], "north")).with("half", or(row[offset + 2], "bottom"))
                .with("shape", or(row[offset + 3], "straight"));
        }
        if (d.shape == Shape.DOOR) {
            state = state.with("facing", or(row[offset + 1], "north")).with("half", or(row[offset + 2], "lower"))
                .with("hinge", or(row[offset + 4], "left")).with("open", flag(row[offset + 5]));
        }
        return state;
    }

    public static boolean flag(String s) {
        if (!s.equals("0") && !s.equals("1")) throw new IllegalArgumentException("Invalid flag: " + s);
        return s.equals("1");
    }

    private static String or(String s, String fallback) { return s.isEmpty() ? fallback : s; }

    private static boolean safe(double x) { return x == Math.floor(x) && Math.abs(x) <= 9007199254740991.0; }

    private static boolean matches(WorldBlock b, String id, BlockState s, int level, boolean falling) {
        if (id.isEmpty()) return b == null;
        if (b == null || !id.equals(b.id)) return false;
        BlockState actual = b.state;
        return actual.type.equals(s.type) && actual.facing.equals(s.facing) && actual.half.equals(s.half)
            && actual.stairShape.equals(s.stairShape) && actual.hinge.equals(s.hinge) && actual.open == s.open
            && (!id.equals("water") || b.level == level && b.falling == falling);
    }
}

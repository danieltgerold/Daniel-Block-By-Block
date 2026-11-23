package blockbyblock.core.world;

import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.Shape;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

/** Sparse typed edits and the observable JS query-index ordering. */
final class WorldStorage {
    enum Index { SOLIDS, REMOVALS, SOURCES, WATERS }
    final double baseY, topY;
    final int depth;
    long removedCount;
    private final String[] layers;
    private final LinkedHashMap<ChunkKey, LinkedHashMap<BlockKey, WorldBlock>> edits = new LinkedHashMap<>();
    private final List<LinkedHashMap<ChunkKey, LinkedHashMap<BlockKey, WorldBlock>>> indices = new ArrayList<>();
    private static final int[][] DIRECTIONS = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};

    WorldStorage(double baseY, String[] layers) {
        if (!safe(baseY) || layers == null || layers.length > 384)
            throw new IllegalArgumentException("Invalid terrain configuration");
        this.layers = layers.clone();
        // At most 384 explicitly configured full-cube layers.
        for (String id : this.layers) if (BlockDefinition.forId(id).shape != Shape.CUBE)
            throw new IllegalArgumentException("Terrain layers must be full cubes");
        this.baseY = baseY; this.depth = layers.length; this.topY = baseY + depth;
        for (int i = 0; i < Index.values().length; i++) indices.add(new LinkedHashMap<>());
    }

    String[] getLayers() { return layers.clone(); }

    boolean hasWaters() { return !indices.get(Index.WATERS.ordinal()).isEmpty(); }

    static boolean safe(double n) { return n == Math.floor(n) && Math.abs(n) <= 9007199254740991.0; }
    private record ChunkKey(long x, long z) {}
    private record BlockKey(long x, long y, long z) {}
    private static ChunkKey chunk(double x, double z) {
        return new ChunkKey((long) Math.floor(x / 16), (long) Math.floor(z / 16));
    }
    private static BlockKey key(double x, double y, double z) { return new BlockKey((long) x, (long) y, (long) z); }

    String baseIdAt(double y) {
        double i = y - baseY;
        return i >= 0 && i < depth && i == Math.floor(i) ? layers[(int) i] : null;
    }

    WorldBlock blockAt(double x, double y, double z) {
        if (safe(x) && safe(y) && safe(z)) {
            var cells = edits.get(chunk(x, z));
            WorldBlock edit = cells == null ? null : cells.get(key(x, y, z));
            if (edit != null) return edit.id == null ? null : edit;
        }
        String id = baseIdAt(y);
        return id == null ? null : new WorldBlock(x, y, z, id, defaults(BlockDefinition.forId(id)), 0, false);
    }

    String blockIdAt(double x, double y, double z) {
        WorldBlock b = blockAt(x, y, z); return b == null ? null : b.id;
    }

    static BlockState defaults(BlockDefinition d) { return BlockState.defaults(d); }

    boolean setBlock(double x, double y, double z, String id, BlockState state, int level, boolean falling) {
        return setBlock(x, y, z, id, state, level, falling, true);
    }

    /** Stores the edit; with {@code reshapeStairs} false the caller owns stair updates (the rules layer orders them after neighbour reactions). */
    boolean setBlock(double x, double y, double z, String id, BlockState state, int level, boolean falling, boolean reshapeStairs) {
        if (!safe(x) || !safe(y) || !safe(z)) return false;
        if (id != null) {
            BlockDefinition d;
            try { d = BlockDefinition.forId(id); } catch (IllegalArgumentException e) { return false; }
            if (state == null) state = defaults(d);
            if (state.shape != d.shape || level < 0 || level > 7) return false;
        }
        WorldBlock previous = blockAt(x, y, z);
        WorldBlock next = new WorldBlock(x, y, z, id, state, level, falling);
        if (same(previous, next)) return false;
        setInternal(next, previous);
        if (reshapeStairs && (isStair(previous) || isStair(next))) updateStairs(x, y, z);
        return true;
    }

    static boolean sameState(BlockState a, BlockState b) { return a == b || a != null && a.equals(b); }

    /** Every stored edit, including air edits that hide base blocks (order unspecified). */
    java.util.List<WorldBlock> allEdits() {
        java.util.List<WorldBlock> all = new java.util.ArrayList<>();
        for (var cells : edits.values()) all.addAll(cells.values());
        return all;
    }

    static boolean same(WorldBlock a, WorldBlock b) {
        if (a == null || a.id == null) return b == null || b.id == null;
        return b != null && a.id.equals(b.id) && sameState(a.state, b.state)
            && (!a.water() || a.level == b.level && a.falling == b.falling);
    }

    private void setInternal(WorldBlock next, WorldBlock previous) {
        boolean base = baseIdAt(next.y) != null;
        if (base) removedCount += (previous != null && previous.fullCube() ? 1 : 0) - (next.fullCube() ? 1 : 0);
        String baseId = baseIdAt(next.y);
        boolean isDefault = next.id == null ? baseId == null
            : next.id.equals(baseId) && sameState(next.state, defaults(next.definition));
        update(edits, next, !isDefault);
        update(indices.get(Index.SOLIDS.ordinal()), next, !isDefault && next.definition != null && next.definition.solid);
        update(indices.get(Index.REMOVALS.ordinal()), next, !isDefault && base && !next.fullCube());
        update(indices.get(Index.SOURCES.ordinal()), next, !isDefault && next.source());
        update(indices.get(Index.WATERS.ordinal()), next, !isDefault && next.water());
    }

    private static void update(LinkedHashMap<ChunkKey, LinkedHashMap<BlockKey, WorldBlock>> index,
                               WorldBlock b, boolean present) {
        ChunkKey chunk = chunk(b.x, b.z); BlockKey key = key(b.x, b.y, b.z);
        var cells = index.get(chunk);
        if (present) {
            if (cells == null) { cells = new LinkedHashMap<>(); index.put(chunk, cells); }
            cells.put(key, b);
        } else if (cells != null) {
            cells.remove(key); if (cells.isEmpty()) index.remove(chunk);
        }
    }

    List<WorldBlock> indexedEdits(Index kind, double[] min, double[] max) {
        var index = indices.get(kind.ordinal());
        List<WorldBlock> found = new ArrayList<>();
        if (index.isEmpty()) return found;
        if (min != null) {
            double x0 = Math.floor((min[0] - VoxelWorld.EPSILON) / 16), x1 = Math.floor((max[0] + VoxelWorld.EPSILON) / 16);
            double z0 = Math.floor((min[2] - VoxelWorld.EPSILON) / 16), z1 = Math.floor((max[2] + VoxelWorld.EPSILON) / 16);
            double count = (x1 - x0 + 1) * (z1 - z0 + 1);
            if (count <= Math.max(16, index.size() * 2.0) && safe(x0) && safe(x1) && safe(z0) && safe(z1)) {
                // At most max(16, 2 * occupied chunks) visits, numeric X/Z order.
                for (long x = (long) x0; x <= (long) x1; x++) {
                    for (long z = (long) z0; z <= (long) z1; z++) {
                        var cells = index.get(new ChunkKey(x, z));
                        if (cells != null) for (WorldBlock b : cells.values())
                            if (matches(b, min, max)) found.add(b);
                    }
                }
                return found;
            }
        }
        // Fallback visits each stored edit once in chunk insertion order.
        for (var cells : index.values()) for (WorldBlock b : cells.values()) if (matches(b, min, max)) found.add(b);
        return found;
    }

    private static boolean matches(WorldBlock e, double[] min, double[] max) {
        double eps = VoxelWorld.EPSILON;
        return min == null || e.x + 1 >= min[0] - eps && e.x <= max[0] + eps
            && e.z + 1 >= min[2] - eps && e.z <= max[2] + eps && e.y + 1.5 >= min[1] - eps && e.y <= max[1] + eps;
    }

    static boolean isStair(WorldBlock b) { return b != null && b.definition != null && b.definition.shape == Shape.STAIRS; }
    private WorldBlock neighbor(WorldBlock b, int direction) {
        int[] d = DIRECTIONS[direction]; return blockAt(b.x + d[0], b.y, b.z + d[1]);
    }
    private static int facing(String facing) {
        return switch (facing) { case "north" -> 0; case "east" -> 1; case "south" -> 2; default -> 3; };
    }
    private static boolean compatible(WorldBlock b, String half) { return isStair(b) && b.state.half.equals(half); }
    private boolean guarded(WorldBlock b, int direction) {
        WorldBlock side = neighbor(b, direction);
        return compatible(side, b.state.half) && side.state.facing.equals(b.state.facing);
    }

    /** The shape a stair block should take given its neighbours. */
    String stairShape(WorldBlock b) {
        int f = facing(b.state.facing); WorldBlock front = neighbor(b, f);
        if (compatible(front, b.state.half) && facing(front.state.facing) % 2 != f % 2
            && !guarded(b, (facing(front.state.facing) + 2) % 4))
            return facing(front.state.facing) == (f + 3) % 4 ? "outer-left" : "outer-right";
        WorldBlock back = neighbor(b, (f + 2) % 4);
        if (compatible(back, b.state.half) && facing(back.state.facing) % 2 != f % 2 && !guarded(b, facing(back.state.facing)))
            return facing(back.state.facing) == (f + 3) % 4 ? "inner-left" : "inner-right";
        return "straight";
    }

    private void updateStairs(double x, double y, double z) {
        // Source order: center then north/east/south/west; direct writes avoid recursion.
        for (int i = -1; i < 4; i++) {
            WorldBlock b = i == -1 ? blockAt(x, y, z) : blockAt(x + DIRECTIONS[i][0], y, z + DIRECTIONS[i][1]);
            if (!isStair(b)) continue;
            String shape = stairShape(b);
            if (shape.equals(b.state.stairShape)) continue;
            BlockState s = b.state.with("shape", shape);
            setInternal(new WorldBlock(b.x, b.y, b.z, b.id, s, b.level, b.falling), b);
        }
    }
}

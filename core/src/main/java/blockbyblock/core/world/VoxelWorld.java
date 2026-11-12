package blockbyblock.core.world;

import java.util.LinkedHashMap;

/**
 * Port of the rule half of src/voxel-world.js. Base terrain is analytic (solid for -depth <= y < 0)
 * and only edits are stored. Every expression keeps the JS evaluation order so results match bit for bit.
 *
 * <p>Edits are kept in insertion order, chunk by chunk, exactly like the JS Maps: a raycast that hits two
 * blocks at the same distance keeps the first one it finds, so iteration order is observable.
 */
public final class VoxelWorld {
    public static final int CHUNK_SIZE = 16;
    public static final double PLAYER_HALF_WIDTH = 0.3;
    public static final double BLOCK_REACH = 4.5;
    public static final double EPSILON = 1e-7;
    /** JS Number.MAX_SAFE_INTEGER. */
    static final double MAX_SAFE_INTEGER = 9007199254740991.0;

    private static final double[] ZERO_NORMAL = {0, 0, 0};

    private final int depth;
    private final LinkedHashMap<ChunkKey, LinkedHashMap<BlockKey, Edit>> chunkEdits = new LinkedHashMap<>();
    private long removedCount;

    public VoxelWorld(int depth) { this.depth = depth; }

    public VoxelWorld() { this(3); }

    /** Result of {@link #movePlayer}. */
    public static final class Motion {
        public double x, y, z;
        public double movedX, movedY, movedZ;
        public boolean blockedX, blockedY, blockedZ;
        public boolean grounded;
    }

    private static final class Edit {
        final double[] pos;
        final boolean solid;

        Edit(double x, double y, double z, boolean solid) {
            this.pos = new double[] {x, y, z};
            this.solid = solid;
        }
    }

    private static final class ChunkKey {
        final long cx, cz;

        ChunkKey(long cx, long cz) { this.cx = cx; this.cz = cz; }

        @Override public boolean equals(Object o) {
            return o instanceof ChunkKey k && k.cx == cx && k.cz == cz;
        }

        @Override public int hashCode() { return Long.hashCode(cx) * 31 + Long.hashCode(cz); }
    }

    private static final class BlockKey {
        final long x, y, z;

        BlockKey(long x, long y, long z) { this.x = x; this.y = y; this.z = z; }

        @Override public boolean equals(Object o) {
            return o instanceof BlockKey k && k.x == x && k.y == y && k.z == z;
        }

        @Override public int hashCode() { return (Long.hashCode(x) * 31 + Long.hashCode(y)) * 31 + Long.hashCode(z); }
    }

    /** JS Number.isSafeInteger. */
    static boolean isSafeInteger(double v) {
        return v == Math.floor(v) && Math.abs(v) <= MAX_SAFE_INTEGER;
    }

    /** JS Math.round: nearest integer, ties toward +Infinity, -0 for results of zero from negative inputs. */
    static double jsRound(double v) {
        if (!(Math.abs(v) < 4503599627370496.0)) return v; // NaN, infinities and |v| >= 2^52 are already integral
        double r = Math.floor(v);
        if (v - r >= 0.5) r += 1;
        if (r == 0 && v < 0) return -0.0;
        return r;
    }

    // tolerance = (min, max) => Math.min(EPSILON, Math.max(0, max - min) * 1e-6)
    private static double tolerance(double min, double max) {
        return Math.min(EPSILON, Math.max(0, max - min) * 1e-6);
    }

    // overlaps = (min, max, block) => AXES.every(...)
    private static boolean overlaps(double[] min, double[] max, double[] block) {
        for (int a = 0; a < 3; a++) {
            if (!(max[a] > block[a] + tolerance(min[a], max[a])
                && min[a] < block[a] + 1 - tolerance(min[a], max[a]))) return false;
        }
        return true;
    }

    private static ChunkKey chunkKeyOf(double x, double z) {
        return new ChunkKey((long) Math.floor(x / CHUNK_SIZE), (long) Math.floor(z / CHUNK_SIZE));
    }

    /** The edit stored at exactly these coordinates, if any. Only safe integers can ever have been stored. */
    private Edit find(double x, double y, double z) {
        if (!isSafeInteger(x) || !isSafeInteger(y) || !isSafeInteger(z)) return null;
        LinkedHashMap<BlockKey, Edit> edits = chunkEdits.get(chunkKeyOf(x, z));
        return edits == null ? null : edits.get(new BlockKey((long) x, (long) y, (long) z));
    }

    public boolean hasBlock(double x, double y, double z) {
        Edit edit = find(x, y, z);
        return edit != null ? edit.solid : y >= -depth && y < 0;
    }

    public boolean setBlock(double x, double y, double z, boolean solid) {
        if (!isSafeInteger(x) || !isSafeInteger(y) || !isSafeInteger(z)) return false;
        if (hasBlock(x, y, z) == solid) return false;
        ChunkKey key = chunkKeyOf(x, z);
        LinkedHashMap<BlockKey, Edit> edits = chunkEdits.get(key);
        boolean isDefault = y >= -depth && y < 0;
        if (isDefault) removedCount += solid ? -1 : 1;
        BlockKey blockKey = new BlockKey((long) x, (long) y, (long) z);
        if (solid == isDefault) {
            if (edits != null) {
                edits.remove(blockKey);
                if (edits.isEmpty()) chunkEdits.remove(key);
            }
        } else {
            if (edits == null) {
                edits = new LinkedHashMap<>();
                chunkEdits.put(key, edits);
            }
            edits.put(blockKey, new Edit(x, y, z, solid));
        }
        return true;
    }

    // Untouched terrain is analytic, while edits remain sparse.
    boolean baseSolidInBox(double[] min, double[] max) {
        double[] clippedMin = {min[0], Math.max(min[1], -depth), min[2]};
        double[] clippedMax = {max[0], Math.min(max[1], 0), max[2]};
        for (int a = 0; a < 3; a++) if (clippedMax[a] <= clippedMin[a]) return false;
        double[] low = new double[3], high = new double[3];
        double cells = 1;
        for (int a = 0; a < 3; a++) {
            double eps = tolerance(clippedMin[a], clippedMax[a]);
            low[a] = Math.floor(clippedMin[a] + eps);
            high[a] = Math.floor(clippedMax[a] - eps);
            cells *= Math.max(0, high[a] - low[a] + 1);
        }
        if (cells > removedCount) return true;
        long removed = 0;
        for (LinkedHashMap<BlockKey, Edit> edits : chunkEdits.values()) {
            for (Edit edit : edits.values()) {
                if (!edit.solid && within(edit.pos, low, high)) removed++;
            }
        }
        return cells > removed;
    }

    private static boolean within(double[] pos, double[] low, double[] high) {
        for (int a = 0; a < 3; a++) if (!(pos[a] >= low[a] && pos[a] <= high[a])) return false;
        return true;
    }

    boolean hasSolidInBox(double[] min, double[] max) {
        for (int a = 0; a < 3; a++) if (max[a] <= min[a]) return false;
        if (baseSolidInBox(min, max)) return true;
        for (LinkedHashMap<BlockKey, Edit> edits : chunkEdits.values()) {
            for (Edit edit : edits.values()) if (edit.solid && overlaps(min, max, edit.pos)) return true;
        }
        return false;
    }

    /** rayBox: null on miss, else {distance, nx, ny, nz}. */
    private static double[] rayBox(double[] origin, double[] direction, double[] min, double[] max, double reach) {
        double enter = Double.NEGATIVE_INFINITY, exit = Double.POSITIVE_INFINITY;
        double[] normal = ZERO_NORMAL;
        for (int a = 0; a < 3; a++) {
            if (direction[a] == 0) {
                if (origin[a] <= min[a] || origin[a] >= max[a]) return null;
            } else {
                double t0 = (min[a] - origin[a]) / direction[a];
                double t1 = (max[a] - origin[a]) / direction[a];
                double near = Math.min(t0, t1);
                if (near > enter) {
                    enter = near;
                    normal = new double[] {0, 0, 0};
                    normal[a] = -Math.signum(direction[a]);
                }
                exit = Math.min(exit, Math.max(t0, t1));
            }
        }
        if (exit <= 0 || enter > exit || enter > reach) return null;
        double[] n = enter < 0 ? ZERO_NORMAL : normal;
        return new double[] {Math.max(0, enter), n[0], n[1], n[2]};
    }

    /** Distance to the first solid block along the ray, or null. The direction need not be normalised. */
    public RaycastHit raycast(double ox, double oy, double oz, double dx, double dy, double dz, double reach) {
        double length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (!(length != 0) || reach < 0) return null; // JS !length: 0, -0 or NaN
        double[] origin = {ox, oy, oz};
        double[] d = {dx / length, dy / length, dz / length};
        RaycastHit best = null;
        for (LinkedHashMap<BlockKey, Edit> edits : chunkEdits.values()) {
            for (Edit edit : edits.values()) {
                if (!edit.solid) continue;
                double[] max = {edit.pos[0] + 1, edit.pos[1] + 1, edit.pos[2] + 1};
                double[] hit = rayBox(origin, d, edit.pos, max, best != null ? best.distance : reach);
                if (hit != null && (best == null || hit[0] < best.distance)) {
                    best = new RaycastHit(edit.pos[0], edit.pos[1], edit.pos[2], hit[1], hit[2], hit[3], hit[0]);
                }
            }
        }
        if (depth == 0) return best;
        double entry = 0, end = best != null ? best.distance : reach;
        double[] normal = {0, 0, 0};
        if (d[1] == 0) {
            if (origin[1] < -depth || origin[1] >= 0) return best;
        } else {
            double a = (-depth - origin[1]) / d[1], b = -origin[1] / d[1];
            entry = Math.max(0, Math.min(a, b));
            end = Math.min(end, Math.max(a, b));
            if (Math.min(a, b) >= 0) normal[1] = -Math.signum(d[1]);
            if (end < entry || end < 0) return best;
        }
        if (entry > end) return best;
        double[] cell = new double[3], next = new double[3], step = new double[3], delta = new double[3];
        for (int a = 0; a < 3; a++) {
            double coordinate = origin[a] + d[a] * entry;
            if (!Double.isFinite(coordinate)) return best;
            cell[a] = Math.floor(coordinate);
            if (d[a] < 0 && coordinate == cell[a]) cell[a]--;
            step[a] = Math.signum(d[a]);
            delta[a] = d[a] == 0 ? Double.POSITIVE_INFINITY : Math.abs(1 / d[a]);
            next[a] = d[a] == 0 ? Double.POSITIVE_INFINITY : ((d[a] > 0 ? cell[a] + 1 : cell[a]) - origin[a]) / d[a];
        }
        double distance = entry;
        // Only removed cells can postpone a base-terrain hit, so this work is bounded by stored edits.
        for (long count = 0; count <= removedCount + 3 && distance <= end; count++) {
            if (cell[1] < -depth || cell[1] >= 0) break;
            if (hasBlock(cell[0], cell[1], cell[2])) {
                return new RaycastHit(cell[0], cell[1], cell[2], normal[0], normal[1], normal[2], distance);
            }
            int axis = next[0] <= next[1] ? 0 : 1; // AXES.reduce((a, b) => next[a] <= next[b] ? a : b)
            axis = next[axis] <= next[2] ? axis : 2;
            distance = next[axis];
            if (!Double.isFinite(distance)) break;
            cell[axis] += step[axis];
            next[axis] += delta[axis];
            normal = new double[] {0, 0, 0};
            normal[axis] = -step[axis];
        }
        return best;
    }

    /** True when a player box at (x, y, z) rests within EPSILON on a solid block top. */
    public boolean isSupported(double x, double y, double z, double halfWidth) {
        double ry = jsRound(y);
        if (Math.abs(y - ry) > EPSILON) return false;
        return hasSolidInBox(new double[] {x - halfWidth, ry - 0.5, z - halfWidth}, new double[] {x + halfWidth, ry, z + halfWidth});
    }

    private static final int[] MOVE_ORDER = {1, 0, 2}; // y, then x, then z

    /** Moves a player box by (vx, vy, vz), clipping each axis in turn against solid blocks. */
    public Motion movePlayer(double x, double y, double z, double vx, double vy, double vz, double halfWidth, double height) {
        double[] p = {x, y, z};
        double[] velocity = {vx, vy, vz};
        double[] moved = {0, 0, 0};
        boolean[] blocked = {false, false, false};
        for (int axis : MOVE_ORDER) {
            double wanted = velocity[axis];
            if (!(wanted != 0)) continue; // JS !wanted: 0, -0 or NaN
            double[] min = {p[0] - halfWidth, p[1], p[2] - halfWidth};
            double[] max = {p[0] + halfWidth, p[1] + height, p[2] + halfWidth};
            double allowed = wanted;
            for (LinkedHashMap<BlockKey, Edit> edits : chunkEdits.values()) {
                for (Edit edit : edits.values()) {
                    if (edit.solid) allowed = clip(axis, wanted, allowed, min, max, edit.pos);
                }
            }
            if (axis == 1) {
                for (int yy = -depth; yy < 0; yy++) {
                    double[] low = {min[0], yy, min[2]}, high = {max[0], yy + 1, max[2]};
                    if (!baseSolidInBox(low, high)) continue;
                    if (wanted > 0 && max[1] <= yy + EPSILON) allowed = Math.min(allowed, yy - max[1]);
                    if (wanted < 0 && min[1] >= yy + 1 - EPSILON) allowed = Math.max(allowed, yy + 1 - min[1]);
                }
            } else if (min[1] < 0 && max[1] > -depth) {
                double first = wanted > 0 ? Math.ceil(max[axis] - EPSILON) : Math.floor(min[axis] + EPSILON) - 1;
                for (long offset = 0; offset <= removedCount + 1; offset++) {
                    double cell = first + Math.signum(wanted) * offset;
                    double distance = wanted > 0 ? cell - max[axis] : cell + 1 - min[axis];
                    if (wanted > 0 ? distance > allowed : distance < allowed) break;
                    double[] low = min.clone(), high = max.clone();
                    low[axis] = cell;
                    high[axis] = cell + 1;
                    if (baseSolidInBox(low, high)) {
                        allowed = distance;
                        break;
                    }
                }
            }
            double next = Math.max(-Double.MAX_VALUE, Math.min(Double.MAX_VALUE, p[axis] + allowed));
            moved[axis] = next - p[axis];
            blocked[axis] = Math.abs(allowed - wanted) > EPSILON;
            p[axis] = next;
        }
        Motion m = new Motion();
        m.x = p[0]; m.y = p[1]; m.z = p[2];
        m.movedX = moved[0]; m.movedY = moved[1]; m.movedZ = moved[2];
        m.blockedX = blocked[0]; m.blockedY = blocked[1]; m.blockedZ = blocked[2];
        m.grounded = isSupported(p[0], p[1], p[2], halfWidth);
        return m;
    }

    private static double clip(int axis, double wanted, double allowed, double[] min, double[] max, double[] block) {
        for (int other = 0; other < 3; other++) {
            if (other == axis) continue;
            if (!(max[other] > block[other] + tolerance(min[other], max[other])
                && min[other] < block[other] + 1 - tolerance(min[other], max[other]))) return allowed;
        }
        if (wanted > 0 && max[axis] <= block[axis] + EPSILON) allowed = Math.min(allowed, block[axis] - max[axis]);
        if (wanted < 0 && min[axis] >= block[axis] + 1 - EPSILON) allowed = Math.max(allowed, block[axis] + 1 - min[axis]);
        return allowed;
    }
}

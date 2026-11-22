package blockbyblock.core.world;

import java.util.ArrayList;
import java.util.List;

/** Static fluid queries; propagation and world ticking belong to a later host. */
public final class WorldFluids {
    private WorldFluids() {}

    public static final class Sample {
        public final boolean inWater;
        public final double x, y, z;
        Sample(boolean inWater, double x, double y, double z) {
            this.inWater = inWater; this.x = x; this.y = y; this.z = z;
        }
    }

    private static double waterHeight(WorldBlock b) { return b.falling ? 1 : (8 - b.level) / 9.0; }

    private static Sample current(WorldStorage storage, WorldBlock b) {
        int level = b.falling ? 0 : b.level;
        double x = 0, z = 0;
        // Four neighbors, in the source's +X,-X,+Z,-Z order.
        for (int[] d : new int[][] {{1, 0}, {-1, 0}, {0, 1}, {0, -1}}) {
            WorldBlock n = storage.blockAt(b.x + d[0], b.y, b.z + d[1]);
            WorldBlock below = storage.blockAt(b.x + d[0], b.y - 1, b.z + d[1]);
            double delta = n != null && n.water()
                ? (n.falling ? 0 : n.level) - level + (n.falling ? 1 : 0)
                : n == null && below != null && below.water() ? (below.falling ? 0 : below.level) + 8 - level : 0;
            x += d[0] * delta; z += d[1] * delta;
        }
        double y = b.falling ? -6 : 0;
        double length = Math.sqrt(x * x + y * y + z * z);
        if (length == 0) length = 1;
        return new Sample(true, x / length, y / length, z / length);
    }

    private static List<WorldBlock> candidates(WorldStorage storage, double[] min, double[] max) {
        if (!storage.hasWaters()) return List.of();
        double sx = Math.ceil(max[0]) - Math.floor(min[0]);
        double sy = Math.ceil(max[1]) - Math.floor(min[1]);
        double sz = Math.ceil(max[2]) - Math.floor(min[2]);
        double volume = (Math.ceil(max[0]) - Math.floor(min[0]))
            * (Math.ceil(max[1]) - Math.floor(min[1])) * (Math.ceil(max[2]) - Math.floor(min[2]));
        if (!(volume < 512 && sx > 0 && sy > 0 && sz > 0 && sx <= 512 && sy <= 512 && sz <= 512))
            return storage.indexedEdits(WorldStorage.Index.WATERS, min, max);
        // Unit increments must advance in double precision on every enumerated axis.
        for (int axis = 0; axis < 3; axis++)
            if (!WorldStorage.safe(Math.floor(min[axis])) || !WorldStorage.safe(Math.ceil(max[axis])))
                return storage.indexedEdits(WorldStorage.Index.WATERS, min, max);
        List<WorldBlock> result = new ArrayList<>();
        // Product of these integer-cell spans is <512, in X/Y/Z source order.
        for (double x = Math.floor(min[0]); x < max[0]; x++)
            for (double y = Math.floor(min[1]); y < max[1]; y++)
                for (double z = Math.floor(min[2]); z < max[2]; z++) {
                    WorldBlock b = storage.blockAt(x, y, z);
                    if (b != null && b.water()) result.add(b);
                }
        return result;
    }

    static Sample sample(WorldStorage storage, double[] min, double[] max) {
        int count = 0; double x = 0, y = 0, z = 0;
        for (WorldBlock b : candidates(storage, min, max)) {
            if (min[0] >= b.x + 1 || max[0] <= b.x || min[2] >= b.z + 1 || max[2] <= b.z
                || min[1] >= b.y + waterHeight(b) || max[1] <= b.y) continue;
            Sample flow = current(storage, b);
            x += flow.x; y += flow.y; z += flow.z; count++;
        }
        int divisor = count == 0 ? 1 : count;
        return new Sample(count > 0, x / divisor, y / divisor, z / divisor);
    }

    static boolean touchesPath(WorldStorage storage, double[] from, double[] to, double half, double height) {
        double[] min = {Math.min(from[0], to[0]) - half, Math.min(from[1], to[1]), Math.min(from[2], to[2]) - half};
        double[] max = {Math.max(from[0], to[0]) + half, Math.max(from[1], to[1]) + height, Math.max(from[2], to[2]) + half};
        for (WorldBlock b : candidates(storage, min, max)) if (touches(b, from, to, half, height)) return true;
        return false;
    }

    private static boolean touches(WorldBlock b, double[] from, double[] to, double half, double height) {
        double[] low = {b.x - half, b.y - height, b.z - half};
        double[] high = {b.x + 1 + half, b.y + waterHeight(b), b.z + 1 + half};
        double enter = 0, exit = 1;
        // Three slab intersections on the swept feet segment.
        for (int a = 0; a < 3; a++) {
            double delta = to[a] - from[a];
            if (delta == 0) {
                if (from[a] <= low[a] || from[a] >= high[a]) return false;
            } else {
                double t0 = (low[a] - from[a]) / delta, t1 = (high[a] - from[a]) / delta;
                enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
            }
        }
        return exit >= enter;
    }
}

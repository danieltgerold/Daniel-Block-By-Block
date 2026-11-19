package blockbyblock.core.world;

import blockbyblock.core.world.shape.BlockGeometry;
import blockbyblock.core.world.shape.QueryKind;
import blockbyblock.core.world.shape.Shape;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;

/** Shape-aware sparse terrain queries; geometry arithmetic follows the JS rules. */
final class WorldQueries {
    private final WorldStorage storage;
    WorldQueries(WorldStorage storage) { this.storage = storage; }
    static double tolerance(double min, double max) {
        return Math.min(VoxelWorld.EPSILON, Math.max(0, max - min) * 1e-6);
    }

    double[][] boxes(WorldBlock b, QueryKind kind) {
        if (b == null || b.definition == null) return new double[0][];
        int mask = 0;
        if (b.definition.shape == Shape.FENCE) {
            int[][] directions = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};
            // Exactly four horizontal neighbor queries.
            for (int i = 0; i < 4; i++) {
                WorldBlock n = storage.blockAt(b.x + directions[i][0], b.y, b.z + directions[i][1]);
                if (n != null && (n.definition.shape == Shape.FENCE || n.opaque())) mask |= 1 << i;
            }
        }
        double[][] local = BlockGeometry.boxes(b.definition, b.state, kind, mask, 0, 0, 0);
        double[] origin = {b.x, b.y, b.z};
        // At most nine boxes with six coordinates. Do not reject JS's huge-coordinate collapse.
        for (double[] box : local) for (int axis = 0; axis < 6; axis++) box[axis] = origin[axis % 3] + box[axis];
        return local;
    }

    List<double[]> collisionBoxes(double[] min, double[] max) {
        List<double[]> result = new ArrayList<>();
        // Each candidate contributes at most nine boxes.
        for (WorldBlock b : storage.indexedEdits(WorldStorage.Index.SOLIDS, min, max))
            for (double[] box : boxes(b, QueryKind.COLLISION)) result.add(box);
        return result;
    }

    boolean baseSolidInBox(double[] min, double[] max) {
        double[] lowMin = {min[0], Math.max(min[1], storage.baseY), min[2]};
        double[] highMax = {max[0], Math.min(max[1], storage.topY), max[2]};
        for (int a = 0; a < 3; a++) if (highMax[a] <= lowMin[a]) return false;
        double[] low = new double[3], high = new double[3]; double cells = 1;
        for (int a = 0; a < 3; a++) {
            double eps = tolerance(lowMin[a], highMax[a]);
            low[a] = Math.floor(lowMin[a] + eps); high[a] = Math.floor(highMax[a] - eps);
            cells *= Math.max(0, high[a] - low[a] + 1);
        }
        if (cells > storage.removedCount) return true;
        long removed = 0;
        // Only stored non-full replacements can remove analytic full cells.
        for (WorldBlock b : storage.indexedEdits(WorldStorage.Index.REMOVALS, lowMin, highMax))
            if (b.x >= low[0] && b.x <= high[0] && b.y >= low[1] && b.y <= high[1]
                && b.z >= low[2] && b.z <= high[2]) removed++;
        return cells > removed;
    }

    static boolean overlap(double[] min, double[] max, double[] box) {
        for (int axis = 0; axis < 3; axis++)
            if (!(max[axis] > box[axis] + tolerance(min[axis], max[axis])
                && min[axis] < box[axis + 3] - tolerance(min[axis], max[axis]))) return false;
        return true;
    }

    boolean hasSolidInBox(double[] min, double[] max) {
        for (int a = 0; a < 3; a++) if (max[a] <= min[a]) return false;
        if (baseSolidInBox(min, max)) return true;
        for (double[] box : collisionBoxes(min, max)) if (overlap(min, max, box)) return true;
        return false;
    }

    boolean intersectsPlayer(double x, double y, double z, double half, double height) {
        return hasSolidInBox(new double[] {x - half, y, z - half}, new double[] {x + half, y + height, z + half});
    }

    boolean supportProbe(double x, double y, double z, double half, double depth) {
        return hasSolidInBox(new double[] {x - half, y - depth, z - half}, new double[] {x + half, y, z + half});
    }

    boolean isSupported(double x, double y, double z, double half) {
        double depth = Math.min(VoxelWorld.EPSILON, half * 1e-3);
        return supportProbe(x, y, z, half, depth) && !supportProbe(x, y + depth, z, half, depth);
    }

    boolean supportedPath(double x, double y, double z, double half, double dx, double dz, double depth) {
        if (!supportProbe(x, y, z, half, depth) || !supportProbe(x + dx, y, z + dz, half, depth)) return false;
        double[] min = {x - half, y, z - half}, max = {x + half, y, z + half};
        double[] queryMin = {Math.min(min[0], min[0] + dx), y - depth, Math.min(min[2], min[2] + dz)};
        double[] queryMax = {Math.max(max[0], max[0] + dx), y, Math.max(max[2], max[2] + dz)};
        List<double[]> boundaries = new ArrayList<>();
        for (WorldBlock b : storage.indexedEdits(WorldStorage.Index.REMOVALS, queryMin, queryMax))
            boundaries.add(new double[] {b.x, b.y, b.z, b.x + 1, b.y + 1, b.z + 1});
        boundaries.addAll(collisionBoxes(queryMin, queryMax));
        TreeSet<Double> times = new TreeSet<>(); times.add(0.0); times.add(1.0);
        addBreakpoints(boundaries, times, x, y, z, half, dx, dz, depth, min, max);
        double previous = 0;
        // At most sixteen times per box plus endpoints; no arbitrary distance subdivisions.
        for (double t : times) {
            if (t == 0) continue;
            double middle = (previous + t) / 2;
            if (!supportProbe(x + dx * t, y, z + dz * t, half, depth)
                || !supportProbe(x + dx * middle, y, z + dz * middle, half, depth)) return false;
            previous = t;
        }
        return true;
    }

    private static void addBreakpoints(List<double[]> boxes, TreeSet<Double> times, double x, double y,
                                       double z, double half, double dx, double dz, double depth,
                                       double[] min, double[] max) {
        double[] position = {x, y, z}, delta = {dx, 0, dz};
        // Finite candidate boxes, two axes, two faces and two footprint sides.
        for (double[] box : boxes) {
            if (box[1] >= y || box[4] <= y - depth) continue;
            for (int axis : new int[] {0, 2}) {
                if (delta[axis] == 0) continue;
                double inset = half - tolerance(min[axis], max[axis]);
                for (int face : new int[] {axis, axis + 3}) for (int side : new int[] {-1, 1}) {
                    double t = (box[face] + side * inset - position[axis]) / delta[axis];
                    if (t > 0 && t < 1) times.add(t);
                }
            }
        }
    }
}

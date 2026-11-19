package blockbyblock.core.world;

import java.util.List;

/** Current shape-aware sweeps and step-up rules; no rendering or entity state. */
final class WorldMotion {
    private static final double EPSILON = 1e-7;
    private static final int[] MOVE_ORDER = {1, 0, 2};
    private final WorldStorage storage;
    private final WorldQueries queries;

    WorldMotion(WorldStorage storage, WorldQueries queries) {
        if (storage == null || queries == null) throw new IllegalArgumentException("World helpers are required");
        this.storage = storage;
        this.queries = queries;
    }

    VoxelWorld.Motion moveRaw(double x, double y, double z, double vx, double vy, double vz,
                              double halfWidth, double height) {
        double[] p = {x, y, z}, velocity = {vx, vy, vz}, moved = {0, 0, 0};
        boolean[] blocked = {false, false, false};
        double[] min = minimum(p, halfWidth), max = maximum(p, halfWidth, height);
        double[] queryMin = new double[3], queryMax = new double[3];
        // Three axes; NaN and signed zero are JS-falsy velocity values.
        for (int axis = 0; axis < 3; axis++) {
            double delta = Double.isNaN(velocity[axis]) ? 0 : velocity[axis];
            queryMin[axis] = Math.min(min[axis], min[axis] + delta);
            queryMax[axis] = Math.max(max[axis], max[axis] + delta);
        }
        List<double[]> boxes = queries.collisionBoxes(queryMin, queryMax);
        for (int axis : MOVE_ORDER) {
            double wanted = velocity[axis];
            if (wanted == 0 || Double.isNaN(wanted)) continue;
            min = minimum(p, halfWidth);
            max = maximum(p, halfWidth, height);
            double allowed = wanted;
            // Bounded by the stored-edit candidates, each with at most nine boxes.
            for (double[] box : boxes) allowed = clip(axis, wanted, allowed, min, max, box);
            allowed = clipTerrain(axis, wanted, allowed, min, max);
            double next = Math.max(-Double.MAX_VALUE, Math.min(Double.MAX_VALUE, p[axis] + allowed));
            moved[axis] = next - p[axis];
            blocked[axis] = Math.abs(allowed - wanted) > EPSILON;
            p[axis] = next;
        }
        return result(p, moved, blocked, halfWidth);
    }

    VoxelWorld.Motion movePlayer(double x, double y, double z, double vx, double vy, double vz,
                                 double halfWidth, double height, double size, boolean flying, boolean grounded) {
        VoxelWorld.Motion normal = moveRaw(x, y, z, vx, vy, vz, halfWidth, height);
        boolean canStep = !flying && vy <= 0 && (grounded || normal.grounded)
            && Math.abs(halfWidth - .3 * size) < 1e-8 && height >= 1.49 * size;
        if (!canStep || !normal.blockedX && !normal.blockedZ) return normal;
        double top = stepTop(normal, y, halfWidth, height, size);
        if (top == Double.NEGATIVE_INFINITY) return normal;
        VoxelWorld.Motion rise = moveRaw(x, y, z, 0, top - y, 0, halfWidth, height);
        if (rise.movedY <= 1e-7) return normal;
        VoxelWorld.Motion across = moveRaw(rise.x, rise.y, rise.z, vx, 0, vz, halfWidth, height);
        VoxelWorld.Motion down = moveRaw(across.x, across.y, across.z, 0, -rise.movedY + vy, 0, halfWidth, height);
        double dx = down.x - x, dz = down.z - z;
        if (dx * dx + dz * dz <= normal.movedX * normal.movedX + normal.movedZ * normal.movedZ + 1e-10)
            return normal;
        down.movedX = dx;
        down.movedY = down.y - y;
        down.movedZ = dz;
        down.blockedX = across.blockedX;
        down.blockedZ = across.blockedZ;
        return down;
    }

    private double stepTop(VoxelWorld.Motion normal, double y, double half, double height, double size) {
        double[] p = {normal.x, normal.y, normal.z};
        double[] min = minimum(p, half), max = maximum(p, half, height);
        double[] queryMin = {min[0], y, min[2]}, queryMax = {max[0], y + .6 * size, max[2]};
        double highest = Double.NEGATIVE_INFINITY;
        // At most nine boxes per stored candidate.
        for (double[] box : queries.collisionBoxes(queryMin, queryMax)) {
            if (box[4] > y + EPSILON && box[4] <= y + .6 * size + EPSILON
                && max[0] >= box[0] - EPSILON && min[0] <= box[3] + EPSILON
                && max[2] >= box[2] - EPSILON && min[2] <= box[5] + EPSILON)
                highest = Math.max(highest, box[4]);
        }
        // Layer count is validated by storage (at most 384).
        for (int layer = 0; layer < storage.depth; layer++) {
            double yy = storage.baseY + layer;
            if (!(yy + 1 > y + EPSILON && yy + 1 <= y + .6 * size + EPSILON)) continue;
            double[] low = {min[0] - 2 * EPSILON, yy, min[2] - 2 * EPSILON};
            double[] high = {max[0] + 2 * EPSILON, yy + 1, max[2] + 2 * EPSILON};
            if (queries.baseSolidInBox(low, high)) highest = Math.max(highest, yy + 1);
        }
        return highest;
    }

    private double clipTerrain(int axis, double wanted, double allowed, double[] min, double[] max) {
        if (axis == 1) {
            // Finite layer count, never scan by displacement.
            for (int layer = 0; layer < storage.depth; layer++) {
                double y = storage.baseY + layer;
                double[] low = {min[0], y, min[2]}, high = {max[0], y + 1, max[2]};
                if (!queries.baseSolidInBox(low, high)) continue;
                if (wanted > 0 && max[1] <= y + EPSILON) allowed = Math.min(allowed, y - max[1]);
                if (wanted < 0 && min[1] >= y + 1 - EPSILON) allowed = Math.max(allowed, y + 1 - min[1]);
            }
        } else if (min[1] < storage.topY && max[1] > storage.baseY) {
            allowed = clipLateralTerrain(axis, wanted, allowed, min, max);
        }
        return allowed;
    }

    private double clipLateralTerrain(int axis, double wanted, double allowed, double[] min, double[] max) {
        double first = wanted > 0 ? Math.ceil(max[axis] - EPSILON) : Math.floor(min[axis] + EPSILON) - 1;
        // Only stored removals can delay the first analytic terrain cell.
        for (long offset = 0; offset <= storage.removedCount + 1; offset++) {
            double cell = first + Math.signum(wanted) * offset;
            double distance = wanted > 0 ? cell - max[axis] : cell + 1 - min[axis];
            if (wanted > 0 ? distance > allowed : distance < allowed) break;
            double[] low = min.clone(), high = max.clone();
            low[axis] = cell;
            high[axis] = cell + 1;
            if (queries.baseSolidInBox(low, high)) return distance;
        }
        return allowed;
    }

    private static double clip(int axis, double wanted, double allowed, double[] min, double[] max, double[] box) {
        // Three axes, skipping the sweep axis.
        for (int other = 0; other < 3; other++) {
            if (other == axis) continue;
            double tolerance = WorldQueries.tolerance(min[other], max[other]);
            if (!(max[other] > box[other] + tolerance && min[other] < box[other + 3] - tolerance)) return allowed;
        }
        if (wanted > 0 && max[axis] <= box[axis] + EPSILON) allowed = Math.min(allowed, box[axis] - max[axis]);
        if (wanted < 0 && min[axis] >= box[axis + 3] - EPSILON) allowed = Math.max(allowed, box[axis + 3] - min[axis]);
        return allowed;
    }

    private static double[] minimum(double[] p, double half) { return new double[] {p[0] - half, p[1], p[2] - half}; }
    private static double[] maximum(double[] p, double half, double height) {
        return new double[] {p[0] + half, p[1] + height, p[2] + half};
    }

    private VoxelWorld.Motion result(double[] p, double[] moved, boolean[] blocked, double half) {
        VoxelWorld.Motion result = new VoxelWorld.Motion();
        result.x = p[0]; result.y = p[1]; result.z = p[2];
        result.movedX = moved[0]; result.movedY = moved[1]; result.movedZ = moved[2];
        result.blockedX = blocked[0]; result.blockedY = blocked[1]; result.blockedZ = blocked[2];
        result.grounded = queries.isSupported(p[0], p[1], p[2], half);
        return result;
    }
}

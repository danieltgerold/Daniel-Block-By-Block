package blockbyblock.core.world;

import blockbyblock.core.world.shape.QueryKind;

/** Ordered edit selection followed by edit-bounded analytic-terrain traversal. */
final class WorldRaycast {
    private final WorldStorage storage;
    private final WorldQueries queries;

    WorldRaycast(WorldStorage storage, WorldQueries queries) {
        if (storage == null || queries == null) throw new IllegalArgumentException("World helpers are required");
        this.storage = storage;
        this.queries = queries;
    }

    RaycastHit raycast(double ox, double oy, double oz, double dx, double dy, double dz,
                       double reach, boolean waterSources) {
        double length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length == 0 || Double.isNaN(length) || reach < 0) return null;
        double[] origin = {ox, oy, oz}, direction = {dx / length, dy / length, dz / length};
        double[] min = new double[3], max = new double[3];
        // Three axes; preserve source multiply-then-add order.
        for (int axis = 0; axis < 3; axis++) {
            double end = origin[axis] + direction[axis] * reach;
            min[axis] = Math.min(origin[axis], end);
            max[axis] = Math.max(origin[axis], end);
        }
        RaycastHit best = candidates(storage.indexedEdits(WorldStorage.Index.SOLIDS, min, max),
            origin, direction, reach, null);
        if (waterSources) best = candidates(storage.indexedEdits(WorldStorage.Index.SOURCES, min, max),
            origin, direction, reach, best);
        best = terrain(origin, direction, reach, best);
        if (best == null) return null;
        return new RaycastHit(best.x, best.y, best.z, best.nx, best.ny, best.nz, best.distance,
            ox + direction[0] * best.distance, oy + direction[1] * best.distance, oz + direction[2] * best.distance);
    }

    private RaycastHit candidates(Iterable<WorldBlock> blocks, double[] origin, double[] direction,
                                   double reach, RaycastHit best) {
        // Finite indexed-edit candidates, at most nine boxes each (one for water).
        for (WorldBlock block : blocks) {
            double[][] boxes = block.id.equals("water") ? new double[][] {{block.x, block.y, block.z,
                block.x + 1, block.y + waterHeight(block), block.z + 1}} : queries.boxes(block, QueryKind.SELECTION);
            for (double[] box : boxes) {
                double[] hit = rayBox(origin, direction, box, best != null ? best.distance : reach);
                if (hit != null && (best == null || hit[0] < best.distance))
                    best = new RaycastHit(block.x, block.y, block.z, hit[1], hit[2], hit[3], hit[0]);
            }
        }
        return best;
    }

    private RaycastHit terrain(double[] origin, double[] d, double reach, RaycastHit best) {
        if (storage.depth == 0) return best;
        double entry = 0, end = best != null ? best.distance : reach;
        double[] normal = {0, 0, 0};
        if (d[1] == 0) {
            if (origin[1] < storage.baseY || origin[1] >= storage.topY) return best;
        } else {
            double a = (storage.baseY - origin[1]) / d[1], b = (storage.topY - origin[1]) / d[1];
            entry = Math.max(0, Math.min(a, b));
            end = Math.min(end, Math.max(a, b));
            if (Math.min(a, b) >= 0) normal[1] = -Math.signum(d[1]);
            if (end < entry || end < 0) return best;
        }
        if (entry > end) return best;
        double[][] traversal = initialize(origin, d, entry);
        if (traversal == null) return best;
        return traverse(traversal, normal, entry, end, best);
    }

    private static double[][] initialize(double[] origin, double[] d, double entry) {
        double[] cell = new double[3], next = new double[3], step = new double[3], delta = new double[3];
        // Three axes, no scan over reach or world coordinates.
        for (int axis = 0; axis < 3; axis++) {
            double coordinate = origin[axis] + d[axis] * entry;
            if (!Double.isFinite(coordinate)) return null;
            cell[axis] = Math.floor(coordinate);
            if (d[axis] < 0 && coordinate == cell[axis]) cell[axis]--;
            step[axis] = Math.signum(d[axis]);
            delta[axis] = d[axis] == 0 ? Double.POSITIVE_INFINITY : Math.abs(1 / d[axis]);
            next[axis] = d[axis] == 0 ? Double.POSITIVE_INFINITY
                : ((d[axis] > 0 ? cell[axis] + 1 : cell[axis]) - origin[axis]) / d[axis];
        }
        return new double[][] {cell, next, step, delta};
    }

    private RaycastHit traverse(double[][] traversal, double[] normal, double distance, double end, RaycastHit best) {
        double[] cell = traversal[0], next = traversal[1], step = traversal[2], delta = traversal[3];
        // Only stored removed/partial cells can postpone a full analytic terrain hit.
        for (long count = 0; count <= storage.removedCount + 3 && distance <= end; count++) {
            if (cell[1] < storage.baseY || cell[1] >= storage.topY) break;
            WorldBlock block = storage.blockAt(cell[0], cell[1], cell[2]);
            if (block != null && block.fullCube())
                return new RaycastHit(cell[0], cell[1], cell[2], normal[0], normal[1], normal[2], distance);
            int axis = next[0] <= next[1] ? 0 : 1;
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

    private static double waterHeight(WorldBlock block) { return block.falling ? 1 : (8 - block.level) / 9.0; }

    private static double[] rayBox(double[] origin, double[] direction, double[] box, double reach) {
        double enter = Double.NEGATIVE_INFINITY, exit = Double.POSITIVE_INFINITY;
        double[] normal = {0, 0, 0};
        // Three axis-aligned slab intersections.
        for (int axis = 0; axis < 3; axis++) {
            if (direction[axis] == 0) {
                if (origin[axis] <= box[axis] || origin[axis] >= box[axis + 3]) return null;
            } else {
                double a = (box[axis] - origin[axis]) / direction[axis];
                double b = (box[axis + 3] - origin[axis]) / direction[axis];
                double near = Math.min(a, b);
                if (near > enter) {
                    enter = near;
                    normal = new double[] {0, 0, 0};
                    normal[axis] = -Math.signum(direction[axis]);
                }
                exit = Math.min(exit, Math.max(a, b));
            }
        }
        if (exit <= 0 || enter > exit || enter > reach) return null;
        if (enter < 0) normal = new double[] {0, 0, 0};
        return new double[] {Math.max(0, enter), normal[0], normal[1], normal[2]};
    }
}

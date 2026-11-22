package blockbyblock.web;

import blockbyblock.core.entity.Movement;
import blockbyblock.core.entity.Player;
import blockbyblock.core.entity.PlayerInput;
import blockbyblock.core.math.Trig;
import blockbyblock.core.world.RaycastHit;
import blockbyblock.core.world.VoxelWorld;
import blockbyblock.core.world.WorldBlock;
import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockGeometry;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.QueryKind;
import blockbyblock.core.world.shape.Shape;
import org.teavm.jso.JSExport;
import org.teavm.jso.typedarrays.Float64Array;

/** Numeric browser boundary for deterministic rules; no renderer or host services. */
public final class CoreExports {
    private static VoxelWorld world = new VoxelWorld();
    private static Player player = new Player();
    private static final double[] STATE = new double[21];

    private CoreExports() {}
    public static void main(String[] args) {}

    @JSExport public static void reset(int depth) {
        world = new VoxelWorld(depth);
        player = new Player();
        refreshState();
    }

    @JSExport public static void resetCurrent() {
        world = VoxelWorld.current();
        player = new Player();
        player.x = .5; player.y = 4; player.z = .5;
        refreshState();
    }

    @JSExport public static void resetWorld(double baseY, String layers) {
        if (layers == null) throw new IllegalArgumentException("Terrain layers are required");
        world = new VoxelWorld(baseY, layers.isEmpty() ? new String[0] : layers.split("\\|"));
        player = new Player();
        refreshState();
    }

    @JSExport public static void setPosition(double x, double y, double z) {
        player.x = x;
        player.y = y;
        player.z = z;
        refreshState();
    }

    @JSExport public static boolean setBlock(double x, double y, double z, boolean solid) {
        requireCoordinates(x, y, z);
        boolean changed = world.setBlock(x, y, z, solid);
        if (!changed) {
            String id = null;
            if (solid) {
                String[] layers = world.getLayers();
                double index = y - world.getBaseY();
                id = index >= 0 && index < layers.length ? layers[(int) index] : "dirt";
            }
            requireNoOp(x, y, z, id, id == null ? null : projectedState(BlockDefinition.forId(id),
                "", "", "", "", "", false), 0, false);
        }
        return changed;
    }

    @JSExport public static boolean setTypedBlock(double x, double y, double z, String id,
            String type, String facing, String half, String stairShape, String hinge,
            boolean open, int level, boolean falling) {
        requireCoordinates(x, y, z);
        if (level < 0 || level > 7) throw new IllegalArgumentException("Water level must be 0..7");
        if (id == null || id.isEmpty()) {
            boolean changed = world.setBlock(x, y, z, null, null, 0, false);
            if (!changed) requireNoOp(x, y, z, null, null, 0, false);
            return changed;
        }
        BlockDefinition definition = BlockDefinition.forId(id);
        BlockState state = projectedState(definition, type, facing, half, stairShape, hinge, open);
        boolean changed = world.setBlock(x, y, z, id, state, level, falling);
        if (!changed) requireNoOp(x, y, z, id, state, level, falling);
        return changed;
    }

    private static void requireCoordinates(double x, double y, double z) {
        // Exactly three bounded coordinate checks, matching JS safe-integer edits.
        for (double coordinate : new double[] {x, y, z})
            if (coordinate != Math.floor(coordinate) || Math.abs(coordinate) > 9007199254740991.0)
                throw new IllegalArgumentException("Block coordinates must be safe integers");
    }

    private static void requireNoOp(double x, double y, double z, String id, BlockState state,
            int level, boolean falling) {
        WorldBlock actual = world.blockAt(x, y, z);
        if (id == null && actual == null) return;
        if (actual == null || !actual.id.equals(id) || state == null
            || !actual.state.type.equals(state.type) || !actual.state.facing.equals(state.facing)
            || !actual.state.half.equals(state.half) || !actual.state.stairShape.equals(state.stairShape)
            || !actual.state.hinge.equals(state.hinge) || actual.state.open != state.open
            || id.equals("water") && (actual.level != level || actual.falling != falling))
            throw new IllegalArgumentException("World rejected the requested block edit");
    }

    private static BlockState projectedState(BlockDefinition definition, String type, String facing,
            String half, String stairShape, String hinge, boolean open) {
        Shape shape = definition.shape;
        return BlockState.of(definition,
            shape == Shape.SLAB ? fallback(type, "bottom") : "",
            shape == Shape.STAIRS || shape == Shape.DOOR ? fallback(facing, "north") : "",
            shape == Shape.STAIRS ? fallback(half, "bottom") : "",
            shape == Shape.STAIRS ? fallback(stairShape, "straight") : "",
            shape == Shape.DOOR ? fallback(hinge, "left") : "", shape == Shape.DOOR && open);
    }

    private static String fallback(String value, String defaultValue) {
        return value == null || value.isEmpty() ? defaultValue : value;
    }

    @JSExport public static void step(double forward, double right, boolean jump, boolean sprint,
            double yaw, double walkScale, double jumpVelocity, double size, boolean crouch,
            boolean canFly, boolean toggleFlight, boolean canSprint) {
        if (!Double.isFinite(size) || size <= 0) throw new IllegalArgumentException("Invalid player size");
        PlayerInput input = new PlayerInput();
        input.forward = forward; input.right = right; input.jump = jump; input.sprint = sprint;
        input.yaw = yaw; input.walkSpeedScale = walkScale; input.jumpVelocity = jumpVelocity;
        input.crouch = crouch; input.canFly = canFly; input.toggleFlight = toggleFlight;
        input.canSprint = canSprint;
        player.size = size;
        Movement.step(player, input, world);
        refreshState();
    }

    /** Zero-copy view, refreshed in the same 21-field order as current movement goldens. */
    @JSExport public static Float64Array stateView() {
        refreshState();
        return Float64Array.fromJavaArray(STATE);
    }

    private static void refreshState() {
        STATE[0] = player.x; STATE[1] = player.y; STATE[2] = player.z;
        STATE[3] = player.vx; STATE[4] = player.vy; STATE[5] = player.vz;
        STATE[6] = player.fovMultiplier; STATE[7] = player.speed;
        STATE[8] = flag(player.grounded); STATE[9] = flag(player.sprinting);
        STATE[10] = player.jumpCount; STATE[11] = player.jumpCooldown; STATE[12] = player.size;
        STATE[13] = flag(player.crouching); STATE[14] = player.eyeOffset;
        STATE[15] = flag(player.flying); STATE[16] = flag(player.inWater);
        STATE[17] = player.fallDistance; STATE[18] = player.landingFallDistance;
        STATE[19] = player.damageFallDistance; STATE[20] = player.landingDamageDistance;
    }

    @JSExport public static Float64Array raycast(double ox, double oy, double oz,
            double dx, double dy, double dz, double reach) {
        return Float64Array.fromJavaArray(ray(world.raycast(ox, oy, oz, dx, dy, dz, reach), false));
    }

    @JSExport public static Float64Array queryRaycast(double ox, double oy, double oz,
            double dx, double dy, double dz, double reach, boolean sources) {
        return Float64Array.fromJavaArray(ray(world.raycast(ox, oy, oz, dx, dy, dz, reach, sources), true));
    }

    private static double[] ray(RaycastHit hit, boolean points) {
        double[] result = new double[points ? 11 : 8];
        if (hit == null) return result;
        result[0] = 1; result[1] = hit.x; result[2] = hit.y; result[3] = hit.z;
        result[4] = hit.nx; result[5] = hit.ny; result[6] = hit.nz; result[7] = hit.distance;
        if (points) { result[8] = hit.pointX; result[9] = hit.pointY; result[10] = hit.pointZ; }
        return result;
    }

    /** Fixed scalar query ABI avoids copying Java arrays at the JS boundary. */
    @JSExport public static Float64Array query(String op, double a0, double a1, double a2,
            double a3, double a4, double a5, double a6, double a7, double a8, double a9, double a10) {
        if (op == null) throw new IllegalArgumentException("Query operation is required");
        double size = a8 == 0 || Double.isNaN(a8) ? 1 : a8;
        return Float64Array.fromJavaArray(switch (op) {
            case "ray" -> ray(world.raycast(a0, a1, a2, a3, a4, a5, a6, a7 != 0), true);
            case "supported" -> new double[] {flag(world.isSupported(a0, a1, a2, a3))};
            case "overlap" -> new double[] {flag(world.intersectsPlayer(a0, a1, a2, .3 * a3, 1.8 * a3))};
            case "path" -> new double[] {flag(world.supportedPath(a0, a1, a2, .3 * size, a3, a4, a5))};
            case "raw" -> motion(world.moveRaw(a0, a1, a2, a3, a4, a5, a6, a7));
            case "step" -> motion(world.movePlayer(a0, a1, a2, a3, a4, a5, a6, a7, size, a9 != 0, a10 != 0));
            default -> throw new IllegalArgumentException("Unknown query operation: " + op);
        });
    }

    private static double[] motion(VoxelWorld.Motion result) {
        return new double[] {result.x, result.y, result.z, result.movedX, result.movedY, result.movedZ,
            flag(result.blockedX), flag(result.blockedY), flag(result.blockedZ), flag(result.grounded)};
    }

    @JSExport public static Float64Array shape(String id, String kind, int mask, double x, double y, double z,
            String type, String facing, String half, String stairShape, String hinge, boolean open) {
        if (kind == null) throw new IllegalArgumentException("Geometry query kind is required");
        BlockDefinition definition = BlockDefinition.forId(id);
        BlockState state = BlockState.of(definition, type, facing, half, stairShape, hinge, open);
        QueryKind queryKind = switch (kind) {
            case "collision" -> QueryKind.COLLISION;
            case "selection" -> QueryKind.SELECTION;
            default -> throw new IllegalArgumentException("Unknown geometry query: " + kind);
        };
        double[][] boxes = BlockGeometry.boxes(definition, state, queryKind, mask, x, y, z);
        double[] result = new double[boxes.length * 6];
        // At most nine boxes, six coordinates each.
        for (int box = 0; box < boxes.length; box++) for (int coordinate = 0; coordinate < 6; coordinate++)
            result[box * 6 + coordinate] = boxes[box][coordinate];
        return Float64Array.fromJavaArray(result);
    }

    @JSExport public static Float64Array shapeFlags(String id, String type, String facing,
            String half, String stairShape, String hinge, boolean open) {
        BlockDefinition definition = BlockDefinition.forId(id);
        BlockState state = BlockState.of(definition, type, facing, half, stairShape, hinge, open);
        return Float64Array.fromJavaArray(new double[] {flag(definition.solid), flag(definition.opaque),
            flag(BlockGeometry.fullCube(definition, state)), flag(BlockGeometry.opaque(definition, state))});
    }

    @JSExport public static double sin(double x) { return Trig.sin(x); }
    @JSExport public static double cos(double x) { return Trig.cos(x); }
    private static double flag(boolean value) { return value ? 1 : 0; }
}

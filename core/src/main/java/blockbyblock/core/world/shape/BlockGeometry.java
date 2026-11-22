package blockbyblock.core.world.shape;

import java.util.Arrays;

/** Arithmetic-only port of the resolved geometry in src/block-shapes.js. */
public final class BlockGeometry {
    private BlockGeometry() {}

    /** Fresh ordered minX,minY,minZ,maxX,maxY,maxZ boxes, translated into the world. */
    public static double[][] boxes(BlockDefinition definition, BlockState state, QueryKind kind,
                                   int mask, double x, double y, double z) {
        requireCompatible(definition, state);
        if (kind == null) throw new IllegalArgumentException("Query kind must not be null");
        if (mask < -1 || mask > 15) throw new IllegalArgumentException("Fence mask must be -1 or 0..15");
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z))
            throw new IllegalArgumentException("Translation must be finite");
        double[][] boxes = localBoxes(definition, state, kind, mask);
        if (boxes.length > 9) throw new IllegalStateException("Geometry exceeds nine boxes");
        double[] origin = {x, y, z};
        // At most nine boxes, each with exactly six coordinates.
        for (double[] box : boxes) {
            for (int coordinate = 0; coordinate < 6; coordinate++) {
                box[coordinate] = origin[coordinate % 3] + box[coordinate];
                if (!Double.isFinite(box[coordinate]))
                    throw new IllegalArgumentException("Translated geometry must be finite");
            }
            // Unit offsets can collapse at huge finite translations; reject those boxes.
            for (int axis = 0; axis < 3; axis++) if (box[axis] >= box[axis + 3])
                throw new IllegalArgumentException("Translated geometry must have positive extent");
        }
        return boxes;
    }

    public static boolean fullCube(BlockDefinition definition, BlockState state) {
        requireCompatible(definition, state);
        return definition.solid && (definition.shape == Shape.CUBE
            || definition.shape == Shape.SLAB && state.type.equals("double"));
    }

    public static boolean opaque(BlockDefinition definition, BlockState state) {
        return fullCube(definition, state) && (definition.opaque || definition.shape == Shape.SLAB);
    }

    private static void requireCompatible(BlockDefinition definition, BlockState state) {
        if (definition == null || state == null)
            throw new IllegalArgumentException("Definition and state must not be null");
        if (definition.shape != state.shape)
            throw new IllegalArgumentException("State belongs to a different shape family");
    }

    private static double[][] localBoxes(BlockDefinition definition, BlockState state, QueryKind kind, int mask) {
        if (!definition.solid) return new double[0][];
        return switch (definition.shape) {
            case SLAB -> slab(state);
            case STAIRS -> stairs(state);
            case DOOR -> door(state);
            case FENCE -> fence(kind, mask);
            case WALL -> wall(kind, mask);
            case FARMLAND -> new double[][] {{0, 0, 0, 1, 15.0 / 16, 1}};
            case CUBE -> cube();
            case FLUID -> new double[0][];
        };
    }

    private static double[][] cube() { return new double[][] {{0, 0, 0, 1, 1, 1}}; }

    private static double[][] slab(BlockState state) {
        return switch (state.type) {
            case "double" -> cube();
            case "top" -> new double[][] {{0, .5, 0, 1, 1, 1}};
            default -> new double[][] {{0, 0, 0, 1, .5, 1}}; // Validated bottom.
        };
    }

    private static int facingIndex(String facing) {
        return switch (facing) {
            case "north" -> 0;
            case "east" -> 1;
            case "south" -> 2;
            case "west" -> 3;
            default -> throw new IllegalStateException("Unvalidated facing");
        };
    }

    private static boolean inHalf(int direction, int x, int z) {
        return switch (direction) {
            case 0 -> z == 0;
            case 1 -> x == 1;
            case 2 -> z == 1;
            case 3 -> x == 0;
            default -> throw new IllegalStateException("Invalid direction index");
        };
    }

    private static double[][] stairs(BlockState state) {
        double[][] boxes = new double[5][];
        boolean top = state.half.equals("top");
        boxes[0] = top ? new double[] {0, .5, 0, 1, 1, 1} : new double[] {0, 0, 0, 1, .5, 1};
        int count = 1, facing = facingIndex(state.facing);
        int side = (facing + (state.stairShape.endsWith("left") ? 3 : 1)) % 4;
        // Four quadrants, at most four additional boxes; x-major order is observable.
        for (int x = 0; x < 2; x++) for (int z = 0; z < 2; z++) {
            boolean front = inHalf(facing, x, z), lateral = inHalf(side, x, z);
            boolean raised = state.stairShape.startsWith("outer") ? front && lateral
                : state.stairShape.startsWith("inner") ? front || lateral : front;
            if (raised) boxes[count++] = new double[] {
                x / 2.0, top ? 0 : .5, z / 2.0, (x + 1) / 2.0, top ? .5 : 1, (z + 1) / 2.0};
        }
        return Arrays.copyOf(boxes, count);
    }

    private static double[][] door(BlockState state) {
        int facing = facingIndex(state.facing);
        if (state.open) facing = (facing + (state.hinge.equals("right") ? 3 : 1)) % 4;
        return switch (facing) {
            case 0 -> new double[][] {{0, 0, .8125, 1, 1, 1}};
            case 1 -> new double[][] {{0, 0, 0, .1875, 1, 1}};
            case 2 -> new double[][] {{0, 0, 0, 1, 1, .1875}};
            case 3 -> new double[][] {{.8125, 0, 0, 1, 1, 1}};
            default -> throw new IllegalStateException("Invalid door direction");
        };
    }

    private static double[] fenceRange(int direction) {
        return switch (direction) {
            case 0 -> new double[] {.4375, 0, .5625, .375};
            case 1 -> new double[] {.625, .4375, 1, .5625};
            case 2 -> new double[] {.4375, .625, .5625, 1};
            case 3 -> new double[] {0, .4375, .375, .5625};
            default -> throw new IllegalStateException("Invalid fence direction");
        };
    }

    private static double[] wallRange(int direction) {
        return switch (direction) {
            case 0 -> new double[] {.3125, 0, .6875, .5};
            case 1 -> new double[] {.5, .3125, 1, .6875};
            case 2 -> new double[] {.3125, .5, .6875, 1};
            case 3 -> new double[] {0, .3125, .5, .6875};
            default -> throw new IllegalStateException("Invalid wall direction");
        };
    }

    /** Post plus one arm per linked side; with no world (mask -1) JS links east and west. */
    private static double[][] wall(QueryKind kind, int mask) {
        boolean collision = kind == QueryKind.COLLISION;
        double[][] boxes = new double[5][];
        boxes[0] = new double[] {.25, 0, .25, .75, collision ? 1.5 : 1, .75};
        int count = 1;
        int[] directions = mask == -1 ? new int[] {1, 3} : new int[] {0, 1, 2, 3};
        // At most four directions, one arm box each.
        for (int direction : directions) {
            if (mask != -1 && (mask & (1 << direction)) == 0) continue;
            double[] range = wallRange(direction);
            boxes[count++] = new double[] {range[0], 0, range[1], range[2], collision ? 1.5 : .8125, range[3]};
        }
        return Arrays.copyOf(boxes, count);
    }

    private static double[][] fence(QueryKind kind, int mask) {
        boolean collision = kind == QueryKind.COLLISION;
        double[][] boxes = new double[9][];
        boxes[0] = new double[] {.375, 0, .375, .625, collision ? 1.5 : 1, .625};
        int count = 1;
        // Item geometry enumerates east then west, unlike world north/east/south/west.
        int[] directions = mask == -1 ? new int[] {1, 3} : new int[] {0, 1, 2, 3};
        // At most four directions, each adding one collision or two selection boxes.
        for (int direction : directions) {
            if (mask != -1 && (mask & (1 << direction)) == 0) continue;
            double[] range = fenceRange(direction);
            if (collision) boxes[count++] = new double[] {range[0], 0, range[1], range[2], 1.5, range[3]};
            else for (int rail = 0; rail < 2; rail++) {
                double y = rail == 0 ? .375 : .75;
                boxes[count++] = new double[] {range[0], y, range[1], range[2], y + .1875, range[3]};
            }
        }
        return Arrays.copyOf(boxes, count);
    }
}

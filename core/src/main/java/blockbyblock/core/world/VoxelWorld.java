package blockbyblock.core.world;

import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockState;
import blockbyblock.core.world.shape.Shape;


/**
 * Shared static-world collision and selection rules. Terrain layers are analytic;
 * typed edits are sparse. Candidate traversal preserves the JS query-index order.
 * World gameplay ticks and persistence are outside this snapshot API.
 */
public final class VoxelWorld {
    public static final int CHUNK_SIZE = 16;
    public static final double PLAYER_HALF_WIDTH = 0.3;
    public static final double BLOCK_REACH = 4.5;
    public static final double EPSILON = 1e-7;
    /** JS Number.MAX_SAFE_INTEGER. */
    static final double MAX_SAFE_INTEGER = 9007199254740991.0;

    private final WorldStorage storage;
    private final WorldQueries queries;
    private final WorldRaycast raycast;
    private final WorldMotion motion;

    /** Legacy constructor: explicit dirt layers below Y=0. */
    public VoxelWorld(int depth) {
        this(-depth, createLegacyLayers(depth));
    }

    private static String[] createLegacyLayers(int depth) {
        if (depth < 0 || depth > 384) throw new IllegalArgumentException("Invalid depth");
        String[] layers = new String[depth];
        for (int i = 0; i < depth; i++) layers[i] = "dirt";
        return layers;
    }

    /** Default constructor: flat 3-layer world. */
    public VoxelWorld() { this(3); }

    /** Current constructor: explicit baseY and layer array. */
    public VoxelWorld(double baseY, String[] layers) {
        this.storage = new WorldStorage(baseY, layers);
        this.queries = new WorldQueries(storage);
        this.raycast = new WorldRaycast(storage, queries);
        this.motion = new WorldMotion(storage, queries);
    }

    public static VoxelWorld current() {
        return new VoxelWorld(0, new String[] {"bedrock", "dirt", "dirt", "grass.block"});
    }

    /** Get the base Y coordinate of the world. */
    public double getBaseY() { return storage.baseY; }

    /** Get the terrain layers array. */
    public String[] getLayers() { return storage.getLayers(); }

    /** Result of {@link #movePlayer}. */
    public static final class Motion {
        public double x, y, z;
        public double movedX, movedY, movedZ;
        public boolean blockedX, blockedY, blockedZ;
        public boolean grounded;
    }

    // ==================== Legacy API (boolean solid edits) ====================

    public boolean hasBlock(double x, double y, double z) {
        WorldBlock block = storage.blockAt(x, y, z);
        return block != null;
    }

    public boolean setBlock(double x, double y, double z, boolean solid) {
        if (!WorldStorage.safe(x) || !WorldStorage.safe(y) || !WorldStorage.safe(z)) return false;
        String id = solid ? storage.baseIdAt(y) : null;
        return storage.setBlock(x, y, z, solid && id == null ? "dirt" : id, null, 0, false);
    }

    // ==================== Current API (typed block edits) ====================

    /**
     * Sets a block with full type and state information.
     * @param x block X coordinate
     * @param y block Y coordinate
     * @param z block Z coordinate
     * @param id block ID, or null for air
     * @param state block state, or null for defaults
     * @param level water level (0-7), ignored for non-water
     * @param falling whether water is falling
     * @return true if the block changed
     */
    public boolean setBlock(double x, double y, double z, String id, BlockState state,
                            int level, boolean falling) {
        return storage.setBlock(x, y, z, id, state, level, falling);
    }

    public String blockIdAt(double x, double y, double z) {
        return storage.blockIdAt(x, y, z);
    }

    public WorldBlock blockAt(double x, double y, double z) {
        return storage.blockAt(x, y, z);
    }

    // ==================== Queries ====================

    public boolean isSupported(double x, double y, double z, double halfWidth) {
        return queries.isSupported(x, y, z, halfWidth);
    }

    public boolean supportProbe(double x, double y, double z, double halfWidth, double depth) {
        return queries.supportProbe(x, y, z, halfWidth, depth);
    }

    public boolean supportedPath(double x, double y, double z, double halfWidth,
                                  double dx, double dz, double depth) {
        return queries.supportedPath(x, y, z, halfWidth, dx, dz, depth);
    }

    public boolean intersectsPlayer(double x, double y, double z, double halfWidth, double height) {
        return queries.intersectsPlayer(x, y, z, halfWidth, height);
    }

    /** Check if a block position is replaceable (air or water). */
    public boolean isReplaceable(double x, double y, double z) {
        WorldBlock block = storage.blockAt(x, y, z);
        return block == null || block.water();
    }

    public boolean hasSolidInBox(double[] min, double[] max) {
        return queries.hasSolidInBox(min, max);
    }

    public WorldFluids.Sample sample(double[] min, double[] max) {
        return WorldFluids.sample(storage, min, max);
    }

    public boolean touchesWater(double[] from, double[] to, double halfWidth, double height) {
        return WorldFluids.touchesPath(storage, from, to, halfWidth, height);
    }

    /**
     * Checks if a swept player box from previous position to current position touches water.
     * Used for fall damage water touch detection.
     */
    public boolean touchesPath(double[] prev, double[] curr, double halfWidth, double height) {
        return WorldFluids.touchesPath(storage, prev, curr, halfWidth, height);
    }

    // ==================== Raycast ====================

    /**
     * Raycast against solid blocks and optionally water sources.
     * @param ox origin X
     * @param oy origin Y
     * @param oz origin Z
     * @param dx direction X
     * @param dy direction Y
     * @param dz direction Z
     * @param reach maximum distance
     * @return RaycastHit or null if no hit within reach
     */
    public RaycastHit raycast(double ox, double oy, double oz, double dx, double dy, double dz, double reach) {
        return raycast.raycast(ox, oy, oz, dx, dy, dz, reach, false);
    }

    /**
     * Raycast with water sources option.
     * @param waterSources whether to include water source blocks
     */
    public RaycastHit raycast(double ox, double oy, double oz, double dx, double dy, double dz,
                               double reach, boolean waterSources) {
        return raycast.raycast(ox, oy, oz, dx, dy, dz, reach, waterSources);
    }

    // ==================== Motion ====================

    /**
     * Moves a player box by (vx, vy, vz), clipping each axis in turn against solid blocks.
     * Legacy 8-parameter signature.
     */
    public Motion movePlayer(double x, double y, double z, double vx, double vy, double vz,
                              double halfWidth, double height) {
        return motion.moveRaw(x, y, z, vx, vy, vz, halfWidth, height);
    }

    /**
     * Moves a player box with full parameters.
     * @param size player size multiplier
     * @param flying whether player is flying
     * @param grounded whether player started grounded
     */
    public Motion movePlayer(double x, double y, double z, double vx, double vy, double vz,
                              double halfWidth, double height, double size, boolean flying, boolean grounded) {
        return motion.movePlayer(x, y, z, vx, vy, vz, halfWidth, height, size, flying, grounded);
    }

    /**
     * Raw movement without step-up logic.
     */
    public Motion moveRaw(double x, double y, double z, double vx, double vy, double vz,
                           double halfWidth, double height) {
        return motion.moveRaw(x, y, z, vx, vy, vz, halfWidth, height);
    }
}
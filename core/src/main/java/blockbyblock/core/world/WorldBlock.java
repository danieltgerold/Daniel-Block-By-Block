package blockbyblock.core.world;

import blockbyblock.core.world.shape.BlockDefinition;
import blockbyblock.core.world.shape.BlockGeometry;
import blockbyblock.core.world.shape.BlockState;

/** Immutable typed query snapshot. An internal null ID records an air edit. */
public final class WorldBlock {
    public final double x, y, z;
    public final String id;
    public final BlockDefinition definition;
    public final BlockState state;
    public final int level;
    public final boolean falling;

    WorldBlock(double x, double y, double z, String id, BlockState state, int level, boolean falling) {
        this.x = x; this.y = y; this.z = z; this.id = id;
        this.definition = id == null ? null : BlockDefinition.forId(id);
        this.state = state; this.level = level; this.falling = falling;
    }

    boolean fullCube() { return definition != null && BlockGeometry.fullCube(definition, state); }
    boolean opaque() { return definition != null && BlockGeometry.opaque(definition, state); }
    boolean water() { return "water".equals(id); }
    boolean source() { return water() && !falling && level == 0; }
}

package blockbyblock.core.world;

/**
 * A raycast result: the hit block cell, the face normal, and the distance along the ray.
 * Coordinates are doubles because base terrain is unbounded horizontally, so a hit cell can be far
 * outside the range of a long.
 */
public final class RaycastHit {
    public final double x, y, z;
    public final double nx, ny, nz;
    public final double distance;

    RaycastHit(double x, double y, double z, double nx, double ny, double nz, double distance) {
        this.x = x; this.y = y; this.z = z;
        this.nx = nx; this.ny = ny; this.nz = nz;
        this.distance = distance;
    }

    @Override public String toString() {
        return "RaycastHit[" + x + "," + y + "," + z + " n=" + nx + "," + ny + "," + nz + " d=" + distance + "]";
    }
}

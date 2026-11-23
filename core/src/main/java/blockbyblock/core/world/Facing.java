package blockbyblock.core.world;

/** The four horizontal directions, in the JS order (north, east, south, west) and its yaw conversion. */
final class Facing {
    private Facing() {}

    static final String[] NAMES = {"north", "east", "south", "west"};
    /** x and z step for each direction in {@link #NAMES} order. */
    static final int[][] STEP = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};

    static int index(String facing) {
        for (int i = 0; i < 4; i++) if (NAMES[i].equals(facing)) return i;
        throw new IllegalArgumentException("Not a facing: " + facing);
    }

    static String opposite(String facing) { return NAMES[(index(facing) + 2) % 4]; }

    /** JS Math.round: nearest integer, ties toward positive infinity. */
    static double jsRound(double v) {
        if (!(Math.abs(v) < 4503599627370496.0)) return v;
        double floor = Math.floor(v);
        return v - floor >= 0.5 ? floor + 1 : floor;
    }

    /** The direction a player looking along {@code yaw} faces; yaw must be finite. */
    static String fromYaw(double yaw) {
        double quarter = jsRound(-yaw / (Math.PI / 2));
        double wrapped = ((quarter % 4) + 4) % 4;
        return NAMES[(int) wrapped];
    }
}

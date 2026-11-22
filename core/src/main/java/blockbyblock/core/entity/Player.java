package blockbyblock.core.entity;

/** Numeric simulation state; animation and browser controller state live outside the core. */
public final class Player {
    public double x, y, z, vx, vy, vz;
    public boolean grounded = true;
    public boolean sprinting, flying, crouching, inWater;
    public double speed;
    public double size = 1;
    public double eyeOffset = 1.62;
    public int jumpCooldown, jumpTicks, jumpCount, sprintImpulseCount;
    public double jumpApex, jumpStartY;
    public boolean jumpInProgress;
    public Jump lastJump;
    public double fovMultiplier = 1;
    public double fallDistance, landingFallDistance, damageFallDistance, landingDamageDistance;

    /** Completed-jump measurements, preserved separately from movement authority. */
    public static final class Jump {
        public final double height;
        public final int ticks;
        public final double airtime;

        Jump(double height, int ticks) {
            this.height = height;
            this.ticks = ticks;
            this.airtime = ticks * (1.0 / 20);
        }
    }
}

package blockbyblock.core.entity;

import blockbyblock.core.math.Trig;
import blockbyblock.core.world.VoxelWorld;
import blockbyblock.core.world.WorldFluids.Sample;

/** Exact arithmetic-order port of src/movement.js stepPlayer, excluding presentation. */
public final class Movement {
    private Movement() {}

    /** Advance exactly one 50 ms tick. A null world uses the historical analytic floor. */
    public static Player step(Player p, PlayerInput in, VoxelWorld world) {
        if (p == null || in == null) throw new IllegalArgumentException("Player and input are required");
        double previousX = p.x, previousY = p.y, previousZ = p.z;
        p.landingFallDistance = 0;
        p.landingDamageDistance = 0;
        if (!in.canFly) p.flying = false;
        else if (in.toggleFlight) p.flying = !p.flying;
        boolean flying = p.flying;
        Sample medium = sample(world, p);
        boolean wet = !flying && medium != null && medium.inWater;
        p.inWater = medium != null && medium.inWater;
        if (wet) { p.jumpInProgress = false; p.fallDistance = 0; }
        if (flying) { p.jumpInProgress = false; p.jumpCooldown = 0; p.fallDistance = 0; }
        posture(p, in, world, flying);
        if (world != null && p.grounded && !world.isSupported(p.x, p.y, p.z, .3 * p.size)) p.grounded = false;
        boolean startedGrounded = p.grounded;
        double forward = orZero(in.forward), right = orZero(in.right);
        // JS: input.canSprint !== false (default true if not provided)
        boolean canSprint = in.canSprint;
        p.sprinting = canSprint && forward > 0
            && (p.sprinting || ((flying || !p.crouching) && in.sprint));
        if (p.jumpCooldown > 0) p.jumpCooldown--;
        if (!in.jump) p.jumpCooldown = 0;
        double launch = Double.isNaN(in.jumpVelocity) ? .42 * p.size : in.jumpVelocity;
        boolean takeoff = !flying && !wet && in.jump && launch > 0 && startedGrounded && p.jumpCooldown == 0;
        double yaw = orZero(in.yaw), sin = Trig.sin(yaw), cos = Trig.cos(yaw);
        impulses(p, in, medium, takeoff, launch, flying, wet, sin, cos);
        accelerate(p, in, forward, right, startedGrounded, flying, wet, sin, cos);
        move(p, in, world, startedGrounded, flying, wet, takeoff);
        jumpMeasurements(p);
        fallMeasurements(p, previousY, startedGrounded, flying, wet);
        damageDistance(p, world, previousX, previousY, previousZ, startedGrounded, flying, wet);
        finish(p, startedGrounded, flying, wet);
        return p;
    }

    // JS `value || 0`: both signed zeros and NaN become positive zero.
    private static double orZero(double value) { return value == 0 || Double.isNaN(value) ? 0 : value; }

    private static Sample sample(VoxelWorld world, Player p) {
        if (world == null) return null;
        double size = p.size;
        return world.sample(new double[] {p.x - .3 * size, p.y + .1 * size, p.z - .3 * size},
            new double[] {p.x + .3 * size, p.y + (p.crouching ? 1.4 : 1.7) * size, p.z + .3 * size});
    }

    private static void posture(Player p, PlayerInput in, VoxelWorld world, boolean flying) {
        if (in.crouch && !flying) p.crouching = true;
        else if (p.crouching && (world == null
            || !world.intersectsPlayer(p.x, p.y, p.z, .3 * p.size, 1.8 * p.size))) p.crouching = false;
        p.eyeOffset += (((p.crouching ? 1.27 : 1.62) * p.size) - p.eyeOffset) * .5;
    }

    private static void impulses(Player p, PlayerInput in, Sample medium, boolean takeoff,
                                 double launch, boolean flying, boolean wet, double sin, double cos) {
        if (takeoff) {
            p.vy = launch;
            p.jumpCooldown = 10;
            p.jumpTicks = 0;
            p.jumpApex = 0;
            p.jumpStartY = p.y;
            p.jumpInProgress = true;
            p.jumpCount++;
            if (p.sprinting) {
                p.vx -= sin * .20 * p.size;
                p.vz -= cos * .20 * p.size;
                p.sprintImpulseCount++;
            }
        }
        if (flying) p.vy += ((in.jump ? 1 : 0) - (in.crouch ? 1 : 0)) * .15 * p.size;
        if (wet && medium != null) {
            if (in.jump) p.vy += .04 * p.size * (launch / (.42 * p.size));
            p.vx += medium.x * .014 * p.size;
            p.vy += medium.y * .014 * p.size;
            p.vz += medium.z * .014 * p.size;
        }
    }

    private static void accelerate(Player p, PlayerInput in, double forward, double right,
                                   boolean startedGrounded, boolean flying, boolean wet, double sin, double cos) {
        double sneak = p.crouching && !flying ? .30 : 1;
        forward *= sneak * .98;
        right *= sneak * .98;
        double length = Math.sqrt(forward * forward + right * right);
        if (length > 1) { forward /= length; right /= length; }
        double acceleration;
        if (wet) {
            // JS: .02 * (input.walkSpeedScale ?? size)
            acceleration = .02 * (Double.isNaN(in.walkSpeedScale) ? p.size : in.walkSpeedScale);
        } else if (flying) {
            // Flight is separate ability speed, scaled by size. /speed continues to control walking.
            // The 0.98 input shaping gives 10.8889 blocks/s in flight.
            acceleration = (p.sprinting ? .10 : .05) * p.size;
        } else if (startedGrounded) {
            acceleration = p.sprinting ? .1274 : .098;
            // JS: acceleration /= .98; acceleration *= input.walkSpeedScale ?? 1;
            acceleration /= .98;
            acceleration *= Double.isNaN(in.walkSpeedScale) ? 1 : in.walkSpeedScale;
        } else {
            acceleration = p.sprinting ? .02548 : .0196;
            acceleration /= .98;
            acceleration *= Double.isNaN(in.walkSpeedScale) ? 1 : in.walkSpeedScale;
        }
        p.vx += (right * cos - forward * sin) * acceleration;
        p.vz += (-right * sin - forward * cos) * acceleration;
    }

    private static void move(Player p, PlayerInput in, VoxelWorld world, boolean startedGrounded,
                             boolean flying, boolean wet, boolean takeoff) {
        if (world == null) {
            p.x += p.vx; p.z += p.vz; p.y += p.vy;
            p.speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz) * 20;
            p.grounded = p.y <= 0 && p.vy <= 0;
            if (p.grounded) p.y = 0;
            return;
        }
        double x = p.vx, z = p.vz;
        if (in.crouch && !wet && !flying && !takeoff && p.vy <= 0
            && (startedGrounded || world.supportProbe(p.x, p.y, p.z, .3 * p.size, .6 * p.size))) {
            double[] requested = sneak(world, p, x, z);
            x = requested[0]; z = requested[1];
        }
        VoxelWorld.Motion motion = world.movePlayer(p.x, p.y, p.z, x, p.vy, z, .3 * p.size,
            (p.crouching ? 1.5 : 1.8) * p.size, p.size, p.flying, p.grounded);
        p.x = motion.x; p.y = motion.y; p.z = motion.z;
        if (motion.blockedX || x != p.vx) p.vx = 0;
        if (motion.blockedY) p.vy = 0;
        if (motion.blockedZ || z != p.vz) p.vz = 0;
        p.speed = Math.sqrt(motion.movedX * motion.movedX + motion.movedZ * motion.movedZ) * 20;
        p.grounded = motion.grounded;
    }

    private static double[] sneak(VoxelWorld world, Player p, double x, double z) {
        double step = .05 * p.size;
        int count = 0;
        // Each source loop has a hard maximum of 4097 reductions.
        while (x != 0 && !supported(world, p, x, 0)) {
            x = reduce(x, step); if (++count > 4096) { x = 0; break; }
        }
        count = 0;
        while (z != 0 && !supported(world, p, 0, z)) {
            z = reduce(z, step); if (++count > 4096) { z = 0; break; }
        }
        count = 0;
        while (x != 0 && z != 0 && !supported(world, p, x, z)) {
            x = reduce(x, step); z = reduce(z, step);
            if (++count > 4096) { x = 0; z = 0; break; }
        }
        return new double[] {x, z};
    }

    private static boolean supported(VoxelWorld world, Player p, double x, double z) {
        return world.supportedPath(p.x, p.y, p.z, .3 * p.size, x, z, .6 * p.size);
    }

    private static double reduce(double value, double step) {
        return Math.abs(value) <= step ? 0 : value - Math.signum(value) * step;
    }

    private static void jumpMeasurements(Player p) {
        if (!p.jumpInProgress) return;
        p.jumpTicks++;
        p.jumpApex = Math.max(p.jumpApex, p.y - p.jumpStartY);
        if (p.grounded) {
            p.lastJump = new Player.Jump(p.jumpApex, p.jumpTicks);
            p.jumpInProgress = false;
        }
    }

    private static void fallMeasurements(Player p, double previousY, boolean startedGrounded,
                                         boolean flying, boolean wet) {
        if (!flying && !wet) {
            if (p.grounded) {
                if (!startedGrounded) p.landingFallDistance = p.fallDistance;
                p.fallDistance = 0;
            } else p.fallDistance += Math.max(0, previousY - p.y);
        }
    }

    private static void damageDistance(Player p, VoxelWorld world, double previousX, double previousY,
                                       double previousZ, boolean startedGrounded, boolean flying, boolean wet) {
        Sample entered = sample(world, p);
        if (entered != null) p.inWater = entered.inWater;
        boolean touched = (previousY > p.y || p.damageFallDistance > 0) && world != null
            && world.touchesPath(new double[] {previousX, previousY, previousZ},
                new double[] {p.x, p.y, p.z}, .3 * p.size, (p.crouching ? 1.5 : 1.8) * p.size);
        if (flying || wet || p.inWater || touched) {
            p.damageFallDistance = 0;
            if (wet || p.inWater || touched) { p.fallDistance = 0; p.landingFallDistance = 0; }
        } else {
            p.damageFallDistance += Math.max(0, previousY - p.y);
            if (p.grounded) {
                if (!startedGrounded) p.landingDamageDistance = p.damageFallDistance;
                p.damageFallDistance = 0;
            }
        }
    }

    private static void finish(Player p, boolean startedGrounded, boolean flying, boolean wet) {
        if (flying && p.grounded) p.flying = false;
        double drag = wet ? .8 : !flying && startedGrounded ? .546 : .91;
        p.vx *= drag;
        p.vz *= drag;
        p.vy = wet ? p.vy * .8 - .02 * p.size : flying ? p.vy * .60 : (p.vy - .08 * p.size) * .98;
        if (p.grounded && p.vy < 0) p.vy = 0;
        double fovTarget = (p.sprinting ? 1.15 : 1) * (p.flying ? 1.1 : 1);
        p.fovMultiplier += (fovTarget - p.fovMultiplier) * .5;
    }
}

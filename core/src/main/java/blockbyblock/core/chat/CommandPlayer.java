package blockbyblock.core.chat;

import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The parts of a player the chat commands change, ported from MovementController: the five adjustable settings with
 * their overflow and resize checks, game mode, developer mode, position and giving items. Everything the platform
 * must supply is behind {@link Host}.
 */
public final class CommandPlayer {
    /** What the surrounding game provides. */
    public interface Host {
        /**
         * Launch speed that makes a jump reach {@code height} blocks. The JS uses Math.log and Math.pow, which engines
         * do not compute identically, so the platform supplies it.
         */
        double jumpVelocityForHeight(double height);

        /** True when a player of this size standing at the position would overlap solid blocks. */
        boolean intersectsPlayer(double x, double y, double z, double size);

        void giveItem(String id, BigInteger amount);

        default void teleported(double x, double y, double z) {}

        default void gameModeChanged(String mode) {}
    }

    public static final double DEFAULT_SPEED = 0.098 / (1 - 0.546) * 20;
    public static final double DEFAULT_REACH = 4.5;
    public static final double DEFAULT_JUMP = 1.252203352512;
    public static final double DEFAULT_SIZE = 1;
    public static final double DEFAULT_FALLDAMAGE = 1;
    public static final double DEFAULT_LAUNCH_VELOCITY = 0.42;
    public static final String[] SETTING_NAMES = {"speed", "reach", "jump", "size", "falldamage"};

    /** Outcome of a settings change. {@code effective} holds speed, reach, jump and size times size. */
    public static final class Result {
        public final boolean ok;
        public final String error;
        public final double effectiveSpeed, effectiveReach, effectiveJump, effectiveSize;

        private Result(boolean ok, String error, double speed, double reach, double jump, double size) {
            this.ok = ok;
            this.error = error;
            this.effectiveSpeed = speed;
            this.effectiveReach = reach;
            this.effectiveJump = jump;
            this.effectiveSize = size;
        }

        static Result fail(String error) { return new Result(false, error, 0, 0, 0, 0); }

        static Result ok(double speed, double reach, double jump, double size) { return new Result(true, null, speed, reach, jump, size); }

        /** The effective value of a command setting; fall damage has none. */
        public double effective(String setting) {
            switch (setting) {
                case "speed": return effectiveSpeed;
                case "reach": return effectiveReach;
                case "jump": return effectiveJump;
                case "size": return effectiveSize;
                default: throw new IllegalArgumentException("No effective value for " + setting);
            }
        }
    }

    private final Host host;
    public double speed = DEFAULT_SPEED, reach = DEFAULT_REACH, jump = DEFAULT_JUMP, size = DEFAULT_SIZE, falldamage = DEFAULT_FALLDAMAGE;
    public double jumpLaunchVelocity = DEFAULT_LAUNCH_VELOCITY;
    public boolean developerMode;
    private String gameMode = "survival";
    public double x, y, z;

    public CommandPlayer(Host host) { this.host = host; }

    public String gameMode() { return gameMode; }

    public double setting(String name) {
        switch (name) {
            case "speed": return speed;
            case "reach": return reach;
            case "jump": return jump;
            case "size": return size;
            case "falldamage": return falldamage;
            default: throw new IllegalArgumentException("Unknown setting " + name);
        }
    }

    /** The default reach for the current game mode: 5 in creative, 4.5 otherwise. */
    public double defaultReach() { return gameMode.equals("creative") ? 5 : DEFAULT_REACH; }

    public static double defaultSetting(String name) {
        switch (name) {
            case "speed": return DEFAULT_SPEED;
            case "reach": return DEFAULT_REACH;
            case "jump": return DEFAULT_JUMP;
            case "size": return DEFAULT_SIZE;
            case "falldamage": return DEFAULT_FALLDAMAGE;
            default: throw new IllegalArgumentException("Unknown setting " + name);
        }
    }

    /** True the first time developer mode is switched on. */
    public boolean enableDeveloperMode() {
        boolean changed = !developerMode;
        developerMode = true;
        return changed;
    }

    public boolean setGameMode(String mode) {
        if (!mode.equals("survival") && !mode.equals("creative")) return false;
        if (!configure("reach", mode.equals("creative") ? 5 : DEFAULT_REACH).ok) return false;
        gameMode = mode;
        host.gameModeChanged(mode);
        return true;
    }

    public Result configure(String key, double value) {
        Map<String, Double> updates = new LinkedHashMap<>();
        updates.put(key, value);
        return configureSettings(updates);
    }

    public Result resetAllSettings() {
        Map<String, Double> updates = new LinkedHashMap<>();
        for (String name : SETTING_NAMES) updates.put(name, name.equals("reach") ? defaultReach() : defaultSetting(name));
        return configureSettings(updates);
    }

    /** Validates and applies a batch of setting changes; nothing changes unless all of it is acceptable. */
    public Result configureSettings(Map<String, Double> updates) {
        for (Map.Entry<String, Double> update : updates.entrySet()) {
            double value = update.getValue();
            boolean known = false;
            for (String name : SETTING_NAMES) known |= name.equals(update.getKey());
            boolean valid = known && !Double.isNaN(value) && !Double.isInfinite(value) && (update.getKey().equals("size") ? value > 0 : value >= 0);
            if (!valid) return Result.fail("Use a finite nonnegative number, or a positive size.");
        }
        double nSpeed = updates.containsKey("speed") ? updates.get("speed") : speed;
        double nReach = updates.containsKey("reach") ? updates.get("reach") : reach;
        double nJump = updates.containsKey("jump") ? updates.get("jump") : jump;
        double nSize = updates.containsKey("size") ? updates.get("size") : size;
        double nFall = updates.containsKey("falldamage") ? updates.get("falldamage") : falldamage;
        double eSpeed = nSpeed * nSize, eReach = nReach * nSize, eJump = nJump * nSize;
        double launch = updates.containsKey("jump") ? host.jumpVelocityForHeight(nJump) : jumpLaunchVelocity;
        double[] derived = {eSpeed, eReach, eJump, nSize, eSpeed * 1.3, launch * nSize, 3.92 * nSize, 1.875 * nSize,
            x + 0.3 * nSize, x - 0.3 * nSize, z + 0.3 * nSize, z - 0.3 * nSize, y + 1.8 * nSize + eJump};
        for (double d : derived) {
            if (Double.isNaN(d) || Double.isInfinite(d)) return Result.fail("Effective values would overflow; the setting was not changed.");
        }
        if (updates.containsKey("size") && host.intersectsPlayer(x, y, z, nSize))
            return Result.fail("Cannot resize here: the new collision box would intersect solid blocks.");
        speed = nSpeed;
        reach = nReach;
        jump = nJump;
        size = nSize;
        falldamage = nFall;
        jumpLaunchVelocity = launch;
        return Result.ok(eSpeed, eReach, eJump, nSize);
    }

    /** Moves the player's feet to an exact position, with no collision correction; false for a non-finite coordinate. */
    public boolean teleport(double nx, double ny, double nz) {
        for (double d : new double[] {nx, ny, nz}) if (Double.isNaN(d) || Double.isInfinite(d)) return false;
        x = nx;
        y = ny;
        z = nz;
        host.teleported(nx, ny, nz);
        return true;
    }

    public void giveItem(String id, BigInteger amount) { host.giveItem(id, amount); }
}

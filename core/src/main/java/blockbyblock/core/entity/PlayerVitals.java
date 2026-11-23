package blockbyblock.core.entity;

/**
 * Port of PlayerVitals and fallDamage (src/player-vitals.js, src/player-settings.js): health, hunger,
 * saturation and exhaustion, regeneration, void and fall damage. All values are doubles because regeneration
 * adds fractional health and exhaustion is clamped at the largest double.
 */
public final class PlayerVitals {
    public static final double DEFAULT_JUMP_HEIGHT = 1.252203352512;

    /** Receives each health loss with its source ("fall", "void", ...). */
    @FunctionalInterface
    public interface DamageListener {
        void onDamage(double amount, String source);
    }

    /** Movement settings that change fall damage; null fields use the defaults. */
    public static final class Settings {
        public Double size, jump, falldamage;

        public Settings(Double size, Double jump, Double falldamage) {
            this.size = size;
            this.jump = jump;
            this.falldamage = falldamage;
        }
    }

    /** What the player did this tick, as the simulation reports it. */
    public static final class TickInput {
        public double playerY;
        public boolean inWater, grounded, sprinting;
        /** Distance fallen on landing this tick; 0 when none. */
        public double landingDamageDistance;
        public double playerSize = 1;
        public boolean creative, jumped, sprintJump;
        public double distance, swimDistance;
        /** Null means "use the player's own size". */
        public Settings settings;
    }

    public double health, hunger, saturation, exhaustion;
    public int regenTicks, voidTicks;
    /** "fast", "slow" or null. */
    public String regenMode;
    public DamageListener onDamage;

    public PlayerVitals() { reset(); }

    private static double clamp(double value, double max) { return Math.max(0, Math.min(max, value)); }

    private static double usable(Double saved, double fallback) {
        return saved != null && !saved.isNaN() && !saved.isInfinite() ? Math.max(0, saved) : fallback;
    }

    /** Restores saved values; a missing or non-finite value falls back to the starting one. */
    public void restore(Double savedHealth, Double savedHunger, Double savedSaturation, Double savedExhaustion) {
        health = usable(savedHealth, 20);
        hunger = usable(savedHunger, 20);
        saturation = usable(savedSaturation, 5);
        exhaustion = usable(savedExhaustion, 0);
        health = clamp(health, 20);
        hunger = clamp(hunger, 20);
        saturation = clamp(saturation, hunger);
        regenTicks = 0;
        regenMode = null;
        voidTicks = 0;
    }

    public void reset() { restore(null, null, null, null); }

    public boolean dead() { return health <= 0; }

    public void damage(double amount, String source) {
        double before = health;
        if (amount > 0) health = Math.max(0, health - amount);
        if (health < before && onDamage != null) onDamage.onDamage(before - health, source);
    }

    public void exhaust(double amount) {
        if (amount > 0) exhaustion = Math.min(Double.MAX_VALUE, exhaustion + amount);
    }

    public void processExhaustion() {
        // Constant time even at developer-mode movement speeds. Java's comparison is strictly > 4; an exact
        // multiple leaves 4 exhaustion carried over.
        if (exhaustion > 4) {
            double losses = Math.ceil(exhaustion / 4) - 1;
            double rest = exhaustion % 4;
            exhaustion = rest == 0 || Double.isNaN(rest) ? 4 : rest;
            double saturationLoss = Math.min(losses, Math.ceil(saturation));
            saturation = Math.max(0, saturation - saturationLoss);
            hunger = Math.max(0, hunger - (losses - saturationLoss));
        }
        hunger = clamp(hunger, 20);
        saturation = clamp(saturation, hunger);
    }

    public boolean eat(double foodHunger, double foodSaturation) {
        if (dead() || hunger >= 20) return false;
        hunger = Math.min(20, hunger + foodHunger);
        saturation = Math.min(hunger, saturation + foodSaturation);
        return true;
    }

    public static double fallDamage(double distance, Double size, Double jump, Double falldamage) {
        double s = size == null ? 1 : size, j = jump == null ? DEFAULT_JUMP_HEIGHT : jump, f = falldamage == null ? 1 : falldamage;
        double safe = Math.max(3, j);
        double extra = Math.max(0, distance / s - safe - 1e-7 * Math.max(1, safe));
        return f == 0 ? 0 : Math.max(0, Math.ceil(extra * f - 1e-9));
    }

    public void tick(TickInput in) {
        if (dead()) return;
        if (in.playerY < -64) {
            if (++voidTicks >= 10) {
                voidTicks = 0;
                damage(4, "void");
            }
        } else voidTicks = 0;
        if (dead() || in.creative) {
            regenTicks = 0;
            regenMode = null;
            return;
        }
        if (in.inWater) exhaust(in.swimDistance * .01);
        else if (in.grounded && in.sprinting) exhaust(in.distance * .1);
        if (in.jumped) exhaust(in.sprintJump ? .2 : .05);
        double fall = in.landingDamageDistance;
        if (fall > 0) {
            Settings s = in.settings != null ? in.settings : new Settings(in.playerSize, null, null);
            damage(fallDamage(fall, s.size, s.jump, s.falldamage), "fall");
        }
        if (dead()) return;
        processExhaustion();
        String mode = health < 20 && hunger >= 18 ? hunger == 20 && saturation > 0 ? "fast" : "slow" : null;
        if (!java.util.Objects.equals(mode, regenMode)) {
            regenMode = mode;
            regenTicks = 0;
        }
        if (mode == null) {
            regenTicks = 0;
            return;
        }
        if (++regenTicks >= (mode.equals("fast") ? 10 : 80)) {
            regenTicks = 0;
            double amount = mode.equals("fast") ? Math.min(saturation, 6) : 6;
            health = Math.min(20, health + amount / 6);
            exhaust(amount);
            processExhaustion();
        }
    }
}

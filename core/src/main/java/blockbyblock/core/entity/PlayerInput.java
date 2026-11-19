package blockbyblock.core.entity;

/** One simulation tick. NaN denotes an absent optional numeric setting, distinct from zero. */
public final class PlayerInput {
    public double forward, right, yaw;
    public double walkSpeedScale = Double.NaN;
    public double jumpVelocity = Double.NaN;
    public boolean jump, sprint, crouch, canFly, toggleFlight;
    public boolean canSprint = true;
}

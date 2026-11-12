// Position is in blocks (1 block = 1 meter); velocity is blocks per physics tick.
// y is always the player's feet. Constants follow the requested Java rules.
import { createPlayerAnimation, tickPlayerAnimation, interpolatePlayerAnimation } from './player-animation.js';
export const MOVEMENT = Object.freeze({
  ticksPerSecond: 20,
  fixedStep: 1 / 20,
  groundWalkAcceleration: 0.098,
  groundSprintAcceleration: 0.1274,
  airWalkAcceleration: 0.0196,
  airSprintAcceleration: 0.02548,
  diagonalAdjustment: 0.98,
  groundDrag: 0.546,
  airDrag: 0.91,
  jumpVelocity: 0.42,
  sprintJumpImpulse: 0.20,
  jumpCooldownTicks: 10,
  doubleTapTicks: 7,
  gravity: 0.08,
  verticalDrag: 0.98,
  sprintFovMultiplier: 1.15,
  playerHeight: 2,
  eyeHeight: 1.6,
});

export function createPlayer() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, sprinting: false, speed: 0,
    jumpCooldown: 0, jumpTicks: 0, jumpApex: 0, jumpStartY: 0, jumpInProgress: false,
    jumpCount: 0, sprintImpulseCount: 0, lastJump: null,
    fovMultiplier: 1,
    animation: createPlayerAnimation(),
  };
}

// Exactly one 50 ms physics tick. This snapshot drives both acceleration and
// drag, including takeoff and landing ticks.
export function stepPlayer(player, input = {}, world = null) {
  const previousX = player.x, previousZ = player.z;
  // A block edit can remove last tick's support before the next tick begins.
  if (world && player.grounded && !world.isSupported(player)) player.grounded = false;
  const startedGrounded = player.grounded;
  let forward = input.forward || 0;
  let right = input.right || 0;
  player.sprinting = forward > 0 && (player.sprinting || Boolean(input.sprint));
  player.fovMultiplier += ((player.sprinting ? MOVEMENT.sprintFovMultiplier : 1) - player.fovMultiplier) * 0.5;

  if (player.jumpCooldown > 0) player.jumpCooldown--;
  // Java resets the repeat delay when jump is released.
  if (!input.jump) player.jumpCooldown = 0;
  const takeoff = Boolean(input.jump) && startedGrounded && player.jumpCooldown === 0;
  const yaw = input.yaw || 0;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // 1. Jump and the once-per-takeoff sprint impulse, using carried velocity.
  if (takeoff) {
    player.vy = MOVEMENT.jumpVelocity;
    player.jumpCooldown = MOVEMENT.jumpCooldownTicks;
    player.jumpTicks = 0;
    player.jumpApex = 0;
    player.jumpStartY = player.y;
    player.jumpInProgress = true;
    player.jumpCount++;
    if (player.sprinting) {
      player.vx -= sinYaw * MOVEMENT.sprintJumpImpulse;
      player.vz -= cosYaw * MOVEMENT.sprintJumpImpulse;
      player.sprintImpulseCount++;
    }
  }

  // 2. Normalize diagonals, preserving Java's small diagonal speed adjustment.
  const diagonal = forward !== 0 && right !== 0;
  const length = Math.hypot(forward, right);
  if (length > 1) { forward /= length; right /= length; }
  let acceleration = startedGrounded
    ? (player.sprinting ? MOVEMENT.groundSprintAcceleration : MOVEMENT.groundWalkAcceleration)
    : (player.sprinting ? MOVEMENT.airSprintAcceleration : MOVEMENT.airWalkAcceleration);
  if (diagonal) acceleration /= MOVEMENT.diagonalAdjustment;
  // Only new acceleration is rotated by yaw; momentum stays in world space.
  player.vx += (right * cosYaw - forward * sinYaw) * acceleration;
  player.vz += (-right * sinYaw - forward * cosYaw) * acceleration;

  // 3. Move, resolve the floor, then apply drag using the PREVIOUS grounded state.
  if (world) {
    const motion = world.movePlayer(player, { x: player.vx, y: player.vy, z: player.vz }, undefined, MOVEMENT.playerHeight);
    player.x = motion.x; player.y = motion.y; player.z = motion.z;
    if (motion.blocked.x) player.vx = 0;
    if (motion.blocked.y) player.vy = 0;
    if (motion.blocked.z) player.vz = 0;
    player.speed = Math.hypot(motion.moved.x, motion.moved.z) * MOVEMENT.ticksPerSecond;
    player.grounded = motion.grounded;
  } else {
    player.x += player.vx;
    player.z += player.vz;
    player.y += player.vy;
    player.speed = Math.hypot(player.vx, player.vz) * MOVEMENT.ticksPerSecond;
    player.grounded = player.y <= 0 && player.vy <= 0;
    if (player.grounded) player.y = 0;
  }
  if (player.jumpInProgress) {
    player.jumpTicks++;
    player.jumpApex = Math.max(player.jumpApex, player.y - player.jumpStartY);
    if (player.grounded) {
      player.lastJump = {
        height: player.jumpApex,
        ticks: player.jumpTicks,
        airtime: player.jumpTicks * MOVEMENT.fixedStep,
      };
      player.jumpInProgress = false;
    }
  }
  const drag = startedGrounded ? MOVEMENT.groundDrag : MOVEMENT.airDrag;
  player.vx *= drag;
  player.vz *= drag;
  player.vy = (player.vy - MOVEMENT.gravity) * MOVEMENT.verticalDrag;
  if (player.grounded && player.vy < 0) player.vy = 0;
  tickPlayerAnimation(player.animation, { dx: player.x - previousX, dz: player.z - previousZ,
    aimYaw: input.yaw, aimPitch: input.pitch, swing: input.swing, mining: input.mining });
  return player;
}

const supportedKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft']);
const snapshot = p => ({ x: p.x, y: p.y, z: p.z, fovMultiplier: p.fovMultiplier, animation: { ...p.animation } });

export class MovementController {
  constructor(world = null) {
    this.world = world;
    this.player = createPlayer();
    this.accumulator = 0;
    this.previous = snapshot(this.player);
    this.totalSteps = 0;
    this.heldKeys = new Set();
    this.lastForwardPressTick = -Infinity;
    this.sprintRequested = false;
    this.miningHeld = false;
    this.swingQueued = false;
    this.onTick = null;
  }

  setMining(held) { this.miningHeld = held; }
  requestSwing() { this.swingQueued = true; }

  keyDown(code, repeat = false) {
    // Count actual transitions, not OS repeats or duplicate keydown events.
    if (!supportedKeys.has(code) || repeat || this.heldKeys.has(code)) return;
    this.heldKeys.add(code);
    if (code === 'KeyW') {
      if (this.totalSteps - this.lastForwardPressTick <= MOVEMENT.doubleTapTicks) {
        this.sprintRequested = true;
      }
      this.lastForwardPressTick = this.totalSteps;
    }
    this.cancelSprintWithoutForward();
  }

  keyUp(code) {
    this.heldKeys.delete(code);
    this.cancelSprintWithoutForward();
  }

  cancelSprintWithoutForward() {
    if (!this.heldKeys.has('KeyW') || this.heldKeys.has('KeyS')) {
      this.player.sprinting = false;
      this.sprintRequested = false;
    }
  }

  readInput() {
    return {
      forward: Number(this.heldKeys.has('KeyW')) - Number(this.heldKeys.has('KeyS')),
      right: Number(this.heldKeys.has('KeyD')) - Number(this.heldKeys.has('KeyA')),
      jump: this.heldKeys.has('Space'),
      sprint: this.heldKeys.has('ShiftLeft') || this.sprintRequested,
    };
  }

  update(frameSeconds, input = {}) {
    // Simulate normal frames fully; cap long browser stalls. Focus loss pauses
    // separately so returning to the tab never simulates unattended input.
    this.accumulator += Math.max(0, Math.min(frameSeconds, 0.25));
    // Sub-nanosecond rounding must not postpone a tick at a clock boundary.
    while (this.accumulator + 1e-9 >= MOVEMENT.fixedStep) {
      this.previous = snapshot(this.player);
      // Overrides let deterministic measurements exercise this exact controller.
      stepPlayer(this.player, { ...this.readInput(), mining: this.miningHeld, swing: this.swingQueued, ...input }, this.world);
      if (this.player.animation.swingStartedThisTick) this.swingQueued = false;
      this.sprintRequested = false;
      this.accumulator -= MOVEMENT.fixedStep;
      this.totalSteps++;
      this.onTick?.(this.player);
    }
    this.accumulator = Math.max(0, this.accumulator);
  }

  renderState() {
    const alpha = this.accumulator / MOVEMENT.fixedStep;
    const result = {};
    for (const key of ['x', 'y', 'z', 'fovMultiplier']) {
      result[key] = this.previous[key] + (this.player[key] - this.previous[key]) * alpha;
    }
    result.animation = interpolatePlayerAnimation(this.previous.animation, this.player.animation, alpha);
    return result;
  }

  respawn(position) {
    const { aimYaw, aimPitch } = this.player.animation;
    this.player = { ...createPlayer(), ...position };
    this.player.animation = createPlayerAnimation(aimYaw, aimPitch);
    this.pause();
  }

  pause() {
    this.miningHeld = false;
    this.swingQueued = false;
    this.player.animation.swingAge = -1;
    this.player.animation.amount = 0;
    this.heldKeys.clear();
    this.lastForwardPressTick = -Infinity;
    this.sprintRequested = false;
    this.accumulator = 0;
    this.player.sprinting = false;
    this.player.fovMultiplier = 1;
    this.player.jumpCooldown = 0;
    this.player.vx = this.player.vz = this.player.speed = 0;
    this.previous = snapshot(this.player);
  }
}

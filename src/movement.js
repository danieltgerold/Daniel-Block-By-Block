// Position is in blocks (1 block = 1 meter); velocity is blocks per physics tick.
// y is always the player's feet. Constants follow the requested Java rules.
import { createPlayerAnimation, tickPlayerAnimation, interpolatePlayerAnimation } from './player-animation.js';
import { DEFAULT_SETTINGS, DEFAULT_WALK_SPEED, effectiveSettings, jumpVelocityForHeight } from './player-settings.js';
import { protectSneakingEdge } from './player-posture.js';
export { DEFAULT_WALK_SPEED };
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
  playerHeight: 1.8,
  eyeHeight: 1.62,
  crouchHeight: 1.5,
  crouchEyeHeight: 1.27,
});

export function createPlayer() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    grounded: true, sprinting: false, speed: 0, size: 1, crouching: false, eyeOffset: 1.62,
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
  if (input.crouch) player.crouching = true;
  else if (player.crouching && (!world || !world.intersectsPlayer({ ...player, crouching: false }))) player.crouching = false;
  player.eyeOffset += (((player.crouching ? MOVEMENT.crouchEyeHeight : MOVEMENT.eyeHeight) * player.size) - player.eyeOffset) * 0.5;
  // A block edit can remove last tick's support before the next tick begins.
  if (world && player.grounded && !world.isSupported(player)) player.grounded = false;
  const startedGrounded = player.grounded;
  let forward = input.forward || 0;
  let right = input.right || 0;
  player.sprinting = forward > 0 && (player.sprinting || (!player.crouching && Boolean(input.sprint)));
  player.fovMultiplier += ((player.sprinting ? MOVEMENT.sprintFovMultiplier : 1) - player.fovMultiplier) * 0.5;

  if (player.jumpCooldown > 0) player.jumpCooldown--;
  // Java resets the repeat delay when jump is released.
  if (!input.jump) player.jumpCooldown = 0;
  const size = player.size ?? 1;
  const launchVelocity = input.jumpVelocity ?? MOVEMENT.jumpVelocity * size;
  const takeoff = Boolean(input.jump) && launchVelocity > 0 && startedGrounded && player.jumpCooldown === 0;
  const yaw = input.yaw || 0;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  // 1. Jump and the once-per-takeoff sprint impulse, using carried velocity.
  if (takeoff) {
    player.vy = launchVelocity;
    player.jumpCooldown = MOVEMENT.jumpCooldownTicks;
    player.jumpTicks = 0;
    player.jumpApex = 0;
    player.jumpStartY = player.y;
    player.jumpInProgress = true;
    player.jumpCount++;
    if (player.sprinting) {
      player.vx -= sinYaw * MOVEMENT.sprintJumpImpulse * size;
      player.vz -= cosYaw * MOVEMENT.sprintJumpImpulse * size;
      player.sprintImpulseCount++;
    }
  }

  // 2. Normalize diagonals, preserving Java's small diagonal speed adjustment.
  const sneak = player.crouching ? 0.30 : 1;
  forward *= sneak * MOVEMENT.diagonalAdjustment;
  right *= sneak * MOVEMENT.diagonalAdjustment;
  const length = Math.hypot(forward, right);
  if (length > 1) { forward /= length; right /= length; }
  let acceleration = startedGrounded
    ? (player.sprinting ? MOVEMENT.groundSprintAcceleration : MOVEMENT.groundWalkAcceleration)
    : (player.sprinting ? MOVEMENT.airSprintAcceleration : MOVEMENT.airWalkAcceleration);
  acceleration /= MOVEMENT.diagonalAdjustment;
  acceleration *= input.walkSpeedScale ?? 1;
  // Only new acceleration is rotated by yaw; momentum stays in world space.
  player.vx += (right * cosYaw - forward * sinYaw) * acceleration;
  player.vz += (-right * sinYaw - forward * cosYaw) * acceleration;

  // 3. Move, resolve the floor, then apply drag using the PREVIOUS grounded state.
  if (world) {
    let requested = { x: player.vx, z: player.vz };
    if (input.crouch && !takeoff && player.vy <= 0 && (startedGrounded || world.supportProbe(player))) {
      requested = protectSneakingEdge(world, player, requested.x, requested.z);
    }
    const motion = world.movePlayer(player, { ...requested, y: player.vy }, 0.3 * size,
      (player.crouching ? MOVEMENT.crouchHeight : MOVEMENT.playerHeight) * size);
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
  player.vy = (player.vy - MOVEMENT.gravity * size) * MOVEMENT.verticalDrag;
  if (player.grounded && player.vy < 0) player.vy = 0;
  tickPlayerAnimation(player.animation, { dx: player.x - previousX, dz: player.z - previousZ,
    aimYaw: input.yaw, aimPitch: input.pitch, swing: input.swing, mining: input.mining, crouching: player.crouching });
  return player;
}

const supportedKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'KeyR']);
const snapshot = p => ({ x: p.x, y: p.y, z: p.z, eyeOffset: p.eyeOffset, fovMultiplier: p.fovMultiplier, animation: { ...p.animation } });

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
    this.placementHeld = false;
    this.swingQueued = false;
    this.onTick = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.jumpLaunchVelocity = MOVEMENT.jumpVelocity;
    this.developerMode = false;
  }

  get walkSpeed() { return this.settings.speed; }
  get size() { return this.settings.size; }
  get effective() { return effectiveSettings(this.settings); }
  get eyeHeight() { return (this.player.crouching ? MOVEMENT.crouchEyeHeight : MOVEMENT.eyeHeight) * this.size; }
  enableDeveloperMode() { const changed = !this.developerMode; this.developerMode = true; return changed; }
  configure(key, value) {
    return this.configureSettings({ [key]: value });
  }
  resetAllSettings() { return this.configureSettings({ ...DEFAULT_SETTINGS }); }
  configureSettings(updates) {
    if (!Object.entries(updates).every(([key, value]) => Object.hasOwn(DEFAULT_SETTINGS, key)
      && Number.isFinite(value) && (key === 'size' ? value > 0 : value >= 0))) {
      return { ok: false, error: 'Use a finite nonnegative number, or a positive size.' };
    }
    const next = { ...this.settings, ...updates };
    const effective = effectiveSettings(next);
    const launch = Object.hasOwn(updates, 'jump') ? jumpVelocityForHeight(next.jump) : this.jumpLaunchVelocity;
    const derived = [...Object.values(effective), effective.speed * 1.3, launch * next.size,
      3.92 * next.size, 1.875 * next.size, this.player.x + 0.3 * next.size,
      this.player.x - 0.3 * next.size, this.player.z + 0.3 * next.size,
      this.player.z - 0.3 * next.size, this.player.y + 1.8 * next.size + effective.jump];
    if (!derived.every(Number.isFinite)) return { ok: false, error: 'Effective values would overflow; the setting was not changed.' };
    if (Object.hasOwn(updates, 'size') && this.world?.intersectsPlayer(this.player, next.size)) {
      return { ok: false, error: 'Cannot resize here: the new collision box would intersect solid blocks.' };
    }
    this.settings = next;
    this.jumpLaunchVelocity = launch;
    this.player.size = next.size;
    if (Object.hasOwn(updates, 'size')) { this.player.eyeOffset = this.eyeHeight; this.previous = snapshot(this.player); }
    return { ok: true, effective };
  }
  setWalkSpeed(value) {
    const result = this.configure('speed', value);
    if (!result.ok) throw new RangeError(result.error);
  }
  resetWalkSpeed() { this.setWalkSpeed(DEFAULT_WALK_SPEED); }
  interactionRay(feet = this.player, yaw = this.player.animation.aimYaw, pitch = this.player.animation.aimPitch) {
    return { origin: { x: feet.x, y: feet.y + (feet.eyeHeight ?? feet.eyeOffset ?? this.eyeHeight), z: feet.z },
      direction: { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }, reach: this.effective.reach };
  }
  targetBlock(feet, yaw, pitch) {
    const ray = this.interactionRay(feet, yaw, pitch);
    return this.world?.raycast(ray.origin, ray.direction, ray.reach) ?? null;
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
      sprint: this.heldKeys.has('KeyR') || this.sprintRequested,
      crouch: this.heldKeys.has('ShiftLeft'),
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
      stepPlayer(this.player, { ...this.readInput(), mining: this.miningHeld, swing: this.swingQueued, ...input,
        walkSpeedScale: this.effective.speed / DEFAULT_WALK_SPEED,
        jumpVelocity: this.jumpLaunchVelocity * this.size }, this.world);
      this.swingQueued = false;
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
    result.size = this.size;
    result.crouching = this.player.crouching;
    result.eyeHeight = this.previous.eyeOffset + (this.player.eyeOffset - this.previous.eyeOffset) * alpha;
    return result;
  }

  respawn(position) {
    const { aimYaw, aimPitch } = this.player.animation;
    this.player = { ...createPlayer(), ...position, size: this.size };
    this.player.eyeOffset = this.eyeHeight;
    this.player.animation = createPlayerAnimation(aimYaw, aimPitch);
    this.pause();
  }

  teleport(position) {
    if (!['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) return false;
    // Deliberately allow air and solid destinations. No collision correction or
    // rounding: the next physics tick resumes normally at these exact feet.
    this.respawn({ x: position.x, y: position.y, z: position.z });
    this.player.grounded = this.world ? this.world.isSupported(this.player) : position.y === 0;
    this.onTeleport?.();
    return true;
  }

  pause() {
    this.miningHeld = false;
    this.placementHeld = false;
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

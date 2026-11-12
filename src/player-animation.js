const TAU = Math.PI * 2;
export const SWING_TICKS = 6;
export const wrapAngle = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
export const angleDifference = (from, to) => wrapAngle(to - from);
export const lerpAngle = (from, to, alpha) => wrapAngle(from + angleDifference(from, to) * alpha);

export function createPlayerAnimation(aimYaw = 0, aimPitch = 0) {
  return { amount: 0, phase: 0, aimYaw, aimPitch, torsoYaw: aimYaw,
    swingAge: -1, swingSerial: 0, swingStartedThisTick: false };
}

export function tickPlayerAnimation(state, { dx = 0, dz = 0, aimYaw = state.aimYaw,
  aimPitch = state.aimPitch, swing = false, mining = false } = {}) {
  const distance = Math.hypot(dx, dz);
  state.amount += (Math.min(4 * distance, 1) - state.amount) * 0.4;
  state.phase += state.amount;
  state.aimYaw = wrapAngle(aimYaw);
  state.aimPitch = aimPitch;
  state.swingStartedThisTick = false;
  if (state.swingAge >= 0 && ++state.swingAge >= SWING_TICKS) state.swingAge = -1;
  if ((swing || mining) && state.swingAge < 0) {
    state.swingAge = 0;
    state.swingSerial++;
    state.swingStartedThisTick = true;
  }
  let target = state.torsoYaw;
  if (distance > 0.05) {
    target = Math.atan2(-dx, -dz); // Game forward is -Z, right is +X.
    if (Math.abs(angleDifference(state.aimYaw, target)) > 95 * Math.PI / 180) target = wrapAngle(target + Math.PI);
  }
  if (state.swingAge >= 0) target = state.aimYaw;
  state.torsoYaw = lerpAngle(state.torsoYaw, target, 0.3);
  const headYaw = angleDifference(state.torsoYaw, state.aimYaw);
  const limit = 50 * Math.PI / 180;
  if (Math.abs(headYaw) > limit) state.torsoYaw = wrapAngle(state.aimYaw - Math.sign(headYaw) * limit);
  return state;
}

export function interpolatePlayerAnimation(previous, current, alpha) {
  const pose = {
    amount: previous.amount + (current.amount - previous.amount) * alpha,
    phase: previous.phase + (current.phase - previous.phase) * alpha,
    torsoYaw: lerpAngle(previous.torsoYaw, current.torsoYaw, alpha),
    aimYaw: lerpAngle(previous.aimYaw, current.aimYaw, alpha),
    aimPitch: previous.aimPitch + (current.aimPitch - previous.aimPitch) * alpha,
    swingActive: previous.swingAge >= 0 || current.swingAge >= 0,
    swingProgress: 0,
  };
  if (previous.swingAge >= 0) {
    // Finish the old cycle toward 1, including when a held click starts a new one.
    const nextAge = current.swingSerial !== previous.swingSerial || current.swingAge < 0
      ? SWING_TICKS : current.swingAge;
    pose.swingProgress = (previous.swingAge + (nextAge - previous.swingAge) * alpha) / SWING_TICKS;
  } else if (current.swingAge >= 0) {
    pose.swingProgress = current.swingAge * alpha / SWING_TICKS;
  }
  pose.headYaw = angleDifference(pose.torsoYaw, pose.aimYaw);
  return pose;
}

export function swingCurves(progress, active = true) {
  if (!active) return { inward: 0, vertical: 0, reach: 0 };
  const p = Math.max(0, Math.min(progress, 1));
  return { inward: Math.sin(Math.PI * Math.sqrt(p)),
    vertical: Math.sin(2 * Math.PI * Math.sqrt(p)), reach: Math.sin(Math.PI * p) };
}

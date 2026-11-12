import { BLOCK_REACH } from './voxel-world.js';
export const DEFAULT_WALK_SPEED = 0.098 / (1 - 0.546) * 20;
export const DEFAULT_JUMP_HEIGHT = 1.252203352512;
export const DEFAULT_SETTINGS = Object.freeze({ speed: DEFAULT_WALK_SPEED, reach: BLOCK_REACH, jump: DEFAULT_JUMP_HEIGHT, size: 1 });

// Peak of the actual tick recurrence: move by vy, then vy=(vy-0.08)*0.98.
export function jumpApex(velocity) {
  if (velocity <= 0.08) return Math.max(0, velocity);
  const drag = 0.98, terminal = 0.08 * drag / (1 - drag);
  const ticks = Math.ceil(Math.log(terminal / (velocity + terminal)) / Math.log(drag));
  const sum = (1 - drag ** ticks) / (1 - drag);
  return sum * velocity - terminal * (ticks - sum);
}

export function jumpVelocityForHeight(height) {
  if (height === 0) return 0;
  if (height === DEFAULT_JUMP_HEIGHT) return 0.42;
  let low = 0, high = height;
  for (let i = 0; i < 100; i++) {
    const middle = low + (high - low) * 0.5;
    if (jumpApex(middle) < height) low = middle; else high = middle;
  }
  return low + (high - low) * 0.5;
}

export function effectiveSettings(settings) {
  return { speed: settings.speed * settings.size, reach: settings.reach * settings.size,
    jump: settings.jump * settings.size, size: settings.size };
}

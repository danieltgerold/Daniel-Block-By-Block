# Block By Block - movement milestone 002

A local JavaScript / Three.js / Vite first-person test. This milestone implements
the requested Minecraft Java Edition 1.21.11-style flat-floor movement rules.
It does not attempt to simulate the rest of Minecraft.

## Run

- `npm run dev` starts development with live reload.
- `npm test` checks inputs, physics, interpolation, and actual movement measurements.
- `npm run build` creates the production site in `dist/`.
- `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` serves the build.

## Controls

- Click **Step into the world** to capture the mouse. Mouse movement looks around.
- WASD moves relative to horizontal camera direction.
- W + **Left Shift**, or two actual W presses within **7 physics ticks (0.35 s)**,
  starts sprinting. Auto-repeat and duplicate keydown events do not count.
- Release Shift while holding W to keep sprinting, including in the air and after
  landing. Releasing forward input, or canceling it with S, stops sprinting.
- Hold Space to jump repeatedly whenever grounded and the jump cooldown permits.
- Esc releases the mouse. Unlocking, switching windows, or hiding the tab clears
  held inputs, sprint, and double-tap history. Click again to resume.

## World and physics

One block is one meter. Each floor cell is 1 m x 1 m. The player is 2 m tall,
with eyes 1.8 m above the feet. Only the flat floor has collision.

Physics runs at **20 ticks per second**. Velocities are stored in **blocks/tick**,
with horizontal momentum kept in world coordinates. Turning the camera rotates
only new acceleration and the sprint takeoff impulse.

Each tick takes a snapshot of the previous grounded state, then:

1. If held jump is eligible, set vy to 0.42 and a 10-tick jump cooldown. Sprint
   takeoff adds 0.20 horizontal velocity in camera-yaw direction, exactly once.
   The cooldown decreases each tick; releasing jump resets it, as in Java.
2. Apply walking/sprinting acceleration of 0.098/0.1274 if the tick started on
   the ground, or 0.0196/0.02548 if it started in the air. Normalize diagonal
   input and divide these straight-input accelerations by 0.98 for diagonals.
3. Move and resolve floor contact. Multiply horizontal velocity by 0.546 if the
   tick started grounded, otherwise 0.91. Apply vy = (vy - 0.08) * 0.98, clearing
   downward velocity on floor contact. Save the new grounded state.

Thus the takeoff tick uses ground acceleration and drag; the landing tick uses
those for air. Space held throughout produces one takeoff every 12 ticks.

Position is interpolated between physics snapshots. The current 75-degree
vertical FOV is the base. Its multiplier moves halfway toward 1.15 when sprinting,
otherwise 1.0, every physics tick. Rendering interpolates that multiplier too
and updates the camera projection. Jump boosts never change the FOV target.

The live speed readout measures displacement per tick converted to blocks/s,
before horizontal drag; carried velocity after drag is not actual travel speed.
Repeated sprint-jumping has a varying instantaneous speed, so compare its
**average** speed to the value below. Last jump apex and airtime are measured
from completed jumps.

Hidden/unfocused sessions pause. Frames longer than 0.25 s are capped to avoid
runaway catch-up. The 512 m floor follows in 32 m increments with its edges
beyond the fog. The mipmapped, anisotropically filtered grid stays world-aligned.

## Verified measurements

Measured on 2026-11-12 with the same `MovementController` imported by the browser.
Each sample has 12 s of warm-up followed by 60 s of straight-input movement.
The sprint-jump sample covers 100 consecutive settled jump cycles.

| Measurement | Result |
| --- | --- |
| Walking | 4.317181 blocks/s |
| Sprinting | 5.612335 blocks/s |
| Repeated sprint-jumping, average | 7.126765 blocks/s |
| Jump peak, feet above floor | 1.252203 blocks |
| Landing | Tick 12 / 0.600 s |
| Sprint takeoff impulse | 0.20 blocks/tick, once per takeoff |

Results match at 5, 15, 30, 60, 120, 144, and 240 rendering FPS, plus uneven frame
intervals. Tests also cover exact takeoff/landing order, carried momentum,
diagonal adjustment, cooldown, held jumps, both sprint triggers, the seven-tick
boundary, auto-repeat, focus-reset behavior, FOV easing without jump pulses,
and smooth position interpolation between ticks.

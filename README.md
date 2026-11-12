# Block By Block - editable voxel milestone 003

A local JavaScript / Three.js / Vite first-person block test.

## Run

- `npm run dev` starts development with live reload.
- `npm test` checks controller measurements, voxel editing, meshes, culling, and collision.
- `npm run build` creates the production site in `dist/`.
- `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort` serves the build.

## GitHub and VS Code

This project is connected to https://github.com/danieltgerold/Daniel-Block-By-Block
on the `main` branch. In VS Code, use Source Control to stage changes, enter a
commit message, and commit. Workspace settings automatically push after a
VS Code commit and fetch remote updates in the background. Saving a file by
itself does not commit or upload it. GitHub authentication is managed by Git
Credential Manager. Generated `dist/`, dependencies, and temporary tools are
ignored; source files and the package lock are tracked.

## Controls

- Click **Click to play** to capture the mouse. Move the mouse to look around.
- WASD moves relative to horizontal camera direction.
- W + **Left Shift**, or two actual W presses within **7 physics ticks (0.35 s)**,
  starts sprinting. Keyboard auto-repeat does not count.
- Release Shift while holding W to keep sprinting, including in the air and after
  landing. Releasing forward input, or canceling it with S, stops sprinting.
- Hold Space to jump repeatedly whenever grounded and the cooldown permits.
- F5 cycles first-person, third-person rear, and third-person front views.
  Held-key repeats do not cycle again; F5's normal page reload is suppressed.
- Default reach is **4.5 blocks** at size 1; `/reach` changes it. The outline marks the target.
- **Left click / hold** mines the targeted block and swings the bare hand.
  Holding repeats the swing and mining once every six ticks (0.30 s).
- **Right click** places a block against the targeted face. Placement inside the
  player's physical or interpolated body is rejected. The context menu is suppressed.
- Esc releases the mouse. Unlocking, switching windows, or hiding the tab clears
  held inputs, sprint, and double-tap history. Click again to resume.

## Chat, names, and player settings

Press **T** while playing for an empty chat field or **/** for a command field
prefilled with one slash. **Enter** sends and closes; **Escape** discards the
draft without opening the pause menu. Movement and game shortcuts are blocked
while typing. Closing chat requests mouse capture again; if the browser denies
that request, use **Click to resume mouse look** or click the world.

Recent messages remain visible above the input after chat closes. Player text
and names are inserted as literal text. The sender name has its own color.
Command replies use the reserved `server` sender and are private to the caller.

`/help` and Tab completion use the same command registry. Tab completes prefixes
such as `/rea`, suggests `default` for arguments, and cycles ambiguous matches
such as `/s`. Enter submits the completed command.

| Command | Size-1 meaning | Normal range | Default |
| --- | --- | --- | --- |
| `/speed <number>` | Walking blocks/s | 0-255 | 4.3171806167 |
| `/reach <number>` | Eye-to-hit blocks | 0-255 | 4.5 |
| `/jump <number>` | Apex above takeoff, blocks | 0-255 | 1.252203352512 |
| `/size <number>` | Player size multiplier | 0.1-4 | 1 |

All accept decimals and `default`; each reset changes only its own setting.
Values are stored independently. Effective speed, reach and jump height are
their size-1 values times size. Thus speed 6 at size 2 is 12 blocks/s; sprint
retains its 1.3 multiplier. Zero speed, reach and jump height are supported.
Jump launch is tuned against the discrete tick apex; launch velocity and
gravity scale together with size, preserving proportional flight time.

Enter `Up Up Down Down Left Right Left Right B A Enter` within 60 seconds to
enable developer mode for this load. Auto-repeat is ignored; a wrong key or
timeout resets the sequence. The final Enter is consumed, even in text fields.
The server chat announces entry. Developer mode removes all four normal range
limits, while requiring finite nonnegative speed/reach/jump and finite positive
size. Effective overflow and resizing into terrain are still rejected. This
mode is not saved and starts disabled on a fresh load.

The existing Escape screen has a **Player name** field and **Save name** button.
The default is `player 1`. Accepted names are trimmed and saved in local storage;
blank names and all capitalizations of `server` are rejected beside the field.
Names allow at most 16 ASCII letters, numbers and spaces, after trimming.
Invalid changes retain the last valid name. Player identity is a separate stable
local ID, independent of display name. The reusable player directory checks join
and rename uniqueness without case sensitivity and allocates the first free
`player N` default for future multiplayer. An actual server will own that
registry and authenticate IDs; the current game remains single-player.

All messages go through one delivery path. Public outgoing messages have an
optional future broadcast hook; incoming messages are not rebroadcast. Private
command replies are filtered by recipient identity and never use that hook.

Keyboard/form checks run in an isolated Happy DOM document and real controller
tests, without controlling the user's desktop or browser. Native pointer-lock
permission behavior still depends on the browser and is handled with a resume
button when recapture is denied.

## Blocks and collision

Every block is **1 m x 1 m x 1 m**. The ground contains exactly **three layers**:
voxel y=-1, -2, and -3, with the initial walking surface at y=0. The world extends
horizontally as you travel; only edits are stored. Edits remain while traveling
away and back, but are currently session-only and reset on page reload.

At size s, the axis-aligned hitbox extends 0.3*s blocks to each side in X/Z and
1.8*s blocks above the feet. The eye is 1.6*s above the feet in every F5 mode.
The world model scales uniformly about the feet. Growth is rejected if the new
box intersects a solid voxel. Placement checks use the same scaled body.
Swept collision against the actual unit blocks handles walls, floors, ceilings,
placed blocks, and holes. Digging all three layers opens the void; there is no
invisible floor below them. Falling below y=-32 respawns you at a supported
column near the original spawn, with movement inputs cleared.

The feet readout shows world Y. Jump peak is measured relative to the takeoff
surface, so jumping on a placed block still measures approximately 1.25 m.

## Rendering and distance detail

The visual rig uses classic Steve model coordinates scaled by `0.9375 / 16`,
with a feet-rooted Y-up group and independent neck, shoulder and hip joints.
Its standing height is **1.875 blocks**, independent of the **1.8-block physics
hitbox at size 1**. Original green/yellow/red/magenta/blue/cyan part colors are preserved;
an original simple face marks the head's forward direction (-Z, with +X right).

Each 20 Hz tick measures actual horizontal displacement after collision. Amount
eases 40% toward `min(4 * hypot(dx, dz), 1)` and phase advances by amount.
Rendered phase and amount interpolate between ticks. With
`s = cos(phase * 0.6662) * amount`, arm rotations are `s` and `-s`; opposite legs
are `1.4*s` and `-1.4*s`. Pushing against a wall therefore eases the limbs to rest.

Aim and torso yaw are separate. Travel beyond 0.05 blocks/tick steers torso yaw
30% toward travel direction, flipped when more than 95 degrees from aim.
Actions steer toward aim; otherwise idle torso yaw holds. The head stays within
50 degrees, shifting the torso only as needed. Yaw interpolation wraps across
180 degrees. From rest, aim 35 leaves torso 0; aim 70 gives torso 20/head 50.

First-person hides the head and world right arm, retaining the depth-tested body.
A small backward visual-only offset keeps the chest from covering both feet.
The one visible right arm renders in a separate camera-space scene after the
world with a depth clear and its own 70-degree vertical FOV. Six-tick action
swings use the requested square-root sine curves, independently of walking,
for mining (repeated while held) and successful placement.

Eye height is **1.6 times size**. Third-person rear/front start 4 blocks opposite/
along the full aim vector. Front rendering adds 180 degrees yaw and negates
pitch without changing aim or movement. A swept camera box with 0.1-block
half-extents pulls in immediately against solid voxels, including corners,
floors and ceilings, and restores 4 blocks when clear. Editing always uses the
player's scaled eye and aim with the configured effective reach, independently of camera mode.

- Terrain is divided into **16 x 16 block chunks**.
- Only exposed block faces are meshed. Adjacent coplanar faces are greedily merged;
  an untouched chunk needs just a top quad and a bottom quad.
- Camera-frustum culling skips chunks outside the view. GPU back-face culling
  also discards faces pointing away from the camera.
- Near chunks use exact **1 m** voxel detail; middle and distant chunks use **2 m**
  and **4 m** horizontal samples at approximately **48 m** and **96 m**.
  Majority coverage removes small distant details. Vertical layers remain 1 m
  thick, so the untouched ground stays 3 m deep at every level.
- LOD thresholds use hysteresis to avoid repeated swaps along the boundary.
  All editing and collision use exact blocks, independently of rendering LOD.
- Chunks beyond the 160 m view distance are skipped. Distant loaded geometry is
  disposed; block edits remain stored. Fog hides the distance boundary.
- Mesh creation is budgeted across frames, prioritizing nearby chunks. Local edits
  rebuild affected chunks and neighbors, including faces across chunk boundaries.
- The existing mipmapped, anisotropically filtered grid texture is applied to
  exposed block faces. Chunk-local vertices keep coordinates small and precise.

## Movement preserved

Physics runs at **20 ticks/s**, with interpolated rendered position and FOV.
Horizontal velocity stays in world coordinates, so camera turns affect only new
acceleration and sprint takeoff impulses. The original 75-degree vertical FOV
moves toward 1.15 times the base while sprinting, halfway per physics tick.
Jump boosts do not change that target.

Each tick snapshots the grounded state, applies eligible jump velocity 0.42 and
one yaw-only sprint boost of 0.20, then adds movement acceleration. Ground
walking/sprinting acceleration is 0.098/0.1274; air values are 0.0196/0.02548.
Diagonals are normalized with the 1/0.98 adjustment. Collision resolves motion,
then horizontal drag is 0.546 for ticks that started grounded or 0.91 for ticks
that started airborne. Vertical update is vy = (vy - 0.08) * 0.98. Held jump uses
a 10-tick cooldown, reset on jump release. Hidden/unfocused sessions pause;
frames over 0.25 s are capped to prevent runaway catch-up.

The live speed readout uses actual displacement before drag, converted to m/s.
Sprint-jump speed varies during each jump; compare its average to the value below.

## Verification

The browser and tests use the same voxel world, mesher, renderer, and controller.
Movement samples run on voxel collision, with 12 s of warm-up followed by 60 s
of straight movement (100 settled sprint-jump cycles).

| Measurement | Result |
| --- | --- |
| Walking | 4.317181 blocks/s |
| Sprinting | 5.612335 blocks/s |
| Repeated sprint-jumping, average | 7.126765 blocks/s |
| Jump peak above takeoff surface | 1.252203 blocks |
| Flat-ground landing | Tick 12 / 0.600 s |

These match at 5, 15, 30, 60, 120, 144, and 240 rendering FPS, plus uneven frame
intervals. Tests cover unit cube dimensions and triangle winding, three-layer
terrain, successive digging and face targeting, placement safety, walls,
ceilings, falling and jumping on placed blocks, hidden-face removal, distance
LOD polygon reduction, camera-frustum culling, boundary rebuilds, and geometry
disposal. Browser-based visual QA depends on availability of the browser host.

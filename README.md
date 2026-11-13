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
- W + **R**, or two actual W presses within **7 physics ticks (0.35 s)**,
  starts sprinting. Keyboard auto-repeat does not count.
- Release R while holding W to keep sprinting, including in the air and after
  landing. Releasing forward input, or canceling it with S, stops sprinting.
- Hold Space to jump repeatedly whenever grounded and the cooldown permits.
- In Creative, two distinct **Space** presses within seven game ticks toggle
  flight. Space rises, Left Shift descends, and releasing both eases to hover.
  WASD follows yaw only; R or double-W sprints faster. Landing or switching to
  Survival ends flight and restores normal gravity. Shift crouches again after
  flight ends. Chat, inventory, menus and focus loss clear held inputs and tap
  history; pausing a flight keeps it active but clears its movement momentum.
- Hold **Left Shift** to crouch and avoid walking off ledges. Release to stand
  when there is enough headroom. An existing sprint can carry into crouching;
  starting a new sprint requires standing.
- F5 cycles first-person, third-person rear, and third-person front views.
  Held-key repeats do not cycle again; F5's normal page reload is suppressed.
- Switching to Survival sets reach to **4.5 blocks** at size 1; switching to
  Creative sets it to **5 blocks**. `/reach` changes it, and its `default` reset
  follows the current mode. Reach continues to scale with `/size`.
- **Left click / hold** mines the targeted block and swings the bare hand.
  A swing lasts six ticks (0.30 s); continued mining may restart it at tick three.
- **Right click** queues a press for the next 20 Hz physics tick. Each queued
  press attempts placement even during cooldown. Each attempt, successful or
  not, resets the four-tick repeat delay; a hold repeats every 0.20 seconds.
  Every attempt uses fresh eye targeting, current reach and the selected
  main-hand stack. Only empty destinations outside the collision box succeed.
  Success consumes one selected block and requests one swing; failure consumes none.
  Close-up placement is allowed with no minimum eye distance. All six entered
  faces work, and cubes may touch the scaled hitbox but must not overlap it.
  The offhand is display/storage only. Active mining prevents placement. Loaded
  edited chunks and their neighbors rebuild immediately, including boundaries.
  Releasing the button, opening chat or menus, losing focus or releasing mouse
  capture cancels the hold and requires a new press. Browser context menus are
  suppressed while playing.
- **E** opens/closes inventory; Escape closes it. **1-9** or the mouse wheel
  selects a hotbar slot, **F** swaps the selected stack and offhand, and **Q**
  drops one item (**Ctrl+Q** drops the selected stack). Middle click picks a
  matching hotbar stack. Survival can swap a matching main-inventory stack in;
  Creative creates one targeted block in an empty hotbar slot, or replaces the
  selected slot while saving the displaced stack to inventory/dropping overflow.
  No target within reach means no change, in any F5 view.
- The first-person crosshair is a crisp translucent 15x15 GUI-pixel plus with
  difference blending. It hides in third person and while chat, inventory or
  menus have focus; eye-based targeting continues in all camera views.
- Esc releases the mouse. Unlocking, switching windows, or hiding the tab clears
  held inputs, sprint, and double-tap history. Click again to resume.
- **F3 + B** toggles depth-tested collision outlines, including the local player
  in either third-person view. Keyboard repeats are ignored.
- The Escape menu has independent **Show Coordinates** and **Show FPS** toggles,
  both on by default and saved locally. The top-left display uses feet X/Y/Z,
  rounded to whole blocks without changing physics precision. Positive X is
  east, Y is up, and Z is south; the world origin stays fixed. Half values round
  away from zero, and negative zero displays as zero. FPS averages rendered
  frame intervals and updates twice per second.

## Chat, names, and player settings

Press **T** while playing for an empty chat field or **/** for a command field
prefilled with one slash. **Enter** sends and closes; **Escape** discards the
draft without opening the pause menu. Movement and game shortcuts are blocked
while typing. Closing chat requests mouse capture again; if the browser denies
that request, use **Click to resume mouse look** or click the world.

Recent messages stay visible for ten seconds after the latest message, then
fade over one second. Opening chat or receiving a message brings them back.
Player text
and names are inserted as literal text. The sender name has its own color.
Command replies use the reserved `server` sender and are private to the caller.

`/help` and Tab completion use the same command registry. Tab completes prefixes
such as `/rea`, suggests `default` for arguments, and cycles ambiguous matches
such as `/s`. Enter submits the completed command.

| Command | Size-1 meaning | Normal range | Default |
| --- | --- | --- | --- |
| `/speed <number>` | Walking blocks/s | 0-255 | 4.3171806167 |
| `/reach <number>` | Eye-to-hit blocks | 0-255 | 4.5 Survival / 5 Creative |
| `/jump <number>` | Apex above takeoff, blocks | 0-255 | 1.252203352512 |
| `/size <number>` | Player size multiplier | 0.1-4 | 1 |

All accept decimals and `default`; each reset changes only its own setting.
`/default` resets all four settings together, subject to the same resize checks.
`/help` is one compact multiline server reply, with range details kept in errors.
`/tp <x> <y> <z>` teleports the feet to exact finite coordinates, including air
or inside blocks. Commas also work, for example `/tp 10, 64, -20`. Each axis may
use `~` for its current coordinate or `~offset`, for example `/tp ~ ~1 ~-2`.
All relative values resolve against one position snapshot. Tab suggests
`~ ~ ~` for the coordinates. Negative and decimal values are accepted.
Teleporting clears velocity, held inputs and
interpolation, and immediately refreshes the camera, hitbox and nearby chunks.
Aim and player settings are preserved. `/tp` also appears in help and autocomplete.

`/gamemode survival` or `/gamemode creative` changes the mode for the current
session, with argument autocomplete and a server confirmation. New loads start
in Survival. Survival consumes one selected block per successful placement
and breaking creates a collectible drop. Creative preserves the selected stack
and breaking creates no drop, but an empty main hand still cannot place. Mode
changes preserve inventory and terrain, movement and breaking timing. They do
not add health or hunger. Creative flight uses the controls described above.

Flight uses the same interpolated 20 Hz controller and swept scaled hitbox.
At size one its separate ability acceleration is 0.05 (0.10 while sprinting),
with the existing 0.98 input shaping and 0.91 horizontal retention. Settled
straight speeds are 10.888889 and 21.777778 blocks/s. Vertical input adds
0.15 blocks/tick per tick, followed by 0.60 retention without gravity. Both
accelerations scale with size; `/speed` retains its walking-speed meaning.
The camera smoothly combines the 1.1 flying multiplier with sprint FOV.

## Inventory and collectible items

Registered blocks stack to 64 and have cached, static three-face isometric icons
shared across inventory, hotbar and cursor slots. World, held and dropped blocks
use the corresponding block's face textures. Test Block retains its original
palette and filtered fine grid. Third-person blocks use Java's ordered hand/block-model
transforms, converted with the rig's X/Y-flipped basis and a single 0.9375
render scale. Their side length is 0.3515625 blocks at size one; both attachments
follow the animated shoulders. Held arms halve their base walk pitch and add
the Java hold pose before crouch/action offsets. First-person item transforms
remain on their separate path. Inventory starts
empty for the session; `/give <item> [quantity]` defaults to one, fills
partial storage stacks before empty slots, and drops all overflow near the
player. Quantities use exact integers, including totals larger than JavaScript's
safe Number range. Tab completes the item ID and leaves a space for quantity.

There are 27 main slots, nine shared HUD/inventory hotbar slots, four typed
armor slots and one offhand slot. These blocks cannot enter armor slots. The
reserved 2x2 crafting grid/output is visibly inactive. Item definitions and
armor slot rules support future items. The separate preview uses the actual
colored rig and equipment at size one; its limited mouse-follow pose never
changes player aim. Offhand contents display in world and first-person views.

Left click picks up, merges or swaps full stacks; right click takes the rounded-up
half or places one. With a held cursor stack, left drag shares equal whole-number
amounts across eligible distinct slots, right drag places one per slot, and both
show previews. Shift-click transfers between main inventory and hotbar, partial
stacks first. Double click collects matching stacks up to 64; shift-double-click
transfers matching source-area stacks. Hover plus 1-9 or F swaps with that hotbar
slot or offhand. Hover plus Q/Ctrl+Q drops one/all. Left/right clicking outside
the panel drops all/one cursor items. Closing returns cursor items to storage
and drops any remainder. Inventory blocks all gameplay input and releases the
mouse, but the 20 Hz world simulation keeps running, including gravity, drops,
pickup, merging and despawn. Closing uses the same capture/resume flow as chat.
The Escape pause menu and lost-focus state still pause simulation.
Static inventory labels/instructions have been removed. Hovering a stack shows
its item name immediately in an in-game tooltip; stack counts remain visible.
The top gameplay-controls hint and movement-test milestone banner are removed.

Breaking blocks in Survival makes collectible cube items with gravity and voxel
collision. Piles show 1 cube for one item, 2 for 2–16, 3 for 17–32, 4 for 33–48,
and 5 for 49 or more. Extra cubes have stable offsets and shared geometry/materials.
Only the visual group bobs by `sin(ageTicks/10 + phase)*0.1 + 0.1` above a fixed
height offset and rotates by `ageTicks/20 + phase`; physics bounds never bob.
Touching picks up as much as storage can hold. Nearby
compatible drops with exactly the same item ID merge within two blocks; smaller sources visually travel into
the live larger pile over 0.25 seconds. Quantities transfer once immediately;
the effect is visual-only, follows subsequent merges and ends on pickup/expiry.
A visible pile may exceed 64, while
inventory stacks stay capped. Each merged lot retains its original five-minute
active-game-time expiry. Thrown items start at the player's X/Z and 0.3 blocks
below the eye, with 0.3 blocks/tick along the full aim, +0.1 upward velocity and
up to 0.02 horizontal spread. They use 0.04 gravity, 0.98 air drag, a small
landing bounce and a 40-tick (two-second) pickup delay. Drops,
inventory and block edits currently reset together on page reload.
Values are stored independently. Effective speed, reach and jump height are
their size-1 values times size. Thus speed 6 at size 2 is 12 blocks/s; sprint
retains its 1.3 multiplier. Zero speed, reach and jump height are supported.
Jump launch is tuned against the discrete tick apex; launch velocity and
gravity scale together with size, preserving proportional flight time.

Use `/devmode`, or enter `Up Up Down Down Left Right Left Right B A Enter`
within 60 seconds, to enable developer mode for this load. The sequence uses
physical B/A key codes when available, tolerates Shift/modifier key presses,
and consumes matched keys outside text fields so they do not move the player
or navigate the page. Auto-repeat is ignored; a wrong key or
timeout resets the sequence. The final Enter is consumed, even in text fields.
The server chat announces entry. Developer mode removes all four normal range
limits, while requiring finite nonnegative speed/reach/jump and finite positive
size. Effective overflow and resizing into terrain are still rejected. This
mode is not saved and starts disabled on a fresh load.

The existing Escape screen has a **Player name** field and **Save name** button.
The default is `player1`. Accepted names are saved in local storage;
blank names and all capitalizations of `server` are rejected beside the field.
Names allow at most 16 ASCII letters and numbers. All whitespace, including
leading/trailing spaces, is invalid. Legacy saved names remove whitespace on
load while keeping the same stable identity, with invalid names using a default.
Invalid changes retain the last valid name. Player identity is a separate stable
local ID, independent of display name. The reusable player directory checks join
and rename uniqueness without case sensitivity and allocates the first free
`playerN` default for future multiplayer. An actual server will own that
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
1.8*s blocks above the feet when standing, or 1.5*s when crouching. The eye
targets 1.62*s standing or 1.27*s crouching in every F5 mode, easing halfway
each tick with render interpolation. Crouching scales movement input by 0.30.
While Shift is held, a 0.60*s downward footprint probe protects ledges by
reducing horizontal motion in 0.05*s steps; upward jumps skip this check.
Grounded contact uses that same full footprint with a contact-thin probe at
the actual feet height. Overhanging players can stop and stand without a
horizontal shift. The edge guard subdivides movement at edited voxel-face
crossings to detect unsupported intervals along the path, including narrow
gaps at fractional sizes. Blocked edge motion clears its horizontal momentum;
vertical movement and gravity still determine actual floor contact.
The world model scales uniformly about the feet. Growth is rejected if the new
box intersects a solid voxel. Placement checks use the same scaled body.
Swept collision against the actual unit blocks handles walls, floors, ceilings,
placed blocks, and holes. Digging all three layers opens the void; there is no
invisible floor below them. Falling across y=-32 respawns you at a supported
column near the original spawn, with movement inputs cleared.
An explicit teleport below that boundary stays at the requested destination.

Jump peak is measured internally relative to the takeoff surface. The former
Live Telemetry panel and block-unit label have been removed from the game UI.

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

First-person always hides the entire world avatar; the body toggle and its
saved setting have been removed.
The rig stays rooted at the feet without a first-person position offset.
The one visible right arm renders in a separate camera-space scene after the
world with a depth clear and its own 70-degree vertical FOV. Six-tick action
swings use the requested square-root sine curves, independently of walking,
for mining (repeated while held) and successful placement.
There is no idle sway or walk bob in that separate hand pass. Third-person
actions layer chest and shoulder rotation onto the walk/crouch pose without
accumulating transforms. Four-pixel legs use hip centers at +/-2 model pixels
and rotate only around local X, preserving their seam.

Third-person rear/front start **4 times size** blocks opposite/
along the full aim vector. Front rendering adds 180 degrees yaw and negates
pitch without changing aim or movement. A swept camera box with 0.1*size-block
half-extents pulls in immediately against solid voxels, including corners,
floors and ceilings, and restores the full scaled distance when clear. Editing always uses the
player's scaled eye and aim with the configured effective reach, independently of camera mode.

- Terrain is divided into **16 x 16 block chunks**.
- Dropped entities use a reusable `EntityVisibility` policy with authored sphere
  bounds and per-type detail settings. Bounds cover the complete animated
  cluster without rebuilding model bounds each frame. The active game camera,
  including its F5 offset and current FOV, drives frustum culling and distance.
  Piles use their normal cluster within 24 blocks and one cube farther away,
  with a 0.5-block hysteresis buffer. Existing cube nodes, geometry and materials
  are reused. Hidden and simplified piles still simulate, merge, pick up and
  despawn normally; merge effects track the live destination even offscreen.
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

Internal measurements use actual displacement before drag. Sprint-jump speed
varies during each jump; the value below averages consecutive jumps.

## Block definitions and basic blocks

Commands provide Test Block (`test.block`), Stone (`stone`), Cobblestone
(`cobblestone`), Dirt (`dirt`), Grass Block (`grass.block`), Sand (`sand`),
Gravel (`gravel`), Oak Log (`oak.log`), and Oak Planks (`oak.planks`).
For example, `/give grass.block 64`; Tab completes all registered item IDs.
There is no creative inventory, crafting, tool requirement, log rotation, or
falling Sand/Gravel behavior yet.

Definitions share cube collision/placement/breaking code and specify names, IDs,
face textures, stack sizes, solidity, opacity, collision shape, breaking time,
optional behavior hooks and recipe tags. All current breaking times remain zero.
Wood tags allow future recipes to accept a group or an exact block ID.
Sparse world edits retain the actual block ID; old boolean edits map to Test
Block and untouched ground remains unchanged. `loadEdits` accepts both formats.
Survival breaks drop the actual block item; Creative pick-block provides that
actual type, while Survival still requires an existing matching stack.

The eight new blocks use original, low-noise 16x16 pixel face artwork with
nearest magnification and shared mipmaps. Test Block deliberately keeps its
legacy 128-pixel fine-grid sampler to preserve its appearance. Cached SVG icons
project the same pixel artwork onto three shaded cube faces; no slot needs a
live renderer. Grass has distinct top/side/bottom faces and logs have bark/end
faces. Held blocks, drop clusters, merge ghosts and particles use their own
block's appearance. Different item IDs never merge.

Greedy meshes merge only compatible face textures, hide contacting opaque faces,
and repeat the tile once per world block, including at distant LODs. Side UVs
keep grass edges at the top and bark vertical. Chunk material groups reuse face
materials and rebuild on identity changes, including grass behavior changes.

Covering Grass with a solid opaque block changes it to Dirt immediately. Area
refresh also checks covered grass. Every second of active 20 Hz simulation,
each uncovered Grass Block chooses a random neighbor within one block on each
axis; uncovered Dirt there becomes Grass. Newly spread grass waits until the
next round. Uncovering Dirt does not instantly restore Grass. Inventory keeps
this timer running, while the Escape menu pauses it.

## Pickup and block particles

Opening and closing inventory releases gameplay inputs while preserving carried
velocity and interpolation. Air drag, gravity and collision keep running, just
as when movement keys are released. The Escape pause menu retains its existing
motion reset.

Successful gameplay Q/Ctrl+Q drops request the same six-tick main-hand swing as
block actions. Empty slots, key repeats and inventory-interface drops do not.
The first-person block follows that swing; a stack-count change keeps it equipped.
Changing to an empty hand lowers the old item, switches below 0.1 equip height,
then raises the hand, at up to 0.4 equip height per physics tick with interpolation.
Third-person drops use the existing animated shoulder attachment. A newly thrown
item merged immediately into another pile retains a short cosmetic launch before
converging; ownership, pickup delay and lifetime remain authoritative and unchanged.

Dropped-item pickup tests the current scaled, crouch-aware collision box expanded
by a fixed one block on each X/Z side and half a block above and below. Item-box
overlap is sufficient, including through walls; delays, partial pickup, capacity,
and each quantity's expiry remain unchanged.

Block definitions designate a shared particle texture and optional tint. Sprint,
landing, and instant-break effects use the actual supporting or broken block.
Normal break bursts sample all 64 cell centers; landing bursts use accumulated
downward travel before the final landing tick. A separate small mining-hit API
is reserved for future progressive mining, without adding a delay today.

Particles run at 20 Hz with interpolated, camera-facing quarter-texture crops,
nearest filtering, collision and Java-style motion/lifetimes. A reusable pool
caps active particles at 1,024; shared instanced batches render each texture.
Frustum/distance culling and nearby-visible prioritization limit cosmetic work.

Smoothed frame timing, independent of the FPS HUD, selects normal, half-density,
or quarter-density effects with sustained thresholds and gradual recovery.
Inactive-tab time is excluded, and the quality policy accepts a known frame cap.
Reduced quality simplifies bounded merge visuals; low quality skips them.
These settings never affect authoritative items, movement or inventory. Inventory
continues simulation, while the Escape menu retains its existing pause behavior.

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

Focused automated checks also cover both scaled F5 cameras, size-two wall
collision, leg separation, forward action swings, neutral hand rest, crouch
speed (1.295154 blocks/s at size one), low-ceiling standing rejection, diagonal
ledge overhang at sizes one and two, chat fading and revival, compact help,
the four-setting reset, and F3+B collision bounds. HUD checks cover independent
saved toggles, coordinate rounding around zero, stable FPS samples, teleport
formats and errors, exact positions and reset motion, plus destination cameras,
collision outlines and chunk loading. These
checks run without taking control of the user's computer; visual playtesting
remains with the user.

# Replay fixtures

Run `npm run golden` to record reference traces from the JavaScript rules.
CSV numeric values round-trip IEEE doubles, including signed zero. Compare raw
bits, not rounded decimals. Each input row represents one 50 ms movement tick.

`movement/` and `raycast/` retain the historical three-layer regression suites.
Their explicit world and movement spawn are recorded in `legacy-fixture.json`.
They intentionally use a surface at y=0, independently of the game's default
terrain. The existing Java raycast parity test consumes this historical suite.

`current/movement/` records the current four-layer terrain at y=0..3, with players
starting on the surface at y=4. Each scenario has a versioned `fixture.json`
describing world configuration, initial position, typed edits and tick count.
Other player fields start with `createPlayer()` defaults. `inputs.csv` includes
flight, crouch and sprint permissions; `expected.csv` includes the corresponding
state and fall-distance fields. Boolean CSV fields are 0 or 1.

These scenarios exercise walking, sprint-jumping, crouching, flight transitions,
sprint permissions and movement in static water. They call `stepPlayer` only:
fluid propagation, world ticks, food and vitals do not run. Those need separate
replay contracts. The current suites are recorded JS reference targets; Java and
TeaVM replay for them is pending. A green historical Java test does not establish
parity for the newer features.

`trig/` is produced separately by `./gradlew :core:writeTrigGolden`.

`shapes/` isolates block geometry from world mutation. Cases describe the block
definition, geometry state, query kind, resolved fence connection mask, and
translation. Coordinate rows identify each case and its ordered box index;
zero-box cases still appear in the case table. Masks use north/east/south/west
bits 0..3, with -1 for the no-world item shape. This contract consumes resolved
stair shapes and fence connections; neighbor discovery and stair recomputation
belong to the later world integration stage.
`./gradlew :core:test` replays all 404 shape cases and compares the 964 ordered
boxes by raw double bits. This proves JVM geometry parity; TeaVM and world-query
integration remain pending.

When rules change, investigate mismatches before replacing reference values.
Never use a changed default terrain configuration to silently redefine a fixture.

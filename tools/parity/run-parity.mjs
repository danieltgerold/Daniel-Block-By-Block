// Same replay in Node and browsers: hosts supply only the text loader and core.
const OLD_INPUT = 'forward,right,jump,sprint,yaw,walkSpeedScale,jumpVelocity,size';
const INPUT = OLD_INPUT + ',crouch,canFly,toggleFlight,canSprint';
const OLD_STATE = 'x,y,z,vx,vy,vz,fovMultiplier,speed,grounded,sprinting,jumpCount,jumpCooldown';
const STATE = OLD_STATE + ',size,crouching,eyeOffset,flying,inWater,fallDistance,landingFallDistance,damageFallDistance,landingDamageDistance';
const EDIT = 'x,y,z,id,type,facing,half,stairShape,hinge,open,level,falling';
const SHAPE = 'case,category,id,kind,mask,x,y,z,type,facing,half,stairShape,hinge,open,boxCount,fullCube,opaque,solid,shape,definitionOpaque';
const CURRENT = ['crouch', 'crouch-ledge', 'falling-water', 'flight', 'flowing-water',
  'sprint-jump', 'sprint-permission', 'step-slab', 'walk', 'water'];
const LEGACY = [['walk', 1440], ['sprint', 1440], ['sprint-jump', 1440],
  ['obstacle-course', 3000], ['far-flight', 620]];
const CURRENT_EDITS = { water: 2, 'flowing-water': 2, 'falling-water': 8,
  'step-slab': 1, 'crouch-ledge': 56 };
const CONFIG = 'baseY,layers,x,y,z,ticks';
const BOX = 'case,index,minX,minY,minZ,maxX,maxY,maxZ';
const buffer = new ArrayBuffer(8);
const doubles = new Float64Array(buffer), integers = new BigUint64Array(buffer);

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function number(value) {
  requireValue(typeof value === 'string' && value.length > 0, 'Missing numeric value');
  requireValue(/^(?:-?(?:Infinity|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)|NaN)$/i.test(value), `Invalid number: ${value}`);
  const result = Number(value);
  requireValue(!Number.isNaN(result) || value === 'NaN', `Invalid number: ${value}`);
  return result;
}
function flag(value) {
  requireValue(value === '0' || value === '1', `Invalid boolean: ${value}`);
  return value === '1';
}
function bits(value) { doubles[0] = value; return integers[0]; }
function fromBits(hex) {
  requireValue(/^[0-9a-f]{16}$/.test(hex), `Invalid double bits: ${hex}`);
  integers[0] = BigInt('0x' + hex); return doubles[0];
}

async function table(read, path, header, count, allowEmpty = false) {
  const text = await read(path);
  requireValue(typeof text === 'string' && text.length <= 20_000_000, `${path}: invalid text`);
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  requireValue(lines.shift() === header, `${path}: header mismatch`);
  requireValue((allowEmpty || lines.length > 0) && lines.length <= 100_000, `${path}: empty or oversized rows`);
  if (count !== undefined) requireValue(lines.length === count, `${path}: rowCount expected ${count}, got ${lines.length}`);
  const width = header.split(',').length;
  // File size and row count are checked before this finite parse.
  return lines.map((line, index) => {
    const row = line.split(',');
    requireValue(row.length === width, `${path}: row ${index + 2} width mismatch`);
    return row;
  });
}

function compare(context, expected, actual, location) {
  requireValue(typeof actual === 'number', `${location.suite}: nonnumeric core result`);
  context.checked++;
  if (!(Number.isNaN(expected) && Number.isNaN(actual)) && bits(expected) !== bits(actual)) {
    context.mismatchCount++;
    // Bound failure diagnostics while still checking every recorded value.
    if (context.mismatches.length < 100) context.mismatches.push({ ...location, expected, actual });
  }
}
function compareValues(context, expected, actual, location, fields) {
  requireValue(actual.length === expected.length, `${location.suite}: core result width mismatch`);
  // Each result has at most 54 shape coordinates or 21 player fields.
  expected.forEach((value, field) => compare(context, number(value), actual[field],
    { ...location, field: fields?.[field] ?? field }));
}
function mutation(result) {
  requireValue(typeof result === 'boolean', 'Block mutation must return a checked boolean');
}
function typedEdit(core, row, registry) {
  requireValue(row.length === 12, 'Typed edit width');
  const coords = row.slice(0, 3).map(number);
  requireValue(coords.every(Number.isSafeInteger), 'Typed edit coordinates must be safe integers');
  requireValue(row[3] === '' || registry.has(row[3]), `Unknown fixture block: ${row[3]}`);
  const level = number(row[10]);
  requireValue(Number.isInteger(level) && level >= 0 && level <= 7, 'Invalid water level');
  mutation(core.setTypedBlock(...coords, ...row.slice(3, 9), flag(row[9]), level, flag(row[11])));
}
function movementInput(row, current) {
  const first = [number(row[0]), number(row[1]), flag(row[2]), flag(row[3]), number(row[4]),
    row[5] === '' ? NaN : number(row[5]), row[6] === '' ? NaN : number(row[6]), number(row[7])];
  return [...first, ...(current ? row.slice(8).map(flag) : [false, false, false, true])];
}

async function movement(context, core, read, name, current, ticks) {
  const path = current ? `current/movement/${name}` : `movement/${name}`;
  if (current) {
    const [config] = await table(read, `${path}/fixture.csv`, CONFIG, 1);
    requireValue(number(config[5]) === ticks, `${path}: configuration tick count`);
    core.resetWorld(number(config[0]), config[1]);
    core.setPosition(...config.slice(2, 5).map(number));
    const edits = await table(read, `${path}/edits.csv`, EDIT, CURRENT_EDITS[name] ?? 0, true);
    for (const edit of edits) typedEdit(core, edit, context.registry);
  } else {
    core.reset(3); core.setPosition(.5, 0, .5);
    const edits = await table(read, `${path}/edits.csv`, 'x,y,z,solid',
      name === 'obstacle-course' || name === 'far-flight' ? 29 : 0, true);
    for (const edit of edits) mutation(core.setBlock(...edit.slice(0, 3).map(number), flag(edit[3])));
  }
  const inputs = await table(read, `${path}/inputs.csv`, current ? INPUT : OLD_INPUT, ticks);
  const expected = await table(read, `${path}/expected.csv`, current ? STATE : OLD_STATE, ticks);
  const fields = (current ? STATE : OLD_STATE).split(',');
  // Scenario tick counts are independent of either file's length.
  for (let tick = 0; tick < ticks; tick++) {
    core.step(...movementInput(inputs[tick], current));
    const actual = core.stateView();
    requireValue(actual.length === 21, `${path}: expected 21-field state view`);
    compareValues(context, expected[tick], actual.subarray(0, fields.length),
      { suite: 'movement', scenario: current ? `current/${name}` : name, row: tick + 2 }, fields);
  }
}

async function raycast(context, core, read) {
  core.reset(3);
  const edits = await table(read, 'raycast/edits.csv', 'x,y,z,solid', 56);
  for (const edit of edits) mutation(core.setBlock(...edit.slice(0, 3).map(number), flag(edit[3])));
  const cases = await table(read, 'raycast/cases.csv', 'ox,oy,oz,dx,dy,dz,reach', 2014);
  const expected = await table(read, 'raycast/expected.csv', 'hit,x,y,z,nx,ny,nz,distance', 2014);
  for (let i = 0; i < cases.length; i++) compareValues(context, expected[i], core.raycast(...cases[i].map(number)),
    { suite: 'raycast', row: i + 2 });
}
async function trig(context, core, read) {
  const cases = await table(read, 'trig/cases.csv', 'x_bits,sin_bits,cos_bits', 5024);
  for (let i = 0; i < cases.length; i++) {
    const [x, sin, cos] = cases[i].map(fromBits);
    compare(context, sin, core.sin(x), { suite: 'trig', row: i + 2, field: 'sin' });
    compare(context, cos, core.cos(x), { suite: 'trig', row: i + 2, field: 'cos' });
  }
}

async function shapes(context, core, read, cases) {
  const boxes = await table(read, 'shapes/boxes.csv', BOX, 964);
  let cursor = 0;
  for (let i = 0; i < cases.length; i++) {
    const r = cases[i];
    requireValue(number(r[0]) === i, 'Shape case IDs must be sequential');
    const state = [...r.slice(8, 13), flag(r[13])];
    const actual = core.shape(r[2], r[3], number(r[4]), ...r.slice(5, 8).map(number), ...state);
    const count = number(r[14]);
    for (const field of [15, 16, 17, 19]) flag(r[field]);
    requireValue(Number.isInteger(count) && count >= 0 && count <= 9, 'Invalid shape box count');
    requireValue(actual.length === count * 6, `Shape ${i}: boxCount mismatch`);
    compareValues(context, [r[17], r[19], r[15], r[16]], core.shapeFlags(r[2], ...state),
      { suite: 'shapes', row: i + 2 }, ['solid', 'definitionOpaque', 'fullCube', 'opaque']);
    for (let index = 0; index < count; index++) {
      const box = boxes[cursor++];
      requireValue(box && number(box[0]) === i && number(box[1]) === index, 'Missing, orphan or unordered shape box');
      compareValues(context, box.slice(2), actual.subarray(index * 6, index * 6 + 6),
        { suite: 'shapes', row: i + 2, box: index });
    }
  }
  requireValue(cursor === boxes.length, 'Orphan shape coordinate rows');
}

async function world(context, core, read) {
  const configs = await table(read, 'world/worlds.csv', 'world,baseY,layers', 3);
  const edits = await table(read, 'world/edits.csv', 'world,' + EDIT, 18);
  const queries = await table(read, 'world/queries.csv', 'case,world,op,a0,a1,a2,a3,a4,a5,a6,a7,a8,a9,a10', 312);
  const expected = await table(read, 'world/expected.csv', 'case,count,v0,v1,v2,v3,v4,v5,v6,v7,v8,v9,v10', 312);
  const known = new Set(configs.map(row => row[0]));
  requireValue(known.size === configs.length, 'Duplicate world configurations');
  requireValue(edits.every(row => known.has(row[0])) && queries.every(row => known.has(row[1])), 'Unknown fixture world');
  for (const [id, baseY, layers] of configs) {
    core.resetWorld(number(baseY), layers);
    for (const edit of edits.filter(row => row[0] === id)) typedEdit(core, edit.slice(1), context.registry);
    for (const q of queries.filter(row => row[1] === id)) {
      const index = number(q[0]);
      requireValue(Number.isInteger(index) && index >= 0 && index < queries.length, 'Invalid world case ID');
      const e = expected[index];
      requireValue(number(e[0]) === index, 'Mismatched world expected case');
      const count = number(e[1]);
      requireValue([1, 10, 11].includes(count), 'Invalid world result width');
      compareValues(context, e.slice(2, count + 2), core.query(q[2], ...q.slice(3).map(number)),
        { suite: 'world', scenario: id, row: index + 2 });
    }
  }
  requireValue(queries.every((row, i) => number(row[0]) === i), 'Duplicate or missing world cases');
}

/** Throws on malformed references; numerical divergence is returned with location. */
export async function runParity(core, readText) {
  requireValue(core && typeof readText === 'function', 'Core and fixture reader are required');
  const shapeCases = await table(readText, 'shapes/cases.csv', SHAPE, 404);
  const registry = new Set(shapeCases.filter(row => row[1] === 'defaults').map(row => row[2]));
  requireValue(registry.size === 25, 'Registry coverage mismatch');
  for (const [category, count] of Object.entries({ defaults: 100, slabs: 12, stairs: 160, doors: 64, fences: 64, 'item-fence': 4 }))
    requireValue(shapeCases.filter(row => row[1] === category).length === count, `Shape category coverage: ${category}`);
  const context = { checked: 0, mismatchCount: 0, mismatches: [], registry };
  await shapes(context, core, readText, shapeCases);
  for (const [name, ticks] of LEGACY) await movement(context, core, readText, name, false, ticks);
  for (const name of CURRENT) await movement(context, core, readText, name, true, 160);
  await raycast(context, core, readText);
  await trig(context, core, readText);
  await world(context, core, readText);
  return { checked: context.checked, mismatchCount: context.mismatchCount, mismatches: context.mismatches };
}

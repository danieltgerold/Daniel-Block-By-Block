// Records how JavaScript prints numbers: String(x), and the 8-significant-digit form the chat replies use,
// String(Number(x.toPrecision(8))). Values are written as raw IEEE bits so the exact double reaches Java.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const view = new DataView(new ArrayBuffer(8));
const bitsOf = x => { view.setFloat64(0, x); return view.getBigUint64(0).toString(16).padStart(16, '0'); };
const fromBits = hi => { view.setBigUint64(0, BigInt.asUintN(64, hi)); return view.getFloat64(0); };
const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const CURATED = [0, -0, 1, -1, 0.5, 0.1, 0.2, 0.1 + 0.2, 1 / 3, 2 / 3, 10, 100, 1e5, 123456, 1234567, 12345678, 123456789, 99999999, 999999999, 0.99999999, 9.9999999, 9.99999995, 9.99999994999,
  4.317180616740089, 5.612334801762115, 7.126765405142745, 1.252203352512, 4.5, 255, 256, 0.1 * 3, 0.07, 1e-6, 1e-7, 9.9999999e-7, 1.5e-6, 0.000001234, 0.0000001234, 123456.789e-3,
  1e20, 1e21, 1e22, 123456789012345680000, 999999999999999900000, 1e21 - 1e5, 1.2345678901e21, 1.7976931348623157e308, 1.7976931e308, 2.2250738585072014e-308, 2.225073858507201e-308,
  5e-324, 1e-323, 4.9406564584124654e-324, 1.5e-323, 2.5e-323, 1e-310, 1.23456789e-310, 9.87654321e-320, 0.3, 0.30000000000000004, 1.005, 2.5, 3.5, 1.45, 8.345, 0.000123456785, 12345.67895,
  12345678.5, 123456785, 1234567850, 12345678.25, 0.000012345678500, 1.00000005, 2.5, 0.5, 1234567.5, 99999999.5, 999999995, 4503599627370495.5, 12345675, 123456750, -12345678.5, -123456785,
  Number.MAX_SAFE_INTEGER, Number.EPSILON, Math.PI, Math.E, Infinity, -Infinity, NaN, -4.5, -1e21, -1e-7, -123456789, -5e-324, 1e100, 1e-100, 1.5e300, 4e-300];

export function numberRows() {
  const values = [...CURATED];
  const rand = lcg(1234);
  // Random doubles across the whole exponent range, and short decimals that round at the 8th digit.
  for (let i = 0; i < 700; i++) {
    const exponent = Math.floor(rand() * 2046) + 1, mantissa = BigInt(Math.floor(rand() * 2 ** 26)) << 26n | BigInt(Math.floor(rand() * 2 ** 26));
    values.push(fromBits((rand() < 0.5 ? 0n : 1n << 63n) | (BigInt(exponent) << 52n) | (mantissa & ((1n << 52n) - 1n))));
  }
  for (let i = 0; i < 200; i++) values.push(Number((rand() * 10 ** Math.floor(rand() * 14 - 4)).toFixed(Math.floor(rand() * 10))));
  for (let i = 0; i < 100; i++) values.push(fromBits(BigInt(Math.floor(rand() * 2 ** 26)) << 26n | BigInt(Math.floor(rand() * 2 ** 26)))); // subnormals
  return values.map(v => `${bitsOf(v)}\t${String(v)}\t${String(Number(v.toPrecision(8)))}`);
}

export function generateNumbers(outDir) {
  const dir = join(outDir, 'chat');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'numbers.tsv'), ['bits\tstring\tnumberText', ...numberRows()].join('\n') + '\n');
}

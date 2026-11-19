// Number formatting for golden CSVs. String(n) is the shortest decimal that
// round-trips a double, so Java's Double.parseDouble recovers the exact bits.
// The one value it loses is the sign of zero, which the parity checks compare.
export const formatNumber = n => (Object.is(n, -0) ? '-0' : String(n));
export const formatBool = b => (b ? '1' : '0');

/** 靈石以下品為單位儲存，1 極品 = 100 上品 = 10000 中品 = 1000000 下品 */
const UNITS: [string, number][] = [
  ['極品', 1_000_000],
  ['上品', 10_000],
  ['中品', 100],
  ['下品', 1],
];

/** 自動換算成高階靈石，例如 15230 → 「1上品 52中品 30下品」 */
export function fmtStones(n: number, compact = false): string {
  n = Math.max(0, Math.floor(n));
  if (n === 0) return '0下品';
  const parts: string[] = [];
  let rest = n;
  for (const [name, v] of UNITS) {
    const q = Math.floor(rest / v);
    rest -= q * v;
    if (q > 0) parts.push(`${q}${name}`);
  }
  return (compact ? parts.slice(0, 2) : parts).join(' ');
}

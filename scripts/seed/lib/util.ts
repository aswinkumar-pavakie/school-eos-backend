// Shared deterministic-ish random + weighted-pick helpers for the seed script.
// Deterministic seeding (a fixed PRNG seed) means a --dry-run and the eventual
// --commit run produce the IDENTICAL dataset — what gets verified in the
// rollback test is exactly what would be committed, not a different random draw.

let seed = 42;
export function rand(): number {
  // xorshift32 — fast, deterministic, good enough for data generation (not crypto).
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  seed |= 0;
  return ((seed >>> 0) / 4294967296);
}
export function resetRandomSeed(s = 42) { seed = s; }

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

export function pickWeighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) {
    if (r < w) return k;
    r -= w;
  }
  return entries[entries.length - 1]![0];
}

/** Splits `total` into an array of counts matching `weights` (object of label->%),
 * guaranteeing the counts sum EXACTLY to total (last bucket absorbs rounding) —
 * this is the fix for every "percentage that didn't sum to the real total" bug
 * found during planning: every caller gets exact, reconciled counts, never an
 * approximation. */
export function exactSplit<T extends string>(total: number, weights: Record<T, number>): Record<T, number> {
  const entries = Object.entries(weights) as [T, number][];
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  const out = {} as Record<T, number>;
  let assigned = 0;
  entries.forEach(([k, w], i) => {
    if (i === entries.length - 1) {
      out[k] = total - assigned;
    } else {
      const c = Math.round((w / totalWeight) * total);
      out[k] = c;
      assigned += c;
    }
  });
  return out;
}

export function randomDateBetween(start: Date, end: Date): Date {
  const t = start.getTime() + rand() * (end.getTime() - start.getTime());
  return new Date(t);
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

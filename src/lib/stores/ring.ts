// fixed size column buffers on typed arrays for the chart history. a push
// overwrites the oldest sample once the buffer is full, nothing is allocated
// after the start. a missing value is stored as NaN and read back as null

export const HISTORY_COLUMNS = ['time', 'pan', 'tilt', 'lvl', 'lux', 'pmw', 'off', 'gain', 'ex', 'ey'] as const;
export type HistoryColumn = (typeof HISTORY_COLUMNS)[number];
export type HistorySample = Partial<Record<HistoryColumn, number | null | undefined>>;

export class Ring {
  readonly capacity: number;
  // time is unix seconds and needs the doubles, the rest fits in floats
  readonly columns: Record<HistoryColumn, Float64Array | Float32Array>;
  // where the next sample goes, and how many are kept
  private head = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const columns = {} as Record<HistoryColumn, Float64Array | Float32Array>;
    for (const name of HISTORY_COLUMNS) {
      columns[name] = name === 'time' ? new Float64Array(this.capacity) : new Float32Array(this.capacity);
    }
    this.columns = columns;
  }

  get length(): number {
    return this.count;
  }

  push(sample: HistorySample): void {
    const i = this.head;
    for (const name of HISTORY_COLUMNS) {
      const value = sample[name];
      this.columns[name][i] = typeof value === 'number' && Number.isFinite(value) ? value : NaN;
    }
    this.head = (i + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  // where the sample i places from the oldest sits in the arrays
  private slot(i: number): number {
    return (this.head - this.count + i + this.capacity) % this.capacity;
  }

  // sample i counted from the oldest, null when it is missing or out of range
  get(column: HistoryColumn, i: number): number | null {
    if (i < 0 || i >= this.count) return null;
    const value = this.columns[column][this.slot(i)];
    return Number.isNaN(value) ? null : value;
  }

  latest(column: HistoryColumn): number | null {
    return this.get(column, this.count - 1);
  }

  // the first sample at or after a time. the times only grow, so a binary search does it
  since(time: number): number {
    let lo = 0;
    let hi = this.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.get('time', mid) ?? -Infinity) < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // the samples from start to the newest in order, into out when it is large
  // enough. missing values stay NaN. returns a view of exactly that length
  copy(column: HistoryColumn, start = 0, out?: Float64Array): Float64Array {
    const from = Math.max(0, Math.min(start, this.count));
    const n = this.count - from;
    const target = out && out.length >= n ? out : new Float64Array(n);
    const source = this.columns[column];
    for (let i = 0; i < n; i++) target[i] = source[this.slot(from + i)];
    return target.subarray(0, n);
  }

  // the same as plain numbers with null for the gaps, the way uplot draws them
  toArray(column: HistoryColumn, start = 0): (number | null)[] {
    const from = Math.max(0, Math.min(start, this.count));
    const out: (number | null)[] = new Array(this.count - from);
    const source = this.columns[column];
    for (let i = 0; i < out.length; i++) {
      const value = source[this.slot(from + i)];
      out[i] = Number.isNaN(value) ? null : value;
    }
    return out;
  }
}

// checks for the fields of a command, the same rules as commands.py on the pi:
// a number is a finite number and never a string or a boolean, a range is
// checked and not clamped, a missing field is bad unless it is optional

import type { AckErr } from '$lib/link/protocol';

// thrown by a command handler, code is the err of the ack and the message the
// detail for the event log
export class CommandError extends Error {
  readonly code: AckErr;

  constructor(message: string, code: AckErr = 'bad') {
    super(message);
    this.code = code;
  }
}

export type Fields = Record<string, unknown>;

export function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function present(msg: Fields, key: string): boolean {
  return msg[key] !== undefined && msg[key] !== null;
}

const show = (n: number) => String(+n.toPrecision(6));

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// a number from lo to hi
export function num(msg: Fields, key: string, lo: number, hi: number): number {
  if (!present(msg, key)) throw new CommandError(`${key} is missing`);
  const value = msg[key];
  if (!isNumber(value)) throw new CommandError(`${key} must be a number`);
  if (value < lo || value > hi) throw new CommandError(`${key} must be from ${show(lo)} to ${show(hi)}`);
  return value;
}

// the same, or null when it is left out
export function optNum(msg: Fields, key: string, lo: number, hi: number): number | null {
  return present(msg, key) ? num(msg, key, lo, hi) : null;
}

export function bool(msg: Fields, key: string): boolean {
  if (!present(msg, key)) throw new CommandError(`${key} is missing`);
  const value = msg[key];
  if (typeof value !== 'boolean') throw new CommandError(`${key} must be true or false`);
  return value;
}

export function optBool(msg: Fields, key: string): boolean | null {
  return present(msg, key) ? bool(msg, key) : null;
}

export function text(msg: Fields, key: string): string {
  const value = msg[key];
  if (typeof value !== 'string' || value === '') throw new CommandError(`${key} is missing`);
  return value;
}

// one of a few words
export function oneOf<T extends string>(msg: Fields, key: string, choices: readonly T[]): T {
  const value = msg[key];
  if (typeof value !== 'string' || !(choices as readonly string[]).includes(value)) {
    throw new CommandError(`${key} must be one of ${choices.join(', ')}`);
  }
  return value as T;
}

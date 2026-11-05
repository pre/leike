import type { History } from './types.js';

export const historyVersion = 1;

/** Gives the object that the platform writes to history.json. */
export function serializeHistory(_history: History): unknown {
  throw new Error('not implemented');
}

/** Reads the parsed history.json. Throws on an unknown version. */
export function parseHistory(_value: unknown): History {
  throw new Error('not implemented');
}

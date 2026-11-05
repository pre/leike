import type { EntryType } from './types.js';

export type TextType = Exclude<EntryType, 'image'>;

export function classify(_text: string): TextType {
  throw new Error('not implemented');
}

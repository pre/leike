import type { EntryType } from './types.js';

export type TextType = Exclude<EntryType, 'image'>;

// A scheme with "//" (https://, ftp://), or a scheme that has no "//".
const urlPattern = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const opaqueUrlPattern = /^(mailto|tel|sms|magnet|urn|geo|xmpp):\S+$/i;

// #RGB, #RGBA, #RRGGBB and #RRGGBBAA.
const hexColorPattern = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const functionColorPattern = /^(rgba?|hsla?)\(([-+\d\s.,%/]|deg)+\)$/i;

/** Gives the type of a copied text: link, color, file (text/uri-list) or text. */
export function classify(text: string): TextType {
  const trimmed = text.trim();
  if (trimmed === '') {
    return 'text';
  }
  if (isFileList(trimmed)) {
    return 'file';
  }
  if (isLink(trimmed)) {
    return 'link';
  }
  if (hexColorPattern.test(trimmed) || functionColorPattern.test(trimmed)) {
    return 'color';
  }
  return 'text';
}

function isFileList(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.every((line) => line.startsWith('file://'));
}

function isLink(text: string): boolean {
  return urlPattern.test(text) || opaqueUrlPattern.test(text);
}

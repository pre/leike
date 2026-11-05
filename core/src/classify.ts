import type { EntryType } from './types.js';

export type TextType = Exclude<EntryType, 'image'>;

// A scheme with "//" (https://, ftp://), or a scheme that has no "//".
const urlPattern = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;
const opaqueUrlPattern = /^(mailto|tel|sms|magnet|urn|geo|xmpp):\S+$/i;

// Only #RRGGBB and #RRGGBBAA. Shorter forms such as #add or #1234 are too often plain text.
const hexColorPattern = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const colorFunctionPattern = /^(rgba?|hsla?)\((.*)\)$/i;
const numberPattern = /^(\d+(\.\d+)?|\.\d+)$/;

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
  if (hexColorPattern.test(trimmed) || isColorFunction(trimmed)) {
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

/** rgb() and rgba() take 3 or 4 numbers. hsl() and hsla() take a hue, two percentages and an optional alpha. */
function isColorFunction(text: string): boolean {
  const match = colorFunctionPattern.exec(text);
  if (match === null) {
    return false;
  }
  const name = (match[1] ?? '').toLowerCase();
  const parts = (match[2] ?? '').split(/[\s,/]+/).filter((part) => part !== '');
  if (parts.length < 3 || parts.length > 4) {
    return false;
  }
  const [first = '', second = '', third = '', alpha] = parts;
  if (alpha !== undefined && !isNumber(alpha, true)) {
    return false;
  }
  if (name.startsWith('rgb')) {
    return [first, second, third].every((part) => isNumber(part, true));
  }
  return isHue(first) && isPercentage(second) && isPercentage(third);
}

function isNumber(text: string, percentAllowed: boolean): boolean {
  const value = percentAllowed && text.endsWith('%') ? text.slice(0, -1) : text;
  return numberPattern.test(value);
}

function isPercentage(text: string): boolean {
  return text.endsWith('%') && isNumber(text, true);
}

function isHue(text: string): boolean {
  const value = text.toLowerCase().endsWith('deg') ? text.slice(0, -3) : text;
  return numberPattern.test(value);
}

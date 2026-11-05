import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, type TextType } from '../src/index.js';

const cases: Array<[string, string, TextType]> = [
  ['an https URL', 'https://example.com/path?q=1', 'link'],
  ['an http URL', 'http://example.com', 'link'],
  ['an ftp URL', 'ftp://files.example.com/a.txt', 'link'],
  ['a mailto URL', 'mailto:someone@example.com', 'link'],
  ['a tel URL', 'tel:+358401234567', 'link'],
  ['a URL with whitespace around it', '  https://example.com \n', 'link'],
  ['two URLs on two lines', 'https://a.example\nhttps://b.example', 'text'],
  ['a URL inside a sentence', 'see https://example.com now', 'text'],
  ['a scheme without a body', 'https://', 'text'],
  ['a host and port without a scheme', 'localhost:8080', 'text'],
  ['a three-digit hash', '#fa0', 'text'],
  ['a three-digit hash of hex letters', '#add', 'text'],
  ['a four-digit hash', '#1234', 'text'],
  ['a four-digit hash of hex letters', '#cafe', 'text'],
  ['a #RRGGBB color', '#FFAA00', 'color'],
  ['a #RRGGBBAA color', '#ffaa0080', 'color'],
  ['a color with whitespace around it', ' #ffaa00\n', 'color'],
  ['an rgb() color', 'rgb(255, 170, 0)', 'color'],
  ['an rgba() color', 'rgba(255 170 0 / 50%)', 'color'],
  ['an hsl() color', 'hsl(40deg, 100%, 50%)', 'color'],
  ['an rgb() color with percentages and decimals', 'rgb(100%, 66.5%, 0%)', 'color'],
  ['an rgba() color with commas', 'rgba(255, 170, 0, 0.5)', 'color'],
  ['an hsl() color without deg', 'hsl(40 100% 50%)', 'color'],
  ['an hsla() color', 'hsla(40, 100%, 50%, 0.5)', 'color'],
  ['an rgb() with only a comma', 'rgb(,)', 'text'],
  ['an rgb() with two numbers', 'rgb(1, 2)', 'text'],
  ['an rgb() with five numbers', 'rgb(1, 2, 3, 4, 5)', 'text'],
  ['an rgb() with deg', 'rgb(1deg, 2, 3)', 'text'],
  ['an hsl() with only deg', 'hsl(deg)', 'text'],
  ['an hsl() without percentages', 'hsl(40, 100, 50)', 'text'],
  ['an empty rgb()', 'rgb()', 'text'],
  ['an rgba() with an alpha that is not a number', 'rgba(1, 2, 3, x)', 'text'],
  ['a hash with non-hex digits', '#ggg', 'text'],
  ['a hash with five digits', '#12345', 'text'],
  ['a markdown heading', '# Title', 'text'],
  ['one file URI', 'file:///home/user/a.txt', 'file'],
  ['a uri-list with two files', 'file:///home/user/a.txt\r\nfile:///home/user/b.png\r\n', 'file'],
  ['a uri-list with a non-file line', 'file:///home/user/a.txt\nhttps://example.com', 'text'],
  ['plain text', 'hello world', 'text'],
  ['an empty string', '', 'text'],
  ['whitespace only', '  \n ', 'text'],
];

for (const [name, input, expected] of cases) {
  test(`classify gives '${expected}' for ${name}`, () => {
    // Act
    const result = classify(input);

    // Assert
    assert.equal(result, expected);
  });
}

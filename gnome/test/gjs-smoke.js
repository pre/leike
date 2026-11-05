// Run with: gjs -m test/gjs-smoke.js (after node esbuild.mjs). Checks that
// the core bundle loads and runs in GJS, outside gnome-shell.
import { entryTypes, historyVersion } from '../build/core.js';

function check(name, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`gjs smoke test failed: ${name}: expected ${expectedJson}, got ${actualJson}`);
  }
}

check('entryTypes', entryTypes, ['text', 'link', 'color', 'file', 'image']);
check('historyVersion', historyVersion, 1);

print('gjs smoke test passed: core bundle');

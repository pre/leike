import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const shared = {
  bundle: true,
  format: 'esm',
  target: 'firefox115',
  minify: false,
  legalComments: 'inline',
};

rmSync('dist', { recursive: true, force: true });
rmSync('build', { recursive: true, force: true });
mkdirSync('dist/schemas', { recursive: true });

// Two bundles: gnome-shell loads extension.js, and a separate gjs process
// loads prefs.js. Neither process can load the modules of the other.
for (const name of ['extension', 'prefs']) {
  await build({
    ...shared,
    entryPoints: [`src/${name}.ts`],
    outfile: `dist/${name}.js`,
    external: ['gi://*', 'resource:///*'],
  });
}

// The GJS smoke test runs these bundles outside gnome-shell, so they must
// not import resource:///org/gnome/shell/*.
await build({
  ...shared,
  entryPoints: {
    core: '@leike/core',
    'clear-history': 'src/clear-history.ts',
    store: 'src/store.ts',
  },
  outdir: 'build',
  external: ['gi://*'],
});

// The release workflow sets version-name. A local build gets git-<commit>, or no version outside a git checkout.
const metadata = JSON.parse(readFileSync('metadata.json', 'utf8'));
if (metadata['version-name'] === undefined) {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    metadata['version-name'] = `git-${commit}`;
  } catch {}
}
writeFileSync('dist/metadata.json', `${JSON.stringify(metadata, null, 2)}\n`);
cpSync('stylesheet.css', 'dist/stylesheet.css');
cpSync('schemas', 'dist/schemas', { recursive: true });
execFileSync('glib-compile-schemas', ['--strict', 'dist/schemas'], { stdio: 'inherit' });
copyFileSync('../LICENSE', 'dist/LICENSE');

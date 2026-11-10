// Run by "npm run test:coverage" after the node tests, with the lcov file of
// that run. The coverage report of node has only the modules that a node
// test loads, and node cannot load a module that imports gi:// or
// resource://. This prints the files of src/ that the report does not have,
// so its total is not read as the coverage of all of src/.
import { readdirSync, readFileSync } from 'node:fs';

const measured = new Set(
  readFileSync(process.argv[2], 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('SF:'))
    .map((line) => line.replace(/^SF:(.*\/)?src\//, 'src/')),
);
const files = readdirSync('src')
  .filter((name) => name.endsWith('.ts'))
  .map((name) => `src/${name}`)
  .sort();
const notMeasured = files.filter((file) => !measured.has(file));

console.log(`\nThe coverage report above measures ${files.length - notMeasured.length} of the ${files.length} files in src/.`);
console.log(`Not measured, because the node tests cannot load them (${notMeasured.length} files):`);
notMeasured.forEach((file) => console.log(`  ${file}`));
console.log('README.md, "Test coverage", tells how these files are tested.');

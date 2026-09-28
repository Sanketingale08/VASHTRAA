require('./patch-fs.cjs');
const path = require('path');

const target = process.argv[2];
const args = process.argv.slice(3);

if (!target) {
  console.log("Usage: node scripts/run-cmd.cjs <relative-script-path> [args...]");
  process.exit(0);
}

process.argv = [process.argv[0], target, ...args];
require(path.resolve(process.cwd(), target));

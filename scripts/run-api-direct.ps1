$node = "C:\Users\Administrator\AppData\Local\ms-playwright-go\1.57.0\node.exe"
$env:NODE_PATH = "node_modules\.pnpm\esbuild@0.27.3\node_modules;node_modules\.pnpm\node_modules;node_modules;artifacts\api-server\node_modules;lib\db\node_modules;scripts\node_modules"

$code = @"
const fs = require('fs');
function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try { return orig.apply(this, args); } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) { try { return fs.statSync(...args); } catch(_) {} }
        return args[0];
      }
      throw e;
    }
  };
}
patch(fs, 'realpathSync');
patch(fs, 'lstatSync');
if (fs.promises) { patch(fs.promises, 'realpath'); patch(fs.promises, 'lstat'); }

require('module').Module._initPaths();
require('./scripts/node_modules/tsx/dist/cli.mjs');
"@

& $node -e $code ./artifacts/api-server/src/index.ts

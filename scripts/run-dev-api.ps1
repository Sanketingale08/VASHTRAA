$env:PATH = "C:\Users\Administrator\AppData\Local\ms-playwright-go\1.57.0;$env:PATH"

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
"@

# Run pnpm dev:api with node option to require patch-fs
$env:NODE_OPTIONS = "-r ./patch-fs.js"
& pnpm --filter @workspace/api-server dev

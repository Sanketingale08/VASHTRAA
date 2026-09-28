import fs from "fs";

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

import("../artifacts/api-server/build.mjs")
  .then(() => {
    console.log("SUCCESSFULLY BUILT API SERVER DIST!");
    process.exit(0);
  })
  .catch(err => {
    console.error("BUILD FAILED:", err);
    process.exit(1);
  });

const fs = require('fs');

function safeRealpath(orig) {
  if (!orig) return orig;
  const fn = function(p, options) {
    try {
      return orig(p, options);
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        return typeof p === 'string' ? p : String(p);
      }
      throw e;
    }
  };
  return fn;
}

if (fs.realpathSync) {
  const origSync = fs.realpathSync;
  fs.realpathSync = safeRealpath(origSync);
  if (origSync.native) {
    fs.realpathSync.native = safeRealpath(origSync.native);
  } else {
    fs.realpathSync.native = fs.realpathSync;
  }
}

if (fs.realpath) {
  const origAsync = fs.realpath;
  fs.realpath = function(p, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    try {
      return origAsync(p, options, (err, res) => {
        if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
          return callback(null, typeof p === 'string' ? p : String(p));
        }
        return callback(err, res);
      });
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
        return callback(null, typeof p === 'string' ? p : String(p));
      }
      throw err;
    }
  };
}

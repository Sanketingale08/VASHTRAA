import crypto from "crypto";

/**
 * Hashes a plaintext password securely using PBKDF2 with SHA-512 and a random 16-byte salt.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || typeof password !== "string" || !storedHash || typeof storedHash !== "string") {
    return false;
  }

  const trimmedHash = storedHash.trim();
  const pwdVariants = [password, password.trim()];

  for (const pwd of pwdVariants) {
    if (checkPasswordHash(pwd, trimmedHash)) {
      return true;
    }
  }

  return false;
}

function checkPasswordHash(password: string, storedHash: string): boolean {
  try {
    // Standard format: pbkdf2:salt:hash
    if (storedHash.startsWith("pbkdf2:")) {
      const parts = storedHash.split(":");
      if (parts.length === 3) {
        const [, salt, hash] = parts;
        const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
        const a = Buffer.from(hash, "hex");
        const b = Buffer.from(verifyHash, "hex");
        if (a.length === b.length) {
          return crypto.timingSafeEqual(a, b);
        }
      }
    }

    // Alternative format: pbkdf2$iterations$salt$hash or $pbkdf2$iterations$salt$hash or pbkdf2$salt$hash
    if (storedHash.includes("pbkdf2$") || storedHash.startsWith("$pbkdf2$")) {
      const clean = storedHash.replace(/^\$?pbkdf2\$?/, "");
      const parts = clean.split(/[:$]/);
      if (parts.length >= 3) {
        let iterations = 100000;
        let salt = "";
        let hash = "";
        if (parts.length === 3 && isNaN(Number(parts[0]))) {
          salt = parts[0];
          hash = parts[1];
        } else {
          iterations = parseInt(parts[0], 10) || 100000;
          salt = parts[1];
          hash = parts[2];
        }
        if (salt && hash) {
          const keyLen = hash.length / 2 || 64;
          const verifyHash = crypto.pbkdf2Sync(password, salt, iterations, keyLen, "sha512").toString("hex");
          const a = Buffer.from(hash, "hex");
          const b = Buffer.from(verifyHash, "hex");
          if (a.length === b.length) {
            return crypto.timingSafeEqual(a, b);
          }
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

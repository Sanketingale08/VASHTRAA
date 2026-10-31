import { writeAuditLog, getIp } from "./auditLog";

interface LockoutState {
  failedAttempts: number;
  lockCount: number;
  lockedUntil: Date | null;
  lastFailedAt: Date;
}

const lockoutStore = new Map<string, LockoutState>();

// Configuration loaded from environment variables with safe defaults
export const SECURITY_CONFIG = {
  get MAX_LOGIN_ATTEMPTS(): number {
    return parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5", 10);
  },
  get INITIAL_LOCK_MINUTES(): number {
    return parseInt(process.env.INITIAL_LOCK_MINUTES || "15", 10);
  },
  get MAX_LOCK_MINUTES(): number {
    return parseInt(process.env.MAX_LOCK_MINUTES || "60", 10);
  },
};

function normalizeIdentifier(raw: string): string {
  return (raw || "").trim().toLowerCase();
}

function calculateLockDurationMinutes(lockCount: number): number {
  const initial = SECURITY_CONFIG.INITIAL_LOCK_MINUTES;
  const max = SECURITY_CONFIG.MAX_LOCK_MINUTES;
  // Progressive multiplier: 15m (1st lock) -> 30m (2nd lock) -> 60m (3rd+ lock max)
  const minutes = initial * Math.pow(2, Math.max(0, lockCount - 1));
  return Math.min(max, minutes);
}

/**
 * Checks if an account identifier or IP is currently temporarily locked due to brute-force protection.
 */
export function checkAccountLockout(
  identifier: string,
  role: string = "user",
  ip: string = ""
): {
  isLocked: boolean;
  remainingMinutes: number;
  remainingSeconds: number;
  message?: string;
  retryMessage?: string;
} {
  const cleanId = normalizeIdentifier(identifier);
  const now = new Date();

  // Check identifier+IP key and standalone IP key (prevents global account griefing / DoS)
  const effectiveIp = (ip || "").trim();
  const userIpKey = cleanId && effectiveIp ? `${role}:${cleanId}:${effectiveIp}` : (cleanId ? `${role}:${cleanId}` : "");
  const ipKey = effectiveIp ? `ip:${effectiveIp}` : "";
  const keys = [userIpKey, ipKey].filter(Boolean);

  for (const key of keys) {
    const state = lockoutStore.get(key);
    if (state && state.lockedUntil) {
      if (now < state.lockedUntil) {
        const remainingMs = state.lockedUntil.getTime() - now.getTime();
        const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
        const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
        const msg = `Your login is temporarily locked due to repeated failed attempts. Please try again after ${remainingMinutes} minute(s).`;
        return {
          isLocked: true,
          remainingMinutes,
          remainingSeconds,
          message: msg,
          retryMessage: msg,
        };
      } else {
        // Lock expired -> reset lock state automatically
        state.lockedUntil = null;
        state.failedAttempts = 0;
      }
    }
  }

  return { isLocked: false, remainingMinutes: 0, remainingSeconds: 0 };
}

/**
 * Records a failed authentication attempt. Triggers temporary lockout when threshold is hit.
 */
export function recordFailedAttempt(
  identifier: string,
  role: string = "user",
  ip: string = "",
  req?: any
): {
  isLocked: boolean;
  isNowLocked: boolean;
  attempts: number;
  lockMinutes: number;
  remainingMinutes: number;
  remainingSeconds: number;
  message?: string;
} {
  const cleanId = normalizeIdentifier(identifier);
  const now = new Date();
  const effectiveIp = (ip || (req ? getIp(req) : "")).trim();

  const userIpKey = cleanId && effectiveIp ? `${role}:${cleanId}:${effectiveIp}` : (cleanId ? `${role}:${cleanId}` : "");
  const ipKey = effectiveIp ? `ip:${effectiveIp}` : "";
  const keys = [userIpKey, ipKey].filter(Boolean);
  let newlyLocked = false;
  let maxLockMinutes = 0;
  let maxAttempts = 0;

  for (const key of keys) {
    let state = lockoutStore.get(key);
    if (!state) {
      state = {
        failedAttempts: 0,
        lockCount: 0,
        lockedUntil: null,
        lastFailedAt: now,
      };
      lockoutStore.set(key, state);
    }

    state.failedAttempts += 1;
    state.lastFailedAt = now;
    maxAttempts = Math.max(maxAttempts, state.failedAttempts);

    if (state.failedAttempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      state.lockCount += 1;
      const lockMinutes = calculateLockDurationMinutes(state.lockCount);
      state.lockedUntil = new Date(now.getTime() + lockMinutes * 60_000);
      newlyLocked = true;
      maxLockMinutes = Math.max(maxLockMinutes, lockMinutes);

      writeAuditLog({
        action: "account_locked",
        module: "Security",
        status: "failure",
        role,
        email: cleanId,
        ipAddress: effectiveIp || "unknown",
        metadata: {
          lockDurationMinutes: lockMinutes,
          lockCount: state.lockCount,
          reason: "max_failed_attempts_exceeded",
        },
      }).catch(() => {});
    }
  }

  const remainingSeconds = maxLockMinutes * 60;
  const remainingMinutes = maxLockMinutes;

  return {
    isLocked: newlyLocked,
    isNowLocked: newlyLocked,
    attempts: maxAttempts,
    lockMinutes: maxLockMinutes,
    remainingMinutes,
    remainingSeconds,
    message: newlyLocked
      ? `Too many failed login attempts. Account is temporarily locked for ${maxLockMinutes} minute(s).`
      : undefined,
  };
}

/**
 * Resets failed attempt counter and lockout state on successful authentication.
 */
export function recordSuccessfulLogin(
  identifier: string,
  role: string = "user",
  ip: string = "",
  req?: any
): void {
  const cleanId = normalizeIdentifier(identifier);
  const effectiveIp = (ip || (req ? getIp(req) : "")).trim();
  const userIpKey = cleanId && effectiveIp ? `${role}:${cleanId}:${effectiveIp}` : (cleanId ? `${role}:${cleanId}` : "");
  const ipKey = effectiveIp ? `ip:${effectiveIp}` : "";
  const keys = [userIpKey, ipKey, cleanId ? `${role}:${cleanId}` : ""].filter(Boolean);

  for (const key of keys) {
    lockoutStore.delete(key);
  }

  writeAuditLog({
    action: "login_success",
    module: "Security",
    status: "success",
    role,
    email: cleanId,
    ipAddress: effectiveIp || "unknown",
  }).catch(() => {});
}
